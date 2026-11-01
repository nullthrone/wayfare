import { getTranslations } from "next-intl/server";
import { REPO_URL } from "../layout/SiteFooter";

export async function ViewerFooter() {
  const t = await getTranslations("viewer");
  return (
    <footer className="px-4 py-8 text-center text-xs text-[var(--wf-muted)]">
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
        {t("footer")}
      </a>
    </footer>
  );
}
