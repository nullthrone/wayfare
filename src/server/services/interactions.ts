import "server-only";
import { nanoid } from "nanoid";
import type { Album, Comment, Photo, Report, SessionUser } from "@/domain/types";
import { getDb } from "../container";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { COLLECTIONS, type Doc } from "../ports/document-store";
import {
  assertCanManageAlbum,
  canManageAlbum,
  getAlbumById,
  getCommentById,
  getPhotoById,
  normalizeComment,
  normalizeReport,
  nowIso,
  requireAlbumById,
  requirePhotoById,
} from "../repo";
import { evaluateAlbumAccess } from "./albums";
import { notifyOwner } from "./notifications";
import { hasRole } from "./session";
import { resolveTheme } from "./themes";

/**
 * Comments, reactions, reports, viewer blocking.
 * Any signed-in, non-banned user can interact with albums they have access to
 * (resolveAlbumAccess === "granted"), unless blocked for that album.
 *
 * Comment moderation per album (album.comments.mode):
 *   "post" → status "visible" immediately; owner may hide/delete afterwards
 *   "pre"  → status "pending" until the owner approves
 *   "off"  → adding comments is rejected; existing comments are hidden from viewers
 * Reaction keys must belong to the album theme's reaction set.
 *
 * photo.commentCount counts VISIBLE comments only; every status transition adjusts it.
 */

const MAX_COMMENT = 1000;
const MAX_REASON = 500;

/** Guard shared by all interactive (write) operations. Returns the album. */
async function requireInteractive(actor: SessionUser, photo: Photo): Promise<Album> {
  if (!actor) throw forbidden("unauthorized");
  if (actor.banned || !hasRole(actor, "viewer")) throw forbidden("accountBanned");
  const album = await getAlbumById(photo.albumId);
  if (!album) throw notFound("albumNotFound");
  const access = await evaluateAlbumAccess(album, actor);
  if (access.status === "not-found") throw notFound("albumNotFound");
  if (access.status === "expired") throw forbidden("albumExpired");
  if (access.status === "password-required") throw forbidden("albumLocked");
  if (album.blockedUserIds.includes(actor.id)) throw forbidden("blockedFromAlbum");
  return album;
}

export async function listComments(photoId: string, viewer: SessionUser | null): Promise<Comment[]> {
  const photo = await getPhotoById(photoId);
  if (!photo) return [];
  const album = await getAlbumById(photo.albumId);
  if (!album) return [];
  const manager = canManageAlbum(viewer, album);
  if (!manager) {
    if (album.comments.mode === "off") return [];
    if ((await evaluateAlbumAccess(album, viewer)).status !== "granted") return [];
  }
  const docs = await (await getDb()).find<Doc>(COLLECTIONS.comments.name, {
    where: [{ field: "photoId", op: "eq", value: photoId }],
    sort: [{ field: "createdAt", direction: "asc" }],
  });
  const all = docs.map(normalizeComment).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (manager) return all;
  // Viewers: visible comments, plus their own pending ones (so they see their comment is awaiting approval).
  return all.filter((c) => c.status === "visible" || (c.status === "pending" && viewer && c.authorId === viewer.id));
}

/** body: 1..1000 chars, trimmed, plain text. Updates photo.commentCount (visible only). Triggers notifications. */
export async function addComment(actor: SessionUser, photoId: string, body: string): Promise<Comment> {
  const photo = await requirePhotoById(photoId);
  if (photo.status !== "approved" && !(actor && canManageAlbum(actor, photo))) throw notFound("photoNotFound");
  const album = await requireInteractive(actor, photo);
  if (album.comments.mode === "off") throw invalid("commentsDisabled");

  const text = String(body ?? "").trim();
  if (text.length === 0) throw invalid("commentEmpty");
  if (text.length > MAX_COMMENT) throw invalid("commentTooLong");

  const manager = canManageAlbum(actor, album);
  const status: Comment["status"] = album.comments.mode === "pre" && !manager ? "pending" : "visible";
  const comment: Comment = {
    id: nanoid(),
    albumId: album.id,
    photoId: photo.id,
    ownerId: album.ownerId,
    authorId: actor.id,
    authorName: actor.name,
    authorImage: actor.image ?? null,
    body: text,
    status,
    reportCount: 0,
    createdAt: nowIso(),
  };
  const db = await getDb();
  await db.create(COLLECTIONS.comments.name, comment as unknown as Doc);
  if (status === "visible") await db.increment(COLLECTIONS.photos.name, photo.id, "commentCount", 1);

  if (actor.id !== album.ownerId) {
    const preview = text.length > 140 ? `${text.slice(0, 137)}...` : text;
    await notifyOwner(album, { kind: "comment", summary: `${actor.name}: ${preview}` });
  }
  return comment;
}

/** Author can delete own comment; album owner/admin can delete any. */
export async function deleteComment(actor: SessionUser, commentId: string): Promise<void> {
  const comment = await getCommentById(commentId);
  if (!comment) throw notFound("commentNotFound");
  const isAuthor = !!actor && !actor.banned && actor.id === comment.authorId;
  if (!isAuthor && !canManageAlbum(actor, { ownerId: comment.ownerId })) throw forbidden();
  const db = await getDb();
  await db.delete(COLLECTIONS.comments.name, comment.id);
  await db.deleteMany(COLLECTIONS.reports.name, { where: [{ field: "commentId", op: "eq", value: comment.id }] });
  if (comment.status === "visible") await db.increment(COLLECTIONS.photos.name, comment.photoId, "commentCount", -1);
}

/** Owner: approve pending ("visible") or hide ("hidden"). */
export async function moderateComment(actor: SessionUser, commentId: string, status: "visible" | "hidden"): Promise<void> {
  if (status !== "visible" && status !== "hidden") throw invalid("invalidInput");
  const comment = await getCommentById(commentId);
  if (!comment) throw notFound("commentNotFound");
  assertCanManageAlbum(actor, { ownerId: comment.ownerId });
  if (comment.status === status) return;
  const db = await getDb();
  await db.update(COLLECTIONS.comments.name, comment.id, { status });
  if (comment.status === "visible") await db.increment(COLLECTIONS.photos.name, comment.photoId, "commentCount", -1);
  else if (status === "visible") await db.increment(COLLECTIONS.photos.name, comment.photoId, "commentCount", 1);
}

export async function reportComment(actor: SessionUser, commentId: string, reason: string): Promise<void> {
  const comment = await getCommentById(commentId);
  if (!comment || comment.status !== "visible") throw notFound("commentNotFound");
  const photo = await requirePhotoById(comment.photoId);
  const album = await requireInteractive(actor, photo);
  if (comment.authorId === actor.id) throw invalid("cannotReportOwnComment");
  const text = String(reason ?? "").trim();
  if (text.length === 0) throw invalid("reportReasonRequired");
  if (text.length > MAX_REASON) throw invalid("reportReasonTooLong");

  const db = await getDb();
  const already = await db.count(COLLECTIONS.reports.name, {
    where: [
      { field: "commentId", op: "eq", value: comment.id },
      { field: "reporterId", op: "eq", value: actor.id },
    ],
  });
  if (already > 0) throw conflict("alreadyReported");

  const report: Report = {
    id: nanoid(),
    albumId: album.id,
    ownerId: album.ownerId,
    commentId: comment.id,
    reporterId: actor.id,
    reason: text,
    resolved: false,
    createdAt: nowIso(),
  };
  await db.create(COLLECTIONS.reports.name, report as unknown as Doc);
  await db.increment(COLLECTIONS.comments.name, comment.id, "reportCount", 1);
  await notifyOwner(album, { kind: "report", summary: `${comment.authorName}: ${comment.body.slice(0, 100)}` });
}

export async function listModerationQueue(
  actor: SessionUser,
  albumId: string,
): Promise<{ pendingComments: Comment[]; reports: (Report & { comment: Comment | null })[] }> {
  const album = await requireAlbumById(albumId);
  assertCanManageAlbum(actor, album);
  const db = await getDb();
  const pending = await db.find<Doc>(COLLECTIONS.comments.name, {
    where: [
      { field: "albumId", op: "eq", value: album.id },
      { field: "status", op: "eq", value: "pending" },
    ],
    sort: [{ field: "createdAt", direction: "asc" }],
  });
  const reportDocs = await db.find<Doc>(COLLECTIONS.reports.name, {
    where: [
      { field: "albumId", op: "eq", value: album.id },
      { field: "resolved", op: "eq", value: false },
    ],
    sort: [{ field: "createdAt", direction: "asc" }],
  });
  const reports = await Promise.all(
    reportDocs.map(async (r) => {
      const report = normalizeReport(r);
      return { ...report, comment: await getCommentById(report.commentId) };
    }),
  );
  return { pendingComments: pending.map(normalizeComment), reports };
}

export async function resolveReport(actor: SessionUser, reportId: string): Promise<void> {
  const db = await getDb();
  const doc = await db.get<Doc>(COLLECTIONS.reports.name, reportId);
  if (!doc) throw notFound("reportNotFound");
  const report = normalizeReport(doc);
  assertCanManageAlbum(actor, { ownerId: report.ownerId });
  await db.update(COLLECTIONS.reports.name, report.id, { resolved: true });
}

/** Toggle; returns new state and updated counter for that key. */
export async function toggleReaction(actor: SessionUser, photoId: string, key: string): Promise<{ active: boolean; count: number }> {
  const photo = await requirePhotoById(photoId);
  if (photo.status !== "approved") throw notFound("photoNotFound");
  const album = await requireInteractive(actor, photo);
  if (!album.reactions.enabled) throw invalid("reactionsDisabled");
  const theme = await resolveTheme(album.themeId);
  if (!theme.reactions.some((r) => r.key === key)) throw invalid("reactionInvalid");

  const db = await getDb();
  const id = `${photo.id}_${actor.id}_${key}`;
  const existing = await db.get<Doc>(COLLECTIONS.reactions.name, id);
  let active: boolean;
  if (existing) {
    await db.delete(COLLECTIONS.reactions.name, id);
    await db.increment(COLLECTIONS.photos.name, photo.id, `reactionCounts.${key}`, -1);
    active = false;
  } else {
    try {
      await db.create(COLLECTIONS.reactions.name, { id, albumId: album.id, photoId: photo.id, userId: actor.id, key, createdAt: nowIso() });
      await db.increment(COLLECTIONS.photos.name, photo.id, `reactionCounts.${key}`, 1);
    } catch {
      // concurrent double-click: the other request created it already
    }
    active = true;
  }
  const fresh = await getPhotoById(photo.id);
  return { active, count: Math.max(0, fresh?.reactionCounts[key] ?? 0) };
}

/** Map photoId → reaction keys the user has set, for one album. */
export async function getUserReactions(userId: string, albumId: string): Promise<Record<string, string[]>> {
  const docs = await (await getDb()).find<Doc>(COLLECTIONS.reactions.name, {
    where: [
      { field: "albumId", op: "eq", value: albumId },
      { field: "userId", op: "eq", value: userId },
    ],
  });
  const out: Record<string, string[]> = {};
  for (const d of docs) {
    const photoId = String(d.photoId);
    (out[photoId] ??= []).push(String(d.key));
  }
  return out;
}

/** Block/unblock a user for one album (also hides their comments when blocking). */
export async function setViewerBlocked(actor: SessionUser, albumId: string, userId: string, blocked: boolean): Promise<void> {
  const album = await requireAlbumById(albumId);
  assertCanManageAlbum(actor, album);
  if (userId === album.ownerId) throw invalid("cannotBlockOwner");
  const db = await getDb();
  const set = new Set(album.blockedUserIds);
  if (blocked) set.add(userId);
  else set.delete(userId);
  await db.update(COLLECTIONS.albums.name, album.id, { blockedUserIds: [...set], updatedAt: nowIso() });

  if (blocked) {
    const visible = await db.find<Doc>(COLLECTIONS.comments.name, {
      where: [
        { field: "albumId", op: "eq", value: album.id },
        { field: "authorId", op: "eq", value: userId },
        { field: "status", op: "eq", value: "visible" },
      ],
    });
    const perPhoto = new Map<string, number>();
    for (const c of visible) perPhoto.set(String(c.photoId), (perPhoto.get(String(c.photoId)) ?? 0) + 1);
    await db.updateMany(
      COLLECTIONS.comments.name,
      {
        where: [
          { field: "albumId", op: "eq", value: album.id },
          { field: "authorId", op: "eq", value: userId },
          { field: "status", op: "in", value: ["visible", "pending"] },
        ],
      },
      { status: "hidden" },
    );
    for (const [photoId, n] of perPhoto) await db.increment(COLLECTIONS.photos.name, photoId, "commentCount", -n);
  }
}
