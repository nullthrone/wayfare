import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/server/container", async () => (await import("./fakes")).containerMock);
vi.mock("next/headers", async () => (await import("./fakes")).nextHeadersMock);
vi.mock("@/server/services/session", async () => (await import("./fakes")).sessionMock);
vi.mock("@/server/services/themes", async () => (await import("./fakes")).themesMock);

import { GET as mediaGet } from "@/app/api/media/[photoId]/[variant]/route";
import { createAlbum, rotateShareSlug, updateAlbumSettings } from "@/server/services/albums";
import type { MediaScope } from "@/server/services/photos";
import {
  addGuestPhoto,
  addPhoto,
  deletePhoto,
  listPhotos,
  mediaUrl,
  moderateGuestPhoto,
  readVariant,
  reorderPhotos,
  setCoverPhoto,
  updateCaption,
  verifyMediaSignature,
  getPhoto,
} from "@/server/services/photos";
import { renderWatermark } from "@/server/media/pipeline";
import { parseExifDate } from "@/server/media/exif";
import type { Doc } from "@/server/ports/document-store";
import { ctx, jpeg, makeUser, resetCtx } from "./fakes";

beforeEach(() => resetCtx());

async function setup(settings: Parameters<typeof updateAlbumSettings>[2] = { status: "published" }) {
  const owner = await makeUser("owner");
  const created = await createAlbum(owner, { title: "Album", themeId: "builtin:neutral" });
  const album = await updateAlbumSettings(owner, created.id, settings);
  return { owner, album };
}
const upload = async (owner: Awaited<ReturnType<typeof makeUser>>, albumId: string, buf?: Buffer, name = "a.jpg") =>
  addPhoto(owner, albumId, { data: buf ?? (await jpeg()), filename: name, contentType: "image/jpeg", source: "upload" });

describe("image pipeline / addPhoto", () => {
  it("stores thumb, display and original and fills metadata", async () => {
    const { owner, album } = await setup();
    const original = await jpeg({ width: 3000, height: 2000, color: "#ff0000" });
    const photo = await upload(owner, album.id, original, "../../evil/IMG 1.jpg");

    expect(photo.status).toBe("approved");
    expect(photo.originalFilename).toBe("IMG 1.jpg");
    expect(photo.blobKeys).toEqual({
      thumb: `albums/${album.id}/${photo.id}/thumb.webp`,
      display: `albums/${album.id}/${photo.id}/display.webp`,
      original: `albums/${album.id}/${photo.id}/original.jpg`,
    });
    expect(photo.width).toBe(3000);
    expect(photo.height).toBe(2000);
    expect(photo.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(photo.dominantColor.startsWith("#f")).toBe(true);
    expect(photo.contentType).toBe("image/jpeg");
    expect(photo.bytes).toBe(original.length);

    const thumb = sharp((await ctx.blobs.get(photo.blobKeys.thumb))!.data);
    const display = sharp((await ctx.blobs.get(photo.blobKeys.display))!.data);
    expect(await thumb.metadata()).toMatchObject({ format: "webp", width: 480, height: 320 });
    expect(await display.metadata()).toMatchObject({ format: "webp", width: 1600, height: 1067 });
    // original untouched, byte for byte
    expect((await ctx.blobs.get(photo.blobKeys.original))!.data.equals(original)).toBe(true);

    const stored = await ctx.db.get<Doc>("albums", album.id);
    expect(stored).toMatchObject({ photoCount: 1, coverPhotoId: photo.id });
  });

  it("does not upscale small images", async () => {
    const { owner, album } = await setup();
    const photo = await upload(owner, album.id, await jpeg({ width: 200, height: 100 }));
    const display = await sharp((await ctx.blobs.get(photo.blobKeys.display))!.data).metadata();
    expect([display.width, display.height]).toEqual([200, 100]);
  });

  it("applies EXIF orientation and strips metadata (GPS) from display and thumb, keeps the original", async () => {
    const { owner, album } = await setup();
    const withExif = await jpeg({ width: 100, height: 50, exif: true });
    const sourceMeta = await sharp(withExif).metadata();
    expect(sourceMeta.exif).toBeDefined();
    expect(parseExifDate(sourceMeta.exif)).toBe("2023-07-14T10:30:00.000Z");

    const photo = await upload(owner, album.id, withExif);
    expect(photo.takenAt).toBe("2023-07-14T10:30:00.000Z");
    for (const v of ["display", "thumb"] as const) {
      const m = await sharp((await ctx.blobs.get(photo.blobKeys[v]))!.data).metadata();
      expect(m.exif).toBeUndefined();
      expect(m.icc).toBeUndefined();
    }
    const raw = (await ctx.blobs.get(photo.blobKeys.display))!.data;
    expect(raw.includes(Buffer.from("secret-copyright"))).toBe(false);
    expect(raw.includes(Buffer.from("TestCam"))).toBe(false);
    // original still carries it
    expect((await sharp((await ctx.blobs.get(photo.blobKeys.original))!.data).metadata()).exif).toBeDefined();

    // explicit takenAt wins over EXIF
    const p2 = await addPhoto(owner, album.id, { data: withExif, filename: "b.jpg", contentType: "image/jpeg", source: "upload", takenAt: "2020-01-02T03:04:05Z" });
    expect(p2.takenAt).toBe("2020-01-02T03:04:05.000Z");
  });

  it("rotates according to EXIF orientation", async () => {
    const { owner, album } = await setup();
    // orientation 6 = rotate 90° CW: stored 100x50 → displayed 50x100
    const buf = await sharp({ create: { width: 100, height: 50, channels: 3, background: "#00ff00" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const photo = await upload(owner, album.id, buf);
    expect([photo.width, photo.height]).toEqual([50, 100]);
    const display = await sharp((await ctx.blobs.get(photo.blobKeys.display))!.data).metadata();
    expect([display.width, display.height]).toEqual([50, 100]);
  });

  it("accepts png/webp/gif and rejects non-images", async () => {
    const { owner, album } = await setup();
    const base = sharp({ create: { width: 20, height: 20, channels: 3, background: "#123456" } });
    for (const [fmt, ext, ct] of [["png", "png", "image/png"], ["webp", "webp", "image/webp"], ["gif", "gif", "image/gif"]] as const) {
      const data = await base.clone()[fmt]().toBuffer();
      const p = await addPhoto(owner, album.id, { data, filename: `x.${ext}`, contentType: ct, source: "upload" });
      expect(p.blobKeys.original.endsWith(`.${ext}`)).toBe(true);
      expect(p.contentType).toBe(ct);
    }
    const bad = { data: Buffer.from("<html>not an image</html>"), filename: "x.jpg", contentType: "image/jpeg", source: "upload" as const };
    await expect(addPhoto(owner, album.id, bad)).rejects.toMatchObject({ code: "validation", messageKey: "imageUnsupported" });
    await expect(addPhoto(owner, album.id, { ...bad, data: await jpeg(), contentType: "application/pdf" })).rejects.toMatchObject({ messageKey: "imageUnsupported" });
    expect(ctx.blobs.keys().filter((k) => k.includes("bad"))).toEqual([]);
  });

  it("enforces size and count limits from instance settings", async () => {
    const { owner, album } = await setup();
    await ctx.db.put("settings", { id: "instance", maxUploadMb: 1, maxPhotosPerAlbum: 2 });
    const big = Buffer.concat([await jpeg(), Buffer.alloc(1024 * 1024 + 1)]);
    await expect(upload(owner, album.id, big)).rejects.toMatchObject({ code: "limit", messageKey: "fileTooLarge" });
    await upload(owner, album.id);
    await upload(owner, album.id);
    await expect(upload(owner, album.id)).rejects.toMatchObject({ code: "limit", messageKey: "albumPhotoLimit" });
  });

  it("dedupes by sourceRef and is owner-only", async () => {
    const { owner, album } = await setup();
    const input = { data: await jpeg(), filename: "g.jpg", contentType: "image/jpeg", source: "google-photos" as const, sourceRef: "abc" };
    const a = await addPhoto(owner, album.id, input);
    const b = await addPhoto(owner, album.id, input);
    expect(b.id).toBe(a.id);
    expect(await listPhotos(album.id)).toHaveLength(1);
    await expect(addPhoto(await makeUser("owner"), album.id, input)).rejects.toMatchObject({ code: "forbidden" });
    await expect(addPhoto(await makeUser("admin"), album.id, { ...input, sourceRef: "other" })).resolves.toBeTruthy();
  });
});

describe("photo management", () => {
  it("lists in position order, reorders, sets cover/caption and deletes with bookkeeping", async () => {
    const { owner, album } = await setup();
    const [a, b, c] = [await upload(owner, album.id), await upload(owner, album.id), await upload(owner, album.id)];
    expect((await listPhotos(album.id)).map((p) => p.id)).toEqual([a.id, b.id, c.id]);

    await reorderPhotos(owner, album.id, [c.id, a.id, b.id]);
    expect((await listPhotos(album.id)).map((p) => p.id)).toEqual([c.id, a.id, b.id]);
    await expect(reorderPhotos(owner, album.id, [a.id, b.id])).rejects.toMatchObject({ messageKey: "invalidPhotoOrder" });
    await expect(reorderPhotos(owner, album.id, [a.id, a.id, b.id])).rejects.toMatchObject({ messageKey: "invalidPhotoOrder" });

    expect((await updateCaption(owner, a.id, "  Hello  ")).caption).toBe("Hello");
    await expect(updateCaption(await makeUser("owner"), a.id, "x")).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateCaption(owner, a.id, "x".repeat(501))).rejects.toMatchObject({ messageKey: "captionTooLong" });

    await setCoverPhoto(owner, album.id, b.id);
    expect((await ctx.db.get<Doc>("albums", album.id))!.coverPhotoId).toBe(b.id);

    await ctx.db.put("comments", { id: "c1", albumId: album.id, photoId: b.id, status: "visible" });
    await deletePhoto(owner, b.id);
    expect(await getPhoto(b.id)).toBeNull();
    expect(ctx.blobs.keys().some((k) => k.includes(b.id))).toBe(false);
    expect(ctx.db.dump("comments")).toEqual([]);
    const stored = (await ctx.db.get<Doc>("albums", album.id))!;
    expect(stored.photoCount).toBe(2);
    expect(stored.coverPhotoId).toBe(c.id); // first remaining photo in order
  });
});

describe("guest uploads", () => {
  it("require enabled uploads, access, not blocked, and respect the per-guest limit", async () => {
    const { owner, album } = await setup({ status: "published" });
    const guest = await makeUser("viewer");
    const input = async () => ({ data: await jpeg(), filename: "g.jpg", contentType: "image/jpeg" });

    await expect(addGuestPhoto(guest, album.slug, await input())).rejects.toMatchObject({ messageKey: "guestUploadsDisabled" });
    await updateAlbumSettings(owner, album.id, { guestUploadsEnabled: true, guestUploadLimit: 2, notifyMode: "instant" });

    const p = await addGuestPhoto(guest, album.slug, await input());
    expect(p).toMatchObject({ status: "pending", source: "guest-upload", uploadedBy: guest.id });
    expect(await listPhotos(album.id)).toHaveLength(0);
    expect((await listPhotos(album.id, "pending")).map((x) => x.id)).toEqual([p.id]);
    expect((await ctx.db.get<Doc>("albums", album.id))!.photoCount).toBe(0);
    // owner notified instantly
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0].to).toBe(owner.email);

    await addGuestPhoto(guest, album.slug, await input());
    await expect(addGuestPhoto(guest, album.slug, await input())).rejects.toMatchObject({ code: "limit", messageKey: "guestUploadLimit" });

    // approve → visible + counted ; reject → removed, quota freed
    const [first, second] = await listPhotos(album.id, "pending");
    await moderateGuestPhoto(owner, first.id, "approve");
    expect((await listPhotos(album.id)).map((x) => x.id)).toEqual([first.id]);
    expect((await ctx.db.get<Doc>("albums", album.id))!.photoCount).toBe(1);
    await moderateGuestPhoto(owner, second.id, "reject");
    expect(await getPhoto(second.id)).toBeNull();
    await expect(moderateGuestPhoto(owner, first.id, "reject")).rejects.toMatchObject({ messageKey: "photoNotPending" });
    await expect(moderateGuestPhoto(guest, first.id, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await expect(addGuestPhoto(guest, album.slug, await input())).resolves.toBeTruthy();

    // blocked + banned users
    await ctx.db.update("albums", album.id, { blockedUserIds: [guest.id] });
    await expect(addGuestPhoto(guest, album.slug, await input())).rejects.toMatchObject({ messageKey: "blockedFromAlbum" });
    await expect(addGuestPhoto({ ...guest, banned: true }, album.slug, await input())).rejects.toMatchObject({ code: "forbidden" });
  });

  it("require album access (draft, locked)", async () => {
    const { owner, album } = await setup({ status: "draft", guestUploadsEnabled: true });
    const guest = await makeUser("viewer");
    const input = { data: await jpeg(), filename: "g.jpg", contentType: "image/jpeg" };
    await expect(addGuestPhoto(guest, album.slug, input)).rejects.toMatchObject({ code: "not_found" });
    await updateAlbumSettings(owner, album.id, { status: "published", accessMode: "password", password: "secret1" });
    await expect(addGuestPhoto(guest, album.slug, input)).rejects.toMatchObject({ messageKey: "albumLocked" });
    ctx.cookieJar.set(`wf_unlock_${album.id}`, (await import("@/server/crypto")).sign("unlock", `${album.id}:1`));
    await expect(addGuestPhoto(guest, album.slug, input)).resolves.toBeTruthy();
  });
});

describe("media signing", () => {
  const parse = (url: string) => {
    const u = new URL(url, "http://x");
    const [, , , photoId, variant] = u.pathname.split("/");
    return { photoId, variant, exp: u.searchParams.get("exp")!, sig: u.searchParams.get("sig")!, dl: u.searchParams.get("dl") === "1" };
  };

  const scope: MediaScope = { slug: "abc", access: { mode: "link", passwordHash: null, passwordVersion: 1 }, downloads: { allowed: true, watermark: false, watermarkText: "" } };

  it("produces verifiable, bucketed URLs", () => {
    const url = mediaUrl({ id: "p1" }, "thumb", { album: scope });
    expect(url).toMatch(/^\/api\/media\/p1\/thumb\?exp=\d+&sig=[\w-]+$/);
    expect(mediaUrl({ id: "p1" }, "thumb", { album: scope })).toBe(url); // stable within the 5 min bucket
    const { photoId, variant, exp, sig, dl } = parse(url);
    expect(Number(exp) % 300).toBe(0);
    expect(Number(exp)).toBeGreaterThan(Date.now() / 1000 + 600);
    expect(verifyMediaSignature(photoId, variant, exp, sig, dl, scope)).toBe(true);
    // revocation: new slug or new password version invalidates the URL
    expect(verifyMediaSignature(photoId, variant, exp, sig, dl, { ...scope, slug: "rotated" })).toBe(false);
    expect(verifyMediaSignature(photoId, variant, exp, sig, dl, { ...scope, access: { ...scope.access, passwordVersion: 2 } })).toBe(false);
    // tampering
    expect(verifyMediaSignature("p2", variant, exp, sig, dl, scope)).toBe(false);
    expect(verifyMediaSignature(photoId, "display", exp, sig, dl, scope)).toBe(false);
    expect(verifyMediaSignature(photoId, variant, String(Number(exp) + 300), sig, dl, scope)).toBe(false);
    expect(verifyMediaSignature(photoId, variant, exp, sig, true, scope)).toBe(false);
    expect(verifyMediaSignature(photoId, variant, exp, sig + "x", dl, scope)).toBe(false);
    expect(verifyMediaSignature(photoId, "bogus", exp, sig, dl, scope)).toBe(false);
  });

  it("rejects expired signatures", () => {
    vi.useFakeTimers();
    try {
      const { photoId, variant, exp, sig, dl } = parse(mediaUrl({ id: "p1" }, "display", { album: scope, ttlSeconds: 60 }));
      expect(verifyMediaSignature(photoId, variant, exp, sig, dl, scope)).toBe(true);
      vi.setSystemTime(Date.now() + 10 * 60 * 1000);
      expect(verifyMediaSignature(photoId, variant, exp, sig, dl, scope)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports download flag and degrades original when downloads are disallowed", () => {
    const dl = mediaUrl({ id: "p1" }, "original", { album: scope, download: true });
    expect(dl).toContain("/original?");
    expect(dl.endsWith("&dl=1")).toBe(true);
    const p = parse(dl);
    expect(verifyMediaSignature(p.photoId, p.variant, p.exp, p.sig, true, scope)).toBe(true);
    expect(verifyMediaSignature(p.photoId, p.variant, p.exp, p.sig, false, scope)).toBe(false);
    expect(mediaUrl({ id: "p1" }, "original", { album: { ...scope, downloads: { ...scope.downloads, allowed: false } }, download: true })).toMatch(/^\/api\/media\/p1\/display\?exp=\d+&sig=[\w-]+$/);
  });
});

describe("readVariant + watermark", () => {
  it("serves plain display when downloads allowed, watermarked (cached) when not, and refuses originals", async () => {
    const { owner, album } = await setup({ status: "published", downloadsAllowed: false, watermark: true, watermarkText: "(c) Me" });
    const photo = await upload(owner, album.id, await jpeg({ width: 400, height: 300, color: "#808080" }));
    const plain = (await ctx.blobs.get(photo.blobKeys.display))!.data;

    const wm = await readVariant(photo, album, "display");
    expect(wm.contentType).toBe("image/webp");
    expect(wm.data.equals(plain)).toBe(false);
    expect(await sharp(wm.data).metadata()).toMatchObject({ width: 400, height: 300, format: "webp" });
    const cacheKeys = ctx.blobs.keys().filter((k) => k.includes("display-wm-"));
    expect(cacheKeys).toHaveLength(1);
    expect(cacheKeys[0]).toMatch(new RegExp(`albums/${album.id}/${photo.id}/display-wm-[0-9a-f]{12}\\.webp$`));
    // second call is served from cache
    expect((await readVariant(photo, album, "display")).data.equals(wm.data)).toBe(true);

    // thumb is never watermarked
    expect((await readVariant(photo, album, "thumb")).data.equals((await ctx.blobs.get(photo.blobKeys.thumb))!.data)).toBe(true);
    await expect(readVariant(photo, album, "original")).rejects.toMatchObject({ code: "forbidden" });

    const open = { ...album, downloads: { ...album.downloads, allowed: true } };
    expect((await readVariant(photo, open, "display")).data.equals(plain)).toBe(true);
    const orig = await readVariant(photo, open, "original");
    expect(orig.contentType).toBe("image/jpeg");

    // without watermark enabled nothing is rendered
    const noWm = { ...album, downloads: { ...album.downloads, watermark: false } };
    expect((await readVariant(photo, noWm, "display")).data.equals(plain)).toBe(true);
  });

  it("renderWatermark keeps size and changes pixels", async () => {
    const base = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#777777" } }).webp().toBuffer();
    const out = await renderWatermark(base, `<script>&"'`);
    expect(await sharp(out).metadata()).toMatchObject({ width: 300, height: 200 });
    expect(out.equals(base)).toBe(false);
  });
});

describe("GET /api/media/[photoId]/[variant]", () => {
  /** Sign with the album's current state (like a freshly rendered page would). */
  const url = async (photo: { id: string; albumId?: string }, variant: "thumb" | "display" | "original", opts: { download?: boolean; albumId?: string } = {}) => {
    const albumId = opts.albumId ?? photo.albumId!;
    const album = (await ctx.db.get("albums", albumId)) as unknown as MediaScope;
    return mediaUrl(photo, variant, { album, download: opts.download });
  };
  const call = (url: string) => {
    const u = new URL(url, "http://localhost:3000");
    const [, , , photoId, variant] = u.pathname.split("/");
    return mediaGet(new Request(u), { params: Promise.resolve({ photoId, variant }) });
  };

  it("serves signed requests with security headers and enforces the policy", async () => {
    const { owner, album } = await setup({ status: "published" });
    const photo = await upload(owner, album.id, await jpeg({ width: 100, height: 80 }), 'my "photo".jpg');

    // missing / bad signature
    expect((await call(`/api/media/${photo.id}/thumb`)).status).toBe(403);
    expect((await call((await url(photo, "thumb")).replace(/sig=./, "sig=Z"))).status).toBe(403);
    expect((await call(await url({ id: "nonexistent" }, "thumb", { albumId: album.id }))).status).toBe(404);

    const res = await call(await url(photo, "thumb"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, max-age=600");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(res.headers.get("content-disposition")).toBe("inline");
    // revoking the share link invalidates media URLs handed out before
    const before = await url(photo, "thumb");
    await rotateShareSlug(owner, album.id);
    expect((await call(before)).status).toBe(403);
    expect((await call(await url(photo, "thumb"))).status).toBe(200);
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toBe("webp");

    // originals are forbidden while downloads are off — even with a URL signed while they were on
    await updateAlbumSettings(owner, album.id, { downloadsAllowed: true });
    const signedWhileAllowed = await url(photo, "original");
    await updateAlbumSettings(owner, album.id, { downloadsAllowed: false });
    expect((await call(signedWhileAllowed)).status).toBe(403);
    // dl=1 is ignored for attachment while downloads are off
    expect((await call(await url(photo, "display", { download: true }))).headers.get("content-disposition")).toBe("inline");

    await updateAlbumSettings(owner, album.id, { downloadsAllowed: true });
    const orig = await call(await url(photo, "original"));
    expect(orig.status).toBe(200);
    expect(orig.headers.get("content-type")).toBe("image/jpeg");
    expect(orig.headers.get("content-disposition")).toBe("inline");
    const dl = await call(await url(photo, "original", { download: true }));
    expect(dl.headers.get("content-disposition")).toBe(`attachment; filename="my photo.jpg"; filename*=UTF-8''my%20photo.jpg`);
    const dlDisplay = await call(await url(photo, "display", { download: true }));
    expect(dlDisplay.headers.get("content-disposition")).toBe(`attachment; filename="my photo.webp"; filename*=UTF-8''my%20photo.webp`);
  });

  it("hides pending photos, drafts and expired albums from non-owners", async () => {
    const { owner, album } = await setup({ status: "published", guestUploadsEnabled: true });
    const guest = await makeUser("viewer");
    const pending = await addGuestPhoto(guest, album.slug, { data: await jpeg(), filename: "g.jpg", contentType: "image/jpeg" });
    const ok = await upload(owner, album.id);

    ctx.currentUser = null;
    expect((await call(await url(pending, "thumb"))).status).toBe(404);
    ctx.currentUser = guest;
    expect((await call(await url(pending, "thumb"))).status).toBe(404);
    ctx.currentUser = owner;
    expect((await call(await url(pending, "thumb"))).status).toBe(200);
    ctx.currentUser = await makeUser("admin");
    expect((await call(await url(pending, "thumb"))).status).toBe(200);

    ctx.currentUser = null;
    await ctx.db.update("albums", album.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await call(await url(ok, "thumb"))).status).toBe(403);
    ctx.currentUser = owner;
    expect((await call(await url(ok, "thumb"))).status).toBe(200);

    ctx.currentUser = null;
    await ctx.db.update("albums", album.id, { expiresAt: null, status: "draft" });
    expect((await call(await url(ok, "thumb"))).status).toBe(403);
  });
});
