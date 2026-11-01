"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, matchLocale } from "@/i18n/config";

/** Persists the UI language in the `wf_locale` cookie (1 year). The client calls router.refresh() afterwards. */
export async function setLocaleAction(locale: string): Promise<void> {
  const l = matchLocale(locale);
  if (!l) return;
  (await cookies()).set(LOCALE_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
