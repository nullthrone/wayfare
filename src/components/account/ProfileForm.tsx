"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const t = useTranslations("account.profile");
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  return (
    <form
      className="space-y-4"
      data-testid="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        setState("idle");
        start(async () => {
          const res = await authClient.updateUser({ name: value.trim() });
          if (res?.error) setState("error");
          else {
            setState("saved");
            router.refresh();
          }
        });
      }}
    >
      <Input label={t("name")} value={value} onChange={(e) => setValue(e.target.value)} required maxLength={80} autoComplete="name" />
      <Input label={t("email")} value={email} readOnly disabled hint={t("emailHint")} />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} disabled={!value.trim() || value.trim() === name}>
          {t("save")}
        </Button>
      </div>
      {state === "saved" ? <Alert kind="success">{t("saved")}</Alert> : null}
      {state === "error" ? <Alert kind="error">{t("failed")}</Alert> : null}
    </form>
  );
}
