"use client";

import { useState, useTransition } from "react";
import { Ban, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { setBannedAction, setRoleAction } from "@/app/admin/actions";
import type { Role } from "@/domain/types";
import { ActionButton, useErrorMessage } from "../ui/action";
import { useToast } from "../ui/Toast";

export function RoleSelect({ userId, role, disabled }: { userId: string; role: Role; disabled?: boolean }) {
  const t = useTranslations("admin.users");
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();
  return (
    <select
      value={value}
      disabled={disabled || pending}
      aria-label={t("roleFor")}
      data-testid="role-select"
      onChange={(e) => {
        const next = e.target.value as Role;
        const prev = value;
        setValue(next);
        start(async () => {
          const res = await setRoleAction(userId, next);
          if (!res.ok) {
            setValue(prev);
            toast.push("error", errorMessage(res.error));
          } else toast.push("success", t("roleSaved"));
        });
      }}
      className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm disabled:opacity-60"
    >
      {(["viewer", "owner", "admin"] as const).map((r) => (
        <option key={r} value={r}>
          {t(`roles.${r}`)}
        </option>
      ))}
    </select>
  );
}

export function BanButton({ userId, banned, disabled }: { userId: string; banned: boolean; disabled?: boolean }) {
  const t = useTranslations("admin.users");
  return banned ? (
    <ActionButton size="sm" variant="outline" disabled={disabled} action={setBannedAction.bind(null, userId, false)} successMessage={t("unbanned")}>
      <Undo2 className="size-4" aria-hidden /> {t("unban")}
    </ActionButton>
  ) : (
    <ActionButton
      size="sm"
      variant="danger-outline"
      disabled={disabled}
      action={setBannedAction.bind(null, userId, true)}
      successMessage={t("banned")}
      confirm={{ title: t("banConfirm.title"), description: t("banConfirm.description"), confirmLabel: t("banConfirm.confirm") }}
    >
      <Ban className="size-4" aria-hidden /> {t("ban")}
    </ActionButton>
  );
}
