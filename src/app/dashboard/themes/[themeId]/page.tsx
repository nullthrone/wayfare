import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { StoredTheme } from "@/domain/theme";
import { matchLocale } from "@/i18n/config";
import { ThemeEditor } from "@/components/theme-builder/ThemeEditor";
import { listAvailableThemes } from "@/server/services/themes";
import { themeSchema } from "@/domain/theme";
import { requireThemeOwner } from "../_guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("themes");
  return { title: t("editor.editTitle") };
}

export default async function EditThemePage({ params }: { params: Promise<{ themeId: string }> }) {
  const { themeId: rawId } = await params;
  const themeId = decodeURIComponent(rawId);
  const user = await requireThemeOwner();
  // built-in themes are read-only: open the editor as a copy
  if (themeId.startsWith("builtin:")) redirect(`/dashboard/themes/new?base=${encodeURIComponent(themeId)}`);

  const t = await getTranslations("themes");
  const locale = matchLocale(await getLocale()) ?? "en";
  const found = (await listAvailableThemes(user)).find((x) => x.id === themeId);
  if (!found || !("ownerId" in found)) notFound();
  const stored = found as StoredTheme;
  if (stored.ownerId !== user.id) redirect(`/dashboard/themes/new?base=${encodeURIComponent(themeId)}`);
  const theme = themeSchema.parse(stored); // strips storage metadata

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header>
        <Link href="/dashboard/themes" className="text-sm underline underline-offset-2">{t("editor.back")}</Link>
        <h1 className="mt-2 text-3xl font-bold">{t("editor.editTitle")}</h1>
        <p className="mt-1 text-sm opacity-80">{theme.name[locale]}</p>
      </header>
      <ThemeEditor initial={theme} locale={locale} />
    </div>
  );
}
