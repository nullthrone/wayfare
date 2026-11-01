import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/server/config";
import { AppError } from "@/server/errors";
import type { SessionUser } from "@/domain/types";
import type { FetchedItem, PhotoSourceAdapter, RemoteItem } from "@/server/ports/photo-source";
import { createFakeDb, setGoogleEnv } from "./helpers";

const h = vi.hoisted(() => ({
  db: null as unknown,
  addPhoto: vi.fn(),
  getAlbumForOwner: vi.fn(),
  adapter: null as unknown,
}));

vi.mock("@/server/container", () => ({ getDb: async () => h.db }));
vi.mock("@/server/services/photos", () => ({ addPhoto: h.addPhoto }));
vi.mock("@/server/services/albums", () => ({ getAlbumForOwner: h.getAlbumForOwner }));
vi.mock("@/server/sources/connections", () => ({
  getValidTokens: async () => ({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 1e6, scope: "" }),
  listConnections: async () => [],
  saveConnection: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("@/server/sources/registry", async (orig) => {
  const real = await orig<typeof import("@/server/sources/registry")>();
  return { ...real, getSource: (id: string) => (id === "google-photos" ? (h.adapter as PhotoSourceAdapter) : real.getSource(id)) };
});

import { clearSelectionCache, importBatch, IMPORT_BATCH_SIZE } from "@/server/sources";
import { UnsupportedItemError } from "@/server/sources/http";

const owner: SessionUser = { id: "u1", name: "O", email: "o@example.com", role: "owner" };
const items = (n: number): RemoteItem[] =>
  Array.from({ length: n }, (_, i) => ({ ref: `r${i}`, filename: `p${i}.jpg`, mimeType: "image/jpeg", takenAt: null }));

function makeAdapter(all: RemoteItem[], over: Partial<PhotoSourceAdapter> = {}) {
  const listSelected = vi.fn(async (_t: unknown, sel: { refs?: string[] }) => (sel.refs ? all.filter((i) => sel.refs!.includes(i.ref)) : all));
  const fetchItem = vi.fn(async (_t: unknown, item: RemoteItem): Promise<FetchedItem> => ({ data: Buffer.from(item.ref), contentType: item.mimeType, filename: item.filename, takenAt: item.takenAt }));
  const finishSelection = vi.fn(async () => {});
  const adapter = {
    id: "google-photos",
    labelKey: "sources.googlePhotos",
    scopes: [],
    isConfigured: () => true,
    startSelection: vi.fn(),
    listSelected,
    fetchItem,
    finishSelection,
    ...over,
  } as unknown as PhotoSourceAdapter;
  h.adapter = adapter;
  return { adapter, listSelected, fetchItem, finishSelection };
}

beforeEach(() => {
  setGoogleEnv();
  resetConfigForTests();
  clearSelectionCache();
  h.db = createFakeDb();
  h.addPhoto.mockReset().mockResolvedValue({ id: "p" });
  h.getAlbumForOwner.mockReset().mockResolvedValue({ id: "a1" });
});

describe("importBatch", () => {
  it("paginates 25 items into batches of 10 and finishes the selection on the last batch", async () => {
    const { listSelected, finishSelection } = makeAdapter(items(25));
    const b1 = await importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s1" });
    expect(b1).toMatchObject({ imported: 10, skipped: 0, failed: [], nextOffset: 10, total: 25 });
    const b2 = await importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s1", offset: 10 });
    expect(b2).toMatchObject({ imported: 10, nextOffset: 20, total: 25 });
    expect(finishSelection).not.toHaveBeenCalled();
    const b3 = await importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s1", offset: 20 });
    expect(b3).toMatchObject({ imported: 5, nextOffset: null, total: 25 });
    expect(finishSelection).toHaveBeenCalledTimes(1);
    expect(finishSelection).toHaveBeenCalledWith(expect.anything(), { sessionId: "s1" });
    expect(listSelected).toHaveBeenCalledTimes(1); // list cached across batches
    expect(h.addPhoto).toHaveBeenCalledTimes(25);
    expect(h.addPhoto.mock.calls[0]).toEqual([
      owner,
      "a1",
      { data: Buffer.from("r0"), filename: "p0.jpg", contentType: "image/jpeg", source: "google-photos", sourceRef: "r0", takenAt: null },
    ]);
    expect(IMPORT_BATCH_SIZE).toBe(10);
  });

  it("imports sequentially", async () => {
    makeAdapter(items(3));
    let running = 0;
    let maxRunning = 0;
    h.addPhoto.mockImplementation(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { id: "p" };
    });
    await importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s" });
    expect(maxRunning).toBe(1);
  });

  it("skips videos, non-images and already imported refs; reports failures per item", async () => {
    const all: RemoteItem[] = [
      { ref: "ok", filename: "ok.jpg", mimeType: "image/jpeg", takenAt: null },
      { ref: "vid", filename: "v.mp4", mimeType: "video/mp4", takenAt: null },
      { ref: "dup", filename: "dup.jpg", mimeType: "image/jpeg", takenAt: null },
      { ref: "bad", filename: "bad.jpg", mimeType: "image/jpeg", takenAt: null },
      { ref: "unsup", filename: "u.jpg", mimeType: "image/jpeg", takenAt: null },
      { ref: "lim", filename: "lim.jpg", mimeType: "image/jpeg", takenAt: null },
    ];
    const { fetchItem } = makeAdapter(all, {
      fetchItem: vi.fn(async (_t, item) => {
        if (item.ref === "bad") throw new Error("socket hang up");
        if (item.ref === "unsup") throw new UnsupportedItemError();
        return { data: Buffer.from("x"), contentType: "image/jpeg", filename: item.filename, takenAt: null };
      }),
    });
    void fetchItem;
    await (h.db as ReturnType<typeof createFakeDb>).put("photos", { id: "existing", albumId: "a1", source: "google-photos", sourceRef: "dup" });
    h.addPhoto.mockImplementation(async (_a, _id, input: { sourceRef: string }) => {
      if (input.sourceRef === "lim") throw new AppError("limit", "albumPhotoLimit");
      return { id: "p" };
    });
    const res = await importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s" });
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(3); // video, duplicate, unsupported
    expect(res.failed).toEqual([
      { ref: "bad", filename: "bad.jpg", error: "sourceImportFailed" },
      { ref: "lim", filename: "lim.jpg", error: "albumPhotoLimit" },
    ]);
    expect(res.nextOffset).toBeNull();
  });

  it("does not treat duplicates of another album or source as duplicates", async () => {
    makeAdapter(items(1));
    const db = h.db as ReturnType<typeof createFakeDb>;
    await db.put("photos", { id: "x1", albumId: "other", source: "google-photos", sourceRef: "r0" });
    await db.put("photos", { id: "x2", albumId: "a1", source: "google-drive", sourceRef: "r0" });
    const res = await importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s" });
    expect(res.imported).toBe(1);
  });

  it("refs mode resolves only the current slice (client-picker sources)", async () => {
    const all = items(23);
    const { listSelected, finishSelection } = makeAdapter(all);
    const refs = all.map((i) => i.ref);
    const res = await importBatch(owner, "a1", { sourceId: "google-photos", refs, offset: 20 });
    expect(listSelected).toHaveBeenCalledWith(expect.anything(), { sessionId: undefined, refs: ["r20", "r21", "r22"] });
    expect(res).toMatchObject({ imported: 3, nextOffset: null, total: 23 });
    expect(finishSelection).toHaveBeenCalledTimes(1);
  });

  it("an offset beyond the total is an empty final batch", async () => {
    makeAdapter(items(3));
    expect(await importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s", offset: 50 })).toMatchObject({ imported: 0, nextOffset: null, total: 3 });
  });

  it("requires the owner role and album ownership before touching the source", async () => {
    const { listSelected } = makeAdapter(items(1));
    await expect(importBatch({ ...owner, role: "viewer" }, "a1", { sourceId: "google-photos", sessionId: "s" })).rejects.toMatchObject({ code: "forbidden" });
    h.getAlbumForOwner.mockRejectedValueOnce(new AppError("forbidden", "forbidden"));
    await expect(importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s" })).rejects.toMatchObject({ code: "forbidden" });
    expect(listSelected).not.toHaveBeenCalled();
    expect(h.addPhoto).not.toHaveBeenCalled();
  });

  it("aborts the batch when addPhoto reports the album is not accessible", async () => {
    makeAdapter(items(3));
    h.addPhoto.mockRejectedValue(new AppError("forbidden", "forbidden"));
    await expect(importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("validates input and configuration", async () => {
    makeAdapter(items(1));
    await expect(importBatch(owner, "a1", { sourceId: "google-photos" })).rejects.toMatchObject({ messageKey: "sourceSelectionMissing" });
    await expect(importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s", offset: -1 })).rejects.toBeDefined();
    await expect(importBatch(owner, "a1", { sourceId: "dropbox", sessionId: "s" })).rejects.toMatchObject({ code: "not_found" });
    (h.adapter as PhotoSourceAdapter).isConfigured = () => false;
    await expect(importBatch(owner, "a1", { sourceId: "google-photos", sessionId: "s" })).rejects.toMatchObject({ messageKey: "sourceNotConfigured" });
  });
});
