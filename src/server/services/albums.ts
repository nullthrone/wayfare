import "server-only";
import type { AccessMode, Album, CommentMode, NotifyMode, SessionUser } from "@/domain/types";
import { notImplemented } from "../errors";

/**
 * Album management (owner side) and public album access (viewer side).
 * Authorisation: owner functions require actor.id === album.ownerId OR actor.role === "admin".
 */

export interface CreateAlbumInput {
  title: string;
  themeId: string;
  message?: string;
}

export interface AlbumSettingsInput {
  title?: string;
  message?: string;
  status?: "draft" | "published";
  themeId?: string;
  accessMode?: AccessMode;
  /** Required when switching to "password" and no password set yet. null clears (only allowed with mode "link"). */
  password?: string | null;
  expiresAt?: string | null;
  downloadsAllowed?: boolean;
  watermark?: boolean;
  watermarkText?: string;
  commentMode?: CommentMode;
  reactionsEnabled?: boolean;
  guestUploadsEnabled?: boolean;
  guestUploadLimit?: number;
  notifyMode?: NotifyMode;
}

export async function listAlbumsForOwner(actor: SessionUser): Promise<Album[]> {
  void actor;
  return notImplemented("listAlbumsForOwner");
}

export async function createAlbum(actor: SessionUser, input: CreateAlbumInput): Promise<Album> {
  void actor; void input;
  return notImplemented("createAlbum");
}

export async function getAlbumForOwner(actor: SessionUser, albumId: string): Promise<Album> {
  void actor; void albumId;
  return notImplemented("getAlbumForOwner");
}

export async function updateAlbumSettings(actor: SessionUser, albumId: string, input: AlbumSettingsInput): Promise<Album> {
  void actor; void albumId; void input;
  return notImplemented("updateAlbumSettings");
}

/** Generates a new slug → every previously distributed QR code / link stops working. */
export async function rotateShareSlug(actor: SessionUser, albumId: string): Promise<Album> {
  void actor; void albumId;
  return notImplemented("rotateShareSlug");
}

/** Deletes album, photos (incl. blobs), comments, reactions, reports. */
export async function deleteAlbum(actor: SessionUser, albumId: string): Promise<void> {
  void actor; void albumId;
  return notImplemented("deleteAlbum");
}

export function shareUrl(album: Pick<Album, "slug">): string {
  void album;
  return notImplemented("shareUrl");
}

// ---------------------------------------------------------------- viewer side

export type AlbumAccess =
  | { status: "granted"; album: Album }
  | { status: "password-required"; album: Pick<Album, "id" | "slug" | "title" | "themeId"> }
  | { status: "expired"; album: Pick<Album, "id" | "slug" | "title" | "themeId"> }
  | { status: "not-found" };

/**
 * Resolves /a/{slug}. Reads the unlock cookie `wf_unlock_{albumId}` (HMAC over albumId + passwordVersion).
 * Draft albums are "not-found" for everyone except the owner/admin (who get "granted").
 */
export async function resolveAlbumAccess(slug: string, viewer: SessionUser | null): Promise<AlbumAccess> {
  void slug; void viewer;
  return notImplemented("resolveAlbumAccess");
}

/** Verifies password (constant-time), sets the unlock cookie. Rate-limited per album+IP-hash. */
export async function unlockAlbum(slug: string, password: string): Promise<boolean> {
  void slug; void password;
  return notImplemented("unlockAlbum");
}

/** Counts a view at most once per visitor (cookie-less hash of UA + day + album, no IP stored) and day. */
export async function recordAlbumView(album: Album): Promise<void> {
  void album;
  return notImplemented("recordAlbumView");
}

export interface AlbumStats {
  views: number;
  lastViewedAt: string | null;
  photoCount: number;
  commentCount: number;
  reactionCount: number;
  topPhotos: { photoId: string; views: number; reactions: number }[];
}

export async function getAlbumStats(actor: SessionUser, albumId: string): Promise<AlbumStats> {
  void actor; void albumId;
  return notImplemented("getAlbumStats");
}
