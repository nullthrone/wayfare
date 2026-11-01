import { Search } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { BanButton, RoleSelect } from "@/components/admin/UserActions";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { listUsers } from "@/server/services/admin";
import { guard, requireAdminPage } from "../../_lib/guards";

const PAGE_SIZE = 25;

export async function generateMetadata() {
  const t = await getTranslations("admin.users");
  return { title: t("title") };
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireAdminPage("/admin/users");
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";
  const page = Math.max(1, Number.parseInt((Array.isArray(sp.page) ? sp.page[0] : sp.page) ?? "1", 10) || 1);
  const t = await getTranslations("admin.users");
  const format = await getFormatter();

  const rows = await guard("/admin/users", () => listUsers(me, { query: q || undefined, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }));
  const hasNext = rows.length > PAGE_SIZE;
  const users = rows.slice(0, PAGE_SIZE);
  const href = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("subtitle")}</p>

      <form role="search" className="mb-6 flex max-w-md items-end gap-2">
        <Input name="q" type="search" label={t("search")} defaultValue={q} placeholder={t("searchPlaceholder")} wrapperClassName="flex-1" />
        <Button type="submit" variant="outline" className="mb-px">
          <Search className="size-4" aria-hidden /> {t("searchButton")}
        </Button>
      </form>

      {users.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm" data-testid="admin-users-table">
            <caption className="sr-only">{t("title")}</caption>
            <thead className="border-b border-line bg-paper-deep/50 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.user")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.role")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.joined")}</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => {
                const self = u.id === me.id;
                return (
                  <tr key={u.id} data-testid="admin-user-row">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {u.name || "–"} {self ? <Badge tone="accent">{t("you")}</Badge> : null} {u.banned ? <Badge tone="danger">{t("bannedBadge")}</Badge> : null}
                      </p>
                      <p className="text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <RoleSelect userId={u.id} role={u.role} disabled={self} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{format.dateTime(new Date(u.createdAt), { dateStyle: "medium" })}</td>
                    <td className="px-4 py-3 text-right">
                      <BanButton userId={u.id} banned={u.banned} disabled={self} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {page > 1 || hasNext ? (
        <nav className="mt-6 flex items-center justify-between" aria-label={t("pagination")}>
          {page > 1 ? <ButtonLink href={href(page - 1)} variant="outline" size="sm">{t("prev")}</ButtonLink> : <span />}
          <span className="text-sm text-muted">{t("page", { page })}</span>
          {hasNext ? <ButtonLink href={href(page + 1)} variant="outline" size="sm">{t("next")}</ButtonLink> : <span />}
        </nav>
      ) : null}
    </main>
  );
}
