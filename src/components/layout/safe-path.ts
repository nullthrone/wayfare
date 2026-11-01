/** Returns a same-origin relative path or the fallback. Prevents open redirects via ?callbackURL=. */
export function safePath(input: string | string[] | null | undefined, fallback = "/"): string {
  const v = Array.isArray(input) ? input[0] : input;
  if (!v || typeof v !== "string") return fallback;
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f]/.test(v)) return fallback;
  return v;
}
