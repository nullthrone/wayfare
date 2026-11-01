"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createInviteAction } from "@/app/admin/actions";
import { Alert } from "../ui/Alert";
import { CopyButton } from "../ui/CopyButton";
import { Input } from "../ui/Field";
import { ActionForm, SubmitButton } from "../ui/action";

export function InviteForm() {
  const t = useTranslations("admin.invites");
  const [created, setCreated] = useState<{ url: string; email: string | null } | null>(null);
  return (
    <div className="space-y-4">
      <ActionForm
        action={createInviteAction}
        className="grid items-end gap-4 sm:grid-cols-[1fr_10rem_auto]"
        onSuccess={(inv) => setCreated({ url: (inv as { url: string; email: string | null }).url, email: (inv as { email: string | null }).email })}
        resetOnSuccess
        data-testid="invite-form"
      >
        <Input name="email" type="email" label={t("form.email")} hint={t("form.emailHint")} />
        <Input name="validDays" type="number" min={1} max={365} defaultValue={14} label={t("form.validDays")} />
        <SubmitButton className="sm:mb-[1.4rem]">
          <Link2 className="size-4" aria-hidden /> {t("form.create")}
        </SubmitButton>
      </ActionForm>
      {created ? (
        <Alert kind="success" title={t("created.title")} data-testid="invite-created">
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs select-all">{created.url}</code>
            <CopyButton value={created.url} />
          </div>
          {created.email ? <p className="mt-2 text-xs">{t("created.mailed", { email: created.email })}</p> : null}
        </Alert>
      ) : null}
    </div>
  );
}
