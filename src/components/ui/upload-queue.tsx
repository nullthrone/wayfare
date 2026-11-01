"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "./action";

export interface UploadItem {
  id: number;
  name: string;
  size: number;
  progress: number; // 0..100
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

interface UploadResponse {
  photos?: { id: string }[];
  errors?: { filename: string; error: string }[];
  error?: string;
}

/** Uploads one file via XHR so that we get real progress events. Resolves with an error key or null. */
function sendFile(url: string, file: File, onProgress: (pct: number) => void): Promise<string | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => resolve("uploadFailed");
    xhr.onabort = () => resolve("uploadFailed");
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as UploadResponse;
      if (xhr.status >= 200 && xhr.status < 300) {
        if (body.errors && body.errors.length > 0) return resolve(body.errors[0].error || "uploadFailed");
        return resolve(null);
      }
      if (xhr.status === 401) return resolve("unauthorized");
      if (xhr.status === 413) return resolve("fileTooLarge");
      resolve(body.error || "uploadFailed");
    };
    const fd = new FormData();
    fd.append("files[]", file, file.name);
    xhr.send(fd);
  });
}

/** Sequential-ish upload queue (max `concurrency` parallel requests). */
export function useUploadQueue(url: string, opts: { concurrency?: number; onSettled?: (okCount: number) => void } = {}) {
  const { concurrency = 2, onSettled } = opts;
  const [items, setItems] = useState<UploadItem[]>([]);
  const pending = useRef<{ id: number; file: File }[]>([]);
  const active = useRef(0);
  const okCount = useRef(0);
  const nextId = useRef(1);
  const settled = useRef(onSettled);
  const pumpRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    settled.current = onSettled;
  });

  const patch = useCallback((id: number, p: Partial<UploadItem>) => setItems((l) => l.map((it) => (it.id === id ? { ...it, ...p } : it))), []);

  const pump = useCallback(() => {
    while (active.current < concurrency && pending.current.length > 0) {
      const job = pending.current.shift()!;
      active.current++;
      patch(job.id, { status: "uploading", progress: 0 });
      sendFile(url, job.file, (pct) => patch(job.id, { progress: pct })).then((err) => {
        active.current--;
        if (err) patch(job.id, { status: "error", error: err });
        else {
          okCount.current++;
          patch(job.id, { status: "done", progress: 100 });
        }
        if (pending.current.length === 0 && active.current === 0) {
          const n = okCount.current;
          okCount.current = 0;
          settled.current?.(n);
        } else pumpRef.current();
      });
    }
  }, [concurrency, patch, url]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const add = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.size > 0);
      if (list.length === 0) return;
      const entries = list.map((file) => ({ id: nextId.current++, file }));
      setItems((l) => [...l, ...entries.map(({ id, file }) => ({ id, name: file.name, size: file.size, progress: 0, status: "queued" as const }))]);
      pending.current.push(...entries);
      pump();
    },
    [pump],
  );

  const clearFinished = useCallback(() => setItems((l) => l.filter((it) => it.status === "queued" || it.status === "uploading")), []);
  const busy = items.some((it) => it.status === "queued" || it.status === "uploading");
  return { items, add, busy, clearFinished };
}

export function UploadList({ items }: { items: UploadItem[] }) {
  const t = useTranslations("common");
  const errorMessage = useErrorMessage();
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label={t("uploads")} data-testid="upload-list">
      {items.map((it) => (
        <li key={it.id} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm">
          <div className="flex items-center gap-2.5">
            {it.status === "done" ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
            ) : it.status === "error" ? (
              <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />
            ) : (
              <Loader2 className={`size-4 shrink-0 text-accent ${it.status === "uploading" ? "animate-spin" : "opacity-40"}`} aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-ink">{it.name}</span>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {it.status === "error" ? errorMessage(it.error ?? "uploadFailed") : it.status === "queued" ? t("queued") : `${it.progress}%`}
            </span>
          </div>
          {it.status === "uploading" ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100} aria-label={it.name}>
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${it.progress}%` }} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
