import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SectionNav } from "@/components/layout/SectionNav";
import { SiteShell } from "@/components/layout/SiteShell";
import { requireAdminPage } from "../_lib/guards";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage("/admin");
  const t = await getTranslations("admin.nav");
  const items = [
    { href: "/admin", label: t("overview"), exact: true, testId: "admin-nav-overview" },
    { href: "/admin/users", label: t("users"), testId: "admin-nav-users" },
    { href: "/admin/requests", label: t("requests"), testId: "admin-nav-requests" },
    { href: "/admin/invites", label: t("invites"), testId: "admin-nav-invites" },
    { href: "/admin/settings", label: t("settings"), testId: "admin-nav-settings" },
    { href: "/admin/themes", label: t("themes"), testId: "admin-nav-themes" },
  ];
  return (
    <SiteShell>
      <SectionNav items={items} label={t("label")} />
      {children}
    </SiteShell>
  );
}
