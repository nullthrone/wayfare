import type { ReactNode } from "react";
import type { Theme } from "@/domain/theme";
import { ThemeMini } from "./ThemeMini";

/** Theme tile for the Theme Builder list: swatch, name, badges and an action slot. Server-compatible. */
export function ThemeCard({ theme, locale, badge, children }: { theme: Theme; locale: "de" | "en"; badge?: string; children?: ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-current/15 p-3">
      <ThemeMini theme={theme} locale={locale} />
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="truncate font-semibold">{theme.name[locale]}</h3>
        {badge ? <span className="shrink-0 rounded-full bg-current/10 px-2 py-0.5 text-xs">{badge}</span> : null}
      </div>
      <div className="flex flex-wrap gap-2 px-1 pb-1">{children}</div>
    </li>
  );
}
