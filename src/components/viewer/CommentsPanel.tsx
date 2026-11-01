"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Flag, Loader2, Send, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { addCommentAction, deleteCommentAction, listCommentsAction, reportCommentAction } from "@/app/a/[slug]/actions";
import { useErrorMessage } from "../ui/action";
import type { ViewerComment, ViewerConfig } from "./types";

function Avatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--wf-accent)_18%,transparent)] text-xs font-semibold text-[var(--wf-accent)]"
    >
      {initial}
    </span>
  );
}

export function CommentsPanel({ photoId, config, onCountChange }: { photoId: string; config: ViewerConfig; onCountChange: (delta: number) => void }) {
  const t = useTranslations("viewer.comments");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const [comments, setComments] = useState<ViewerComment[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    listCommentsAction(photoId).then((res) => {
      if (cancelled) return;
      if (res.ok) setComments(res.data);
      else setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  if (config.commentMode === "off") return null;

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    setFormError(null);
    setNotice(null);
    start(async () => {
      const res = await addCommentAction(photoId, text);
      if (!res.ok) {
        setFormError(errorMessage(res.error));
        return;
      }
      setBody("");
      setComments((l) => [...(l ?? []), res.data]);
      if (res.data.status === "pending") setNotice(t("pendingNotice"));
      else onCountChange(1);
      requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" }));
    });
  };

  const remove = (c: ViewerComment) =>
    start(async () => {
      const res = await deleteCommentAction(c.id);
      if (res.ok) {
        setComments((l) => (l ?? []).filter((x) => x.id !== c.id));
        if (c.status === "visible") onCountChange(-1);
      } else setFormError(errorMessage(res.error));
    });

  const sendReport = (c: ViewerComment) =>
    start(async () => {
      const res = await reportCommentAction(c.id, reason);
      if (res.ok) {
        setReported((s) => new Set(s).add(c.id));
        setReporting(null);
        setReason("");
      } else setFormError(errorMessage(res.error));
    });

  return (
    <section aria-label={t("title")} data-testid="comments-panel" className="flex min-h-0 flex-1 flex-col">
      <h3 className="mb-3 text-sm font-semibold tracking-wide text-[var(--wf-muted)] uppercase">{t("title")}</h3>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {comments === null && !loadError ? (
          <p className="flex items-center gap-2 text-sm text-[var(--wf-muted)]">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t("loading")}
          </p>
        ) : null}
        {loadError ? <p className="text-sm text-[var(--wf-muted)]">{t("loadFailed")}</p> : null}
        {comments && comments.length === 0 ? <p className="text-sm text-[var(--wf-muted)]">{t("empty")}</p> : null}
        <ul ref={listRef} className="space-y-4">
          {comments?.map((c) => {
            const mine = config.viewer?.id === c.authorId;
            return (
              <li key={c.id} className="flex gap-3" data-testid="comment">
                <Avatar name={c.authorName} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{c.authorName}</span>{" "}
                    <span className="text-xs text-[var(--wf-muted)]">{format.relativeTime(new Date(c.createdAt))}</span>
                    {c.status === "pending" ? (
                      <span className="ml-2 rounded-full bg-[color-mix(in_srgb,var(--wf-accent)_16%,transparent)] px-2 py-0.5 text-xs text-[var(--wf-accent)]">{t("awaiting")}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{c.body}</p>
                  <div className="mt-1 flex gap-3 text-xs text-[var(--wf-muted)]">
                    {mine || config.isOwner ? (
                      <button type="button" onClick={() => remove(c)} disabled={pending} className="inline-flex items-center gap-1 hover:text-[var(--wf-text)]">
                        <Trash2 className="size-3" aria-hidden /> {t("delete")}
                      </button>
                    ) : null}
                    {!mine && config.viewer && c.status === "visible" ? (
                      reported.has(c.id) ? (
                        <span>{t("reported")}</span>
                      ) : (
                        <button type="button" onClick={() => setReporting(reporting === c.id ? null : c.id)} className="inline-flex items-center gap-1 hover:text-[var(--wf-text)]">
                          <Flag className="size-3" aria-hidden /> {t("report")}
                        </button>
                      )
                    ) : null}
                  </div>
                  {reporting === c.id ? (
                    <div className="mt-2 space-y-2">
                      <label className="block text-xs" htmlFor={`report-${c.id}`}>
                        {t("reportReason")}
                      </label>
                      <input
                        id={`report-${c.id}`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={500}
                        className="w-full rounded-lg border border-[color-mix(in_srgb,var(--wf-text)_25%,transparent)] bg-transparent px-2.5 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => sendReport(c)}
                        className="rounded-full bg-[var(--wf-accent)] px-3 py-1 text-xs font-medium text-[var(--wf-accent-contrast)]"
                      >
                        {t("reportSend")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-3 border-t border-[color-mix(in_srgb,var(--wf-text)_14%,transparent)] pt-3">
        {config.viewer ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-2"
          >
            <label htmlFor="wf-comment-body" className="sr-only">
              {t("write")}
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="wf-comment-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation(); // keep lightbox shortcuts (←/→) from firing while typing
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                rows={2}
                maxLength={1000}
                placeholder={t("placeholder")}
                data-testid="comment-input"
                className="min-h-11 flex-1 resize-none rounded-xl border border-[color-mix(in_srgb,var(--wf-text)_25%,transparent)] bg-transparent px-3 py-2 text-sm placeholder:text-[var(--wf-muted)]"
              />
              <button
                type="submit"
                disabled={pending || !body.trim()}
                aria-label={t("send")}
                data-testid="comment-submit"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--wf-accent)] text-[var(--wf-accent-contrast)] disabled:opacity-40"
              >
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              </button>
            </div>
            {config.commentMode === "pre" ? <p className="text-xs text-[var(--wf-muted)]">{t("preHint")}</p> : null}
            {notice ? <p className="text-xs text-[var(--wf-accent)]" role="status">{notice}</p> : null}
            {formError ? <p className="text-xs text-red-600" role="alert">{formError}</p> : null}
          </form>
        ) : (
          <p className="text-sm text-[var(--wf-muted)]">
            <Link href={config.loginHref} className="font-medium text-[var(--wf-accent)] underline underline-offset-4">
              {t("loginLink")}
            </Link>{" "}
            {t("loginSuffix")}
          </p>
        )}
      </div>
    </section>
  );
}
