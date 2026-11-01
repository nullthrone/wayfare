import { redirect } from "next/navigation";
import { Clock, MailQuestion, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ActionForm, SubmitButton } from "@/components/ui/action";
import { Alert } from "@/components/ui/Alert";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Field";
import { getInstanceSettings, getMyOwnerRequest } from "@/server/services/admin";
import { hasRole } from "@/server/services/session";
import { guard, requireUserPage } from "../../_lib/guards";
import { becomeOwnerAction, requestOwnerAction } from "./actions";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.onboarding");
  return { title: t("title") };
}

export default async function BecomeOwnerPage() {
  const user = await requireUserPage("/become-owner");
  if (hasRole(user, "owner")) redirect("/dashboard");

  const t = await getTranslations("dashboard.onboarding");
  const settings = await guard("/become-owner", () => getInstanceSettings());
  const request = settings.onboardingMode === "approval" ? await guard("/become-owner", () => getMyOwnerRequest(user)) : null;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16" data-testid="become-owner">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted">{t("subtitle")}</p>
      </div>

      <Card className="p-6 sm:p-8">
        {settings.onboardingMode === "open" ? (
          <ActionForm action={becomeOwnerAction} className="space-y-4">
            <p className="text-sm text-muted">{t("open.description")}</p>
            <SubmitButton size="lg" className="w-full" data-testid="become-owner-button">
              <Sparkles className="size-4" aria-hidden /> {t("open.cta")}
            </SubmitButton>
          </ActionForm>
        ) : null}

        {settings.onboardingMode === "approval" ? (
          request?.status === "pending" ? (
            <div className="space-y-3 text-center" data-testid="request-pending">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-warn-soft text-warn">
                <Clock className="size-6" aria-hidden />
              </span>
              <h2 className="text-lg font-semibold">{t("approval.pendingTitle")}</h2>
              <p className="text-sm text-muted">{t("approval.pendingDescription")}</p>
              {request.message ? <blockquote className="rounded-xl bg-paper-deep px-4 py-3 text-left text-sm whitespace-pre-wrap">{request.message}</blockquote> : null}
            </div>
          ) : request?.status === "approved" ? (
            <div className="space-y-3 text-center">
              <h2 className="text-lg font-semibold">{t("approval.approvedTitle")}</h2>
              <p className="text-sm text-muted">{t("approval.approvedDescription")}</p>
              <ButtonLink href="/dashboard">{t("goToDashboard")}</ButtonLink>
            </div>
          ) : (
            <ActionForm action={requestOwnerAction} className="space-y-4" successMessage={t("approval.sent")}>
              {request?.status === "denied" ? (
                <Alert kind="warning" title={t("approval.deniedTitle")}>{t("approval.deniedDescription")}</Alert>
              ) : null}
              <p className="text-sm text-muted">{t("approval.description")}</p>
              <Textarea name="message" label={t("approval.message")} hint={t("approval.messageHint")} maxLength={1000} rows={4} />
              <SubmitButton size="lg" className="w-full" data-testid="request-owner-button">
                {t("approval.cta")}
              </SubmitButton>
            </ActionForm>
          )
        ) : null}

        {settings.onboardingMode === "invite" ? (
          <div className="space-y-3 text-center" data-testid="invite-only">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
              <MailQuestion className="size-6" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">{t("invite.title")}</h2>
            <p className="text-sm text-muted">{t("invite.description")}</p>
          </div>
        ) : null}
      </Card>
    </main>
  );
}
