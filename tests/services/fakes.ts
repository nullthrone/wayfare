import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { createSqliteStore } from "@/server/adapters/db/sqlite";
import { createLocalStorage } from "@/server/adapters/storage/local";
import { vi } from "vitest";
import type { SessionUser } from "@/domain/types";
import type { BlobStorage } from "@/server/ports/blob-storage";
import type { Doc, DocumentStore, Filter, QueryOptions } from "@/server/ports/document-store";
import type { Mailer, MailMessage } from "@/server/ports/mailer";

/**
 * In-memory test doubles so the service tests do not depend on the SQLite / filesystem adapters.
 * Test files wire them in with:
 *
 *   vi.mock("@/server/container", async () => (await import("./fakes")).containerMock);
 *   vi.mock("next/headers", async () => (await import("./fakes")).nextHeadersMock);
 *   vi.mock("@/server/services/session", async () => (await import("./fakes")).sessionMock);
 *   vi.mock("@/server/services/themes", async () => (await import("./fakes")).themesMock);
 */

// ------------------------------------------------------------------ DocumentStore

const getPath = (obj: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  o[keys[keys.length - 1]] = value;
}

function matchOne(doc: unknown, f: Filter): boolean {
  const v = getPath(doc, f.field);
  const t = f.value;
  switch (f.op) {
    case "eq": return v !== undefined && v === t;
    case "ne": return v !== t;
    case "lt": return v !== undefined && (v as number | string) < (t as number | string);
    case "lte": return v !== undefined && (v as number | string) <= (t as number | string);
    case "gt": return v !== undefined && (v as number | string) > (t as number | string);
    case "gte": return v !== undefined && (v as number | string) >= (t as number | string);
    case "in": return Array.isArray(t) && t.includes(v);
    case "not_in": return !(Array.isArray(t) && t.includes(v));
    case "contains": return typeof v === "string" ? v.includes(String(t)) : Array.isArray(v) && v.includes(t);
    case "starts_with": return typeof v === "string" && v.startsWith(String(t));
    case "ends_with": return typeof v === "string" && v.endsWith(String(t));
  }
}

function matches(doc: unknown, where: Filter[] = []): boolean {
  let acc = true;
  where.forEach((f, i) => {
    const r = matchOne(doc, f);
    acc = i === 0 ? r : f.connector === "OR" ? acc || r : acc && r;
  });
  return acc;
}

export function createMemoryStore(): DocumentStore & { dump(collection: string): Doc[] } {
  const cols = new Map<string, Map<string, Doc>>();
  const col = (name: string) => {
    let c = cols.get(name);
    if (!c) cols.set(name, (c = new Map()));
    return c;
  };
  const run = (name: string, q: QueryOptions = {}): Doc[] => {
    let docs = [...col(name).values()].filter((d) => matches(d, q.where));
    if (q.sort?.length) {
      docs = docs.sort((a, b) => {
        for (const s of q.sort!) {
          const x = getPath(a, s.field) as string | number;
          const y = getPath(b, s.field) as string | number;
          if (x === y) continue;
          const cmp = x === undefined ? -1 : y === undefined ? 1 : x < y ? -1 : 1;
          return s.direction === "asc" ? cmp : -cmp;
        }
        return 0;
      });
    }
    const off = q.offset ?? 0;
    return docs.slice(off, q.limit === undefined ? undefined : off + q.limit);
  };
  const clone = <T>(x: T): T => structuredClone(x);
  return {
    async get(c, id) { const d = col(c).get(id); return d ? (clone(d) as never) : null; },
    async create(c, doc) {
      if (col(c).has(doc.id)) throw new Error(`duplicate ${c}/${doc.id}`);
      col(c).set(doc.id, clone(doc));
      return clone(doc);
    },
    async put(c, doc) { col(c).set(doc.id, clone(doc)); return clone(doc); },
    async update(c, id, patch) {
      const d = col(c).get(id);
      if (!d) return null;
      for (const [k, v] of Object.entries(patch)) setPath(d, k, clone(v));
      return clone(d) as never;
    },
    async increment(c, id, field, by) {
      const d = col(c).get(id);
      if (!d) return;
      setPath(d, field, ((getPath(d, field) as number | undefined) ?? 0) + by);
    },
    async delete(c, id) { col(c).delete(id); },
    async find(c, q) { return run(c, q).map(clone) as never; },
    async findOne(c, q) { const r = run(c, { ...q, limit: 1 })[0]; return r ? (clone(r) as never) : null; },
    async count(c, q) { return run(c, { where: q?.where }).length; },
    async updateMany(c, q, patch) {
      const docs = run(c, q);
      for (const d of docs) for (const [k, v] of Object.entries(patch)) setPath(d, k, clone(v));
      return docs.length;
    },
    async deleteMany(c, q) {
      const docs = run(c, q);
      for (const d of docs) col(c).delete(d.id);
      return docs.length;
    },
    dump(c) { return [...col(c).values()].map(clone); },
  };
}

// ------------------------------------------------------------------ BlobStorage

export function createMemoryBlobs(): BlobStorage & { keys(): string[] } {
  const m = new Map<string, { data: Buffer; contentType: string }>();
  return {
    async put(key, data, contentType) { m.set(key, { data: Buffer.from(data), contentType }); },
    async get(key) { return m.get(key) ?? null; },
    async exists(key) { return m.has(key); },
    async delete(key) { m.delete(key); },
    async deletePrefix(prefix) { for (const k of [...m.keys()]) if (k.startsWith(prefix)) m.delete(k); },
    keys: () => [...m.keys()].sort(),
  };
}

// ------------------------------------------------------------------ shared mutable test context

export const ctx = {
  db: createMemoryStore(),
  blobs: createMemoryBlobs(),
  sent: [] as MailMessage[],
  mailerKind: "console" as Mailer["kind"],
  cookieJar: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
  requestHeaders: new Headers({ "user-agent": "vitest", "accept-language": "en" }),
  currentUser: null as SessionUser | null,
};

/**
 * WAYFARE_TEST_REAL_ADAPTERS=1 runs the whole service suite against the real SQLite DocumentStore
 * and local BlobStorage (integration check between workstreams). `dump`/`keys` helpers are emulated.
 */
const REAL = process.env.WAYFARE_TEST_REAL_ADAPTERS === "1";
let realCounter = 0;
function freshStores(): { db: typeof ctx.db; blobs: typeof ctx.blobs } {
  if (!REAL) return { db: createMemoryStore(), blobs: createMemoryBlobs() };
  const dir = mkdtempSync(join(tmpdir(), `wayfare-it-${process.pid}-${++realCounter}-`));
  const sqlite = createSqliteStore(join(dir, "wayfare.db"));
  const local = createLocalStorage(join(dir, "blobs"));
  const blobDir = join(dir, "blobs");
  const reader = new Database(join(dir, "wayfare.db"), { readonly: false });
  const db = Object.assign(sqlite, {
    // Synchronous read through a second connection (WAL makes committed writes visible).
    dump: (collection: string) => {
      const exists = reader.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(`c_${collection}`);
      if (!exists) return [];
      return (reader.prepare(`SELECT data FROM "c_${collection}" ORDER BY rowid`).all() as { data: string }[]).map((r) => JSON.parse(r.data));
    },
  }) as typeof ctx.db;
  const blobs = Object.assign(local, {
    keys: () =>
      (readdirSync(blobDir, { recursive: true }) as string[])
        .filter((f) => !f.endsWith(".meta.json") && statSync(join(blobDir, f)).isFile())
        .map((f) => f.split(sep).join("/"))
        .sort(),
  }) as typeof ctx.blobs;
  return { db, blobs };
}

export function resetCtx() {
  const fresh = freshStores();
  ctx.db = fresh.db;
  ctx.blobs = fresh.blobs;
  ctx.sent = [];
  ctx.mailerKind = "console";
  ctx.cookieJar = new Map();
  ctx.cookieOptions = new Map();
  ctx.requestHeaders = new Headers({ "user-agent": "vitest", "accept-language": "en" });
  ctx.currentUser = null;
}

export const containerMock = {
  getDb: async () => ctx.db,
  getBlobs: async () => ctx.blobs,
  getMailer: async (): Promise<Mailer> => ({
    kind: ctx.mailerKind,
    async send(msg) { ctx.sent.push(msg); },
  }),
  container: async () => ({ db: ctx.db, blobs: ctx.blobs }),
};

export const nextHeadersMock = {
  cookies: async () => ({
    get: (name: string) => (ctx.cookieJar.has(name) ? { name, value: ctx.cookieJar.get(name)! } : undefined),
    set: (name: string, value: string, opts?: Record<string, unknown>) => {
      ctx.cookieJar.set(name, value);
      ctx.cookieOptions.set(name, opts ?? {});
    },
    delete: (name: string) => void ctx.cookieJar.delete(name),
  }),
  headers: async () => ctx.requestHeaders,
};

const RANK = { viewer: 0, owner: 1, admin: 2 } as const;
export const sessionMock = {
  hasRole: (user: SessionUser | null, role: keyof typeof RANK) => !!user && !user.banned && RANK[user.role] >= RANK[role],
  getCurrentUser: async () => ctx.currentUser,
  requireUser: async () => {
    const { unauthorized } = await import("@/server/errors");
    if (!ctx.currentUser) throw unauthorized();
    return ctx.currentUser;
  },
  requireRole: async (role: "owner" | "admin") => {
    const { unauthorized, forbidden } = await import("@/server/errors");
    if (!ctx.currentUser) throw unauthorized();
    if (RANK[ctx.currentUser.role] < RANK[role]) throw forbidden();
    return ctx.currentUser;
  },
};

export const THEME_REACTIONS = [
  { key: "heart", emoji: "x", label: { de: "Herz", en: "Heart" } },
  { key: "wow", emoji: "y", label: { de: "Wow", en: "Wow" } },
];
export const themesMock = {
  resolveTheme: vi.fn(async () => ({ id: "builtin:neutral", reactions: THEME_REACTIONS })),
};

// ------------------------------------------------------------------ data helpers

let n = 0;
/** Creates a user in the auth_user collection and returns the SessionUser projection. */
export async function makeUser(role: SessionUser["role"] = "viewer", extra: Partial<SessionUser> & { locale?: string } = {}): Promise<SessionUser> {
  const id = extra.id ?? `user${++n}`;
  const user: SessionUser = { id, name: extra.name ?? `User ${id}`, email: extra.email ?? `${id}@example.com`, image: null, role, banned: extra.banned ?? false };
  await ctx.db.put("auth_user", { ...user, emailVerified: true, locale: extra.locale, createdAt: new Date(1_700_000_000_000 + n * 1000).toISOString(), updatedAt: new Date().toISOString() });
  return user;
}

export async function jpeg(opts: { width?: number; height?: number; orientation?: number; exif?: boolean; color?: string } = {}): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  let img = sharp({ create: { width: opts.width ?? 64, height: opts.height ?? 48, channels: 3, background: opts.color ?? "#336699" } });
  if (opts.exif) {
    img = img.withExif({
      IFD0: { Copyright: "secret-copyright", Make: "TestCam" },
      IFD2: { DateTimeOriginal: "2023:07:14 10:30:00" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 8/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "11/1 34/1 0/1" },
    });
  }
  if (opts.orientation) img = img.withMetadata({ orientation: opts.orientation });
  return img.jpeg().toBuffer();
}
