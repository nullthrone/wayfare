"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Theme } from "@/domain/theme";
import { ThemeMini } from "./ThemeMini";

export interface ThemePickerProps {
  themes: Theme[];
  /** Name of the radio inputs (form field). */
  name: string;
  defaultValue: string;
  locale: "de" | "en";
}

/**
 * Grid of selectable theme cards (native radio inputs: arrow-key navigation, works in a plain
 * `<form action={serverAction}>`; the selected theme id is submitted under `name`).
 */
export function ThemePicker({ themes, name, defaultValue, locale }: ThemePickerProps) {
  const t = useTranslations("themes");
  const [value, setValue] = useState(defaultValue);
  return (
    <div role="radiogroup" aria-label={t("picker.label")} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {themes.map((theme) => {
        const checked = value === theme.id;
        return (
          <label key={theme.id} className="relative block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={theme.id}
              checked={checked}
              onChange={() => setValue(theme.id)}
              className="peer sr-only"
            />
            <span className="block rounded-2xl p-1 ring-2 ring-transparent transition peer-checked:ring-current peer-focus-visible:ring-4 peer-focus-visible:ring-current/60 hover:ring-current/30">
              <ThemeMini theme={theme} locale={locale} />
              <span className="mt-1.5 flex items-center justify-between gap-2 px-1 text-sm">
                <span className="truncate font-medium">{theme.name[locale]}</span>
                {!theme.id.startsWith("builtin:") ? (
                  <span className="shrink-0 rounded-full bg-current/10 px-2 py-0.5 text-xs">{t("picker.custom")}</span>
                ) : null}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-3 grid size-6 place-items-center rounded-full bg-neutral-900 text-white opacity-0 shadow transition peer-checked:opacity-100"
            >
              <Check className="size-4" />
            </span>
          </label>
        );
      })}
    </div>
  );
}
