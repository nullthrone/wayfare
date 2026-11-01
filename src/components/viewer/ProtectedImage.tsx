"use client";

import type { CSSProperties } from "react";
import { cn } from "../ui/cn";

/**
 * Image with optional download hardening. When `protect` is on:
 *  - draggable=false, no context menu, no selection / long-press callout (CSS class .wf-protect)
 *  - a transparent overlay sits above the image and receives all pointer events
 * Nothing here changes how the picture looks.
 */
export function ProtectedImage({
  src,
  alt,
  protect,
  className,
  imgClassName,
  style,
  loading = "lazy",
  fetchPriority,
}: {
  src: string;
  alt: string;
  protect: boolean;
  className?: string;
  imgClassName?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}) {
  return (
    <div className={cn("wf-photo-frame relative", protect && "wf-protect", className)} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed media URL, delivered by /api/media */}
      <img src={src} alt={alt} draggable={false} loading={loading} decoding="async" fetchPriority={fetchPriority} className={cn("size-full object-cover", imgClassName)} />
      {protect ? <span aria-hidden className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} /> : null}
    </div>
  );
}
