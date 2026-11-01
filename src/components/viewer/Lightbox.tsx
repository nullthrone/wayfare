"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { CommentsPanel } from "./CommentsPanel";
import { ReactionBar } from "./ReactionBar";
import type { ViewerConfig, ViewerPhoto } from "./types";

/**
 * Full-screen viewer built on the native <dialog> (focus trap, Esc, inert background).
 * Keyboard: ←/→ navigate, Esc closes. Touch: horizontal swipe navigates.
 */
export function Lightbox({
  photos,
  index,
  config,
  onIndex,
  onClose,
  onPatch,
}: {
  photos: ViewerPhoto[];
  index: number;
  config: ViewerConfig;
  onIndex: (i: number) => void;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<ViewerPhoto>) => void;
}) {
  const t = useTranslations("viewer.lightbox");
  const ref = useRef<HTMLDialogElement>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  const photo = photos[index];
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  // Preload the neighbours so that swiping feels instant.
  useEffect(() => {
    for (const n of [photos[index + 1], photos[index - 1]]) if (n) new Image().src = n.display;
  }, [index, photos]);

  const go = useCallback(
    (delta: -1 | 1) => {
      const next = index + delta;
      if (next >= 0 && next < photos.length) onIndex(next);
    },
    [index, photos.length, onIndex],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    // Block "save page" shortcut inside the lightbox when downloads are disabled.
    if (config.protect && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      return;
    }
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  if (!photo) return null;
  const showAside = config.reactionsEnabled || config.commentMode !== "off" || !!photo.caption;
  const loaded = loadedId === photo.id;

  return (
    <dialog
      ref={ref}
      className="wf-lightbox"
      aria-label={t("label")}
      data-testid="lightbox"
      // Ignore the 'close' event caused by our own cleanup (e.g. React strict-mode re-mount).
      onClose={() => {
        if (!ref.current?.open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
      onContextMenu={config.protect ? (e) => e.preventDefault() : undefined}
    >
      <div className="flex h-dvh flex-col lg:flex-row">
        {/* Stage */}
        <div
          className={`wf-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden ${config.protect ? "wf-protect" : ""}`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipe.current = null)}
        >
          <div className="absolute inset-0" style={{ backgroundColor: photo.color, opacity: loaded ? 0 : 0.35, transition: "opacity 200ms" }} aria-hidden />
          {!loaded ? <Loader2 className="absolute size-6 animate-spin text-white/70" aria-hidden /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element -- signed media URL */}
          <img
            key={photo.id}
            src={photo.display}
            alt={photo.caption || t("photoAlt", { n: index + 1, total: photos.length })}
            draggable={false}
            onLoad={() => setLoadedId(photo.id)}
            className="relative max-h-full max-w-full object-contain transition-opacity duration-200"
            style={{ opacity: loaded ? 1 : 0 }}
            data-testid="lightbox-image"
          />
          {config.protect ? <span aria-hidden className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} /> : null}

          <div className="absolute top-0 right-0 left-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3 sm:p-4">
            <p className="rounded-full bg-black/40 px-3 py-1 text-sm text-white/90 tabular-nums" aria-live="polite">
              {t("counter", { n: index + 1, total: photos.length })}
            </p>
            <div className="flex items-center gap-2">
              {config.downloads && photo.original ? (
                <a
                  href={photo.original}
                  download
                  className="flex h-10 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-medium text-white hover:bg-white/25"
                  data-testid="lightbox-download"
                >
                  <Download className="size-4" aria-hidden /> {t("download")}
                </a>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                autoFocus
                aria-label={t("close")}
                className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                data-testid="lightbox-close"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
          </div>

          {hasPrev ? (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t("prev")}
              className="absolute top-1/2 left-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 sm:left-4"
            >
              <ChevronLeft className="size-6" aria-hidden />
            </button>
          ) : null}
          {hasNext ? (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t("next")}
              className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 sm:right-4"
            >
              <ChevronRight className="size-6" aria-hidden />
            </button>
          ) : null}
        </div>

        {/* Side panel: caption, reactions, comments */}
        {showAside ? (
          <aside
            className="flex max-h-[46dvh] shrink-0 flex-col gap-4 overflow-hidden bg-[var(--wf-surface)] p-4 text-[var(--wf-text)] lg:max-h-none lg:h-full lg:w-[380px] lg:p-6"
            style={{ fontFamily: "var(--wf-font-body)" }}
          >
            {photo.caption ? (
              <p className="wf-heading text-lg leading-snug" data-testid="lightbox-caption">
                {photo.caption}
              </p>
            ) : null}
            {config.reactionsEnabled ? <ReactionBar key={photo.id} photo={photo} config={config} onChange={(patch) => onPatch(photo.id, patch)} /> : null}
            <CommentsPanel key={photo.id} photoId={photo.id} config={config} onCountChange={(d) => onPatch(photo.id, { commentCount: Math.max(0, photo.commentCount + d) })} />
          </aside>
        ) : null}
      </div>
    </dialog>
  );
}
