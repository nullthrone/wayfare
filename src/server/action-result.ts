import { AppError } from "./errors";

/**
 * Uniform result type for Server Actions: never throws across the action boundary
 * (except Next.js control-flow errors such as redirect()/notFound()).
 * `error` is an i18n key under the "errors" namespace.
 */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** redirect()/notFound()/forbidden() signal via errors carrying a NEXT_* digest — these must propagate. */
function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    if (err instanceof AppError) return { ok: false, error: err.messageKey };
    console.error("[action] unexpected error", err);
    return { ok: false, error: "generic" };
  }
}
