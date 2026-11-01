import "server-only";
import { FieldValue, getFirestore, type Firestore, type Query } from "firebase-admin/firestore";
import type { Doc, DocumentStore, Filter, QueryOptions } from "../../ports/document-store";
import { getFirebaseApp } from "../firebase-app";
import { DocumentExistsError } from "./errors";
import { matches, runQuery, setPath } from "./filter";

/**
 * Firestore DocumentStore. One Firestore collection per collection name, document id = doc.id.
 *
 * Query strategy (see ports/document-store.ts): Firestore has many query restrictions (composite
 * indexes, single `in`/`!=`, no missing-field matching), so only a safe subset is pushed down:
 *   1. all non-null scalar `eq` filters (no OR present) — multi-field equality needs no composite index;
 *   2. otherwise a single `in` (<= 30 values), otherwise range filters on ONE field.
 * Whatever is pushed down is ALSO re-evaluated in memory together with the remaining filters, then
 * sort / offset / limit are applied in memory. Without any filter, orderBy/limit/offset are pushed
 * down (note: Firestore omits docs lacking the sort field in that case).
 */

const GRPC_NOT_FOUND = 5;
const GRPC_ALREADY_EXISTS = 6;
const BATCH_SIZE = 450;

const g = globalThis as unknown as { __wayfareFirestore?: Firestore };

function firestore(): Firestore {
  if (!g.__wayfareFirestore) {
    const fs = getFirestore(getFirebaseApp());
    try {
      fs.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings() may only be called once, before first use; already configured elsewhere.
    }
    g.__wayfareFirestore = fs;
  }
  return g.__wayfareFirestore;
}

const isScalar = (v: unknown) => typeof v === "string" || typeof v === "number" || typeof v === "boolean";

interface Plan {
  apply: (q: Query) => Query;
  /** True when the pushed-down query yields exactly the matching documents. */
  exact: boolean;
}

function plan(filters: Filter[] | undefined): Plan {
  const list = filters ?? [];
  if (list.length === 0) return { apply: (q) => q, exact: true };
  if (list.some((f) => f.connector === "OR")) return { apply: (q) => q, exact: false };

  const eqs = list.filter((f) => f.op === "eq" && isScalar(f.value));
  if (eqs.length > 0) {
    // De-duplicate contradicting eq filters on the same field: let memory decide.
    const byField = new Map<string, unknown>();
    for (const f of eqs) if (byField.has(f.field) && byField.get(f.field) !== f.value) return { apply: (q) => q, exact: false };
    else byField.set(f.field, f.value);
    return {
      apply: (q) => [...byField].reduce((acc, [field, value]) => acc.where(field, "==", value), q),
      exact: eqs.length === list.length,
    };
  }

  const ins = list.filter((f) => f.op === "in" && Array.isArray(f.value) && f.value.length > 0 && f.value.length <= 30 && f.value.every(isScalar));
  if (ins.length > 0) {
    const f = ins[0];
    return { apply: (q) => q.where(f.field, "in", f.value as unknown[]), exact: ins.length === 1 && list.length === 1 };
  }

  const ranges = list.filter((f) => ["lt", "lte", "gt", "gte"].includes(f.op) && isScalar(f.value) && typeof f.value !== "boolean");
  if (ranges.length > 0) {
    const field = ranges[0].field;
    const same = ranges.filter((f) => f.field === field);
    const opMap = { lt: "<", lte: "<=", gt: ">", gte: ">=" } as const;
    return {
      apply: (q) => same.reduce((acc, f) => acc.where(f.field, opMap[f.op as keyof typeof opMap], f.value as string | number), q),
      exact: false,
    };
  }
  return { apply: (q) => q, exact: false };
}

function toFirestorePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id") continue;
    out[k] = v === undefined ? FieldValue.delete() : v;
  }
  return out;
}

const codeOf = (e: unknown) => (e as { code?: number | string }).code;

export function createFirestoreStore(): DocumentStore {
  const col = (name: string) => firestore().collection(name);

  async function fetch<T extends Doc>(collection: string, q: QueryOptions | undefined): Promise<T[]> {
    const where = q?.where ?? [];
    if (where.length === 0) {
      let query: Query = col(collection);
      for (const s of q?.sort ?? []) query = query.orderBy(s.field, s.direction);
      if (q?.offset) query = query.offset(q.offset);
      if (q?.limit !== undefined) query = query.limit(q.limit);
      const snap = await query.get();
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
    }
    const snap = await plan(where).apply(col(collection)).get();
    const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);
    return runQuery(docs, q);
  }

  async function writeBatches(docs: Doc[], collection: string, write: (b: FirebaseFirestore.WriteBatch, ref: FirebaseFirestore.DocumentReference) => void) {
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = firestore().batch();
      for (const d of docs.slice(i, i + BATCH_SIZE)) write(batch, col(collection).doc(d.id));
      await batch.commit();
    }
  }

  return {
    async get<T extends Doc>(collection: string, id: string) {
      const snap = await col(collection).doc(id).get();
      return snap.exists ? ({ ...snap.data(), id: snap.id } as T) : null;
    },

    async create<T extends Doc>(collection: string, doc: T) {
      try {
        await col(collection).doc(doc.id).create(doc);
      } catch (e) {
        if (codeOf(e) === GRPC_ALREADY_EXISTS) throw new DocumentExistsError(collection, doc.id);
        throw e;
      }
      return doc;
    },

    async put<T extends Doc>(collection: string, doc: T) {
      await col(collection).doc(doc.id).set(doc);
      return doc;
    },

    async update<T extends Doc>(collection: string, id: string, patch: Record<string, unknown>) {
      const ref = col(collection).doc(id);
      return firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const p = toFirestorePatch(patch);
        if (Object.keys(p).length > 0) tx.update(ref, p);
        // Re-read after commit is not possible inside the transaction; apply the patch locally.
        const merged: Record<string, unknown> = { ...snap.data(), id };
        for (const [k, v] of Object.entries(patch)) if (k !== "id") setPath(merged, k, v);
        return merged as T;
      });
    },

    async increment(collection: string, id: string, field: string, by: number) {
      try {
        await col(collection).doc(id).update({ [field]: FieldValue.increment(by) });
      } catch (e) {
        if (codeOf(e) !== GRPC_NOT_FOUND) throw e;
      }
    },

    async delete(collection: string, id: string) {
      await col(collection).doc(id).delete();
    },

    async find<T extends Doc>(collection: string, query?: QueryOptions) {
      return fetch<T>(collection, query);
    },

    async findOne<T extends Doc>(collection: string, query?: QueryOptions) {
      return ((await fetch<T>(collection, { ...query, limit: 1 }))[0] as T | undefined) ?? null;
    },

    async count(collection: string, query?: QueryOptions) {
      const where = query?.where ?? [];
      const p = plan(where);
      if (p.exact) {
        const res = await p.apply(col(collection)).count().get();
        return res.data().count;
      }
      const snap = await p.apply(col(collection)).get();
      return snap.docs.filter((d) => matches({ ...d.data(), id: d.id }, where)).length;
    },

    async updateMany(collection: string, query: QueryOptions, patch: Record<string, unknown>) {
      const docs = await fetch<Doc>(collection, query);
      const p = toFirestorePatch(patch);
      if (Object.keys(p).length === 0) return docs.length;
      await writeBatches(docs, collection, (b, ref) => b.update(ref, p));
      return docs.length;
    },

    async deleteMany(collection: string, query: QueryOptions) {
      const docs = await fetch<Doc>(collection, query);
      await writeBatches(docs, collection, (b, ref) => b.delete(ref));
      return docs.length;
    },
  };
}
