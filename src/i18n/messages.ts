import { NAMESPACES, type Locale } from "./config";

/** Loads and merges all namespace files for a locale: { common: {...}, viewer: {...}, ... } */
export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = await import(`../../messages/${locale}/${ns}.json`);
      return [ns, mod.default] as const;
    }),
  );
  return Object.fromEntries(entries);
}
