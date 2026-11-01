"use server";

import { revalidatePath } from "next/cache";
import type { ViewerComment } from "@/components/viewer/types";
import type { Comment } from "@/domain/types";
import { runAction } from "@/server/action-result";
import { invalid } from "@/server/errors";
import { unlockAlbum } from "@/server/services/albums";
import { addComment, deleteComment, listComments, reportComment, toggleReaction } from "@/server/services/interactions";
import { getCurrentUser, requireUser } from "@/server/services/session";

const toViewerComment = (c: Comment): ViewerComment => ({
  id: c.id,
  authorId: c.authorId,
  authorName: c.authorName,
  body: c.body,
  status: c.status,
  createdAt: c.createdAt,
});

export async function unlockAlbumAction(slug: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const res = await runAction(async () => {
    const ok = await unlockAlbum(slug, password);
    if (!ok) throw invalid("viewer.gate.wrong");
  });
  if (res.ok) revalidatePath(`/a/${slug}`);
  return res;
}

export async function toggleReactionAction(photoId: string, key: string) {
  return runAction(async () => toggleReaction(await requireUser(), photoId, key));
}

export async function listCommentsAction(photoId: string) {
  return runAction(async () => {
    const viewer = await getCurrentUser();
    return (await listComments(photoId, viewer)).map(toViewerComment);
  });
}

export async function addCommentAction(photoId: string, body: string) {
  return runAction(async () => toViewerComment(await addComment(await requireUser(), photoId, body.trim().slice(0, 1000))));
}

export async function deleteCommentAction(commentId: string) {
  return runAction(async () => deleteComment(await requireUser(), commentId));
}

export async function reportCommentAction(commentId: string, reason: string) {
  return runAction(async () => reportComment(await requireUser(), commentId, reason.trim().slice(0, 500)));
}
