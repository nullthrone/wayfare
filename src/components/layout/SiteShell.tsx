import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** App chrome (header + footer) for everything that is not a themed album page. */
export async function SiteShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only-focusable fixed top-2 left-2 z-[60] rounded-full bg-ink px-4 py-2 text-sm text-white">
        {t("skipToContent")}
      </a>
      <SiteHeader />
      <div id="main" className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}
