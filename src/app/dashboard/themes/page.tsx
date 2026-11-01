import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Pencil, Plus } from "lucide-react";
import type { StoredTheme, Theme } from "@/domain/theme";
import { matchLocale } from "@/i18n/config";
import { ThemeCard } from "@/components/theme-builder/ThemeCard";
import { DeleteThemeButton, ImportThemeButton, PublishToggle } from "@/components/theme-builder/ThemeActions";
import { listAllCustomThemes, listAvailableThemes } from "@/server/services/themes";
import { BUILTIN_THEMES } from "@/themes/builtin";
import { requireThemeOwner } from "./_guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("themes");
  return { title: t("title") };
}

const linkBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-current/25 px-3 py-2 text-sm font-medium hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";

export default async function ThemesPage() {
  const user = await requireThemeOwner();
  const t = await getTranslations("themes");
  const locale = matchLocale(await getLocale()) ?? "en";
  const isAdmin = user.role === "admin";

  const available = (await listAvailableThemes(user)) as (Theme | StoredTheme)[];
  const custom = available.filter((x): x is StoredTheme => "ownerId" in x);
  const mine = custom.filter((x) => x.ownerId === user.id);
  const others = custom.filter((x) => x.ownerId !== user.id);
  const allCustom = isAdmin ? await listAllCustomThemes(user) : [];
  const adminOnly = allCustom.filter((x) => x.ownerId !== user.id);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-sm opacity-80">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href="/dashboard/themes/new" className={primaryBtn}>
            <Plus className="size-4" aria-hidden="true" /> {t("list.newTheme")}
          </Link>
          <ImportThemeButton />
        </div>
      </header>

      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-3 text-xl font-semibold">{t("list.mine")}</h2>
        {mine.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-current/25 p-6 text-sm opacity-80">{t("list.mineEmpty")}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((th) => (
              <ThemeCard key={th.id} theme={th} locale={locale} badge={th.isPublic ? t("list.publicBadge") : undefined}>
                <Link href={`/dashboard/themes/${th.id}`} className={linkBtn}>
                  <Pencil className="size-4" aria-hidden="true" /> {t("list.edit")}
                </Link>
                <Link href={`/dashboard/themes/new?base=${encodeURIComponent(th.id)}`} className={linkBtn}>{t("list.duplicate")}</Link>
                <DeleteThemeButton themeId={th.id} />
                {isAdmin ? <PublishToggle themeId={th.id} isPublic={th.isPublic} /> : null}
              </ThemeCard>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 ? (
        <section aria-labelledby="shared">
          <h2 id="shared" className="mb-1 text-xl font-semibold">{t("list.shared")}</h2>
          <p className="mb-3 text-sm opacity-80">{t("list.sharedIntro")}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((th) => (
              <ThemeCard key={th.id} theme={th} locale={locale} badge={t("list.publicBadge")}>
                <Link href={`/dashboard/themes/new?base=${encodeURIComponent(th.id)}`} className={linkBtn}>{t("list.useAsBase")}</Link>
              </ThemeCard>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="builtin">
        <h2 id="builtin" className="mb-1 text-xl font-semibold">{t("list.builtin")}</h2>
        <p className="mb-3 text-sm opacity-80">{t("list.builtinIntro")}</p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUILTIN_THEMES.map((th) => (
            <ThemeCard key={th.id} theme={th} locale={locale}>
              <Link href={`/dashboard/themes/new?base=${encodeURIComponent(th.id)}`} className={linkBtn}>
                <Plus className="size-4" aria-hidden="true" /> {t("list.useAsBase")}
              </Link>
            </ThemeCard>
          ))}
        </ul>
      </section>

      {isAdmin && adminOnly.length > 0 ? (
        <section aria-labelledby="admin">
          <h2 id="admin" className="mb-1 text-xl font-semibold">{t("list.adminTitle")}</h2>
          <p className="mb-3 text-sm opacity-80">{t("list.adminIntro")}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminOnly.map((th) => (
              <ThemeCard key={th.id} theme={th} locale={locale} badge={th.isPublic ? t("list.publicBadge") : undefined}>
                <PublishToggle themeId={th.id} isPublic={th.isPublic} />
              </ThemeCard>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
