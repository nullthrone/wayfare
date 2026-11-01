"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { setStatusAction } from "@/app/dashboard/albums/[albumId]/actions";
import { ActionButton } from "../ui/action";

export function PublishToggle({ albumId, status }: { albumId: string; status: "draft" | "published" }) {
  const t = useTranslations("album.header");
  if (status === "draft") {
    return (
      <ActionButton action={() => setStatusAction(albumId, "published")} successMessage={t("published")} data-testid="publish">
        <Eye className="size-4" aria-hidden /> {t("publish")}
      </ActionButton>
    );
  }
  return (
    <ActionButton
      variant="outline"
      action={() => setStatusAction(albumId, "draft")}
      successMessage={t("unpublished")}
      confirm={{ title: t("unpublishConfirm.title"), description: t("unpublishConfirm.description"), confirmLabel: t("unpublishConfirm.confirm"), danger: false }}
      data-testid="unpublish"
    >
      <EyeOff className="size-4" aria-hidden /> {t("unpublish")}
    </ActionButton>
  );
}
