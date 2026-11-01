import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { matchLocale } from "@/i18n/config";
import { ThemeEditor } from "@/components/theme-builder/ThemeEditor";
import { listAvailableThemes } from "@/server/services/themes";
import { getBuiltinTheme, NEUTRAL_THEME_ID } from "@/themes/builtin";
import { requireThemeOwner } from "../_guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("themes");
  return { title: t("editor.newTitle") };
}

export default async function NewThemePage({ searchParams }: { searchParams: Promise<{ base?: string | string[] }> }) {
  const user = await requireThemeOwner();
  const t = await getTranslations("themes");
  const locale = matchLocale(await getLocale()) ?? "en";
  const sp = await searchParams;
  const baseId = (Array.isArray(sp.base) ? sp.base[0] : sp.base) ?? NEUTRAL_THEME_ID;

  const available = await listAvailableThemes(user);
  const base = available.find((x) => x.id === baseId) ?? getBuiltinTheme(NEUTRAL_THEME_ID)!;
  const copySuffix = { de: "(Kopie)", en: "(copy)" }; // theme data (both languages), not UI text
  const draft = {
    id: "new",
    version: 1 as const,
    name: { de: `${base.name.de} ${copySuffix.de}`.slice(0, 60), en: `${base.name.en} ${copySuffix.en}`.slice(0, 60) },
    occasion: base.occasion,
    baseThemeId: base.id,
    colors: { ...base.colors },
    fonts: { ...base.fonts },
    pattern: { ...base.pattern },
    frame: base.frame,
    ornament: base.ornament,
    reactions: base.reactions.map((r) => ({ ...r, label: { ...r.label } })),
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header>
        <Link href="/dashboard/themes" className="text-sm underline underline-offset-2">{t("editor.back")}</Link>
        <h1 className="mt-2 text-3xl font-bold">{t("editor.newTitle")}</h1>
        <p className="mt-1 text-sm opacity-80">{t("editor.basedOn", { name: base.name[locale] })}</p>
      </header>
      <ThemeEditor initial={draft} locale={locale} isNew />
    </div>
  );
}
