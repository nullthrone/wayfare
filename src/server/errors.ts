/**
 * Domain errors. Services throw these; server actions / route handlers map them:
 *  NotFound → 404, Forbidden → 403, Unauthorized → 401 (or redirect to /login),
 *  Validation → 400 (message key is an i18n key under "errors.*"), Conflict → 409, Limit → 429/413.
 */
export class AppError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "unauthorized" | "validation" | "conflict" | "limit",
    /** i18n key under the "errors" namespace, e.g. "albumNotFound" */
    public readonly messageKey: string,
    message?: string,
  ) {
    super(message ?? `${code}: ${messageKey}`);
  }
  get status(): number {
    return { not_found: 404, forbidden: 403, unauthorized: 401, validation: 400, conflict: 409, limit: 429 }[this.code];
  }
}

export const notFound = (key = "notFound") => new AppError("not_found", key);
export const forbidden = (key = "forbidden") => new AppError("forbidden", key);
export const unauthorized = (key = "unauthorized") => new AppError("unauthorized", key);
export const invalid = (key: string, msg?: string) => new AppError("validation", key, msg);
export const conflict = (key: string) => new AppError("conflict", key);
export const limitExceeded = (key: string) => new AppError("limit", key);

/** Marker for contract stubs that the implementation workstream replaces. */
export function notImplemented(name: string): never {
  throw new Error(`Not implemented yet: ${name}`);
}
