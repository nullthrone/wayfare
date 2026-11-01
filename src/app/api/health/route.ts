import { config } from "@/server/config";
import { getDb } from "@/server/container";
import { COLLECTIONS } from "@/server/ports/document-store";

export const dynamic = "force-dynamic";

/**
 * Liveness + storage connectivity probe for Docker HEALTHCHECK / uptime monitors.
 *
 * `GET /api/health?diag=forwarded` additionally returns the parsed X-Forwarded-For chain and the
 * configured `WAYFARE_TRUSTED_PROXIES`. It reveals nothing but the caller's own request path; the
 * Firebase bootstrap script uses it to measure how many proxies sit in front of the app.
 */
export async function GET(req: Request) {
  try {
    const db = await getDb();
    await db.get(COLLECTIONS.settings.name, "instance");
    const body: { status: "ok"; forwardedFor?: string[]; trustedProxies?: number } = { status: "ok" };
    if (new URL(req.url).searchParams.get("diag") === "forwarded") {
      body.forwardedFor = (req.headers.get("x-forwarded-for") ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      body.trustedProxies = config().WAYFARE_TRUSTED_PROXIES;
    }
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[health]", e);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
