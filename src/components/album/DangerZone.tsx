"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { deleteAlbumAction } from "@/app/dashboard/albums/[albumId]/actions";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Field";
import { ActionForm, SubmitButton } from "../ui/action";

export function DangerZone({ albumId, title }: { albumId: string; title: string }) {
  const t = useTranslations("album.settings.danger");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <section className="rounded-card border border-danger/30 bg-danger-soft/40 p-5 sm:p-6" data-testid="danger-zone">
      <h2 className="text-base font-semibold text-danger">{t("title")}</h2>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-xl text-sm text-ink/80">{t("description")}</p>
        <Button variant="danger-outline" onClick={() => setOpen(true)} data-testid="delete-album">
          <Trash2 className="size-4" aria-hidden /> {t("button")}
        </Button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("confirmTitle")} description={t("confirmDescription")}>
        <ActionForm action={() => deleteAlbumAction(albumId, typed)} className="space-y-4">
          <Input
            label={t("typeTitle", { title })}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            data-testid="delete-album-confirm-input"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {common("cancel")}
            </Button>
            <SubmitButton variant="danger" disabled={typed.trim() !== title.trim()} data-testid="delete-album-confirm">
              {t("confirm")}
            </SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </section>
  );
}
