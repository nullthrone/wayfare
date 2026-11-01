"use client";

import { useState, useTransition } from "react";
import { Fingerprint, KeyRound, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";

interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt?: Date | string | null;
}

export function PasskeyManager() {
  const t = useTranslations("account.passkeys");
  const format = useFormatter();
  const list = authClient.useListPasskeys();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rows = ((list.data ?? []) as PasskeyRow[]).slice();

  return (
    <div className="space-y-4" data-testid="passkeys">
      {list.isPending ? <p className="text-sm text-muted">{t("loading")}</p> : null}
      {!list.isPending && rows.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <Fingerprint className="size-5 shrink-0 text-accent" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.name || t("unnamed")}</span>
                  {p.createdAt ? <span className="block text-xs text-muted">{t("added", { date: format.dateTime(new Date(p.createdAt), { dateStyle: "medium" }) })}</span> : null}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft"
                disabled={pending}
                aria-label={t("remove", { name: p.name || t("unnamed") })}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const res = await authClient.passkey.deletePasskey({ id: p.id });
                    if (res?.error) setError(res.error.message || t("failed"));
                    else list.refetch?.();
                  })
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await authClient.passkey.addPasskey(name.trim() ? { name: name.trim() } : undefined);
            if (res?.error) setError(res.error.message || t("failed"));
            else {
              setName("");
              list.refetch?.();
            }
          });
        }}
      >
        <Input label={t("nameLabel")} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} maxLength={60} wrapperClassName="min-w-52 flex-1" />
        <Button type="submit" loading={pending} data-testid="add-passkey">
          <KeyRound className="size-4" aria-hidden /> {t("add")}
        </Button>
      </form>
      {error ? <Alert kind="error">{error}</Alert> : null}
    </div>
  );
}
