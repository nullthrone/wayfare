import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SectionNav } from "@/components/layout/SectionNav";
import { SiteShell } from "@/components/layout/SiteShell";
import { hasRole } from "@/server/services/session";
import { requireOwnerPage } from "../_lib/guards";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireOwnerPage("/dashboard");
  const t = await getTranslations("common.nav");
  const items = [
    { href: "/dashboard", label: t("albums"), exact: true, testId: "nav-albums" },
    { href: "/dashboard/themes", label: t("themes"), testId: "nav-themes" },
    { href: "/account", label: t("account"), testId: "nav-account" },
    ...(hasRole(user, "admin") ? [{ href: "/admin", label: t("admin"), testId: "nav-admin" }] : []),
  ];
  return (
    <SiteShell>
      <SectionNav items={items} label={t("dashboardLabel")} />
      {children}
    </SiteShell>
  );
}
