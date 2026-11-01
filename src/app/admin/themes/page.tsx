import { Palette } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ThemePublishToggle } from "@/components/admin/ThemePublishToggle";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { listAllCustomThemes } from "@/server/services/themes";
import { guard, requireAdminPage } from "../../_lib/guards";

export async function generateMetadata() {
  const t = await getTranslations("admin.themes");
  return { title: t("title") };
}

export default async function AdminThemesPage() {
  const me = await requireAdminPage("/admin/themes");
  const t = await getTranslations("admin.themes");
  const format = await getFormatter();
  const locale = (await getLocale()) === "de" ? "de" : "en";
  const themes = await guard("/admin/themes", () => listAllCustomThemes(me));
  const sorted = [...themes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6" data-testid="admin-themes">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("subtitle")}</p>
      {sorted.length === 0 ? (
        <EmptyState icon={<Palette />} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm" data-testid="admin-themes-table">
            <caption className="sr-only">{t("title")}</caption>
            <thead className="border-b border-line bg-paper-deep/50 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.theme")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.occasion")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.updated")}</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">{t("columns.public")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((th) => (
                <tr key={th.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-black/10" aria-hidden>
                        {[th.colors.background, th.colors.surface, th.colors.accent, th.colors.text].map((c, i) => (
                          <span key={i} className="block h-8 w-4" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                      <span className="font-medium">
                        {th.ornament} {th.name[locale]}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{t(`occasions.${th.occasion}`)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">{format.dateTime(new Date(th.updatedAt), { dateStyle: "medium" })}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <ThemePublishToggle themeId={th.id} isPublic={th.isPublic} name={th.name[locale]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
