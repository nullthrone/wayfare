import "server-only";
import type { Comment, Report, SessionUser } from "@/domain/types";
import { notImplemented } from "../errors";

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
 */

export async function listComments(photoId: string, viewer: SessionUser | null): Promise<Comment[]> {
  void photoId; void viewer;
  return notImplemented("listComments");
}

/** body: 1..1000 chars, trimmed, plain text. Updates photo.commentCount (visible only). Triggers notifications. */
export async function addComment(actor: SessionUser, photoId: string, body: string): Promise<Comment> {
  void actor; void photoId; void body;
  return notImplemented("addComment");
}

/** Author can delete own comment; album owner/admin can delete any. */
export async function deleteComment(actor: SessionUser, commentId: string): Promise<void> {
  void actor; void commentId;
  return notImplemented("deleteComment");
}

/** Owner: approve pending ("visible") or hide ("hidden"). */
export async function moderateComment(actor: SessionUser, commentId: string, status: "visible" | "hidden"): Promise<void> {
  void actor; void commentId; void status;
  return notImplemented("moderateComment");
}

export async function reportComment(actor: SessionUser, commentId: string, reason: string): Promise<void> {
  void actor; void commentId; void reason;
  return notImplemented("reportComment");
}

export async function listModerationQueue(actor: SessionUser, albumId: string): Promise<{ pendingComments: Comment[]; reports: (Report & { comment: Comment | null })[] }> {
  void actor; void albumId;
  return notImplemented("listModerationQueue");
}

export async function resolveReport(actor: SessionUser, reportId: string): Promise<void> {
  void actor; void reportId;
  return notImplemented("resolveReport");
}

/** Toggle; returns new state and updated counter for that key. */
export async function toggleReaction(actor: SessionUser, photoId: string, key: string): Promise<{ active: boolean; count: number }> {
  void actor; void photoId; void key;
  return notImplemented("toggleReaction");
}

/** Map photoId → reaction keys the user has set, for one album. */
export async function getUserReactions(userId: string, albumId: string): Promise<Record<string, string[]>> {
  void userId; void albumId;
  return notImplemented("getUserReactions");
}

/** Block/unblock a user for one album (also hides their comments when blocking). */
export async function setViewerBlocked(actor: SessionUser, albumId: string, userId: string, blocked: boolean): Promise<void> {
  void actor; void albumId; void userId; void blocked;
  return notImplemented("setViewerBlocked");
}
