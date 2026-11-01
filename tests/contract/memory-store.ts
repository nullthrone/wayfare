import type { Doc, DocumentStore, QueryOptions } from "@/server/ports/document-store";
import { DocumentExistsError } from "@/server/adapters/db/errors";
import { getPath, runQuery, setPath } from "@/server/adapters/db/filter";

/** Reference DocumentStore on top of the shared in-memory evaluator (also validates filter.ts against the contract). */
export function createMemoryStore(): DocumentStore {
  const cols = new Map<string, Map<string, Doc>>();
  const col = (n: string) => {
    let m = cols.get(n);
    if (!m) cols.set(n, (m = new Map()));
    return m;
  };
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const query = <T extends Doc>(n: string, q?: QueryOptions) => runQuery([...col(n).values()].map(clone), q) as T[];
  const patchDoc = (d: Record<string, unknown>, patch: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(patch)) if (k !== "id") setPath(d, k, v);
  };
  return {
    async get<T extends Doc>(n: string, id: string) {
      const d = col(n).get(id);
      return d ? (clone(d) as T) : null;
    },
    async create<T extends Doc>(n: string, doc: T) {
      if (col(n).has(doc.id)) throw new DocumentExistsError(n, doc.id);
      col(n).set(doc.id, clone(doc));
      return doc;
    },
    async put<T extends Doc>(n: string, doc: T) {
      col(n).set(doc.id, clone(doc));
      return doc;
    },
    async update<T extends Doc>(n: string, id: string, patch: Record<string, unknown>) {
      const d = col(n).get(id);
      if (!d) return null;
      patchDoc(d, patch);
      return clone(d) as T;
    },
    async increment(n, id, field, by) {
      const d = col(n).get(id);
      if (!d) return;
      const cur = getPath(d, field);
      setPath(d, field, (typeof cur === "number" ? cur : 0) + by);
    },
    async delete(n, id) {
      col(n).delete(id);
    },
    async find<T extends Doc>(n: string, q?: QueryOptions) {
      return query<T>(n, q);
    },
    async findOne<T extends Doc>(n: string, q?: QueryOptions) {
      return (query<T>(n, { ...q, limit: 1 })[0] as T | undefined) ?? null;
    },
    async count(n, q) {
      return query(n, { where: q?.where }).length;
    },
    async updateMany(n, q, patch) {
      const hit = query(n, q);
      for (const h of hit) patchDoc(col(n).get(h.id)!, patch);
      return hit.length;
    },
    async deleteMany(n, q) {
      const hit = query(n, q);
      for (const h of hit) col(n).delete(h.id);
      return hit.length;
    },
  };
}
