import type { Theme } from "@/domain/theme";
import { ThemedSurface } from "@/themes/ThemedSurface";

/** Small theme swatch used in pickers and lists (colours, pattern, heading font, ornament). No hooks — usable anywhere. */
export function ThemeMini({ theme, locale, className = "" }: { theme: Theme; locale: "de" | "en"; className?: string }) {
  const name = theme.name[locale];
  return (
    <ThemedSurface
      theme={theme}
      className={`relative flex h-28 flex-col justify-between overflow-hidden rounded-xl border border-black/15 p-3 ${className}`}
    >
      <div className="flex items-center gap-1.5 leading-tight" style={{ fontFamily: "var(--wf-font-heading)" }}>
        {theme.ornament ? <span aria-hidden="true" className="text-lg">{theme.ornament}</span> : null}
        <span className="truncate text-lg font-semibold" style={{ color: "var(--wf-text)" }}>{name}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: "var(--wf-accent)", color: "var(--wf-accent-contrast)", fontFamily: "var(--wf-font-body)" }}
        >
          Aa
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {[theme.colors.surface, theme.colors.muted, theme.colors.accent, theme.colors.text].map((c, i) => (
            <span key={i} className="size-4 rounded-full border border-black/20" style={{ background: c }} />
          ))}
        </span>
      </div>
    </ThemedSurface>
  );
}
