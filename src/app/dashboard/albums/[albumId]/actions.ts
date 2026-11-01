"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AccessMode, CommentMode, NotifyMode } from "@/domain/types";
import { runAction } from "@/server/action-result";
import { invalid } from "@/server/errors";
import { deleteAlbum, getAlbumForOwner, rotateShareSlug, updateAlbumSettings, type AlbumSettingsInput } from "@/server/services/albums";
import { moderateComment, resolveReport, deleteComment, setViewerBlocked } from "@/server/services/interactions";
import { deletePhoto, moderateGuestPhoto, reorderPhotos, setCoverPhoto, updateCaption } from "@/server/services/photos";
import { requireRole } from "@/server/services/session";

const path = (albumId: string) => `/dashboard/albums/${albumId}`;
const owner = () => requireRole("owner");
const oneOf = <T extends string>(v: string, allowed: readonly T[]): T | undefined => ((allowed as readonly string[]).includes(v) ? (v as T) : undefined);

/** FormData (settings tab) → AlbumSettingsInput. Switches are always part of the form, so "absent" means off. */
function parseSettings(fd: FormData): AlbumSettingsInput {
  const str = (k: string) => String(fd.get(k) ?? "");
  const on = (k: string) => fd.get(k) === "on";
  const accessMode = oneOf<AccessMode>(str("accessMode"), ["link", "password"]);
  const password = str("password");
  const date = str("expiresAt");
  const limit = Number.parseInt(str("guestUploadLimit"), 10);
  return {
    title: str("title").trim(),
    message: str("message").trim(),
    themeId: str("themeId") || undefined,
    accessMode,
    password: accessMode === "password" ? (password ? password : undefined) : null,
    expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T23:59:59.000Z`).toISOString() : null,
    downloadsAllowed: on("downloadsAllowed"),
    watermark: on("watermark"),
    watermarkText: str("watermarkText").trim(),
    commentMode: oneOf<CommentMode>(str("commentMode"), ["post", "pre", "off"]),
    reactionsEnabled: on("reactionsEnabled"),
    guestUploadsEnabled: on("guestUploadsEnabled"),
    guestUploadLimit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : undefined,
    notifyMode: oneOf<NotifyMode>(str("notifyMode"), ["off", "instant", "daily"]),
  };
}

export async function saveSettingsAction(albumId: string, formData: FormData) {
  const res = await runAction(async () => {
    const user = await owner();
    const album = await updateAlbumSettings(user, albumId, parseSettings(formData));
    return { slug: album.slug };
  });
  if (res.ok) revalidatePath(path(albumId), "layout");
  return res;
}

export async function setStatusAction(albumId: string, status: "draft" | "published") {
  const res = await runAction(async () => {
    const user = await owner();
    await updateAlbumSettings(user, albumId, { status });
  });
  if (res.ok) revalidatePath(path(albumId), "layout");
  return res;
}

export async function rotateSlugAction(albumId: string) {
  const res = await runAction(async () => {
    const user = await owner();
    const album = await rotateShareSlug(user, albumId);
    return { slug: album.slug };
  });
  if (res.ok) revalidatePath(path(albumId), "layout");
  return res;
}

export async function deleteAlbumAction(albumId: string, typedTitle: string) {
  const res = await runAction(async () => {
    const user = await owner();
    const album = await getAlbumForOwner(user, albumId);
    if (album.title.trim() !== typedTitle.trim()) throw invalid("album.settings.danger.mismatch");
    await deleteAlbum(user, albumId);
  });
  if (res.ok) {
    revalidatePath("/dashboard");
    redirect("/dashboard");
  }
  return res;
}

// ------------------------------------------------------------------- photos

export async function updateCaptionAction(albumId: string, photoId: string, caption: string) {
  const res = await runAction(async () => {
    await updateCaption(await owner(), photoId, caption.trim().slice(0, 300));
  });
  if (res.ok) revalidatePath(path(albumId));
  return res;
}

export async function setCoverAction(albumId: string, photoId: string) {
  const res = await runAction(async () => setCoverPhoto(await owner(), albumId, photoId));
  if (res.ok) revalidatePath(path(albumId));
  return res;
}

export async function deletePhotoAction(albumId: string, photoId: string) {
  const res = await runAction(async () => deletePhoto(await owner(), photoId));
  if (res.ok) revalidatePath(path(albumId));
  return res;
}

export async function reorderAction(albumId: string, orderedIds: string[]) {
  const res = await runAction(async () => reorderPhotos(await owner(), albumId, orderedIds));
  if (res.ok) revalidatePath(path(albumId));
  return res;
}

// --------------------------------------------------------------- moderation

export async function moderatePhotoAction(albumId: string, photoId: string, decision: "approve" | "reject") {
  const res = await runAction(async () => moderateGuestPhoto(await owner(), photoId, decision));
  if (res.ok) revalidatePath(path(albumId));
  return res;
}

export async function moderateCommentAction(albumId: string, commentId: string, status: "visible" | "hidden") {
  const res = await runAction(async () => moderateComment(await owner(), commentId, status));
  if (res.ok) revalidatePath(path(albumId));
  return res;
}

export async function deleteCommentAction(albumId: string, commentId: string) {
  const res = await runAction(async () => deleteComment(await owner(), commentId));
  if (res.ok) revalidatePath(path(albumId));
  return res;
}

export async function resolveReportAction(albumId: string, reportId: string) {
  const res = await runAction(async () => resolveReport(await owner(), reportId));
  if (res.ok) revalidatePath(path(albumId));
  return res;
}

export async function setBlockedAction(albumId: string, userId: string, blocked: boolean) {
  const res = await runAction(async () => setViewerBlocked(await owner(), albumId, userId, blocked));
  if (res.ok) revalidatePath(path(albumId));
  return res;
}
