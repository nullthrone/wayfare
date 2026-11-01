"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { rotateSlugAction } from "@/app/dashboard/albums/[albumId]/actions";
import { ActionButton } from "../ui/action";

export function RotateSlug({ albumId }: { albumId: string }) {
  const t = useTranslations("album.share.rotate");
  return (
    <ActionButton
      variant="danger-outline"
      action={() => rotateSlugAction(albumId)}
      successMessage={t("done")}
      confirm={{ title: t("confirmTitle"), description: t("confirmDescription"), confirmLabel: t("confirm") }}
      data-testid="rotate-slug"
    >
      <RefreshCw className="size-4" aria-hidden /> {t("button")}
    </ActionButton>
  );
}
