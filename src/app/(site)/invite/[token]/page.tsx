import { MailOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { RedeemInvite } from "@/components/account/RedeemInvite";
import { Card } from "@/components/ui/Card";
import { getCurrentUser, hasRole } from "@/server/services/session";
import { redirect } from "next/navigation";
import { loginHref } from "../../../_lib/guards";

export async function generateMetadata() {
  const t = await getTranslations("dashboard.onboarding.inviteRedeem");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref(`/invite/${token}`));

  const t = await getTranslations("dashboard.onboarding.inviteRedeem");
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16" data-testid="invite-page">
      <Card className="p-6 text-center sm:p-10">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <MailOpen className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">{hasRole(user, "owner") ? t("alreadyOwner") : t("description")}</p>
        <div className="mt-8">
          <RedeemInvite token={token} alreadyOwner={hasRole(user, "owner")} />
        </div>
      </Card>
    </main>
  );
}
