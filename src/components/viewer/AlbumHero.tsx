import type { ReactNode } from "react";
import { ProtectedImage } from "./ProtectedImage";

export interface HeroCover {
  src: string;
  alt: string;
  color: string;
}

/** Themed cover header: cover photo, ornament, title in the theme's heading font and the greeting message. */
export function AlbumHero({
  title,
  message,
  ornament,
  cover,
  protect,
  children,
}: {
  title: string;
  message: string;
  ornament: string;
  cover: HeroCover | null;
  protect: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="pt-4 pb-10 text-center sm:pt-8 sm:pb-14" data-testid="album-hero">
      {cover ? (
        <ProtectedImage
          src={cover.src}
          alt={cover.alt}
          protect={protect}
          loading="eager"
          fetchPriority="high"
          className="mx-auto mb-8 aspect-[3/2] max-h-[38vh] w-full max-w-4xl sm:mb-10 sm:aspect-[16/9] sm:max-h-[52vh]"
          style={{ backgroundColor: cover.color }}
        />
      ) : null}
      {ornament ? (
        <div className="mb-3 flex items-center justify-center gap-4 text-3xl sm:text-4xl" aria-hidden>
          <span className="h-px w-12 bg-current opacity-25" />
          <span>{ornament}</span>
          <span className="h-px w-12 bg-current opacity-25" />
        </div>
      ) : null}
      <h1 className="wf-heading mx-auto max-w-3xl text-4xl leading-[1.1] text-balance sm:text-6xl" data-testid="album-title">
        {title}
      </h1>
      {message ? (
        <p className="wf-body mx-auto mt-6 max-w-2xl text-lg leading-relaxed whitespace-pre-line text-[var(--wf-muted)] sm:text-xl" data-testid="album-message">
          {message}
        </p>
      ) : null}
      {children}
    </header>
  );
}
