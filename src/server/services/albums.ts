import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { customAlphabet, nanoid } from "nanoid";
import { z } from "zod";
import type { AccessMode, Album, CommentMode, NotifyMode, SessionUser } from "@/domain/types";
import { config } from "../config";
import { getBlobs, getDb } from "../container";
import { sign, verify, hashPassword, verifyPassword } from "../crypto";
import { forbidden, invalid, limitExceeded, notFound } from "../errors";
import { COLLECTIONS, type Doc } from "../ports/document-store";
import {
  assertCanManageAlbum,
  canManageAlbum,
  getAlbumBySlug,
  isExpired,
  normalizeAlbum,
  normalizePhoto,
  nowIso,
  requireAlbumById,
} from "../repo";
import { hasRole } from "./session";
import { listAvailableThemes } from "./themes";

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

const generateSlug = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);

const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;
const UNLOCK_COOKIE_PREFIX = "wf_unlock_";
const UNLOCK_MAX_AGE = 30 * 24 * 60 * 60;

const createSchema = z.object({
  title: z.string().trim().min(1, "albumTitleRequired").max(120, "albumTitleTooLong"),
  themeId: z.string().trim().min(1, "themeRequired").max(64, "themeRequired"),
  message: z.string().trim().max(1000, "messageTooLong").optional(),
});

const settingsSchema = z.object({
  title: z.string().trim().min(1, "albumTitleRequired").max(120, "albumTitleTooLong").optional(),
  message: z.string().trim().max(1000, "messageTooLong").optional(),
  status: z.enum(["draft", "published"]).optional(),
  themeId: z.string().trim().min(1, "themeRequired").max(64, "themeRequired").optional(),
  accessMode: z.enum(["link", "password"]).optional(),
  password: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  downloadsAllowed: z.boolean().optional(),
  watermark: z.boolean().optional(),
  watermarkText: z.string().trim().max(80, "watermarkTextTooLong").optional(),
  commentMode: z.enum(["post", "pre", "off"]).optional(),
  reactionsEnabled: z.boolean().optional(),
  guestUploadsEnabled: z.boolean().optional(),
  guestUploadLimit: z.number().int().min(0, "guestLimitInvalid").max(500, "guestLimitInvalid").optional(),
  notifyMode: z.enum(["off", "instant", "daily"]).optional(),
});

function firstIssueKey(err: z.ZodError): string {
  const msg = err.issues[0]?.message ?? "";
  // our own schema messages are camelCase keys; zod defaults are sentences
  return /^[a-z][A-Za-z0-9]+$/.test(msg) ? msg : "invalidInput";
}

function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw invalid(firstIssueKey(r.error));
  return r.data;
}

export function shareUrl(album: Pick<Album, "slug">): string {
  return `${config().baseUrl}/a/${album.slug}`;
}

async function uniqueSlug(): Promise<string> {
  const db = await getDb();
  for (let i = 0; i < 8; i++) {
    const slug = generateSlug();
    const existing = await db.findOne<Doc>(COLLECTIONS.albums.name, { where: [{ field: "slug", op: "eq", value: slug }] });
    if (!existing) return slug;
  }
  throw new Error("Could not generate a unique album slug");
}

export async function listAlbumsForOwner(actor: SessionUser): Promise<Album[]> {
  const db = await getDb();
  const docs = await db.find<Doc>(COLLECTIONS.albums.name, {
    where: [{ field: "ownerId", op: "eq", value: actor.id }],
    sort: [{ field: "updatedAt", direction: "desc" }],
  });
  return docs.map(normalizeAlbum);
}

/** Owners may only use built-ins, their own custom themes and themes published by an admin. */
async function assertThemeAvailable(actor: SessionUser, themeId: string): Promise<void> {
  const available = await listAvailableThemes(actor);
  if (!available.some((t) => t.id === themeId)) throw invalid("themeNotAvailable");
}

export async function createAlbum(actor: SessionUser, input: CreateAlbumInput): Promise<Album> {
  if (!hasRole(actor, "owner")) throw forbidden();
  const data = parseOrThrow(createSchema, input);
  await assertThemeAvailable(actor, data.themeId);
  const now = nowIso();
  const album: Album = {
    id: nanoid(),
    ownerId: actor.id,
    slug: await uniqueSlug(),
    title: data.title,
    message: data.message ?? "",
    // New albums start as drafts: nothing is reachable until the owner publishes.
    status: "draft",
    themeId: data.themeId,
    coverPhotoId: null,
    access: { mode: "link", passwordHash: null, passwordVersion: 0 },
    expiresAt: null,
    downloads: { allowed: false, watermark: false, watermarkText: "" },
    comments: { mode: "post" },
    reactions: { enabled: true },
    guestUploads: { enabled: false, limitPerGuest: 10 },
    notifications: { mode: "daily" },
    blockedUserIds: [],
    stats: { views: 0, lastViewedAt: null },
    photoCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await (await getDb()).create(COLLECTIONS.albums.name, album as unknown as Doc);
  return album;
}

export async function getAlbumForOwner(actor: SessionUser, albumId: string): Promise<Album> {
  const album = await requireAlbumById(albumId);
  assertCanManageAlbum(actor, album);
  return album;
}

export async function updateAlbumSettings(actor: SessionUser, albumId: string, input: AlbumSettingsInput): Promise<Album> {
  const album = await getAlbumForOwner(actor, albumId);
  const data = parseOrThrow(settingsSchema, input);
  const patch: Record<string, unknown> = {};

  if (data.title !== undefined) patch.title = data.title;
  if (data.message !== undefined) patch.message = data.message;
  if (data.status !== undefined) patch.status = data.status;
  if (data.themeId !== undefined && data.themeId !== album.themeId) {
    await assertThemeAvailable(actor, data.themeId);
    patch.themeId = data.themeId;
  }
  if (data.downloadsAllowed !== undefined) patch["downloads.allowed"] = data.downloadsAllowed;
  if (data.watermark !== undefined) patch["downloads.watermark"] = data.watermark;
  if (data.watermarkText !== undefined) patch["downloads.watermarkText"] = data.watermarkText;
  if (data.commentMode !== undefined) patch["comments.mode"] = data.commentMode;
  if (data.reactionsEnabled !== undefined) patch["reactions.enabled"] = data.reactionsEnabled;
  if (data.guestUploadsEnabled !== undefined) patch["guestUploads.enabled"] = data.guestUploadsEnabled;
  if (data.guestUploadLimit !== undefined) patch["guestUploads.limitPerGuest"] = data.guestUploadLimit;
  if (data.notifyMode !== undefined) patch["notifications.mode"] = data.notifyMode;

  if (data.expiresAt !== undefined) {
    if (data.expiresAt === null || data.expiresAt === "") {
      patch.expiresAt = null;
    } else {
      const t = Date.parse(data.expiresAt);
      if (!Number.isFinite(t)) throw invalid("expiresAtInvalid");
      patch.expiresAt = new Date(t).toISOString();
    }
  }

  // ---- access mode / password
  const effectiveMode: AccessMode = data.accessMode ?? album.access.mode;
  if (effectiveMode === "password") {
    if (typeof data.password === "string") {
      if (data.password.length < MIN_PASSWORD) throw invalid("passwordTooShort");
      if (data.password.length > MAX_PASSWORD) throw invalid("passwordTooLong");
      patch["access.passwordHash"] = await hashPassword(data.password);
      patch["access.passwordVersion"] = album.access.passwordVersion + 1;
    } else if (data.password === null) {
      throw invalid("passwordRequired");
    } else if (!album.access.passwordHash) {
      throw invalid("passwordRequired");
    }
    patch["access.mode"] = "password";
  } else {
    if (typeof data.password === "string") throw invalid("passwordNotAllowed");
    patch["access.mode"] = "link";
    if (album.access.mode === "password" || album.access.passwordHash) {
      // Leaving password mode (or explicit clear): drop the hash and invalidate unlock cookies.
      patch["access.passwordHash"] = null;
      patch["access.passwordVersion"] = album.access.passwordVersion + 1;
    }
  }

  patch.updatedAt = nowIso();
  const db = await getDb();
  const updated = await db.update<Doc>(COLLECTIONS.albums.name, albumId, patch);
  if (!updated) throw notFound("albumNotFound");
  return normalizeAlbum(updated);
}

/** Generates a new slug → every previously distributed QR code / link stops working. */
export async function rotateShareSlug(actor: SessionUser, albumId: string): Promise<Album> {
  await getAlbumForOwner(actor, albumId);
  const slug = await uniqueSlug();
  const updated = await (await getDb()).update<Doc>(COLLECTIONS.albums.name, albumId, { slug, updatedAt: nowIso() });
  if (!updated) throw notFound("albumNotFound");
  return normalizeAlbum(updated);
}

/** Deletes album, photos (incl. blobs), comments, reactions, reports. */
export async function deleteAlbum(actor: SessionUser, albumId: string): Promise<void> {
  const album = await getAlbumForOwner(actor, albumId);
  const db = await getDb();
  const blobs = await getBlobs();
  const byAlbum = { where: [{ field: "albumId", op: "eq" as const, value: album.id }] };
  await blobs.deletePrefix(`albums/${album.id}/`);
  await Promise.all([
    db.deleteMany(COLLECTIONS.photos.name, byAlbum),
    db.deleteMany(COLLECTIONS.comments.name, byAlbum),
    db.deleteMany(COLLECTIONS.reactions.name, byAlbum),
    db.deleteMany(COLLECTIONS.reports.name, byAlbum),
    db.deleteMany(COLLECTIONS.viewMarkers.name, byAlbum),
    db.deleteMany(COLLECTIONS.pendingNotifications.name, byAlbum),
  ]);
  await db.delete(COLLECTIONS.albums.name, album.id);
}

// ---------------------------------------------------------------- viewer side

export type AlbumAccess =
  | { status: "granted"; album: Album }
  | { status: "password-required"; album: Pick<Album, "id" | "slug" | "title" | "themeId"> }
  | { status: "expired"; album: Pick<Album, "id" | "slug" | "title" | "themeId"> }
  | { status: "not-found" };

const unlockCookieName = (albumId: string) => `${UNLOCK_COOKIE_PREFIX}${albumId}`;
const unlockCookieValue = (album: Pick<Album, "id" | "access">) => sign("unlock", `${album.id}:${album.access.passwordVersion}`);

async function readUnlockCookie(album: Album): Promise<boolean> {
  try {
    const value = (await cookies()).get(unlockCookieName(album.id))?.value;
    if (!value) return false;
    return verify("unlock", `${album.id}:${album.access.passwordVersion}`, value);
  } catch {
    // no request scope (e.g. background job)
    return false;
  }
}

/**
 * Pure access decision for an already loaded album. Shared by resolveAlbumAccess and the
 * interaction/upload services so every entry point applies the same policy.
 */
export async function evaluateAlbumAccess(album: Album, viewer: SessionUser | null): Promise<AlbumAccess> {
  if (canManageAlbum(viewer, album)) return { status: "granted", album };
  if (album.status !== "published") return { status: "not-found" };
  const brief = { id: album.id, slug: album.slug, title: album.title, themeId: album.themeId };
  if (isExpired(album)) return { status: "expired", album: brief };
  if (album.access.mode === "password") {
    if (!album.access.passwordHash || !(await readUnlockCookie(album))) return { status: "password-required", album: brief };
  }
  return { status: "granted", album };
}

/**
 * Resolves /a/{slug}. Reads the unlock cookie `wf_unlock_{albumId}` (HMAC over albumId + passwordVersion).
 * Draft albums are "not-found" for everyone except the owner/admin (who get "granted").
 * Expired albums are "expired" for everyone except the owner/admin.
 */
export async function resolveAlbumAccess(slug: string, viewer: SessionUser | null): Promise<AlbumAccess> {
  const album = await getAlbumBySlug(slug);
  if (!album) return { status: "not-found" };
  return evaluateAlbumAccess(album, viewer);
}

// ---- unlock rate limiting
// In-memory and PER PROCESS: with several instances behind a load balancer the effective
// limit is N × the numbers below. Good enough to make online guessing impractical; the
// scrypt cost per attempt does the rest. Keys are hashes and never persisted.
const UNLOCK_WINDOW_MS = 10 * 60 * 1000;
const UNLOCK_MAX_PER_VISITOR = 10;
/** Above this many attempts per album and window, every further attempt is slowed down (never blocked). */
const UNLOCK_SLOWDOWN_PER_ALBUM = 100;
const UNLOCK_SLOWDOWN_MS = 2000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function hit(key: string, max: number, now: number): boolean {
  let e = attempts.get(key);
  if (!e || e.resetAt <= now) {
    e = { count: 0, resetAt: now + UNLOCK_WINDOW_MS };
    attempts.set(key, e);
  }
  e.count++;
  return e.count <= max;
}

function pruneAttempts(now: number) {
  if (attempts.size < 2000) return;
  for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
}

/** Test hook. */
export function resetUnlockRateLimitForTests() {
  attempts.clear();
}

/**
 * Client IP as seen by the closest trusted proxy. X-Forwarded-For is client-controlled on the LEFT;
 * each trusted proxy appends the address it received the request from on the RIGHT. With N trusted
 * proxies, the N-th entry from the right is the real client. N = 0 ignores the header entirely.
 */
export function clientIp(h: Headers, trustedProxies: number): string {
  if (trustedProxies <= 0) return "";
  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return chain.length >= trustedProxies ? chain[chain.length - trustedProxies] : (chain[0] ?? "");
}

async function visitorFingerprint(): Promise<string> {
  try {
    const h = await headers();
    const ip = clientIp(h, config().WAYFARE_TRUSTED_PROXIES);
    return createHash("sha256")
      .update(`${ip}|${h.get("user-agent") ?? ""}|${h.get("accept-language") ?? ""}`)
      .digest("hex")
      .slice(0, 24);
  } catch {
    return "unknown";
  }
}

/** Verifies password (constant-time), sets the unlock cookie. Rate-limited per album+visitor (IP-hash), slowed down per album. */
export async function unlockAlbum(slug: string, password: string): Promise<boolean> {
  const album = await getAlbumBySlug(slug);
  if (!album || album.status !== "published" || isExpired(album) || album.access.mode !== "password" || !album.access.passwordHash) return false;

  const now = Date.now();
  pruneAttempts(now);
  const visitorKey = `${album.id}:${await visitorFingerprint()}`;
  const okVisitor = hit(visitorKey, UNLOCK_MAX_PER_VISITOR, now);
  if (!okVisitor) throw limitExceeded("rateLimited");
  // Album-wide: slow down instead of blocking, so an attacker cannot lock legitimate guests out.
  if (!hit(`album:${album.id}`, UNLOCK_SLOWDOWN_PER_ALBUM, now)) await new Promise((r) => setTimeout(r, UNLOCK_SLOWDOWN_MS));

  if (typeof password !== "string" || password.length === 0 || password.length > MAX_PASSWORD) return false;
  const ok = await verifyPassword(password, album.access.passwordHash);
  if (!ok) return false;

  attempts.delete(visitorKey);
  (await cookies()).set(unlockCookieName(album.id), unlockCookieValue(album), {
    httpOnly: true,
    sameSite: "lax",
    secure: config().baseUrl.startsWith("https://"),
    path: "/",
    maxAge: UNLOCK_MAX_AGE,
  });
  return true;
}

let lastMarkerCleanup = 0;

/** Counts a view at most once per visitor (cookie-less hash of UA + day + album, no IP stored) and day. Never throws. */
export async function recordAlbumView(album: Album): Promise<void> {
  try {
    const h = await headers();
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const visitor = sign("visitor", `${h.get("user-agent") ?? ""}${h.get("accept-language") ?? ""}${day}`);
    const id = `${album.id}_${visitor.slice(0, 16)}_${day}`;
    const db = await getDb();
    try {
      await db.create(COLLECTIONS.viewMarkers.name, { id, albumId: album.id, createdAt: now.toISOString() });
    } catch {
      return; // marker exists → already counted today
    }
    await db.increment(COLLECTIONS.albums.name, album.id, "stats.views", 1);
    await db.update(COLLECTIONS.albums.name, album.id, { "stats.lastViewedAt": now.toISOString() });

    // Opportunistic cleanup of old markers (at most every 10 minutes per process).
    if (now.getTime() - lastMarkerCleanup > 10 * 60 * 1000) {
      lastMarkerCleanup = now.getTime();
      const cutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
      await db.deleteMany(COLLECTIONS.viewMarkers.name, { where: [{ field: "createdAt", op: "lt", value: cutoff }] });
    }
  } catch (err) {
    console.error("[albums] recordAlbumView failed", err);
  }
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
  const album = await getAlbumForOwner(actor, albumId);
  const db = await getDb();
  const docs = await db.find<Doc>(COLLECTIONS.photos.name, {
    where: [
      { field: "albumId", op: "eq", value: album.id },
      { field: "status", op: "eq", value: "approved" },
    ],
  });
  const photos = docs.map(normalizePhoto);
  const top = photos
    .map((p) => ({ photoId: p.id, views: p.views, reactions: Object.values(p.reactionCounts).reduce((a, b) => a + b, 0) }))
    .filter((p) => p.views + p.reactions > 0)
    .sort((a, b) => b.views + b.reactions - (a.views + a.reactions))
    .slice(0, 5);
  return {
    views: album.stats.views,
    lastViewedAt: album.stats.lastViewedAt,
    photoCount: photos.length,
    commentCount: photos.reduce((n, p) => n + p.commentCount, 0),
    reactionCount: photos.reduce((n, p) => n + Object.values(p.reactionCounts).reduce((a, b) => a + b, 0), 0),
    topPhotos: top,
  };
}
