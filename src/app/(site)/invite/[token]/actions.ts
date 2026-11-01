"use server";

import { revalidatePath } from "next/cache";
import { invalid } from "@/server/errors";
import { runAction } from "@/server/action-result";
import { redeemInvite } from "@/server/services/admin";
import { requireUser } from "@/server/services/session";

export async function redeemInviteAction(token: string) {
  const res = await runAction(async () => {
    const user = await requireUser();
    const ok = await redeemInvite(user, token);
    if (!ok) throw invalid("dashboard.onboarding.inviteRedeem.invalid");
    return true;
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
