import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/container", async () => (await import("./fakes")).containerMock);
vi.mock("next/headers", async () => (await import("./fakes")).nextHeadersMock);
vi.mock("@/server/services/session", async () => (await import("./fakes")).sessionMock);
vi.mock("@/server/services/themes", async () => (await import("./fakes")).themesMock);

import { AppError } from "@/server/errors";
import {
  createAlbum,
  deleteAlbum,
  getAlbumForOwner,
  getAlbumStats,
  listAlbumsForOwner,
  recordAlbumView,
  resetUnlockRateLimitForTests,
  resolveAlbumAccess,
  rotateShareSlug,
  shareUrl,
  unlockAlbum,
  updateAlbumSettings,
} from "@/server/services/albums";
import { ctx, jpeg, makeUser, resetCtx } from "./fakes";
import { addPhoto } from "@/server/services/photos";

beforeEach(() => {
  resetCtx();
  resetUnlockRateLimitForTests();
});

async function setup() {
  const owner = await makeUser("owner");
  const album = await createAlbum(owner, { title: "  Italy 2024 ", themeId: "builtin:travel" });
  return { owner, album };
}

describe("createAlbum", () => {
  it("creates a draft album with defaults and a 10-char slug", async () => {
    const { owner, album } = await setup();
    expect(album.title).toBe("Italy 2024");
    expect(album.ownerId).toBe(owner.id);
    expect(album.slug).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/);
    expect(album.status).toBe("draft");
    expect(album.access.mode).toBe("link");
    expect(shareUrl(album)).toBe(`http://localhost:3000/a/${album.slug}`);
    expect((await listAlbumsForOwner(owner)).map((a) => a.id)).toEqual([album.id]);
  });

  it("requires the owner role and a title", async () => {
    const viewer = await makeUser("viewer");
    await expect(createAlbum(viewer, { title: "x", themeId: "t" })).rejects.toMatchObject({ code: "forbidden" });
    const owner = await makeUser("owner");
    await expect(createAlbum(owner, { title: "   ", themeId: "t" })).rejects.toMatchObject({ code: "validation", messageKey: "albumTitleRequired" });
    const banned = await makeUser("owner", { banned: true });
    await expect(createAlbum(banned, { title: "x", themeId: "t" })).rejects.toBeInstanceOf(AppError);
  });
});

describe("updateAlbumSettings", () => {
  it("updates simple settings and normalises expiresAt", async () => {
    const { owner, album } = await setup();
    const updated = await updateAlbumSettings(owner, album.id, {
      status: "published",
      title: "New",
      commentMode: "pre",
      reactionsEnabled: false,
      downloadsAllowed: true,
      watermark: true,
      watermarkText: " me ",
      guestUploadsEnabled: true,
      guestUploadLimit: 3,
      notifyMode: "instant",
      expiresAt: "2099-01-01T00:00:00+01:00",
    });
    expect(updated).toMatchObject({
      status: "published",
      title: "New",
      comments: { mode: "pre" },
      reactions: { enabled: false },
      downloads: { allowed: true, watermark: true, watermarkText: "me" },
      guestUploads: { enabled: true, limitPerGuest: 3 },
      notifications: { mode: "instant" },
      expiresAt: "2098-12-31T23:00:00.000Z",
    });
    expect((await updateAlbumSettings(owner, album.id, { expiresAt: null })).expiresAt).toBeNull();
    await expect(updateAlbumSettings(owner, album.id, { expiresAt: "garbage" })).rejects.toMatchObject({ messageKey: "expiresAtInvalid" });
  });

  it("only the owner or an admin may update", async () => {
    const { album } = await setup();
    const other = await makeUser("owner");
    const admin = await makeUser("admin");
    await expect(updateAlbumSettings(other, album.id, { title: "x" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateAlbumSettings(admin, album.id, { title: "by admin" })).resolves.toMatchObject({ title: "by admin" });
    await expect(getAlbumForOwner(other, album.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(getAlbumForOwner(admin, "missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("manages password mode: required, min length, version bump, clearing", async () => {
    const { owner, album } = await setup();
    await expect(updateAlbumSettings(owner, album.id, { accessMode: "password" })).rejects.toMatchObject({ messageKey: "passwordRequired" });
    await expect(updateAlbumSettings(owner, album.id, { accessMode: "password", password: "abc" })).rejects.toMatchObject({ messageKey: "passwordTooShort" });
    await expect(updateAlbumSettings(owner, album.id, { password: "abcd" })).rejects.toMatchObject({ messageKey: "passwordNotAllowed" });

    const a1 = await updateAlbumSettings(owner, album.id, { accessMode: "password", password: "secret" });
    expect(a1.access.mode).toBe("password");
    expect(a1.access.passwordHash).toMatch(/^scrypt\$/);
    expect(a1.access.passwordHash).not.toContain("secret");
    expect(a1.access.passwordVersion).toBe(1);

    // other settings keep the password
    const a2 = await updateAlbumSettings(owner, album.id, { title: "again" });
    expect(a2.access.passwordHash).toBe(a1.access.passwordHash);
    expect(a2.access.passwordVersion).toBe(1);

    // changing the password bumps the version
    const a3 = await updateAlbumSettings(owner, album.id, { password: "another" });
    expect(a3.access.passwordVersion).toBe(2);
    await expect(updateAlbumSettings(owner, album.id, { password: null })).rejects.toMatchObject({ messageKey: "passwordRequired" });

    // back to link: hash removed, version bumped
    const a4 = await updateAlbumSettings(owner, album.id, { accessMode: "link", password: null });
    expect(a4.access).toMatchObject({ mode: "link", passwordHash: null, passwordVersion: 3 });
  });
});

describe("resolveAlbumAccess", () => {
  it("handles unknown slug, drafts, published, expiry", async () => {
    const { owner, album } = await setup();
    const viewer = await makeUser("viewer");
    expect(await resolveAlbumAccess("nope", viewer)).toEqual({ status: "not-found" });

    // draft: hidden for everyone but owner/admin
    expect(await resolveAlbumAccess(album.slug, viewer)).toEqual({ status: "not-found" });
    expect(await resolveAlbumAccess(album.slug, null)).toEqual({ status: "not-found" });
    expect((await resolveAlbumAccess(album.slug, owner)).status).toBe("granted");
    expect((await resolveAlbumAccess(album.slug, await makeUser("admin"))).status).toBe("granted");

    await updateAlbumSettings(owner, album.id, { status: "published" });
    expect((await resolveAlbumAccess(album.slug, null)).status).toBe("granted");

    // expired in the past → expired for viewers, still granted for owner
    await ctx.db.update("albums", album.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await resolveAlbumAccess(album.slug, null)).status).toBe("expired");
    expect((await resolveAlbumAccess(album.slug, viewer)).status).toBe("expired");
    expect((await resolveAlbumAccess(album.slug, owner)).status).toBe("granted");

    // future expiry is fine
    await ctx.db.update("albums", album.id, { expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect((await resolveAlbumAccess(album.slug, null)).status).toBe("granted");
  });

  it("tolerates legacy documents with missing fields", async () => {
    await ctx.db.put("albums", { id: "old", ownerId: "u", slug: "oldslug123", title: "Old", status: "published" });
    const res = await resolveAlbumAccess("oldslug123", null);
    expect(res.status).toBe("granted");
    if (res.status === "granted") {
      expect(res.album.access.mode).toBe("link");
      expect(res.album.blockedUserIds).toEqual([]);
      expect(res.album.downloads.allowed).toBe(false);
    }
  });
});

describe("unlockAlbum", () => {
  async function protectedAlbum() {
    const { owner, album } = await setup();
    const a = await updateAlbumSettings(owner, album.id, { status: "published", accessMode: "password", password: "hunter22" });
    return { owner, album: a };
  }

  it("requires the password, then sets an httpOnly cookie that grants access", async () => {
    const { album } = await protectedAlbum();
    expect((await resolveAlbumAccess(album.slug, null)).status).toBe("password-required");
    expect(await unlockAlbum(album.slug, "wrong")).toBe(false);
    expect(ctx.cookieJar.size).toBe(0);

    expect(await unlockAlbum(album.slug, "hunter22")).toBe(true);
    const name = `wf_unlock_${album.id}`;
    expect(ctx.cookieJar.has(name)).toBe(true);
    expect(ctx.cookieOptions.get(name)).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60, secure: false });
    expect((await resolveAlbumAccess(album.slug, null)).status).toBe("granted");
  });

  it("invalidates the cookie when the password changes and rejects forged cookies", async () => {
    const { owner, album } = await protectedAlbum();
    await unlockAlbum(album.slug, "hunter22");
    await updateAlbumSettings(owner, album.id, { password: "newsecret" });
    expect((await resolveAlbumAccess(album.slug, null)).status).toBe("password-required");

    ctx.cookieJar.set(`wf_unlock_${album.id}`, "forged-value");
    expect((await resolveAlbumAccess(album.slug, null)).status).toBe("password-required");
  });

  it("returns false for unknown, link-mode, draft and expired albums", async () => {
    const { owner, album } = await setup();
    expect(await unlockAlbum("nope", "x")).toBe(false);
    expect(await unlockAlbum(album.slug, "x")).toBe(false); // draft / link
    const a = await updateAlbumSettings(owner, album.id, { status: "published", accessMode: "password", password: "hunter22" });
    await ctx.db.update("albums", a.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await unlockAlbum(a.slug, "hunter22")).toBe(false);
  });

  it("rate-limits repeated attempts", async () => {
    const { album } = await protectedAlbum();
    for (let i = 0; i < 10; i++) expect(await unlockAlbum(album.slug, "bad" + i)).toBe(false);
    await expect(unlockAlbum(album.slug, "hunter22")).rejects.toMatchObject({ code: "limit", messageKey: "rateLimited" });
  });
});

describe("rotateShareSlug / deleteAlbum", () => {
  it("rotating the slug breaks the old link", async () => {
    const { owner, album } = await setup();
    await updateAlbumSettings(owner, album.id, { status: "published" });
    const rotated = await rotateShareSlug(owner, album.id);
    expect(rotated.slug).not.toBe(album.slug);
    expect((await resolveAlbumAccess(album.slug, null)).status).toBe("not-found");
    expect((await resolveAlbumAccess(rotated.slug, null)).status).toBe("granted");
    await expect(rotateShareSlug(await makeUser("owner"), album.id)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("deleteAlbum removes photos, blobs and related documents", async () => {
    const { owner, album } = await setup();
    const photo = await addPhoto(owner, album.id, { data: await jpeg(), filename: "a.jpg", contentType: "image/jpeg", source: "upload" });
    await ctx.db.put("comments", { id: "c1", albumId: album.id, photoId: photo.id, status: "visible" });
    await ctx.db.put("reactions", { id: "r1", albumId: album.id, photoId: photo.id });
    await ctx.db.put("reports", { id: "rp1", albumId: album.id });
    await ctx.db.put("albums", { ...(await ctx.db.get("albums", album.id))!, id: "other", slug: "otherslug1" });
    expect(ctx.blobs.keys()).toHaveLength(3);

    await expect(deleteAlbum(await makeUser("owner"), album.id)).rejects.toMatchObject({ code: "forbidden" });
    await deleteAlbum(owner, album.id);

    expect(ctx.blobs.keys()).toEqual([]);
    for (const c of ["photos", "comments", "reactions", "reports"]) expect(ctx.db.dump(c)).toEqual([]);
    expect(await ctx.db.get("albums", album.id)).toBeNull();
    expect(await ctx.db.get("albums", "other")).not.toBeNull();
  });
});

describe("views and stats", () => {
  it("counts a visitor once per day and cleans old markers", async () => {
    const { owner, album } = await setup();
    // an old marker that must be cleaned up
    await ctx.db.put("view_markers", { id: "old", albumId: album.id, createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString() });

    await recordAlbumView(album);
    await recordAlbumView(album);
    ctx.requestHeaders.set("user-agent", "another browser");
    await recordAlbumView(album);

    const stored = (await getAlbumForOwner(owner, album.id));
    expect(stored.stats.views).toBe(2);
    expect(stored.stats.lastViewedAt).not.toBeNull();
    const markers = ctx.db.dump("view_markers");
    expect(markers.map((m) => m.id)).not.toContain("old");
    // marker id format: albumId_hash16_day ; no IP stored
    expect(markers[0].id).toMatch(new RegExp(`^${album.id}_[A-Za-z0-9_-]{16}_\\d{4}-\\d{2}-\\d{2}$`));
  });

  it("getAlbumStats aggregates photos, comments and reactions (owner only)", async () => {
    const { owner, album } = await setup();
    const p = await addPhoto(owner, album.id, { data: await jpeg(), filename: "a.jpg", contentType: "image/jpeg", source: "upload" });
    await ctx.db.update("photos", p.id, { views: 5, commentCount: 2, "reactionCounts.heart": 3 });
    const stats = await getAlbumStats(owner, album.id);
    expect(stats).toMatchObject({ photoCount: 1, commentCount: 2, reactionCount: 3, views: 0 });
    expect(stats.topPhotos).toEqual([{ photoId: p.id, views: 5, reactions: 3 }]);
    await expect(getAlbumStats(await makeUser("owner"), album.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});
