"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Cloud, LoaderCircle } from "lucide-react";
import type { SourceInfo } from "@/server/sources"; // type-only: erased at build time
import { connectHref, labelKeyOf, postJson, sourceFlag, useRelativeLocation } from "./client-api";

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium transition hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50";

/** Account page section: connected cloud accounts with connect / disconnect. */
export function SourceConnections(props: { sources: SourceInfo[] }) {
  const t = useTranslations("sources");
  const format = useFormatter();
  const router = useRouter();
  const here = useRelativeLocation();
  const flag = sourceFlag(here);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disconnect = async (id: string) => {
    setBusyId(id);
    setError(null);
    const res = await postJson(`/api/sources/${id}/disconnect`);
    setBusyId(null);
    setConfirming(null);
    if (res.ok) router.refresh();
    else setError(t("connections.disconnectFailed"));
  };

  return (
    <section aria-labelledby="source-connections-title" className="flex flex-col gap-4">
      <div>
        <h2 id="source-connections-title" className="text-lg font-semibold">
          {t("connections.title")}
        </h2>
        <p className="mt-1 text-sm text-foreground/70">{t("connections.description")}</p>
      </div>

      {flag && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${flag === "connected" ? "bg-green-600/10 text-green-800 dark:text-green-300" : "bg-red-600/10 text-red-800 dark:text-red-300"}`}>
          {flag === "connected" ? t("connections.connectedNotice") : t("connections.connectErrorNotice")}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {props.sources.map((s) => {
          const label = t(labelKeyOf(s.labelKey));
          const busy = busyId === s.id;
          return (
            <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Cloud className="mt-0.5 size-5 shrink-0 text-foreground/60" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium">{label}</p>
                  <p className="break-words text-sm text-foreground/70">
                    {!s.configured
                      ? t("connections.notConfigured")
                      : s.connection
                        ? [
                            s.connection.accountEmail ? t("connections.connectedAs", { email: s.connection.accountEmail }) : t("connections.connectedUnknown"),
                            t("connections.since", { date: format.dateTime(new Date(s.connection.createdAt), { dateStyle: "medium" }) }),
                          ].join(" ")
                        : t("connections.notConnected")}
                  </p>
                </div>
              </div>

              {s.configured && !s.connection && (
                <a href={connectHref(s.id, here)} className={primaryBtn}>
                  {t("connections.connect")}
                </a>
              )}
              {s.connection && confirming !== s.id && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {s.configured && (
                    <a href={connectHref(s.id, here)} className={secondaryBtn}>
                      {t("connections.reconnect")}
                    </a>
                  )}
                  <button type="button" className={secondaryBtn} onClick={() => setConfirming(s.id)}>
                    {t("connections.disconnect")}
                  </button>
                </div>
              )}
              {s.connection && confirming === s.id && (
                <div role="group" aria-label={t("connections.confirmDisconnect")} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="text-sm">{t("connections.confirmDisconnect")}</span>
                  <button type="button" className={primaryBtn} disabled={busy} onClick={() => void disconnect(s.id)}>
                    {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                    {busy ? t("connections.disconnecting") : t("connections.confirmYes")}
                  </button>
                  <button type="button" className={secondaryBtn} disabled={busy} onClick={() => setConfirming(null)}>
                    {t("connections.cancel")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-foreground/60">{t("connections.privacy")}</p>
    </section>
  );
}
