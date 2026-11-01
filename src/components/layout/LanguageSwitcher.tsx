"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALES } from "@/i18n/config";
import { setLocaleAction } from "./locale-action";
import { cn } from "../ui/cn";

/** Compact language selector. Inherits colour from its parent so it works on themed surfaces, too. */
export function LanguageSwitcher({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className={cn("inline-flex items-center gap-1.5 text-sm", pending && "opacity-60", className)}>
      <Globe className="size-4 shrink-0 opacity-70" aria-hidden />
      <span className={showLabel ? "" : "sr-only"}>{t("language")}</span>
      <select
        value={locale}
        aria-label={t("language")}
        data-testid="language-switcher"
        onChange={(e) =>
          start(async () => {
            await setLocaleAction(e.target.value);
            router.refresh();
          })
        }
        className="cursor-pointer rounded-md border-0 bg-transparent py-1 pr-1 pl-0 text-sm font-medium text-inherit focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="text-ink">
            {t(`languages.${l}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
