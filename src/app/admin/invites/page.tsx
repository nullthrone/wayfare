import { MailPlus, Trash2 } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { revokeInviteAction } from "../actions";
import { InviteForm } from "@/components/admin/InviteForm";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionButton } from "@/components/ui/action";
import { config } from "@/server/config";
import { listInvites } from "@/server/services/admin";
import { guard, requireAdminPage } from "../../_lib/guards";
import { nowMs } from "../../_lib/time";

export async function generateMetadata() {
  const t = await getTranslations("admin.invites");
  return { title: t("title") };
}

export default async function AdminInvitesPage() {
  const me = await requireAdminPage("/admin/invites");
  const t = await getTranslations("admin.invites");
  const format = await getFormatter();
  const invites = await guard("/admin/invites", () => listInvites(me));
  const base = config().WAYFARE_BASE_URL.replace(/\/$/, "");
  const now = nowMs();
  const sorted = [...invites].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6" data-testid="admin-invites">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("subtitle")}</p>

      <Card className="mb-10">
        <CardHeader title={t("form.title")} />
        <CardBody>
          <InviteForm />
        </CardBody>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState icon={<MailPlus />} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm" data-testid="admin-invites-table">
            <caption className="sr-only">{t("title")}</caption>
            <thead className="border-b border-line bg-paper-deep/50 text-xs tracking-wide text-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.invite")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.status")}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t("columns.expires")}</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((i) => {
                const used = !!i.usedAt;
                const expired = !used && new Date(i.expiresAt).getTime() < now;
                const url = `${base}/invite/${i.token}`;
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{i.email ?? t("noEmail")}</p>
                      <p className="text-muted">{t("createdOn", { date: date(i.createdAt) })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={used ? "success" : expired ? "neutral" : "accent"}>{used ? t("status.used") : expired ? t("status.expired") : t("status.active")}</Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{date(i.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {!used && !expired ? <CopyButton value={url} label={t("copyLink")} /> : null}
                        {!used ? (
                          <ActionButton
                            size="sm"
                            variant="danger-outline"
                            action={revokeInviteAction.bind(null, i.id)}
                            confirm={{ title: t("revokeConfirm.title"), description: t("revokeConfirm.description"), confirmLabel: t("revokeConfirm.confirm") }}
                          >
                            <Trash2 className="size-4" aria-hidden /> {t("revoke")}
                          </ActionButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
