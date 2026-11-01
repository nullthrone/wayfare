"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleReactionAction } from "@/app/a/[slug]/actions";
import { cn } from "../ui/cn";
import type { ViewerConfig, ViewerPhoto } from "./types";

export function ReactionBar({
  photo,
  config,
  onChange,
}: {
  photo: ViewerPhoto;
  config: ViewerConfig;
  onChange: (patch: Pick<ViewerPhoto, "reactions" | "mine">) => void;
}) {
  const t = useTranslations("viewer.reactions");
  const [pending, start] = useTransition();
  const [needLogin, setNeedLogin] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = (key: string) => {
    if (!config.viewer) {
      setNeedLogin(true);
      return;
    }
    setFailed(false);
    const wasActive = photo.mine.includes(key);
    // optimistic
    const optimistic = {
      mine: wasActive ? photo.mine.filter((k) => k !== key) : [...photo.mine, key],
      reactions: { ...photo.reactions, [key]: Math.max(0, (photo.reactions[key] ?? 0) + (wasActive ? -1 : 1)) },
    };
    const before = { mine: photo.mine, reactions: photo.reactions };
    onChange(optimistic);
    start(async () => {
      const res = await toggleReactionAction(photo.id, key);
      if (res.ok) {
        onChange({
          mine: res.data.active ? [...before.mine.filter((k) => k !== key), key] : before.mine.filter((k) => k !== key),
          reactions: { ...before.reactions, [key]: res.data.count },
        });
      } else {
        onChange(before);
        if (res.error === "unauthorized") setNeedLogin(true);
        else setFailed(true);
      }
    });
  };

  return (
    <div data-testid="reaction-bar">
      <div role="group" aria-label={t("label")} className="flex flex-wrap gap-2">
        {config.reactions.map((r) => {
          const active = photo.mine.includes(r.key);
          const count = photo.reactions[r.key] ?? 0;
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={active}
              aria-label={`${r.label[config.locale]}${count ? ` (${count})` : ""}`}
              title={r.label[config.locale]}
              disabled={pending}
              onClick={() => toggle(r.key)}
              data-testid={`reaction-${r.key}`}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-[background-color,transform] active:scale-95",
                active
                  ? "border-[var(--wf-accent)] bg-[var(--wf-accent)] text-[var(--wf-accent-contrast)]"
                  : "border-[color-mix(in_srgb,var(--wf-text)_18%,transparent)] bg-transparent text-[var(--wf-text)] hover:bg-[color-mix(in_srgb,var(--wf-text)_8%,transparent)]",
              )}
            >
              <span className="text-lg leading-none" aria-hidden>
                {r.emoji}
              </span>
              {count > 0 ? <span className="tabular-nums">{count}</span> : null}
            </button>
          );
        })}
      </div>
      {needLogin ? (
        <p className="mt-2 text-sm text-[var(--wf-muted)]" role="status">
          <Link href={config.loginHref} className="font-medium text-[var(--wf-accent)] underline underline-offset-4">
            {t("loginLink")}
          </Link>{" "}
          {t("loginSuffix")}
        </p>
      ) : null}
      {failed ? (
        <p className="mt-2 text-sm text-[var(--wf-muted)]" role="alert">
          {t("failed")}
        </p>
      ) : null}
    </div>
  );
}
