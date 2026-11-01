import type { Theme } from "@/domain/theme";
import { ThemedSurface } from "@/themes/ThemedSurface";

export interface ThemePreviewProps {
  theme: Theme;
  locale: "de" | "en";
  /** Mini album title (already localised). */
  title: string;
  greeting: string;
  /** Captions for the three placeholder photos (shown in polaroid frames). */
  captions?: [string, string, string];
  className?: string;
}

const TILE_GRADIENTS = [
  "linear-gradient(135deg, color-mix(in srgb, var(--wf-accent) 85%, white), color-mix(in srgb, var(--wf-muted) 70%, var(--wf-bg)))",
  "linear-gradient(200deg, color-mix(in srgb, var(--wf-muted) 80%, white), color-mix(in srgb, var(--wf-accent) 60%, var(--wf-bg)))",
  "linear-gradient(315deg, color-mix(in srgb, var(--wf-accent) 55%, var(--wf-text)), color-mix(in srgb, var(--wf-accent) 35%, white))",
];

/** Mini album: title with ornament, greeting, three placeholder photos in the frame style, reaction bar. No external images. */
export function ThemePreview({ theme, locale, title, greeting, captions = ["1", "2", "3"], className = "" }: ThemePreviewProps) {
  return (
    <ThemedSurface theme={theme} className={`overflow-hidden rounded-2xl border border-black/15 p-5 shadow-sm ${className}`}>
      <header className="text-center">
        <h3 className="text-3xl leading-tight" style={{ fontFamily: "var(--wf-font-heading)", color: "var(--wf-text)" }}>
          {theme.ornament ? <span aria-hidden="true" className="mr-2">{theme.ornament}</span> : null}
          {title}
          {theme.ornament ? <span aria-hidden="true" className="ml-2">{theme.ornament}</span> : null}
        </h3>
        <p className="mx-auto mt-2 max-w-prose text-sm" style={{ color: "var(--wf-muted)" }}>
          {greeting}
        </p>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {TILE_GRADIENTS.map((bg, i) => (
          <figure key={i} className="wf-photo-frame m-0 self-center">
            <div className="wf-photo-media" style={{ background: bg, aspectRatio: i === 1 ? "3 / 4" : "4 / 3" }} />
            <figcaption className="wf-photo-caption">{captions[i]}</figcaption>
          </figure>
        ))}
      </div>

      <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label={theme.reactions.map((r) => r.label[locale]).join(", ")}>
        {theme.reactions.map((r, i) => (
          <li
            key={`${r.key}-${i}`}
            className="flex items-center gap-1 rounded-full border px-3 py-1 text-sm"
            style={{
              background: "var(--wf-surface)",
              color: "var(--wf-text)",
              borderColor: "color-mix(in srgb, var(--wf-accent) 40%, transparent)",
            }}
            title={r.label[locale]}
          >
            <span aria-hidden="true">{r.emoji}</span>
            <span className="text-xs" style={{ color: "var(--wf-muted)" }}>{r.label[locale]}</span>
          </li>
        ))}
      </ul>
    </ThemedSurface>
  );
}
