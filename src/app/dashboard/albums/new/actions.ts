"use server";

import { redirect } from "next/navigation";
import { runAction } from "@/server/action-result";
import { createAlbum } from "@/server/services/albums";
import { requireRole } from "@/server/services/session";

export async function createAlbumAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const themeId = String(formData.get("themeId") ?? "builtin:neutral");
  const res = await runAction(async () => {
    const user = await requireRole("owner");
    return createAlbum(user, { title, message, themeId });
  });
  if (res.ok) redirect(`/dashboard/albums/${res.data.id}`);
  return res;
}
