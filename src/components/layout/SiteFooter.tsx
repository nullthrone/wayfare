import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getInstanceSettings } from "@/server/services/admin";

export const REPO_URL = "https://github.com/nullthrone/wayfare";

export async function SiteFooter() {
  const t = await getTranslations("common");
  const settings = await getInstanceSettings().catch(() => null);
  const imprint = !!settings?.legal.imprint.trim();
  const privacy = !!settings?.legal.privacy.trim();

  return (
    <footer className="mt-auto border-t border-line bg-paper-deep/50" data-testid="site-footer">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:px-6">
        <nav aria-label={t("footer.legal")} className="flex gap-5">
          {imprint ? <Link href="/legal/imprint" className="hover:text-ink">{t("footer.imprint")}</Link> : null}
          {privacy ? <Link href="/legal/privacy" className="hover:text-ink">{t("footer.privacy")}</Link> : null}
        </nav>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
          {t("footer.powered")}
        </a>
      </div>
    </footer>
  );
}
