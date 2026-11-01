import type { Album, Comment, Invite, OwnerRequest, Photo, PhotoVariant, Report } from "@/domain/types";

/**
 * Normalisers: turn whatever is stored (possibly written by an older version) into a
 * fully populated domain object with defaults. Never throws on partial documents.
 */

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed as readonly string[]).includes(v as string) ? (v as T) : d;

/** Dates may come back as ISO strings (contract) but tolerate Date / epoch millis. */
export function toIso(v: unknown, fallback: string | null = null): string | null {
  if (typeof v === "string" && v) return v;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v).toISOString();
  return fallback;
}

export function normalizeAlbum(raw: Raw): Album {
  const access = obj(raw.access);
  const downloads = obj(raw.downloads);
  const comments = obj(raw.comments);
  const reactions = obj(raw.reactions);
  const guest = obj(raw.guestUploads);
  const notifications = obj(raw.notifications);
  const stats = obj(raw.stats);
  const created = toIso(raw.createdAt, new Date(0).toISOString())!;
  return {
    id: str(raw.id),
    ownerId: str(raw.ownerId),
    slug: str(raw.slug),
    title: str(raw.title),
    message: str(raw.message),
    status: oneOf(raw.status, ["draft", "published"] as const, "draft"),
    themeId: str(raw.themeId, "builtin:neutral") || "builtin:neutral",
    coverPhotoId: typeof raw.coverPhotoId === "string" ? raw.coverPhotoId : null,
    access: {
      mode: oneOf(access.mode, ["link", "password"] as const, "link"),
      passwordHash: typeof access.passwordHash === "string" ? access.passwordHash : null,
      passwordVersion: num(access.passwordVersion, 0),
    },
    expiresAt: toIso(raw.expiresAt),
    downloads: {
      allowed: bool(downloads.allowed, false),
      watermark: bool(downloads.watermark, false),
      watermarkText: str(downloads.watermarkText),
    },
    comments: { mode: oneOf(comments.mode, ["post", "pre", "off"] as const, "post") },
    reactions: { enabled: bool(reactions.enabled, true) },
    guestUploads: {
      enabled: bool(guest.enabled, false),
      limitPerGuest: Math.max(0, Math.floor(num(guest.limitPerGuest, 10))),
    },
    notifications: { mode: oneOf(notifications.mode, ["off", "instant", "daily"] as const, "daily") },
    blockedUserIds: Array.isArray(raw.blockedUserIds) ? raw.blockedUserIds.filter((x): x is string => typeof x === "string") : [],
    stats: { views: Math.max(0, num(stats.views)), lastViewedAt: toIso(stats.lastViewedAt) },
    photoCount: Math.max(0, num(raw.photoCount)),
    createdAt: created,
    updatedAt: toIso(raw.updatedAt, created)!,
  };
}

export function normalizePhoto(raw: Raw): Photo {
  const keys = obj(raw.blobKeys);
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(raw.reactionCounts))) counts[k] = Math.max(0, num(v));
  const variantKey = (v: PhotoVariant) => str(keys[v]);
  return {
    id: str(raw.id),
    albumId: str(raw.albumId),
    ownerId: str(raw.ownerId),
    uploadedBy: str(raw.uploadedBy),
    uploaderName: str(raw.uploaderName),
    source: oneOf(raw.source, ["upload", "guest-upload", "google-photos", "google-drive"] as const, "upload"),
    sourceRef: typeof raw.sourceRef === "string" ? raw.sourceRef : null,
    status: oneOf(raw.status, ["approved", "pending", "rejected"] as const, "approved"),
    caption: str(raw.caption),
    position: num(raw.position),
    width: num(raw.width),
    height: num(raw.height),
    dominantColor: /^#[0-9a-fA-F]{6}$/.test(str(raw.dominantColor)) ? str(raw.dominantColor) : "#cccccc",
    takenAt: toIso(raw.takenAt),
    contentType: str(raw.contentType, "application/octet-stream"),
    originalFilename: str(raw.originalFilename, "photo"),
    blobKeys: { thumb: variantKey("thumb"), display: variantKey("display"), original: variantKey("original") },
    bytes: num(raw.bytes),
    reactionCounts: counts,
    commentCount: Math.max(0, num(raw.commentCount)),
    views: Math.max(0, num(raw.views)),
    createdAt: toIso(raw.createdAt, new Date(0).toISOString())!,
  };
}

export function normalizeComment(raw: Raw): Comment {
  return {
    id: str(raw.id),
    albumId: str(raw.albumId),
    photoId: str(raw.photoId),
    ownerId: str(raw.ownerId),
    authorId: str(raw.authorId),
    authorName: str(raw.authorName),
    authorImage: typeof raw.authorImage === "string" ? raw.authorImage : null,
    body: str(raw.body),
    status: oneOf(raw.status, ["visible", "pending", "hidden"] as const, "visible"),
    reportCount: Math.max(0, num(raw.reportCount)),
    createdAt: toIso(raw.createdAt, new Date(0).toISOString())!,
  };
}

export function normalizeReport(raw: Raw): Report {
  return {
    id: str(raw.id),
    albumId: str(raw.albumId),
    ownerId: str(raw.ownerId),
    commentId: str(raw.commentId),
    reporterId: str(raw.reporterId),
    reason: str(raw.reason),
    resolved: bool(raw.resolved, false),
    createdAt: toIso(raw.createdAt, new Date(0).toISOString())!,
  };
}

export function normalizeInvite(raw: Raw): Invite {
  return {
    id: str(raw.id),
    token: str(raw.token),
    createdBy: str(raw.createdBy),
    email: typeof raw.email === "string" ? raw.email : null,
    usedBy: typeof raw.usedBy === "string" ? raw.usedBy : null,
    usedAt: toIso(raw.usedAt),
    expiresAt: toIso(raw.expiresAt, new Date(0).toISOString())!,
    createdAt: toIso(raw.createdAt, new Date(0).toISOString())!,
  };
}

export function normalizeOwnerRequest(raw: Raw): OwnerRequest {
  return {
    id: str(raw.id),
    userId: str(raw.userId),
    userName: str(raw.userName),
    userEmail: str(raw.userEmail),
    message: str(raw.message),
    status: oneOf(raw.status, ["pending", "approved", "denied"] as const, "pending"),
    decidedBy: typeof raw.decidedBy === "string" ? raw.decidedBy : null,
    createdAt: toIso(raw.createdAt, new Date(0).toISOString())!,
    decidedAt: toIso(raw.decidedAt),
  };
}
