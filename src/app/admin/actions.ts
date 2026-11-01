"use server";

import { revalidatePath } from "next/cache";
import type { OnboardingMode, Role } from "@/domain/types";
import { runAction } from "@/server/action-result";
import {
  createInvite,
  decideOwnerRequest,
  revokeInvite,
  setUserBanned,
  setUserRole,
  updateInstanceSettings,
} from "@/server/services/admin";
import { requireRole } from "@/server/services/session";
import { setThemePublic } from "@/server/services/themes";
import { renderMarkdown } from "../_lib/markdown";

const admin = () => requireRole("admin");

export async function setRoleAction(userId: string, role: Role) {
  const res = await runAction(async () => setUserRole(await admin(), userId, role));
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function setBannedAction(userId: string, banned: boolean) {
  const res = await runAction(async () => setUserBanned(await admin(), userId, banned));
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function decideRequestAction(requestId: string, decision: "approved" | "denied") {
  const res = await runAction(async () => decideOwnerRequest(await admin(), requestId, decision));
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function createInviteAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const validDays = Number.parseInt(String(formData.get("validDays") ?? "14"), 10);
  const res = await runAction(async () =>
    createInvite(await admin(), { email: email || undefined, validDays: Number.isFinite(validDays) ? Math.max(1, Math.min(validDays, 365)) : 14 }),
  );
  if (res.ok) revalidatePath("/admin/invites");
  return res;
}

export async function revokeInviteAction(inviteId: string) {
  const res = await runAction(async () => revokeInvite(await admin(), inviteId));
  if (res.ok) revalidatePath("/admin/invites");
  return res;
}

export async function updateSettingsAction(formData: FormData) {
  const str = (k: string) => String(formData.get(k) ?? "");
  const mode = str("onboardingMode");
  const upload = Number.parseInt(str("maxUploadMb"), 10);
  const photos = Number.parseInt(str("maxPhotosPerAlbum"), 10);
  const res = await runAction(async () =>
    updateInstanceSettings(await admin(), {
      instanceName: str("instanceName").trim(),
      onboardingMode: (["open", "approval", "invite"].includes(mode) ? mode : undefined) as OnboardingMode | undefined,
      maxUploadMb: Number.isFinite(upload) ? upload : undefined,
      maxPhotosPerAlbum: Number.isFinite(photos) ? photos : undefined,
      legal: { imprint: str("imprint"), privacy: str("privacy") },
    }),
  );
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

/** Server-side Markdown preview (sanitised HTML). */
export async function previewMarkdownAction(markdown: string) {
  return runAction(async () => {
    await admin();
    return renderMarkdown(markdown.slice(0, 50_000));
  });
}

export async function setThemePublicAction(themeId: string, isPublic: boolean) {
  const res = await runAction(async () => setThemePublic(await admin(), themeId, isPublic));
  if (res.ok) revalidatePath("/admin/themes");
  return res;
}
