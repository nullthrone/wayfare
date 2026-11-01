"use server";

import { redirect } from "next/navigation";
import { runAction } from "@/server/action-result";
import { invalid } from "@/server/errors";
import { deleteOwnAccount } from "@/server/services/admin";
import { requireUser } from "@/server/services/session";

/** Deletes the signed-in account after the user typed their e-mail address as confirmation. */
export async function deleteAccountAction(formData: FormData) {
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  const res = await runAction(async () => {
    const user = await requireUser();
    if (typed !== user.email.trim().toLowerCase()) throw invalid("account.delete.mismatch");
    await deleteOwnAccount(user);
  });
  if (res.ok) redirect("/");
  return res;
}
