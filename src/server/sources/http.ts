import "server-only";
import { AppError } from "../errors";

/** Shared HTTP helpers for Google API calls (timeouts, error mapping, SSRF-safe downloads). */

export const API_TIMEOUT_MS = 20_000;
export const DOWNLOAD_TIMEOUT_MS = 120_000;
/** Hard cap per imported file, independent of the instance's maxUploadMb (checked by addPhoto). */
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** Thrown by adapters for items that are not importable images (skipped, not failed). */
export class UnsupportedItemError extends Error {
  constructor(message = "Unsupported item") {
    super(message);
    this.name = "UnsupportedItemError";
  }
}

/** Parses protobuf JSON durations like "3.5s" / "1800s" into milliseconds. */
export function parseDurationMs(value: unknown, fallbackMs: number): number {
  if (typeof value !== "string") return fallbackMs;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!m) return fallbackMs;
  const ms = Math.round(Number(m[1]) * 1000);
  return Number.isFinite(ms) && ms > 0 ? ms : fallbackMs;
}

/** SSRF guard: https only, host must be `googleusercontent.com` or a sub-domain of it. */
export function isGoogleUserContentUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (u.hostname === "googleusercontent.com" || u.hostname.endsWith(".googleusercontent.com")) && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Host guard for Drive downloads (googleapis.com API host and googleusercontent.com redirects). */
export function isGoogleDriveDownloadUrl(raw: string): boolean {
  if (isGoogleUserContentUrl(raw)) return true;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "www.googleapis.com" && !u.username && !u.password;
  } catch {
    return false;
  }
}

function mapFailure(status: number, what: string): AppError {
  if (status === 401) return new AppError("conflict", "sourceReconnectRequired", `${what}: 401`);
  if (status === 403) return new AppError("forbidden", "sourceAccessDenied", `${what}: 403`);
  if (status === 404) return new AppError("not_found", "sourceItemNotFound", `${what}: 404`);
  if (status === 429) return new AppError("limit", "sourceRateLimited", `${what}: 429`);
  return new AppError("conflict", "sourceRequestFailed", `${what}: ${status}`);
}

/** Authorised JSON request against a Google API. */
export async function googleJson<T>(url: string, accessToken: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) throw mapFailure(res.status, `${init.method ?? "GET"} ${new URL(url).pathname}`);
  return (await res.json()) as T;
}

/**
 * Downloads bytes with the Bearer token. Redirects are followed manually so that every hop is
 * validated by `isAllowed` (the token is never sent to other hosts).
 */
export async function downloadBytes(
  url: string,
  accessToken: string,
  isAllowed: (url: string) => boolean,
): Promise<{ data: Buffer; contentType: string | null }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowed(current)) throw new AppError("validation", "sourceHostNotAllowed", "Blocked download host");
    const res = await fetch(current, {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new AppError("conflict", "sourceRequestFailed", "Redirect without location");
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) throw mapFailure(res.status, "download");
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_DOWNLOAD_BYTES) throw new AppError("limit", "sourceFileTooLarge");
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_DOWNLOAD_BYTES) throw new AppError("limit", "sourceFileTooLarge");
    const ct = res.headers.get("content-type");
    return { data, contentType: ct ? ct.split(";")[0]!.trim().toLowerCase() : null };
  }
  throw new AppError("conflict", "sourceRequestFailed", "Too many redirects");
}

/** Maps any thrown value to a JSON error response. */
export function errorResponse(e: unknown): Response {
  if (e instanceof AppError) return Response.json({ error: e.messageKey }, { status: e.status });
  if (e && typeof e === "object" && "issues" in e) return Response.json({ error: "validation" }, { status: 400 });
  console.error("[sources] unexpected error:", e instanceof Error ? e.message : e);
  return Response.json({ error: "internalError" }, { status: 500 });
}
