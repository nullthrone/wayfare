import type { Doc, DocumentStore, QueryOptions } from "@/server/ports/document-store";

/** Minimal in-memory DocumentStore (equality filters only) for source tests. */
export function createFakeDb(): DocumentStore & { data: Map<string, Map<string, Doc>> } {
  const data = new Map<string, Map<string, Doc>>();
  const coll = (c: string) => {
    if (!data.has(c)) data.set(c, new Map());
    return data.get(c)!;
  };
  const matches = (d: Doc, q?: QueryOptions) => (q?.where ?? []).every((f) => f.op === "eq" && (d as Record<string, unknown>)[f.field] === f.value);
  const find = async (c: string, q?: QueryOptions) => [...coll(c).values()].filter((d) => matches(d, q));
  return {
    data,
    get: async (c, id) => (coll(c).get(id) as never) ?? null,
    create: async (c, d) => (coll(c).set(d.id, d), d),
    put: async (c, d) => (coll(c).set(d.id, d), d),
    update: async (c, id, patch) => {
      const cur = coll(c).get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch } as Doc;
      coll(c).set(id, next);
      return next as never;
    },
    increment: async () => {},
    delete: async (c, id) => void coll(c).delete(id),
    find: find as never,
    findOne: (async (c: string, q?: QueryOptions) => (await find(c, q))[0] ?? null) as never,
    count: async (c, q) => (await find(c, q)).length,
    updateMany: async () => 0,
    deleteMany: async () => 0,
  };
}

export function setGoogleEnv(extra: Record<string, string> = {}) {
  process.env.GOOGLE_SOURCES_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_SOURCES_CLIENT_SECRET = "client-secret";
  process.env.WAYFARE_BASE_URL = "https://wayfare.example";
  for (const [k, v] of Object.entries(extra)) process.env[k] = v;
}

export const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
