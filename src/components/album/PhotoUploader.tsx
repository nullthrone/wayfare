"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { cn } from "../ui/cn";
import { UploadList, useUploadQueue } from "../ui/upload-queue";

/** Drag & drop / file picker. Uploads sequentially (max 2 parallel) with per-file progress. */
export function PhotoUploader({ albumId }: { albumId: string }) {
  const t = useTranslations("album.photos.upload");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { items, add, busy, clearFinished } = useUploadQueue(`/api/upload/${albumId}`, {
    concurrency: 2,
    onSettled: () => router.refresh(),
  });
  const finished = items.some((i) => i.status === "done" || i.status === "error");

  return (
    <div className="space-y-3" data-testid="photo-uploader">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors",
          over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface/60",
        )}
      >
        <UploadCloud className="mb-3 size-9 text-accent" aria-hidden />
        <p className="font-medium">{t("drop")}</p>
        <p className="mt-1 text-sm text-muted">{t("hint")}</p>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*"
          className="sr-only"
          id="photo-file-input"
          data-testid="photo-file-input"
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
        <label
          htmlFor="photo-file-input"
          className="mt-4 inline-flex h-10 cursor-pointer items-center rounded-full bg-accent px-5 text-sm font-medium text-accent-ink hover:bg-accent-hover has-[:focus-visible]:outline-2"
        >
          {t("choose")}
        </label>
      </div>
      <UploadList items={items} />
      {finished && !busy ? (
        <button type="button" onClick={clearFinished} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          {t("clear")}
        </button>
      ) : null}
    </div>
  );
}
