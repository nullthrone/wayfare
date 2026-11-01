"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { deleteAccountAction } from "@/app/(site)/account/actions";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Field";
import { ActionForm, SubmitButton } from "../ui/action";

export function DeleteAccount({ email, isOwner }: { email: string; isOwner: boolean }) {
  const t = useTranslations("account.delete");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <>
      <Button variant="danger-outline" onClick={() => setOpen(true)} data-testid="delete-account">
        <Trash2 className="size-4" aria-hidden /> {t("button")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("title")}>
        <ActionForm action={deleteAccountAction} className="space-y-4">
          <Alert kind="warning">{isOwner ? t("warningOwner") : t("warning")}</Alert>
          <Input name="confirm" label={t("typeEmail", { email })} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="delete-account-input" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {common("cancel")}
            </Button>
            <SubmitButton variant="danger" disabled={typed.trim().toLowerCase() !== email.trim().toLowerCase()} data-testid="delete-account-confirm">
              {t("confirm")}
            </SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}
