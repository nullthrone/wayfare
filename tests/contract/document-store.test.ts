import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Doc, DocumentStore, Filter } from "@/server/ports/document-store";
import { createSqliteStore } from "@/server/adapters/db/sqlite";
import { createMemoryStore } from "./memory-store";

interface Item extends Doc {
  name: string;
  n: number;
  active?: boolean;
  tags?: string[];
  meta?: { a?: number; mode?: string; deep?: { x: number } };
  note?: string | null;
}

/**
 * Contract suite for DocumentStore implementations. Reused by every adapter
 * (SQLite always, Firestore when FIRESTORE_EMULATOR_HOST is set).
 */
export function runDocumentStoreContract(name: string, factory: () => DocumentStore | Promise<DocumentStore>, opts: { skip?: boolean } = {}) {
  describe.skipIf(opts.skip)(`DocumentStore contract: ${name}`, () => {
    let db: DocumentStore;
    let c: string; // unique collection per test
    const ids = (docs: Doc[]) => docs.map((d) => d.id).sort();

    const seed = async () => {
      const docs: Item[] = [
        { id: "a", name: "alpha", n: 1, active: true, tags: ["x", "y"], meta: { a: 1, mode: "link", deep: { x: 10 } }, note: "hello world" },
        { id: "b", name: "beta", n: 2, active: false, tags: ["y"], meta: { a: 2, mode: "password" }, note: null },
        { id: "c", name: "gamma", n: 3, active: true, tags: [], meta: { mode: "link" } },
        { id: "d", name: "delta", n: 4, tags: ["z"], note: "Hello" },
        { id: "e", name: "epsilon", n: 5, active: false },
      ];
      for (const d of docs) await db.create(c, d);
      return docs;
    };

    beforeEach(async () => {
      db = await factory();
      c = `t_${nanoid(8).replace(/[^A-Za-z0-9]/g, "x")}`;
    });

    it("create / get / put / delete", async () => {
      expect(await db.get(c, "nope")).toBeNull();
      const doc: Item = { id: "1", name: "one", n: 1 };
      expect(await db.create(c, doc)).toEqual(doc);
      expect(await db.get<Item>(c, "1")).toEqual(doc);
      await db.put(c, { id: "1", name: "uno", n: 11 });
      expect(await db.get<Item>(c, "1")).toEqual({ id: "1", name: "uno", n: 11 });
      await db.put(c, { id: "2", name: "two", n: 2 });
      expect(await db.count(c)).toBe(2);
      await db.delete(c, "1");
      await db.delete(c, "does-not-exist");
      expect(await db.get(c, "1")).toBeNull();
      expect(await db.count(c)).toBe(1);
    });

    it("create fails when the id exists", async () => {
      await db.create(c, { id: "1", name: "one", n: 1 });
      await expect(db.create(c, { id: "1", name: "again", n: 2 })).rejects.toThrow();
      expect((await db.get<Item>(c, "1"))?.name).toBe("one");
    });

    it("update shallow-merges, supports dot paths and returns the updated doc", async () => {
      await db.create(c, { id: "1", name: "one", n: 1, meta: { a: 1, mode: "link" } } satisfies Item);
      const res = await db.update<Item>(c, "1", { name: "uno", "meta.mode": "password", "meta.deep.x": 5 });
      expect(res).toEqual({ id: "1", name: "uno", n: 1, meta: { a: 1, mode: "password", deep: { x: 5 } } });
      expect(await db.get<Item>(c, "1")).toEqual(res);
      // undefined removes the field
      const res2 = await db.update<Item>(c, "1", { n: undefined });
      expect(res2?.n).toBeUndefined();
      expect("n" in ((await db.get<Item>(c, "1")) as object)).toBe(false);
      expect(await db.update(c, "missing", { name: "x" })).toBeNull();
      expect(await db.get(c, "missing")).toBeNull();
    });

    it("update cannot change the id", async () => {
      await db.create(c, { id: "1", name: "one", n: 1 });
      await db.update(c, "1", { id: "other", name: "x" });
      expect((await db.get<Item>(c, "1"))?.name).toBe("x");
      expect(await db.get(c, "other")).toBeNull();
    });

    it("increment works on top-level and nested fields, missing field = 0, missing doc = no-op", async () => {
      await db.create(c, { id: "1", name: "one", n: 1, meta: { a: 5 } } satisfies Item);
      await db.increment(c, "1", "n", 2);
      await db.increment(c, "1", "meta.a", -1);
      await db.increment(c, "1", "counter", 3);
      await db.increment(c, "1", "stats.views", 1);
      const doc = await db.get<Item & { counter: number; stats: { views: number } }>(c, "1");
      expect(doc?.n).toBe(3);
      expect(doc?.meta?.a).toBe(4);
      expect(doc?.counter).toBe(3);
      expect(doc?.stats.views).toBe(1);
      await expect(db.increment(c, "missing", "n", 1)).resolves.toBeUndefined();
      expect(await db.get(c, "missing")).toBeNull();
    });

    it("supports keys with hyphens and leading digits (e.g. reaction keys) in update, increment, filter and sort", async () => {
      await db.create(c, { id: "1", name: "one", n: 1 });
      await db.increment(c, "1", "reactionCounts.white-heart", 2);
      await db.increment(c, "1", "reactionCounts.1st", 1);
      await db.update(c, "1", { "labels.de-de": "Kerze" });
      const doc = await db.get<Item & { reactionCounts: Record<string, number>; labels: Record<string, string> }>(c, "1");
      expect(doc?.reactionCounts).toEqual({ "white-heart": 2, "1st": 1 });
      expect(doc?.labels["de-de"]).toBe("Kerze");
      expect(await db.count(c, { where: [{ field: "reactionCounts.white-heart", op: "gte", value: 2 }] })).toBe(1);
      await db.create(c, { id: "2", name: "two", n: 2 });
      await db.increment(c, "2", "reactionCounts.white-heart", 5);
      const sorted = await db.find<Item>(c, { sort: [{ field: "reactionCounts.white-heart", direction: "desc" }] });
      expect(sorted.map((d) => d.id)).toEqual(["2", "1"]);
    });

    it("increment is atomic under concurrency", async () => {
      await db.create(c, { id: "1", name: "one", n: 0 });
      await Promise.all(Array.from({ length: 50 }, () => db.increment(c, "1", "n", 1)));
      expect((await db.get<Item>(c, "1"))?.n).toBe(50);
    });

    it("eq / ne", async () => {
      await seed();
      expect(ids(await db.find(c, { where: [{ field: "name", op: "eq", value: "beta" }] }))).toEqual(["b"]);
      expect(ids(await db.find(c, { where: [{ field: "n", op: "eq", value: 3 }] }))).toEqual(["c"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "ne", value: "beta" }] }))).toEqual(["a", "c", "d", "e"]);
      // ne matches documents where the field is missing
      expect(ids(await db.find(c, { where: [{ field: "active", op: "ne", value: true }] }))).toEqual(["b", "d", "e"]);
      // missing fields never match eq
      expect(ids(await db.find(c, { where: [{ field: "meta.mode", op: "eq", value: "nope" }] }))).toEqual([]);
    });

    it("eq null matches missing/null; ne null matches present", async () => {
      await seed();
      expect(ids(await db.find(c, { where: [{ field: "note", op: "eq", value: null }] }))).toEqual(["b", "c", "e"]);
      expect(ids(await db.find(c, { where: [{ field: "note", op: "ne", value: null }] }))).toEqual(["a", "d"]);
    });

    it("booleans", async () => {
      await seed();
      expect(ids(await db.find(c, { where: [{ field: "active", op: "eq", value: true }] }))).toEqual(["a", "c"]);
      expect(ids(await db.find(c, { where: [{ field: "active", op: "eq", value: false }] }))).toEqual(["b", "e"]);
      expect(await db.count(c, { where: [{ field: "active", op: "eq", value: true }] })).toBe(2);
      const doc = await db.get<Item>(c, "a");
      expect(doc?.active).toBe(true); // stays a real boolean
    });

    it("dot paths in filters", async () => {
      await seed();
      expect(ids(await db.find(c, { where: [{ field: "meta.mode", op: "eq", value: "link" }] }))).toEqual(["a", "c"]);
      expect(ids(await db.find(c, { where: [{ field: "meta.deep.x", op: "gte", value: 10 }] }))).toEqual(["a"]);
    });

    it("range operators", async () => {
      await seed();
      const f = (op: "lt" | "lte" | "gt" | "gte", value: unknown) => db.find(c, { where: [{ field: "n", op, value }] }).then(ids);
      expect(await f("lt", 3)).toEqual(["a", "b"]);
      expect(await f("lte", 3)).toEqual(["a", "b", "c"]);
      expect(await f("gt", 3)).toEqual(["d", "e"]);
      expect(await f("gte", 3)).toEqual(["c", "d", "e"]);
      // string ranges (ISO timestamps compare lexicographically)
      await db.put(c, { id: "t1", name: "x", n: 0, at: "2026-01-01T00:00:00.000Z" });
      await db.put(c, { id: "t2", name: "x", n: 0, at: "2026-06-01T00:00:00.000Z" });
      expect(ids(await db.find(c, { where: [{ field: "at", op: "lt", value: "2026-03-01T00:00:00.000Z" }] }))).toEqual(["t1"]);
      // range filters never match missing fields or other types
      expect(ids(await db.find(c, { where: [{ field: "at", op: "gt", value: "" }] }))).toEqual(["t1", "t2"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "lt", value: 5 }] }))).toEqual([]);
    });

    it("in / not_in", async () => {
      await seed();
      expect(ids(await db.find(c, { where: [{ field: "name", op: "in", value: ["alpha", "gamma", "zzz"] }] }))).toEqual(["a", "c"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "in", value: [] }] }))).toEqual([]);
      expect(ids(await db.find(c, { where: [{ field: "n", op: "in", value: [1, 5] }] }))).toEqual(["a", "e"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "not_in", value: ["alpha", "gamma"] }] }))).toEqual(["b", "d", "e"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "not_in", value: [] }] }))).toHaveLength(5);
      // not_in matches missing fields
      expect(ids(await db.find(c, { where: [{ field: "active", op: "not_in", value: [true] }] }))).toEqual(["b", "d", "e"]);
      expect(ids(await db.find(c, { where: [{ field: "id", op: "in", value: ["a", "b"] }] }))).toEqual(["a", "b"]);
    });

    it("contains on arrays and strings", async () => {
      await seed();
      expect(ids(await db.find(c, { where: [{ field: "tags", op: "contains", value: "y" }] }))).toEqual(["a", "b"]);
      expect(ids(await db.find(c, { where: [{ field: "tags", op: "contains", value: "q" }] }))).toEqual([]);
      expect(ids(await db.find(c, { where: [{ field: "note", op: "contains", value: "lo wo" }] }))).toEqual(["a"]);
      expect(ids(await db.find(c, { where: [{ field: "note", op: "contains", value: "hello" }] }))).toEqual(["a"]); // case-sensitive
    });

    it("starts_with / ends_with (case-sensitive, wildcard-safe)", async () => {
      await seed();
      await db.put(c, { id: "p", name: "100%_done", n: 0 });
      await db.put(c, { id: "q", name: "100xxdone", n: 0 });
      expect(ids(await db.find(c, { where: [{ field: "name", op: "starts_with", value: "al" }] }))).toEqual(["a"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "starts_with", value: "AL" }] }))).toEqual([]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "ends_with", value: "ta" }] }))).toEqual(["b", "d"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "starts_with", value: "100%_" }] }))).toEqual(["p"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "ends_with", value: "%_done" }] }))).toEqual(["p"]);
      expect(ids(await db.find(c, { where: [{ field: "name", op: "ends_with", value: "longer than any name in the set" }] }))).toEqual([]);
    });

    it("AND by default, OR connector folds left to right", async () => {
      await seed();
      const q = (where: Filter[]) => db.find(c, { where }).then(ids);
      expect(
        await q([
          { field: "active", op: "eq", value: true },
          { field: "n", op: "gt", value: 1 },
        ]),
      ).toEqual(["c"]);
      // (active = true AND n = 1) OR name = epsilon
      expect(
        await q([
          { field: "active", op: "eq", value: true },
          { field: "n", op: "eq", value: 1 },
          { field: "name", op: "eq", value: "epsilon", connector: "OR" },
        ]),
      ).toEqual(["a", "e"]);
      // ((name = beta OR name = delta) AND n > 2)
      expect(
        await q([
          { field: "name", op: "eq", value: "beta" },
          { field: "name", op: "eq", value: "delta", connector: "OR" },
          { field: "n", op: "gt", value: 2, connector: "AND" },
        ]),
      ).toEqual(["d"]);
    });

    it("sort + limit + offset", async () => {
      await seed();
      const names = (docs: Doc[]) => docs.map((d) => d.id);
      expect(names(await db.find(c, { where: [{ field: "n", op: "gte", value: 1 }], sort: [{ field: "n", direction: "desc" }] }))).toEqual(["e", "d", "c", "b", "a"]);
      expect(names(await db.find(c, { where: [{ field: "n", op: "gte", value: 1 }], sort: [{ field: "n", direction: "asc" }], limit: 2, offset: 1 }))).toEqual(["b", "c"]);
      expect(names(await db.find(c, { where: [{ field: "n", op: "gte", value: 1 }], sort: [{ field: "name", direction: "asc" }], offset: 3 }))).toEqual(["e", "c"]);
      expect(names(await db.find(c, { sort: [{ field: "n", direction: "desc" }], limit: 3 }))).toEqual(["e", "d", "c"]);
      expect(names(await db.find(c, { sort: [{ field: "n", direction: "asc" }], limit: 2, offset: 2 }))).toEqual(["c", "d"]);
      // multi-key sort
      await db.put(c, { id: "f", name: "alpha", n: 0 });
      expect(names(await db.find(c, { where: [{ field: "name", op: "eq", value: "alpha" }], sort: [{ field: "name", direction: "asc" }, { field: "n", direction: "desc" }] }))).toEqual(["a", "f"]);
      expect(await db.find(c, { limit: 0 })).toEqual([]);
    });

    it("findOne and count", async () => {
      await seed();
      expect((await db.findOne<Item>(c, { where: [{ field: "name", op: "eq", value: "gamma" }] }))?.id).toBe("c");
      expect(await db.findOne(c, { where: [{ field: "name", op: "eq", value: "nobody" }] })).toBeNull();
      expect((await db.findOne<Item>(c, { sort: [{ field: "n", direction: "desc" }] }))?.id).toBe("e");
      expect(await db.count(c)).toBe(5);
      expect(await db.count(c, { where: [{ field: "n", op: "gt", value: 2 }] })).toBe(3);
      expect(
        await db.count(c, {
          where: [
            { field: "n", op: "eq", value: 1 },
            { field: "n", op: "eq", value: 2, connector: "OR" },
          ],
        }),
      ).toBe(2);
      expect(await db.count(`${c}_empty`)).toBe(0);
      expect(await db.find(`${c}_empty`)).toEqual([]);
    });

    it("updateMany patches matching docs and returns the count", async () => {
      await seed();
      const n = await db.updateMany(c, { where: [{ field: "active", op: "eq", value: true }] }, { name: "ACTIVE", "meta.flag": 1 });
      expect(n).toBe(2);
      const docs = await db.find<Item & { meta: { flag?: number } }>(c, { where: [{ field: "name", op: "eq", value: "ACTIVE" }] });
      expect(ids(docs)).toEqual(["a", "c"]);
      expect(docs.every((d) => d.meta.flag === 1)).toBe(true);
      expect((await db.get<Item>(c, "a"))?.meta?.mode).toBe("link"); // siblings preserved
      expect(await db.updateMany(c, { where: [{ field: "name", op: "eq", value: "none" }] }, { name: "x" })).toBe(0);
    });

    it("deleteMany deletes matching docs and returns the count", async () => {
      await seed();
      expect(await db.deleteMany(c, { where: [{ field: "n", op: "gt", value: 3 }] })).toBe(2);
      expect(ids(await db.find(c))).toEqual(["a", "b", "c"]);
      expect(await db.deleteMany(c, { where: [{ field: "n", op: "gt", value: 100 }] })).toBe(0);
      expect(await db.deleteMany(c, {})).toBe(3);
      expect(await db.count(c)).toBe(0);
    });

    it("handles large batches (> 500 docs) in updateMany/deleteMany", async () => {
      await Promise.all(Array.from({ length: 620 }, (_, i) => db.put(c, { id: `d${i}`, name: "bulk", n: i })));
      expect(await db.updateMany(c, { where: [{ field: "name", op: "eq", value: "bulk" }] }, { name: "done" })).toBe(620);
      expect(await db.count(c, { where: [{ field: "name", op: "eq", value: "done" }] })).toBe(620);
      expect(await db.deleteMany(c, { where: [{ field: "name", op: "eq", value: "done" }] })).toBe(620);
      expect(await db.count(c)).toBe(0);
    }, 60_000);

    it("round-trips nested JSON values faithfully", async () => {
      const doc = { id: "j", name: "json", n: 1, nested: { arr: [1, "two", { three: 3 }], flag: false, nil: null, text: "ä ö ü \"quoted\" \n newline" } };
      await db.put(c, doc);
      expect(await db.get(c, "j")).toEqual(doc);
    });

    it("rejects unsafe field paths without executing them", async () => {
      await seed();
      if (name.startsWith("sqlite")) {
        await expect(db.find(c, { where: [{ field: "x') OR 1=1 --", op: "eq", value: 1 }] })).rejects.toThrow();
      }
    });
  });
}

// --- SQLite ---------------------------------------------------------------
const tmpDirs: string[] = [];
runDocumentStoreContract("sqlite (file)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wayfare-sqlite-"));
  tmpDirs.push(dir);
  return createSqliteStore(path.join(dir, "nested", "test.db"));
});
runDocumentStoreContract("sqlite (memory)", () => createSqliteStore(":memory:"));
// Reference implementation on the shared evaluator used by the Firestore adapter.
runDocumentStoreContract("in-memory reference (filter.ts)", () => createMemoryStore());

describe("sqlite specifics", () => {
  it("creates expression indexes for declared fields and uses them", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wayfare-sqlite-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "idx.db");
    const store = createSqliteStore(file);
    await store.put("albums", { id: "1", ownerId: "u1", slug: "abc" });
    const Database = (await import("better-sqlite3")).default;
    const raw = new Database(file, { readonly: true });
    const idx = raw.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='c_albums'").all() as { name: string }[];
    expect(idx.map((i) => i.name)).toEqual(expect.arrayContaining(["i_c_albums_ownerId", "i_c_albums_slug"]));
    const plan = raw.prepare("EXPLAIN QUERY PLAN SELECT data FROM \"c_albums\" WHERE json_extract(data,'$.\"ownerId\"') = ?").all("u1") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toContain("USING INDEX");
    raw.close();
  });

  it("persists across store instances (WAL)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wayfare-sqlite-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "p.db");
    await createSqliteStore(file).put("settings", { id: "instance", v: 1 });
    expect(await createSqliteStore(file).get("settings", "instance")).toEqual({ id: "instance", v: 1 });
  });
});

// --- Firestore (emulator only) ---------------------------------------------
runDocumentStoreContract(
  "firestore (emulator)",
  async () => {
    process.env.FIREBASE_PROJECT_ID ??= "wayfare-test";
    const { createFirestoreStore } = await import("@/server/adapters/db/firestore");
    return createFirestoreStore();
  },
  { skip: !process.env.FIRESTORE_EMULATOR_HOST },
);

afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});
