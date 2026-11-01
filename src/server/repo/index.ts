import "server-only";
import type { Album, Comment, Photo, Role, SessionUser } from "@/domain/types";
import { COLLECTIONS, type Doc } from "../ports/document-store";
import { getDb } from "../container";
import { forbidden, notFound } from "../errors";
import { normalizeAlbum, normalizeComment, normalizePhoto, toIso } from "./normalize";

/**
 * Small typed helpers over the DocumentStore shared by the domain services.
 * Everything returns NORMALISED domain objects (see ./normalize.ts).
 */

export * from "./normalize";

export const nowIso = () => new Date().toISOString();

export async function getAlbumById(id: string): Promise<Album | null> {
  const doc = await (await getDb()).get<Doc>(COLLECTIONS.albums.name, id);
  return doc ? normalizeAlbum(doc) : null;
}

export async function requireAlbumById(id: string): Promise<Album> {
  const album = await getAlbumById(id);
  if (!album) throw notFound("albumNotFound");
  return album;
}

export async function getAlbumBySlug(slug: string): Promise<Album | null> {
  if (!slug || slug.length > 64) return null;
  const doc = await (await getDb()).findOne<Doc>(COLLECTIONS.albums.name, { where: [{ field: "slug", op: "eq", value: slug }] });
  return doc ? normalizeAlbum(doc) : null;
}

export async function getPhotoById(id: string): Promise<Photo | null> {
  const doc = await (await getDb()).get<Doc>(COLLECTIONS.photos.name, id);
  return doc ? normalizePhoto(doc) : null;
}

export async function requirePhotoById(id: string): Promise<Photo> {
  const photo = await getPhotoById(id);
  if (!photo) throw notFound("photoNotFound");
  return photo;
}

export async function getCommentById(id: string): Promise<Comment | null> {
  const doc = await (await getDb()).get<Doc>(COLLECTIONS.comments.name, id);
  return doc ? normalizeComment(doc) : null;
}

/** Minimal projection of the Better Auth user record that services need. */
export interface AuthUserDoc {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  banned: boolean;
  locale: "de" | "en" | null;
  createdAt: string;
}

export function normalizeAuthUser(raw: Record<string, unknown>): AuthUserDoc {
  const role = raw.role === "admin" || raw.role === "owner" ? raw.role : "viewer";
  const locale = raw.locale === "de" || raw.locale === "en" ? raw.locale : null;
  return {
    id: String(raw.id ?? ""),
    name: typeof raw.name === "string" ? raw.name : "",
    email: typeof raw.email === "string" ? raw.email : "",
    image: typeof raw.image === "string" ? raw.image : null,
    role,
    banned: raw.banned === true,
    locale,
    createdAt: toIso(raw.createdAt, new Date(0).toISOString())!,
  };
}

export async function getAuthUser(userId: string): Promise<AuthUserDoc | null> {
  const doc = await (await getDb()).get<Doc>(COLLECTIONS.authUser.name, userId);
  return doc ? normalizeAuthUser(doc) : null;
}

/** True when the actor may manage (owner-side) the album: its owner or an admin. Banned users never can. */
export function canManageAlbum(actor: SessionUser | null | undefined, album: Pick<Album, "ownerId">): boolean {
  if (!actor || actor.banned) return false;
  return actor.id === album.ownerId || actor.role === "admin";
}

export function assertCanManageAlbum(actor: SessionUser, album: Pick<Album, "ownerId">): void {
  if (!canManageAlbum(actor, album)) throw forbidden();
}

export function isExpired(album: Pick<Album, "expiresAt">, now = Date.now()): boolean {
  if (!album.expiresAt) return false;
  const t = Date.parse(album.expiresAt);
  return Number.isFinite(t) && t <= now;
}

/** Clamp helper for string input. */
export const clampText = (s: string, max: number) => s.trim().slice(0, max);
