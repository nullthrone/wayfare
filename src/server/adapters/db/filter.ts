import type { Filter, QueryOptions } from "../../ports/document-store";

/**
 * Shared in-memory query evaluator. Used by the Firestore adapter (for everything that is not
 * pushed down) and as the reference implementation of the DocumentStore filter semantics:
 *
 *  - Missing fields never match, except for `ne` / `not_in`.
 *  - `eq null` matches missing or null fields, `ne null` matches present, non-null fields.
 *  - Range operators only compare values of the same JS type (number↔number, string↔string).
 *  - `contains` works on arrays (element equality) and strings (substring).
 *  - Filters are folded left to right: `a AND b OR c AND d` = `(((a AND b) OR c) AND d)`.
 */

export function getPath(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Set (or, for `undefined`, delete) a dot-path inside `target`, creating intermediate objects. */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cur = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const next = cur[k];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      if (value === undefined) return;
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

function isNullish(v: unknown): boolean {
  return v === undefined || v === null;
}

function normalize(v: unknown): unknown {
  return v instanceof Date ? v.toISOString() : v;
}

function sameType(a: unknown, b: unknown): boolean {
  return typeof a === typeof b && (typeof a === "number" || typeof a === "string");
}

function evalFilter(doc: unknown, f: Filter): boolean {
  const v = getPath(doc, f.field);
  const value = normalize(f.value);
  switch (f.op) {
    case "eq":
      return value === null || value === undefined ? isNullish(v) : v === value;
    case "ne":
      return value === null || value === undefined ? !isNullish(v) : v !== value;
    case "lt":
      return sameType(v, value) && (v as number | string) < (value as number | string);
    case "lte":
      return sameType(v, value) && (v as number | string) <= (value as number | string);
    case "gt":
      return sameType(v, value) && (v as number | string) > (value as number | string);
    case "gte":
      return sameType(v, value) && (v as number | string) >= (value as number | string);
    case "in":
      return Array.isArray(value) && !isNullish(v) && value.map(normalize).includes(v);
    case "not_in":
      return !Array.isArray(value) || isNullish(v) || !value.map(normalize).includes(v);
    case "contains":
      if (Array.isArray(v)) return v.includes(value);
      return typeof v === "string" && typeof value === "string" && v.includes(value);
    case "starts_with":
      return typeof v === "string" && typeof value === "string" && v.startsWith(value);
    case "ends_with":
      return typeof v === "string" && typeof value === "string" && v.endsWith(value);
    default:
      throw new Error(`Unsupported filter op: ${String((f as Filter).op)}`);
  }
}

export function matches(doc: unknown, filters: Filter[] | undefined): boolean {
  if (!filters || filters.length === 0) return true;
  let result = evalFilter(doc, filters[0]);
  for (let i = 1; i < filters.length; i++) {
    const r = evalFilter(doc, filters[i]);
    result = filters[i].connector === "OR" ? result || r : result && r;
  }
  return result;
}

/** SQLite-compatible ordering: null/missing < numbers (booleans count as 0/1) < strings. */
function rank(v: unknown): number {
  if (isNullish(v)) return 0;
  if (typeof v === "boolean" || typeof v === "number") return 2;
  if (typeof v === "string") return 3;
  return 4;
}

export function compareValues(a: unknown, b: unknown): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (ra === 2) return Number(a) - Number(b);
  if (ra === 3) return (a as string) < (b as string) ? -1 : (a as string) > (b as string) ? 1 : 0;
  return 0;
}

export function sortDocs<T>(docs: T[], sort: QueryOptions["sort"]): T[] {
  if (!sort || sort.length === 0) return docs;
  return [...docs].sort((x, y) => {
    for (const s of sort) {
      const c = compareValues(getPath(x, s.field), getPath(y, s.field));
      if (c !== 0) return s.direction === "desc" ? -c : c;
    }
    return 0;
  });
}

export function paginate<T>(docs: T[], q: Pick<QueryOptions, "limit" | "offset"> | undefined): T[] {
  const offset = q?.offset ?? 0;
  const end = q?.limit === undefined ? undefined : offset + q.limit;
  return offset === 0 && end === undefined ? docs : docs.slice(offset, end);
}

/** Apply filter + sort + pagination fully in memory. */
export function runQuery<T>(docs: T[], q: QueryOptions | undefined): T[] {
  return paginate(sortDocs(docs.filter((d) => matches(d, q?.where)), q?.sort), q);
}
