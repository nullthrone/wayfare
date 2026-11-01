import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentStore, Doc, QueryOptions } from "@/server/ports/document-store";
import type { SessionUser } from "@/domain/types";
import { getBuiltinTheme } from "@/themes/builtin";

/** Tiny in-memory DocumentStore (only what the themes service uses). */
function memoryStore(): DocumentStore {
  const data = new Map<string, Map<string, Doc>>();
  const col = (c: string) => data.get(c) ?? data.set(c, new Map()).get(c)!;
  const match = (d: Doc, q?: QueryOptions) =>
    (q?.where ?? []).every((f) => (f.op === "eq" ? (d as Record<string, unknown>)[f.field] === f.value : true));
  return {
    async get(c, id) { return (col(c).get(id) as never) ?? null; },
    async create(c, doc) { col(c).set(doc.id, structuredClone(doc)); return doc; },
    async put(c, doc) { col(c).set(doc.id, structuredClone(doc)); return doc; },
    async update(c, id, patch) {
      const d = col(c).get(id);
      if (!d) return null;
      Object.assign(d, patch);
      return d as never;
    },
    async increment() {},
    async delete(c, id) { col(c).delete(id); },
    async find(c, q) { return [...col(c).values()].filter((d) => match(d, q)) as never; },
    async findOne(c, q) { return ([...col(c).values()].find((d) => match(d, q)) as never) ?? null; },
    async count(c, q) { return [...col(c).values()].filter((d) => match(d, q)).length; },
    async updateMany() { return 0; },
    async deleteMany() { return 0; },
  };
}

let store: DocumentStore;
vi.mock("@/server/container", () => ({ getDb: async () => store }));

const user = (id: string, role: SessionUser["role"] = "owner"): SessionUser => ({ id, name: id, email: `${id}@x.y`, role });
const base = () => ({ ...structuredClone(getBuiltinTheme("builtin:birthday")!), id: "new", baseThemeId: "builtin:birthday" });

beforeEach(() => {
  store = memoryStore();
});

describe("themes service", () => {
  it("lists builtins + own + public custom themes; resolves unknown ids to neutral", async () => {
    const svc = await import("@/server/services/themes");
    const alice = user("alice");
    const bob = user("bob");
    const a = await svc.saveCustomTheme(alice, base());
    const b = await svc.saveCustomTheme(bob, base());
    expect(a.ownerId).toBe("alice");
    expect(a.id).not.toBe("new");
    expect((await svc.listAvailableThemes(alice)).map((t) => t.id)).toContain(a.id);
    expect((await svc.listAvailableThemes(alice)).map((t) => t.id)).not.toContain(b.id);
    expect((await svc.listAvailableThemes(null)).length).toBe(13);
    await svc.setThemePublic(user("root", "admin"), b.id, true);
    expect((await svc.listAvailableThemes(alice)).map((t) => t.id)).toContain(b.id);
    expect((await svc.resolveTheme(b.id)).id).toBe(b.id);
    expect(Object.keys(await svc.resolveTheme(b.id))).not.toContain("ownerId");
    expect((await svc.resolveTheme("gone")).id).toBe("builtin:neutral");
    expect((await svc.resolveTheme("builtin:memorial")).occasion).toBe("memorial");
  });

  it("only owners edit their own themes, validates input, admin publishes", async () => {
    const svc = await import("@/server/services/themes");
    const alice = user("alice");
    const bob = user("bob");
    const a = await svc.saveCustomTheme(alice, base());
    const updated = await svc.saveCustomTheme(alice, { ...a, name: { de: "Neu", en: "New" } });
    expect(updated.id).toBe(a.id);
    expect(updated.name.en).toBe("New");
    await expect(svc.saveCustomTheme(bob, { ...a, name: { de: "x", en: "x" } })).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.saveCustomTheme(alice, { ...base(), colors: { ...base().colors, text: "red" } })).rejects.toMatchObject({ code: "validation" });
    await expect(svc.saveCustomTheme(alice, { ...base(), reactions: [] })).rejects.toMatchObject({ code: "validation" });
    await expect(svc.saveCustomTheme(user("v", "viewer"), base())).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.setThemePublic(alice, a.id, true)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.deleteCustomTheme(bob, a.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(svc.deleteCustomTheme(alice, "builtin:birthday")).rejects.toMatchObject({ code: "forbidden" });
    await svc.deleteCustomTheme(alice, a.id);
    expect((await svc.resolveTheme(a.id)).id).toBe("builtin:neutral");
  });
});
