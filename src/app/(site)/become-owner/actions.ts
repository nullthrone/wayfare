"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action-result";
import { becomeOwner, requestOwnerRole } from "@/server/services/admin";
import { requireUser } from "@/server/services/session";

export async function becomeOwnerAction() {
  const res = await runAction(async () => {
    const user = await requireUser();
    await becomeOwner(user);
  });
  if (res.ok) redirect("/dashboard");
  return res;
}

export async function requestOwnerAction(formData: FormData) {
  const message = String(formData.get("message") ?? "").trim().slice(0, 1000);
  const res = await runAction(async () => {
    const user = await requireUser();
    await requestOwnerRole(user, message);
  });
  if (res.ok) revalidatePath("/become-owner");
  return res;
}
