import "server-only";
import type { Album, Photo, PhotoSourceId, PhotoVariant, SessionUser } from "@/domain/types";
import { notImplemented } from "../errors";

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

/** Owner upload/import. Enforces InstanceSettings.maxUploadMb / maxPhotosPerAlbum, dedupes by sourceRef. */
export async function addPhoto(actor: SessionUser, albumId: string, input: IngestInput): Promise<Photo> {
  void actor; void albumId; void input;
  return notImplemented("addPhoto");
}

/**
 * Guest upload (album.guestUploads.enabled, signed-in user, not blocked, within limitPerGuest).
 * Always stored with status "pending" and queued for owner approval. Triggers owner notification.
 */
export async function addGuestPhoto(actor: SessionUser, albumSlug: string, input: Omit<IngestInput, "source">): Promise<Photo> {
  void actor; void albumSlug; void input;
  return notImplemented("addGuestPhoto");
}

/** status "approved" sorted by position; owners may request "pending" for the moderation queue. */
export async function listPhotos(albumId: string, status: Photo["status"] = "approved"): Promise<Photo[]> {
  void albumId; void status;
  return notImplemented("listPhotos");
}

export async function getPhoto(photoId: string): Promise<Photo | null> {
  void photoId;
  return notImplemented("getPhoto");
}

export async function updateCaption(actor: SessionUser, photoId: string, caption: string): Promise<Photo> {
  void actor; void photoId; void caption;
  return notImplemented("updateCaption");
}

export async function setCoverPhoto(actor: SessionUser, albumId: string, photoId: string): Promise<void> {
  void actor; void albumId; void photoId;
  return notImplemented("setCoverPhoto");
}

/** Persist a new order; `orderedIds` must be a permutation of the album's approved photo ids. */
export async function reorderPhotos(actor: SessionUser, albumId: string, orderedIds: string[]): Promise<void> {
  void actor; void albumId; void orderedIds;
  return notImplemented("reorderPhotos");
}

export async function moderateGuestPhoto(actor: SessionUser, photoId: string, decision: "approve" | "reject"): Promise<void> {
  void actor; void photoId; void decision;
  return notImplemented("moderateGuestPhoto");
}

/** Removes the document, blobs, comments, reactions. Updates album.photoCount / coverPhotoId. */
export async function deletePhoto(actor: SessionUser, photoId: string): Promise<void> {
  void actor; void photoId;
  return notImplemented("deletePhoto");
}

/** Signed URL for a variant. "original" only if album.downloads.allowed (else returns display URL). */
export function mediaUrl(photo: Pick<Photo, "id">, variant: PhotoVariant, opts?: { ttlSeconds?: number; download?: boolean }): string {
  void photo; void variant; void opts;
  return notImplemented("mediaUrl");
}

export function verifyMediaSignature(photoId: string, variant: string, exp: string, sig: string, download: boolean): boolean {
  void photoId; void variant; void exp; void sig; void download;
  return notImplemented("verifyMediaSignature");
}

/** Loads bytes for delivery, applying the watermark when required by the album policy. */
export async function readVariant(photo: Photo, album: Album, variant: PhotoVariant): Promise<{ data: Buffer; contentType: string }> {
  void photo; void album; void variant;
  return notImplemented("readVariant");
}

export async function recordPhotoView(photoId: string): Promise<void> {
  void photoId;
  return notImplemented("recordPhotoView");
}
