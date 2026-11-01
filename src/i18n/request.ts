import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, matchLocale, type Locale } from "./config";
import { loadMessages } from "./messages";

/**
 * Locale resolution WITHOUT URL prefixes (share links must stay short: /a/{slug}):
 *   1. cookie `wf_locale` (set by the language switcher)
 *   2. Accept-Language header
 *   3. DEFAULT_LOCALE
 */
export async function resolveLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  const fromCookie = matchLocale(c);
  if (fromCookie) return fromCookie;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const m = matchLocale(part.split(";")[0]?.trim());
    if (m) return m;
  }
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: await loadMessages(locale), timeZone: process.env.WAYFARE_TIMEZONE ?? "UTC" };
});
