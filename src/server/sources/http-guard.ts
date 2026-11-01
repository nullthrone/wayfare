import "server-only";
import { config } from "../config";
import { forbidden } from "../errors";

/**
 * CSRF defence for cookie-authenticated JSON POST routes: if the browser sends an Origin header
 * it must match the configured base URL or the request's Host.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  try {
    const o = new URL(origin);
    if (o.origin === new URL(config().baseUrl).origin) return;
    if (o.host === req.headers.get("host")) return;
  } catch {
    // fall through
  }
  throw forbidden("crossOrigin");
}
