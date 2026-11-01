import { Check, UserCheck, X } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { decideRequestAction } from "../actions";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionButton } from "@/components/ui/action";
import { listOwnerRequests } from "@/server/services/admin";
import { guard, requireAdminPage } from "../../_lib/guards";

export async function generateMetadata() {
  const t = await getTranslations("admin.requests");
  return { title: t("title") };
}

export default async function AdminRequestsPage() {
  const me = await requireAdminPage("/admin/requests");
  const t = await getTranslations("admin.requests");
  const format = await getFormatter();
  const all = await guard("/admin/requests", () => listOwnerRequests(me));
  const pending = all.filter((r) => r.status === "pending");
  const decided = all.filter((r) => r.status !== "pending").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "")).slice(0, 20);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6" data-testid="admin-requests">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("subtitle")}</p>

      {pending.length === 0 ? (
        <EmptyState icon={<UserCheck />} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <ul className="space-y-4">
          {pending.map((r) => (
            <li key={r.id}>
              <Card className="p-5" data-testid="owner-request">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.userName || r.userEmail}</p>
                    <p className="text-sm text-muted">
                      {r.userEmail} · {date(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ActionButton size="sm" action={decideRequestAction.bind(null, r.id, "approved")} successMessage={t("approvedToast")}>
                      <Check className="size-4" aria-hidden /> {t("approve")}
                    </ActionButton>
                    <ActionButton size="sm" variant="outline" action={decideRequestAction.bind(null, r.id, "denied")} successMessage={t("deniedToast")}>
                      <X className="size-4" aria-hidden /> {t("deny")}
                    </ActionButton>
                  </div>
                </div>
                {r.message ? <blockquote className="mt-3 rounded-xl bg-paper-deep px-4 py-3 text-sm whitespace-pre-wrap">{r.message}</blockquote> : <p className="mt-3 text-sm text-muted italic">{t("noMessage")}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-3 text-lg font-semibold">{t("history")}</h2>
          <Card>
            <ul className="divide-y divide-line">
              {decided.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="font-medium">{r.userName || r.userEmail}</span> <span className="text-muted">· {r.userEmail}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge tone={r.status === "approved" ? "success" : "danger"}>{t(`status.${r.status}`)}</Badge>
                    {r.decidedAt ? <span className="text-muted">{date(r.decidedAt)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}
    </main>
  );
}
