import Link from "next/link";
import { ArrowRight, MailPlus, Palette, UserCheck, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/Card";
import { listAllCustomThemes } from "@/server/services/themes";
import { listInvites, listOwnerRequests, listUsers } from "@/server/services/admin";
import { guard, requireAdminPage } from "../_lib/guards";
import { nowMs } from "../_lib/time";

export async function generateMetadata() {
  const t = await getTranslations("admin.overview");
  return { title: t("title") };
}

export default async function AdminOverview() {
  const user = await requireAdminPage("/admin");
  const t = await getTranslations("admin.overview");
  const [users, requests, invites, themes] = await guard("/admin", () =>
    Promise.all([listUsers(user, { limit: 1000 }), listOwnerRequests(user, "pending"), listInvites(user), listAllCustomThemes(user)]),
  );
  const now = nowMs();
  const activeInvites = invites.filter((i) => !i.usedAt && new Date(i.expiresAt).getTime() > now).length;
  const owners = users.filter((u) => u.role === "owner" || u.role === "admin").length;

  const tiles = [
    { href: "/admin/users", icon: Users, label: t("users"), value: users.length, sub: t("owners", { count: owners }) },
    { href: "/admin/requests", icon: UserCheck, label: t("requests"), value: requests.length, sub: t("requestsSub"), highlight: requests.length > 0 },
    { href: "/admin/invites", icon: MailPlus, label: t("invites"), value: activeInvites, sub: t("invitesSub") },
    { href: "/admin/themes", icon: Palette, label: t("themes"), value: themes.length, sub: t("themesSub", { count: themes.filter((x) => x.isPublic).length }) },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6" data-testid="admin-overview">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("subtitle")}</p>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ href, icon: Icon, label, value, sub, highlight }) => (
          <li key={href}>
            <Link href={href} className="group block h-full">
              <Card className={`h-full p-5 transition-shadow group-hover:shadow-pop ${highlight ? "border-warn/50" : ""}`}>
                <div className="flex items-center justify-between text-muted">
                  <Icon className="size-5" aria-hidden />
                  <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </div>
                <p className="mt-4 text-4xl font-semibold tracking-tight tabular-nums">{value}</p>
                <p className="mt-1 font-medium">{label}</p>
                <p className="text-sm text-muted">{sub}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
