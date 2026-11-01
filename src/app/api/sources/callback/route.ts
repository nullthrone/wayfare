import { config } from "@/server/config";
import { getCurrentUser } from "@/server/services/session";
import { completeConnect } from "@/server/sources";
import { withQueryParam } from "@/server/sources/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sources/callback?code&state → stores the connection, redirects to returnTo?source=connected|error */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  let ok = false;
  let returnTo = "/account";
  try {
    const user = await getCurrentUser();
    const res = await completeConnect(user, { code: q.get("code"), state: q.get("state"), error: q.get("error") });
    ok = res.ok;
    returnTo = res.returnTo;
  } catch (e) {
    console.error("[sources] callback failed:", e instanceof Error ? e.message : e);
  }
  return new Response(null, {
    status: 302,
    headers: { location: `${config().baseUrl}${withQueryParam(returnTo, "source", ok ? "connected" : "error")}`, "cache-control": "no-store" },
  });
}
