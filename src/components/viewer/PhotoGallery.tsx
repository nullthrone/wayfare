"use client";

import { useCallback, useRef, useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Lightbox } from "./Lightbox";
import type { ViewerConfig, ViewerPhoto } from "./types";

export function PhotoGallery({ initial, config }: { initial: ViewerPhoto[]; config: ViewerConfig }) {
  const t = useTranslations("viewer.gallery");
  const [photos, setPhotos] = useState(initial);
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const patch = useCallback((id: string, p: Partial<ViewerPhoto>) => setPhotos((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x))), []);

  const close = useCallback(() => {
    setOpen(null);
    opener.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <ul className={`wf-masonry ${config.protect ? "wf-protect" : ""}`} data-testid="photo-gallery">
        {photos.map((p, i) => {
          const reactionTotal = Object.values(p.reactions).reduce((a, b) => a + b, 0);
          return (
            <li key={p.id} className="relative">
              <div
                className="wf-photo-frame relative"
                style={{ aspectRatio: `${p.width} / ${p.height}`, backgroundColor: p.color }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed media URL, delivered by /api/media */}
                <img
                  src={p.thumb}
                  alt={p.caption || t("photoAlt", { n: i + 1 })}
                  width={p.width}
                  height={p.height}
                  loading={i < 8 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  className="size-full object-cover"
                />
                {/* Transparent overlay: receives clicks (and, when protected, swallows context menu/drag). */}
                <button
                  type="button"
                  className="group absolute inset-0 cursor-zoom-in focus-visible:outline-offset-[-3px]"
                  aria-label={p.caption ? t("open", { caption: p.caption }) : t("openN", { n: i + 1, total: photos.length })}
                  data-testid="photo-tile"
                  onClick={(e) => {
                    opener.current = e.currentTarget;
                    setOpen(i);
                  }}
                  onContextMenu={config.protect ? (e) => e.preventDefault() : undefined}
                  onDragStart={(e) => e.preventDefault()}
                >
                  {(reactionTotal > 0 || p.commentCount > 0) && (
                    <span className="absolute right-2 bottom-2 left-2 flex justify-start gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
                      {reactionTotal > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                          <Heart className="size-3" aria-hidden /> {reactionTotal}
                        </span>
                      ) : null}
                      {p.commentCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                          <MessageCircle className="size-3" aria-hidden /> {p.commentCount}
                        </span>
                      ) : null}
                    </span>
                  )}
                </button>
              </div>
              {p.caption ? <p className="mt-1.5 mb-1 line-clamp-2 px-0.5 text-sm text-[var(--wf-muted)]">{p.caption}</p> : null}
            </li>
          );
        })}
      </ul>

      {open !== null ? <Lightbox photos={photos} index={open} config={config} onIndex={setOpen} onClose={close} onPatch={patch} /> : null}
    </>
  );
}
