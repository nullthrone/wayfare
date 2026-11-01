"use client";

import { useState } from "react";
import { PartyPopper } from "lucide-react";
import { useTranslations } from "next-intl";
import { redeemInviteAction } from "@/app/(site)/invite/[token]/actions";
import { Alert } from "../ui/Alert";
import { ButtonLink } from "../ui/Button";
import { ActionForm, SubmitButton } from "../ui/action";

export function RedeemInvite({ token, alreadyOwner }: { token: string; alreadyOwner: boolean }) {
  const t = useTranslations("dashboard.onboarding.inviteRedeem");
  const [done, setDone] = useState(false);

  if (done || alreadyOwner) {
    return (
      <div className="space-y-4" data-testid="invite-success">
        {done ? (
          <Alert kind="success" title={t("successTitle")}>
            <span className="inline-flex items-center gap-1.5">
              <PartyPopper className="size-4" aria-hidden /> {t("successDescription")}
            </span>
          </Alert>
        ) : null}
        <ButtonLink href="/dashboard" size="lg">
          {t("goToDashboard")}
        </ButtonLink>
      </div>
    );
  }
  return (
    <ActionForm action={() => redeemInviteAction(token)} onSuccess={() => setDone(true)} className="space-y-3">
      <SubmitButton size="lg" data-testid="redeem-invite">
        {t("redeem")}
      </SubmitButton>
    </ActionForm>
  );
}
