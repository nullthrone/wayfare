import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { COLLECTIONS, type Doc, type DocumentStore, type Filter, type QueryOptions } from "../../ports/document-store";
import { DocumentExistsError } from "./errors";
import { getPath, setPath } from "./filter";

/**
 * SQLite DocumentStore: one table per collection (`"c_<name>"(id TEXT PRIMARY KEY, data TEXT)`),
 * documents as JSON text, expression indexes on `json_extract(data,'$.<field>')` for the fields
 * declared in COLLECTIONS. All filters (incl. OR connectors) are translated to SQL.
 *
 * better-sqlite3 is synchronous, so every read-modify-write below runs inside a single
 * IMMEDIATE transaction and is atomic, also across processes sharing the same database file.
 */

const NAME_RE = /^[A-Za-z0-9_]+$/;
/**
 * Allowed characters per path segment. Hyphens/leading digits occur in data keys (e.g. reaction
 * keys like "white-heart"), so every segment is emitted double-quoted in the JSON path. The
 * charset deliberately excludes quotes and dots, because paths are inlined into SQL text.
 */
const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

type Bindable = string | number | bigint | null;

function jsonPath(field: string): string {
  const parts = field.split(".");
  for (const p of parts) {
    if (!SEGMENT_RE.test(p)) throw new Error(`Invalid field path: ${JSON.stringify(field)}`);
  }
  return `$.${parts.map((p) => `"${p}"`).join(".")}`;
}

/** SQL expression yielding the (scalar) value of `field`. */
function valueExpr(field: string): string {
  return field === "id" ? "id" : `json_extract(data,'${jsonPath(field)}')`;
}

function typeExpr(field: string): string {
  return field === "id" ? "'text'" : `json_type(data,'${jsonPath(field)}')`;
}

function bind(v: unknown): Bindable {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" || typeof v === "number" || typeof v === "bigint") return v;
  throw new Error(`Unsupported filter value type: ${typeof v}`);
}

function condition(f: Filter, params: Bindable[]): string {
  const x = valueExpr(f.field);
  const t = typeExpr(f.field);
  const v = f.value;
  switch (f.op) {
    case "eq":
      if (v === null || v === undefined) return `${x} IS NULL`;
      params.push(bind(v));
      return `${x} = ?`;
    case "ne":
      if (v === null || v === undefined) return `${x} IS NOT NULL`;
      params.push(bind(v));
      return `(${x} IS NULL OR ${x} != ?)`;
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      if (v === null || v === undefined) return "0";
      const op = { lt: "<", lte: "<=", gt: ">", gte: ">=" }[f.op];
      const bound = bind(v);
      params.push(bound);
      const guard = typeof bound === "string" ? `${t} = 'text'` : `${t} IN ('integer','real')`;
      return `(${guard} AND ${x} ${op} ?)`;
    }
    case "in": {
      if (!Array.isArray(v) || v.length === 0) return "0";
      for (const item of v) params.push(bind(item));
      return `${x} IN (${v.map(() => "?").join(",")})`;
    }
    case "not_in": {
      if (!Array.isArray(v) || v.length === 0) return "1";
      for (const item of v) params.push(bind(item));
      return `(${x} IS NULL OR ${x} NOT IN (${v.map(() => "?").join(",")}))`;
    }
    case "contains": {
      if (v === null || v === undefined) return "0";
      const bound = bind(v);
      const arr = `(${t} = 'array' AND EXISTS (SELECT 1 FROM json_each(data,'${f.field === "id" ? "$.id" : jsonPath(f.field)}') WHERE value = ?))`;
      params.push(bound);
      if (typeof bound !== "string") return arr;
      params.push(bound);
      return `(${arr} OR (${t} = 'text' AND instr(${x}, ?) > 0))`;
    }
    case "starts_with":
    case "ends_with": {
      if (typeof v !== "string") return "0";
      if (v === "") return `${t} = 'text'`;
      params.push(v, v);
      return f.op === "starts_with"
        ? `(${t} = 'text' AND substr(${x}, 1, length(?)) = ?)`
        : `(${t} = 'text' AND substr(${x}, -length(?)) = ?)`;
    }
    default:
      throw new Error(`Unsupported filter op: ${String((f as Filter).op)}`);
  }
}

/** Left-folded AND/OR chain, matching the semantics in filter.ts `matches()`. */
function whereClause(filters: Filter[] | undefined, params: Bindable[]): string {
  if (!filters || filters.length === 0) return "";
  let sql = condition(filters[0], params);
  for (let i = 1; i < filters.length; i++) {
    sql = `(${sql} ${filters[i].connector === "OR" ? "OR" : "AND"} ${condition(filters[i], params)})`;
  }
  return ` WHERE ${sql}`;
}

function tail(q: QueryOptions | undefined): string {
  let sql = "";
  if (q?.sort && q.sort.length > 0) {
    sql += ` ORDER BY ${q.sort.map((s) => `${valueExpr(s.field)} ${s.direction === "desc" ? "DESC" : "ASC"}`).join(", ")}`;
  }
  if (q?.limit !== undefined || q?.offset) {
    sql += ` LIMIT ${q?.limit !== undefined ? Math.max(0, Math.floor(q.limit)) : -1}`;
    if (q?.offset) sql += ` OFFSET ${Math.max(0, Math.floor(q.offset))}`;
  }
  return sql;
}

function applyPatch(doc: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    setPath(doc, k, v);
  }
}

export function createSqliteStore(file: string): DocumentStore {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");

  const known = new Set<string>();
  const stmts = new Map<string, Database.Statement>();
  const prep = (sql: string) => {
    let s = stmts.get(sql);
    if (!s) {
      s = db.prepare(sql);
      if (stmts.size > 500) stmts.clear();
      stmts.set(sql, s);
    }
    return s;
  };

  const declaredIndexes = new Map<string, readonly string[]>(
    Object.values(COLLECTIONS).map((c) => [c.name, c.indexes as readonly string[]]),
  );

  function table(collection: string): string {
    if (!NAME_RE.test(collection)) throw new Error(`Invalid collection name: ${JSON.stringify(collection)}`);
    const t = `c_${collection}`;
    if (!known.has(collection)) {
      db.exec(`CREATE TABLE IF NOT EXISTS "${t}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`);
      for (const field of declaredIndexes.get(collection) ?? []) {
        db.exec(`CREATE INDEX IF NOT EXISTS "i_${t}_${field}" ON "${t}"(json_extract(data,'${jsonPath(field)}'))`);
      }
      known.add(collection);
    }
    return `"${t}"`;
  }

  const parse = <T>(row: { data: string }) => JSON.parse(row.data) as T;

  function assertDoc(doc: Doc) {
    if (!doc || typeof doc.id !== "string" || doc.id === "") throw new Error("Document must have a non-empty string id");
  }

  const tx = <R>(fn: () => R): R => db.transaction(fn).immediate();

  function selectDocs<T extends Doc>(t: string, q: QueryOptions | undefined): T[] {
    const params: Bindable[] = [];
    const sql = `SELECT data FROM ${t}${whereClause(q?.where, params)}${tail(q)}`;
    return (prep(sql).all(...params) as { data: string }[]).map((r) => parse<T>(r));
  }

  const store: DocumentStore = {
    async get<T extends Doc>(collection: string, id: string) {
      const row = prep(`SELECT data FROM ${table(collection)} WHERE id = ?`).get(id) as { data: string } | undefined;
      return row ? parse<T>(row) : null;
    },

    async create<T extends Doc>(collection: string, doc: T) {
      assertDoc(doc);
      try {
        prep(`INSERT INTO ${table(collection)} (id, data) VALUES (?, ?)`).run(doc.id, JSON.stringify(doc));
      } catch (e) {
        if ((e as { code?: string }).code?.startsWith("SQLITE_CONSTRAINT")) throw new DocumentExistsError(collection, doc.id);
        throw e;
      }
      return doc;
    },

    async put<T extends Doc>(collection: string, doc: T) {
      assertDoc(doc);
      prep(
        `INSERT INTO ${table(collection)} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
      ).run(doc.id, JSON.stringify(doc));
      return doc;
    },

    async update<T extends Doc>(collection: string, id: string, patch: Record<string, unknown>) {
      const t = table(collection);
      return tx(() => {
        const row = prep(`SELECT data FROM ${t} WHERE id = ?`).get(id) as { data: string } | undefined;
        if (!row) return null;
        const doc = parse<Record<string, unknown>>(row);
        applyPatch(doc, patch);
        prep(`UPDATE ${t} SET data = ? WHERE id = ?`).run(JSON.stringify(doc), id);
        return doc as T;
      });
    },

    async increment(collection: string, id: string, field: string, by: number) {
      jsonPath(field);
      const t = table(collection);
      tx(() => {
        const row = prep(`SELECT data FROM ${t} WHERE id = ?`).get(id) as { data: string } | undefined;
        if (!row) return;
        const doc = parse<Record<string, unknown>>(row);
        const cur = getPath(doc, field);
        setPath(doc, field, (typeof cur === "number" ? cur : 0) + by);
        prep(`UPDATE ${t} SET data = ? WHERE id = ?`).run(JSON.stringify(doc), id);
      });
    },

    async delete(collection: string, id: string) {
      prep(`DELETE FROM ${table(collection)} WHERE id = ?`).run(id);
    },

    async find<T extends Doc>(collection: string, query?: QueryOptions) {
      return selectDocs<T>(table(collection), query);
    },

    async findOne<T extends Doc>(collection: string, query?: QueryOptions) {
      return (selectDocs<T>(table(collection), { ...query, limit: 1 })[0] as T | undefined) ?? null;
    },

    async count(collection: string, query?: QueryOptions) {
      const params: Bindable[] = [];
      const sql = `SELECT COUNT(*) AS n FROM ${table(collection)}${whereClause(query?.where, params)}`;
      return (prep(sql).get(...params) as { n: number }).n;
    },

    async updateMany(collection: string, query: QueryOptions, patch: Record<string, unknown>) {
      const t = table(collection);
      return tx(() => {
        const params: Bindable[] = [];
        const sql = `SELECT id, data FROM ${t}${whereClause(query.where, params)}${tail(query)}`;
        const rows = prep(sql).all(...params) as { id: string; data: string }[];
        const upd = prep(`UPDATE ${t} SET data = ? WHERE id = ?`);
        for (const row of rows) {
          const doc = parse<Record<string, unknown>>(row);
          applyPatch(doc, patch);
          upd.run(JSON.stringify(doc), row.id);
        }
        return rows.length;
      });
    },

    async deleteMany(collection: string, query: QueryOptions) {
      const t = table(collection);
      const params: Bindable[] = [];
      const where = whereClause(query.where, params);
      if (query.limit === undefined && !query.offset) {
        return prep(`DELETE FROM ${t}${where}`).run(...params).changes;
      }
      return prep(`DELETE FROM ${t} WHERE id IN (SELECT id FROM ${t}${where}${tail(query)})`).run(...params).changes;
    },
  };
  return store;
}
