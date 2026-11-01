import "server-only";
import { createAdapterFactory, type CleanedWhere } from "better-auth/adapters";
import { COLLECTIONS, type Doc, type Filter } from "../ports/document-store";
import { getDb } from "../container";

/**
 * Better Auth database adapter on top of the DocumentStore port.
 *
 * Model → collection mapping (Better Auth model keys): user, session, account, verification, passkey.
 * Notes:
 *  - Dates are persisted as ISO strings (`supportsDates: false`); the adapter factory converts them
 *    back to `Date` objects on output.
 *  - Joins are not supported natively; the factory resolves them with additional queries
 *    (we do NOT enable `advanced.database.joins`).
 *  - Transactions are not supported (`transaction: false`): operations run sequentially. Atomic
 *    primitives (`consumeOne`, `incrementOne`) use Better Auth's guarded fallbacks, which are race-safe
 *    on SQLite (single-statement conditional UPDATE/DELETE) and best-effort on Firestore.
 *  - `mode: "insensitive"` is ignored (Better Auth normalises e-mail addresses to lower case itself).
 */

const MODEL_TO_COLLECTION: Record<string, string> = {
  user: COLLECTIONS.authUser.name,
  session: COLLECTIONS.authSession.name,
  account: COLLECTIONS.authAccount.name,
  verification: COLLECTIONS.authVerification.name,
  passkey: COLLECTIONS.authPasskey.name,
};

function collectionFor(model: string, modelKey?: string): string {
  const name = MODEL_TO_COLLECTION[modelKey ?? ""] ?? MODEL_TO_COLLECTION[model];
  if (!name) throw new Error(`Better Auth model "${modelKey ?? model}" is not mapped to a collection`);
  return name;
}

function toFilters(where: CleanedWhere[] | undefined): Filter[] {
  return (where ?? []).map((w) => ({
    field: w.field,
    op: w.operator,
    value: w.value instanceof Date ? w.value.toISOString() : w.value,
    connector: w.connector,
  }));
}

export function documentStoreAdapter() {
  return createAdapterFactory({
    config: {
      adapterId: "wayfare-document-store",
      adapterName: "Wayfare DocumentStore",
      usePlural: false,
      supportsJSON: true,
      supportsArrays: true,
      supportsBooleans: true,
      supportsDates: false,
      supportsNumericIds: false,
      supportsUUIDs: false,
      transaction: false,
    },
    adapter: () => ({
      async create({ data, model, modelKey }) {
        const db = await getDb();
        await db.create(collectionFor(model, modelKey), data as unknown as Doc);
        return data;
      },

      async findOne<T>({ model, modelKey, where }: { model: string; modelKey?: string; where: CleanedWhere[] }) {
        const db = await getDb();
        return (await db.findOne(collectionFor(model, modelKey), { where: toFilters(where) })) as T | null;
      },

      async findMany<T>({
        model,
        modelKey,
        where,
        limit,
        sortBy,
        offset,
      }: {
        model: string;
        modelKey?: string;
        where?: CleanedWhere[];
        limit: number;
        sortBy?: { field: string; direction: "asc" | "desc" };
        offset?: number;
      }) {
        const db = await getDb();
        return (await db.find(collectionFor(model, modelKey), {
          where: toFilters(where),
          sort: sortBy ? [{ field: sortBy.field, direction: sortBy.direction }] : undefined,
          limit,
          offset,
        })) as T[];
      },

      async count({ model, modelKey, where }) {
        const db = await getDb();
        return db.count(collectionFor(model, modelKey), { where: toFilters(where) });
      },

      async update<T>({ model, modelKey, where, update }: { model: string; modelKey?: string; where: CleanedWhere[]; update: T }) {
        if (where.length === 0) return null;
        const db = await getDb();
        const collection = collectionFor(model, modelKey);
        const target = await db.findOne(collection, { where: toFilters(where) });
        if (!target) return null;
        return (await db.update(collection, target.id, update as Record<string, unknown>)) as T | null;
      },

      async updateMany({ model, modelKey, where, update }) {
        const db = await getDb();
        return db.updateMany(collectionFor(model, modelKey), { where: toFilters(where) }, update);
      },

      async delete({ model, modelKey, where }) {
        if (where.length === 0) return;
        const db = await getDb();
        await db.deleteMany(collectionFor(model, modelKey), { where: toFilters(where) });
      },

      async deleteMany({ model, modelKey, where }) {
        const db = await getDb();
        return db.deleteMany(collectionFor(model, modelKey), { where: toFilters(where) });
      },
    }),
  });
}
