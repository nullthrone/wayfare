"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CircleAlert, CloudDownload, ExternalLink, LoaderCircle, X } from "lucide-react";
import type { SourceInfo } from "@/server/sources"; // type-only: erased at build time
import { connectHref, getJson, labelKeyOf, postJson, sourceFlag, useRelativeLocation } from "./client-api";
import { openDrivePicker, type DrivePickerConfig } from "./drive-picker";

type Phase = "list" | "starting" | "waiting" | "picking" | "importing" | "summary";

type SelectionStart =
  | { kind: "external-window"; url: string; sessionId: string; pollIntervalMs: number; timeoutMs: number }
  | { kind: "client-picker"; widget: "google-drive"; config: DrivePickerConfig };

interface ImportFailure {
  ref: string;
  filename?: string;
  error: string;
}
interface BatchResult {
  imported: number;
  skipped: number;
  failed: ImportFailure[];
  nextOffset: number | null;
  total: number;
}
interface Totals {
  imported: number;
  skipped: number;
  failed: ImportFailure[];
  stopped: boolean;
}

const EMPTY_TOTALS: Totals = { imported: 0, skipped: 0, failed: [], stopped: false };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-foreground/20 px-4 py-2 text-sm font-medium transition hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

/**
 * Owner-facing "import from the cloud" button + dialog (Google Photos, Google Drive).
 * Photos are copied into the album in batches of max 10 (POST /api/albums/{albumId}/import).
 */
export function ImportButton(props: { albumId: string }) {
  const { albumId } = props;
  const t = useTranslations("sources");
  const locale = useLocale();
  const router = useRouter();
  const titleId = useId();
  const here = useRelativeLocation();
  const flag = sourceFlag(here);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const runRef = useRef(0); // token of the active run; bumping it silently aborts older loops
  const stopRef = useRef(0); // run id the user asked to stop gracefully

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("list");
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<SourceInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);

  const errorText = useCallback(
    (key: string) => (key !== "network" && t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic")),
    [t],
  );
  const labelOf = useCallback((s: SourceInfo) => t(labelKeyOf(s.labelKey)), [t]);

  // The picker for Drive is an overlay on the page: a modal <dialog> would cover it (top layer),
  // so the dialog is hidden while the picker is open.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const shouldShow = open && phase !== "picking";
    if (shouldShow && !d.open) d.showModal();
    else if (!shouldShow && d.open) d.close();
  }, [open, phase]);

  const loadSources = useCallback(async () => {
    setLoadError(null);
    const res = await getJson<SourceInfo[]>("/api/sources");
    if (res.ok) setSources(res.data);
    else setLoadError(errorText(res.error));
  }, [errorText]);

  const openDialog = () => {
    runRef.current++;
    setPhase("list");
    setMessage(null);
    setBlockedUrl(null);
    setTotals(EMPTY_TOTALS);
    setSources(null);
    setOpen(true);
    void loadSources();
  };

  const closeDialog = () => {
    runRef.current++; // abort running loops; already imported photos stay
    setOpen(false);
  };

  const fail = (run: number, text: string) => {
    if (run !== runRef.current) return;
    setMessage(text);
    setBlockedUrl(null);
    setPhase("list");
  };

  /** Imports batch by batch until nextOffset is null. Retries a batch on network errors (dedupe makes this safe). */
  const runImport = async (run: number, source: SourceInfo, selection: { sessionId?: string; refs?: string[] }) => {
    setPhase("importing");
    setBlockedUrl(null);
    setProgress({ done: 0, total: selection.refs?.length ?? 0 });
    const acc: Totals = { imported: 0, skipped: 0, failed: [], stopped: false };
    let offset = 0;
    let errorKey: string | null = null;
    for (;;) {
      if (run !== runRef.current) {
        if (acc.imported > 0) router.refresh();
        return;
      }
      if (stopRef.current === run) {
        acc.stopped = true;
        break;
      }
      let res = await postJson<BatchResult>(`/api/albums/${albumId}/import`, { sourceId: source.id, ...selection, offset });
      for (let attempt = 0; !res.ok && res.error === "network" && attempt < 2; attempt++) {
        await sleep(1500);
        res = await postJson<BatchResult>(`/api/albums/${albumId}/import`, { sourceId: source.id, ...selection, offset });
      }
      if (run !== runRef.current) {
        if (acc.imported > 0) router.refresh();
        return;
      }
      if (!res.ok) {
        errorKey = res.error;
        break;
      }
      acc.imported += res.data.imported;
      acc.skipped += res.data.skipped;
      acc.failed = [...acc.failed, ...res.data.failed];
      setTotals({ ...acc });
      setProgress({ done: res.data.nextOffset ?? res.data.total, total: res.data.total });
      if (res.data.nextOffset === null) break;
      offset = res.data.nextOffset;
    }
    setTotals({ ...acc });
    if (errorKey) setMessage(errorText(errorKey));
    setPhase("summary");
    if (acc.imported > 0) router.refresh();
  };

  const pollUntilDone = async (run: number, source: SourceInfo, start: Extract<SelectionStart, { kind: "external-window" }>) => {
    const deadline = Date.now() + start.timeoutMs;
    let failures = 0;
    for (;;) {
      await sleep(start.pollIntervalMs);
      if (run !== runRef.current) return false;
      if (Date.now() > deadline) {
        fail(run, t("import.timeout"));
        return false;
      }
      const res = await getJson<{ done: boolean }>(`/api/sources/${source.id}/selection/${encodeURIComponent(start.sessionId)}`);
      if (run !== runRef.current) return false;
      if (!res.ok) {
        // tolerate short network hiccups, but stop on real errors
        if (res.error === "network" && ++failures < 5) continue;
        fail(run, errorText(res.error));
        return false;
      }
      failures = 0;
      if (res.data.done) return true;
    }
  };

  const startImport = async (source: SourceInfo) => {
    const run = ++runRef.current;
    setActiveSource(source);
    setMessage(null);
    setBlockedUrl(null);
    setTotals(EMPTY_TOTALS);
    setPhase("starting");

    // Google Photos opens its picker in a new window. Open a blank one synchronously inside the
    // click handler (popup blockers allow this), navigate it once the session exists.
    let win: Window | null = null;
    if (source.id === "google-photos") {
      win = window.open("", "_blank");
      if (win) {
        try {
          win.opener = null;
        } catch {
          // ignore
        }
      }
    }

    const res = await postJson<SelectionStart>(`/api/sources/${source.id}/selection`);
    if (run !== runRef.current) return win?.close();
    if (!res.ok) {
      win?.close();
      return fail(run, errorText(res.error));
    }

    if (res.data.kind === "external-window") {
      const start = res.data;
      if (win) win.location.href = start.url;
      else setBlockedUrl(start.url);
      setPhase("waiting");
      if (!(await pollUntilDone(run, source, start))) return;
      win?.close();
      return runImport(run, source, { sessionId: start.sessionId });
    }

    win?.close();
    setPhase("picking");
    let refs: string[] | null;
    try {
      refs = await openDrivePicker(res.data.config, locale);
    } catch {
      return fail(run, t("import.pickerLoadFailed"));
    }
    if (run !== runRef.current) return;
    if (!refs || refs.length === 0) return fail(run, t("import.pickerCancelled"));
    return runImport(run, source, { refs });
  };

  const busy = phase === "starting" || phase === "waiting" || phase === "importing";
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <button type="button" onClick={openDialog} className={secondaryBtn}>
        <CloudDownload className="size-4" aria-hidden="true" />
        {t("import.button")}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => {
          if (phase !== "picking") closeDialog();
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-1rem)] max-w-lg overflow-y-auto rounded-2xl border border-foreground/15 bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        {open && (
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="text-lg font-semibold">
                {t("import.title")}
              </h2>
              <button type="button" onClick={closeDialog} aria-label={t("import.close")} className="-m-2 inline-flex size-11 items-center justify-center rounded-lg hover:bg-foreground/5">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div aria-live="polite" className="flex flex-col gap-4">
              {phase === "list" && (
                <>
                  <p className="text-sm text-foreground/70">{t("import.description")}</p>
                  {flag && !message && (
                    <p role="status" className={`rounded-lg px-3 py-2 text-sm ${flag === "connected" ? "bg-green-600/10 text-green-800 dark:text-green-300" : "bg-red-600/10 text-red-800 dark:text-red-300"}`}>
                      {flag === "connected" ? t("import.connectedNotice") : t("import.connectErrorNotice")}
                    </p>
                  )}
                  {message && (
                    <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {message}
                    </p>
                  )}
                  {loadError && (
                    <div className="flex flex-col items-start gap-2">
                      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                        {t("import.loadFailed")} {loadError}
                      </p>
                      <button type="button" className={secondaryBtn} onClick={() => void loadSources()}>
                        {t("import.retry")}
                      </button>
                    </div>
                  )}
                  {!sources && !loadError && (
                    <p className="flex items-center gap-2 text-sm text-foreground/70">
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      {t("import.loading")}
                    </p>
                  )}
                  {sources && (
                    <ul className="flex flex-col gap-3">
                      {sources.map((s) => (
                        <li key={s.id} className="flex flex-col gap-3 rounded-xl border border-foreground/15 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium">{labelOf(s)}</p>
                            <p className="truncate text-sm text-foreground/70">
                              {!s.configured
                                ? t("import.notConfigured")
                                : s.connection
                                  ? s.connection.accountEmail
                                    ? t("import.connectedAs", { email: s.connection.accountEmail })
                                    : t("import.connected")
                                  : t("import.notConnected")}
                            </p>
                          </div>
                          {!s.configured ? (
                            <button type="button" disabled className={primaryBtn}>
                              {t("import.connect")}
                            </button>
                          ) : s.connection ? (
                            <button type="button" className={primaryBtn} onClick={() => void startImport(s)}>
                              {t("import.choose")}
                            </button>
                          ) : (
                            <a href={connectHref(s.id, here)} className={primaryBtn}>
                              {t("import.connect")}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {phase === "starting" && (
                <p className="flex items-center gap-2 text-sm">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  {t("import.starting")}
                </p>
              )}

              {phase === "waiting" && (
                <div className="flex flex-col gap-3">
                  <p className="flex items-center gap-2 font-medium">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    {t("import.waitingTitle")}
                  </p>
                  <p className="text-sm text-foreground/70">{t("import.waitingBody")}</p>
                  {blockedUrl && (
                    <div className="flex flex-col items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
                      <p>{t("import.popupBlocked")}</p>
                      <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
                        <ExternalLink className="size-4" aria-hidden="true" />
                        {t("import.openPicker")}
                      </a>
                    </div>
                  )}
                  <button type="button" className={secondaryBtn} onClick={closeDialog}>
                    {t("import.cancel")}
                  </button>
                </div>
              )}

              {phase === "importing" && (
                <div className="flex flex-col gap-3">
                  <p className="font-medium">{activeSource ? `${labelOf(activeSource)}: ` : ""}{t("import.importing")}</p>
                  <div
                    role="progressbar"
                    aria-label={t("import.importing")}
                    aria-valuemin={0}
                    aria-valuemax={progress.total || 100}
                    aria-valuenow={progress.total ? progress.done : undefined}
                    className="h-3 w-full overflow-hidden rounded-full bg-foreground/10"
                  >
                    <div className={`h-full rounded-full bg-foreground transition-[width] ${progress.total ? "" : "w-1/4 animate-pulse"}`} style={progress.total ? { width: `${pct}%` } : undefined} />
                  </div>
                  <p className="text-sm text-foreground/70">
                    {progress.total ? t("import.progress", { done: progress.done, total: progress.total }) : t("import.starting")}
                  </p>
                  <p className="text-sm text-foreground/70">{t("import.importingHint")}</p>
                  <button type="button" className={secondaryBtn} onClick={() => (stopRef.current = runRef.current)}>
                    {t("import.stop")}
                  </button>
                </div>
              )}

              {phase === "summary" && (
                <div className="flex flex-col gap-3">
                  <p className="font-medium">{totals.stopped ? t("import.summaryStopped") : t("import.summaryTitle")}</p>
                  <ul className="flex flex-col gap-1 text-sm">
                    <li>{t("import.imported", { count: totals.imported })}</li>
                    {totals.skipped > 0 && <li className="text-foreground/70">{t("import.skipped", { count: totals.skipped })}</li>}
                    {totals.failed.length > 0 && <li className="text-red-700 dark:text-red-300">{t("import.failed", { count: totals.failed.length })}</li>}
                  </ul>
                  {totals.failed.length > 0 && (
                    <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm text-foreground/70">
                      {totals.failed.map((f) => (
                        <li key={f.ref}>
                          {f.filename ?? f.ref}: {errorText(f.error)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {message && (
                    <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-600/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {message}
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" className={primaryBtn} onClick={closeDialog}>
                      {t("import.done")}
                    </button>
                    <button type="button" className={secondaryBtn} onClick={() => { setPhase("list"); setMessage(null); }}>
                      {t("import.more")}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {busy && phase === "starting" && (
              <button type="button" className={secondaryBtn} onClick={closeDialog}>
                {t("import.cancel")}
              </button>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
