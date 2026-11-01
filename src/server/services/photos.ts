import "server-only";
import { posix as path } from "node:path";
import { nanoid } from "nanoid";
import type { Album, Photo, PhotoSourceId, PhotoVariant, SessionUser } from "@/domain/types";
import { getBlobs, getDb } from "../container";
import { sign, verify } from "../crypto";
import { forbidden, invalid, limitExceeded, notFound } from "../errors";
import { processImage, renderWatermark, watermarkHash } from "../media/pipeline";
import { COLLECTIONS, type Doc } from "../ports/document-store";
import {
  assertCanManageAlbum,
  getAlbumBySlug,
  normalizePhoto,
  nowIso,
  requireAlbumById,
  requirePhotoById,
} from "../repo";
import { getInstanceSettings } from "./admin";
import { evaluateAlbumAccess } from "./albums";
import { notifyOwner } from "./notifications";
import { hasRole } from "./session";

/**
 * Photo lifecycle + image pipeline + media delivery.
 *
 * Pipeline (sharp) on ingest:
 *  - auto-rotate by EXIF, read width/height/takenAt, compute dominant colour
 *  - variants: thumb (max 480px, webp q75), display (max 1600px, webp q82), original (as uploaded)
 *  - thumb & display have ALL metadata stripped (GPS privacy); original is kept untouched
 *    and is only ever served when album.downloads.allowed = true.
 *  - Watermarked display variant is generated lazily on first request and cached under
 *    `.../display-wm-{hash(watermarkText)}.webp`.
 *
 * Media delivery: mediaUrl() produces a signed, short-lived URL
 *   /api/media/{photoId}/{variant}?exp={epochSeconds}&sig={hmac}
 * The route handler (src/app/api/media/[photoId]/[variant]/route.ts) verifies sig + exp,
 * re-checks album access/policy and streams the bytes with `Cache-Control: private`.
 */

export interface IngestInput {
  data: Buffer;
  filename: string;
  contentType: string;
  source: PhotoSourceId;
  sourceRef?: string | null;
  takenAt?: string | null;
}

const MB = 1024 * 1024;
const VARIANTS: readonly PhotoVariant[] = ["thumb", "display", "original"];
const EXP_BUCKET_SECONDS = 300;

function cleanFilename(name: string): string {
  const base = path.basename(String(name ?? "").replace(/\\/g, "/"));
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 150);
  return cleaned || "photo";
}

function validIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const blobPrefix = (albumId: string, photoId: string) => `albums/${albumId}/${photoId}/`;

async function ingest(
  album: Album,
  uploader: SessionUser,
  input: IngestInput,
  status: Photo["status"],
  uploadedCount: number,
): Promise<Photo> {
  const db = await getDb();
  const blobs = await getBlobs();
  const settings = await getInstanceSettings();

  if (!input.data || input.data.length === 0) throw invalid("imageUnsupported");
  if (input.data.length > settings.maxUploadMb * MB) throw limitExceeded("fileTooLarge");
  if (settings.maxPhotosPerAlbum > 0 && uploadedCount >= settings.maxPhotosPerAlbum) throw limitExceeded("albumPhotoLimit");

  // Dedupe re-imports from cloud sources.
  if (input.sourceRef) {
    const existing = await db.findOne<Doc>(COLLECTIONS.photos.name, {
      where: [
        { field: "albumId", op: "eq", value: album.id },
        { field: "sourceRef", op: "eq", value: input.sourceRef },
      ],
    });
    if (existing) return normalizePhoto(existing);
  }

  const processed = await processImage(input.data, input.contentType);
  const id = nanoid();
  const prefix = blobPrefix(album.id, id);
  const blobKeys: Record<PhotoVariant, string> = {
    thumb: `${prefix}thumb.webp`,
    display: `${prefix}display.webp`,
    original: `${prefix}original.${processed.originalExt}`,
  };

  const last = await db.findOne<Doc>(COLLECTIONS.photos.name, {
    where: [{ field: "albumId", op: "eq", value: album.id }],
    sort: [{ field: "position", direction: "desc" }],
  });
  const position = last ? normalizePhoto(last).position + 1 : 0;

  const photo: Photo = {
    id,
    albumId: album.id,
    ownerId: album.ownerId,
    uploadedBy: uploader.id,
    uploaderName: uploader.name,
    source: input.source,
    sourceRef: input.sourceRef ?? null,
    status,
    caption: "",
    position,
    width: processed.width,
    height: processed.height,
    dominantColor: processed.dominantColor,
    takenAt: validIso(input.takenAt) ?? processed.takenAt,
    contentType: processed.originalContentType,
    originalFilename: cleanFilename(input.filename),
    blobKeys,
    bytes: input.data.length,
    reactionCounts: {},
    commentCount: 0,
    views: 0,
    createdAt: nowIso(),
  };

  try {
    await Promise.all([
      blobs.put(blobKeys.thumb, processed.thumb, "image/webp"),
      blobs.put(blobKeys.display, processed.display, "image/webp"),
      blobs.put(blobKeys.original, input.data, processed.originalContentType),
    ]);
    await db.create(COLLECTIONS.photos.name, photo as unknown as Doc);
  } catch (err) {
    await blobs.deletePrefix(prefix).catch(() => undefined);
    throw err;
  }

  if (status === "approved") await onApproved(album, photo);
  return photo;
}

/** Bookkeeping when a photo becomes visible: album.photoCount++, first photo becomes the cover. */
async function onApproved(album: Album, photo: Photo): Promise<void> {
  const db = await getDb();
  await db.increment(COLLECTIONS.albums.name, album.id, "photoCount", 1);
  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  const fresh = await db.get<Doc>(COLLECTIONS.albums.name, album.id);
  if (fresh && !fresh.coverPhotoId) patch.coverPhotoId = photo.id;
  await db.update(COLLECTIONS.albums.name, album.id, patch);
}

async function countPhotos(albumId: string): Promise<number> {
  return (await getDb()).count(COLLECTIONS.photos.name, { where: [{ field: "albumId", op: "eq", value: albumId }] });
}

/** Owner upload/import. Enforces InstanceSettings.maxUploadMb / maxPhotosPerAlbum, dedupes by sourceRef. */
export async function addPhoto(actor: SessionUser, albumId: string, input: IngestInput): Promise<Photo> {
  const album = await requireAlbumById(albumId);
  assertCanManageAlbum(actor, album);
  return ingest(album, actor, input, "approved", await countPhotos(album.id));
}

/**
 * Guest upload (album.guestUploads.enabled, signed-in user, not blocked, within limitPerGuest).
 * Always stored with status "pending" and queued for owner approval. Triggers owner notification.
 * Also requires that the guest has access to the album (published, not expired, unlocked).
 */
export async function addGuestPhoto(actor: SessionUser, albumSlug: string, input: Omit<IngestInput, "source">): Promise<Photo> {
  if (!hasRole(actor, "viewer")) throw forbidden(actor?.banned ? "accountBanned" : "unauthorized");
  const album = await getAlbumBySlug(albumSlug);
  if (!album) throw notFound("albumNotFound");
  const access = await evaluateAlbumAccess(album, actor);
  if (access.status === "not-found") throw notFound("albumNotFound");
  if (access.status === "expired") throw forbidden("albumExpired");
  if (access.status === "password-required") throw forbidden("albumLocked");
  if (!album.guestUploads.enabled) throw forbidden("guestUploadsDisabled");
  if (album.blockedUserIds.includes(actor.id)) throw forbidden("blockedFromAlbum");

  const db = await getDb();
  const mine = await db.count(COLLECTIONS.photos.name, {
    where: [
      { field: "albumId", op: "eq", value: album.id },
      { field: "uploadedBy", op: "eq", value: actor.id },
    ],
  });
  if (mine >= album.guestUploads.limitPerGuest) throw limitExceeded("guestUploadLimit");

  const photo = await ingest(album, actor, { ...input, source: "guest-upload" }, "pending", await countPhotos(album.id));
  await notifyOwner(album, { kind: "guest-upload", summary: `${actor.name}: ${photo.originalFilename}` });
  return photo;
}

/** status "approved" sorted by position; owners may request "pending" for the moderation queue. */
export async function listPhotos(albumId: string, status: Photo["status"] = "approved"): Promise<Photo[]> {
  const docs = await (await getDb()).find<Doc>(COLLECTIONS.photos.name, {
    where: [
      { field: "albumId", op: "eq", value: albumId },
      { field: "status", op: "eq", value: status },
    ],
    sort: [{ field: "position", direction: "asc" }],
  });
  return docs.map(normalizePhoto).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function getPhoto(photoId: string): Promise<Photo | null> {
  const doc = await (await getDb()).get<Doc>(COLLECTIONS.photos.name, photoId);
  return doc ? normalizePhoto(doc) : null;
}

export async function updateCaption(actor: SessionUser, photoId: string, caption: string): Promise<Photo> {
  const photo = await requirePhotoById(photoId);
  assertCanManageAlbum(actor, photo);
  const text = String(caption ?? "").trim();
  if (text.length > 500) throw invalid("captionTooLong");
  const updated = await (await getDb()).update<Doc>(COLLECTIONS.photos.name, photoId, { caption: text });
  if (!updated) throw notFound("photoNotFound");
  return normalizePhoto(updated);
}

export async function setCoverPhoto(actor: SessionUser, albumId: string, photoId: string): Promise<void> {
  const album = await requireAlbumById(albumId);
  assertCanManageAlbum(actor, album);
  const photo = await requirePhotoById(photoId);
  if (photo.albumId !== album.id || photo.status !== "approved") throw notFound("photoNotFound");
  await (await getDb()).update(COLLECTIONS.albums.name, album.id, { coverPhotoId: photo.id, updatedAt: nowIso() });
}

/** Persist a new order; `orderedIds` must be a permutation of the album's approved photo ids. */
export async function reorderPhotos(actor: SessionUser, albumId: string, orderedIds: string[]): Promise<void> {
  const album = await requireAlbumById(albumId);
  assertCanManageAlbum(actor, album);
  const current = await listPhotos(album.id, "approved");
  const currentIds = new Set(current.map((p) => p.id));
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.length !== currentIds.size ||
    new Set(orderedIds).size !== orderedIds.length ||
    !orderedIds.every((id) => currentIds.has(id))
  ) {
    throw invalid("invalidPhotoOrder");
  }
  const db = await getDb();
  await Promise.all(orderedIds.map((id, index) => db.update(COLLECTIONS.photos.name, id, { position: index })));
  await db.update(COLLECTIONS.albums.name, album.id, { updatedAt: nowIso() });
}

/**
 * Approve or reject a pending guest photo. Rejecting deletes the photo and its blobs
 * (no tombstone), which also frees the guest's upload quota.
 */
export async function moderateGuestPhoto(actor: SessionUser, photoId: string, decision: "approve" | "reject"): Promise<void> {
  const photo = await requirePhotoById(photoId);
  const album = await requireAlbumById(photo.albumId);
  assertCanManageAlbum(actor, album);
  if (photo.status !== "pending") {
    if (decision === "approve" && photo.status === "approved") return;
    throw invalid("photoNotPending");
  }
  if (decision === "reject") {
    await purgePhoto(photo);
    return;
  }
  const db = await getDb();
  const last = await db.findOne<Doc>(COLLECTIONS.photos.name, {
    where: [{ field: "albumId", op: "eq", value: album.id }],
    sort: [{ field: "position", direction: "desc" }],
  });
  const position = last ? normalizePhoto(last).position + 1 : 0;
  await db.update(COLLECTIONS.photos.name, photo.id, { status: "approved", position });
  await onApproved(album, photo);
}

/**
 * Deletes a photo document with everything hanging off it (blobs, comments + their reports,
 * reactions). Does NOT touch album counters — callers decide. Exported for the admin cascade.
 */
export async function purgePhoto(photo: Photo): Promise<void> {
  const db = await getDb();
  const blobs = await getBlobs();
  await blobs.deletePrefix(blobPrefix(photo.albumId, photo.id));
  const comments = await db.find<Doc>(COLLECTIONS.comments.name, { where: [{ field: "photoId", op: "eq", value: photo.id }] });
  if (comments.length > 0) {
    await db.deleteMany(COLLECTIONS.reports.name, { where: [{ field: "commentId", op: "in", value: comments.map((c) => c.id) }] });
  }
  await db.deleteMany(COLLECTIONS.comments.name, { where: [{ field: "photoId", op: "eq", value: photo.id }] });
  await db.deleteMany(COLLECTIONS.reactions.name, { where: [{ field: "photoId", op: "eq", value: photo.id }] });
  await db.delete(COLLECTIONS.photos.name, photo.id);
}

/** Removes the document, blobs, comments, reactions. Updates album.photoCount / coverPhotoId. */
export async function deletePhoto(actor: SessionUser, photoId: string): Promise<void> {
  const photo = await requirePhotoById(photoId);
  const album = await requireAlbumById(photo.albumId);
  assertCanManageAlbum(actor, album);
  await purgePhoto(photo);
  await afterPhotoRemoved(album, photo);
}

/** Album bookkeeping after a photo was removed (shared with the account-deletion cascade). */
export async function afterPhotoRemoved(album: Album, photo: Photo): Promise<void> {
  if (photo.status !== "approved") return;
  const db = await getDb();
  await db.increment(COLLECTIONS.albums.name, album.id, "photoCount", -1);
  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  const fresh = await db.get<Doc>(COLLECTIONS.albums.name, album.id);
  if (fresh && fresh.coverPhotoId === photo.id) {
    const remaining = await listPhotos(album.id, "approved");
    patch.coverPhotoId = remaining[0]?.id ?? null;
  }
  if (fresh && typeof fresh.photoCount === "number" && fresh.photoCount < 0) patch.photoCount = 0;
  await db.update(COLLECTIONS.albums.name, album.id, patch);
}

// ------------------------------------------------------------------ media delivery

/** Album fields a media signature is bound to (and the download policy is read from). */
export type MediaScope = Pick<Album, "slug" | "access" | "downloads">;

/**
 * The signature is bound to the album's slug and passwordVersion: rotating the share link or
 * changing the password invalidates every media URL handed out before, immediately.
 */
const mediaSigData = (photoId: string, variant: string, exp: string | number, download: boolean, scope: MediaScope) =>
  `${photoId}:${variant}:${exp}:${download ? 1 : 0}:${scope.slug}:${scope.access.passwordVersion}`;

/**
 * Signed URL for a variant. `exp` is rounded UP to 5-minute buckets so the URL stays identical
 * (browser-cacheable) within a page view and across re-renders.
 * The download policy comes from `opts.album`: "original" degrades to "display" and `download`
 * is ignored when the album does not allow downloads. The media route enforces it regardless.
 */
export function mediaUrl(
  photo: Pick<Photo, "id">,
  variant: PhotoVariant,
  opts: { album: MediaScope; ttlSeconds?: number; download?: boolean },
): string {
  const allowed = opts.album.downloads.allowed;
  const effective: PhotoVariant = variant === "original" && !allowed ? "display" : variant;
  const ttl = opts.ttlSeconds ?? 900;
  const exp = Math.ceil((Date.now() / 1000 + ttl) / EXP_BUCKET_SECONDS) * EXP_BUCKET_SECONDS;
  const dl = !!opts.download && allowed;
  const sig = sign("media", mediaSigData(photo.id, effective, exp, dl, opts.album));
  return `/api/media/${encodeURIComponent(photo.id)}/${effective}?exp=${exp}&sig=${sig}${dl ? "&dl=1" : ""}`;
}

/** Cheap pre-check before any database access (format + expiry). */
export function isPlausibleMediaRequest(variant: string, exp: string, sig: string): boolean {
  return VARIANTS.includes(variant as PhotoVariant) && /^\d{1,12}$/.test(exp) && Number(exp) >= Date.now() / 1000 && !!sig && sig.length <= 128;
}

export function verifyMediaSignature(photoId: string, variant: string, exp: string, sig: string, download: boolean, album: MediaScope): boolean {
  if (!isPlausibleMediaRequest(variant, exp, sig)) return false;
  return verify("media", mediaSigData(photoId, variant, exp, download, album), sig);
}

/**
 * Loads bytes for delivery, applying the watermark when required by the album policy
 * (downloads not allowed + watermark enabled → display variant is served watermarked).
 * "original" is refused unless the album allows downloads.
 */
export async function readVariant(photo: Photo, album: Album, variant: PhotoVariant): Promise<{ data: Buffer; contentType: string }> {
  const blobs = await getBlobs();
  if (variant === "original" && !album.downloads.allowed) throw forbidden("downloadsDisabled");

  const key = photo.blobKeys[variant];
  if (!key) throw notFound("photoNotFound");

  if (variant === "display" && !album.downloads.allowed && album.downloads.watermark) {
    const text = album.downloads.watermarkText.trim() || album.title;
    const wmKey = `${path.dirname(key)}/display-wm-${watermarkHash(text)}.webp`;
    const cached = await blobs.get(wmKey);
    if (cached) return { data: cached.data, contentType: "image/webp" };
    const base = await blobs.get(key);
    if (!base) throw notFound("photoNotFound");
    const data = await renderWatermark(base.data, text);
    await blobs.put(wmKey, data, "image/webp").catch((err) => console.error("[photos] watermark cache write failed", err));
    return { data, contentType: "image/webp" };
  }

  const blob = await blobs.get(key);
  if (!blob) throw notFound("photoNotFound");
  return { data: blob.data, contentType: variant === "original" ? photo.contentType : "image/webp" };
}

export async function recordPhotoView(photoId: string): Promise<void> {
  try {
    await (await getDb()).increment(COLLECTIONS.photos.name, photoId, "views", 1);
  } catch (err) {
    console.error("[photos] recordPhotoView failed", err);
  }
}

