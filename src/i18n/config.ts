export const LOCALES = ["de", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "wf_locale";

/**
 * Message namespaces = files in messages/{locale}/{namespace}.json.
 * Ownership (to avoid edit conflicts): see CONTRIBUTING.md#i18n.
 */
export const NAMESPACES = [
  "common",
  "landing",
  "auth",
  "dashboard",
  "album",
  "viewer",
  "admin",
  "themes",
  "share",
  "sources",
  "errors",
  "legal",
  "account",
  "mail",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

export function matchLocale(input: string | null | undefined): Locale | null {
  if (!input) return null;
  const tag = input.toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(tag) ? (tag as Locale) : null;
}
