"use client";

import Link from "next/link";
import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { UploadList, useUploadQueue } from "../ui/upload-queue";
import type { ViewerConfig } from "./types";

/** Guest uploads: signed-in users only; photos are held for owner approval. */
export function GuestUpload({ config }: { config: ViewerConfig }) {
  const t = useTranslations("viewer.upload");
  const input = useRef<HTMLInputElement>(null);
  const { items, add, busy, clearFinished } = useUploadQueue(`/api/upload/guest/${config.slug}`, { concurrency: 2 });
  const doneCount = items.filter((i) => i.status === "done").length;
  const btn =
    "inline-flex h-10 items-center gap-2 rounded-full border border-[var(--wf-accent)] px-4 text-sm font-medium text-[var(--wf-accent)] hover:bg-[color-mix(in_srgb,var(--wf-accent)_10%,transparent)]";

  return (
    <div className="space-y-3" data-testid="guest-upload">
      {config.viewer ? (
        <>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*"
            className="sr-only"
            aria-label={t("choose")}
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.files) add(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" className={btn} onClick={() => input.current?.click()} data-testid="guest-upload-button">
            <ImagePlus className="size-4" aria-hidden /> {t("button")}
          </button>
        </>
      ) : (
        <Link href={config.loginHref} className={btn} data-testid="guest-upload-login">
          <ImagePlus className="size-4" aria-hidden /> {t("loginButton")}
        </Link>
      )}
      {items.length > 0 ? (
        <div className="max-w-md space-y-2 text-[var(--wf-text)]">
          <UploadList items={items} />
          {doneCount > 0 ? (
            <p className="text-sm text-[var(--wf-muted)]" role="status">
              {t("afterApproval", { count: doneCount })}
            </p>
          ) : null}
          {!busy ? (
            <button type="button" onClick={clearFinished} className="text-sm text-[var(--wf-muted)] underline underline-offset-4">
              {t("clear")}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[var(--wf-muted)]">{t("hint")}</p>
      )}
    </div>
  );
}
