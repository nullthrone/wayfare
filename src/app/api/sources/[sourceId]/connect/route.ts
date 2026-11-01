import { config } from "@/server/config";
import { AppError } from "@/server/errors";
import { requireRole } from "@/server/services/session";
import { beginConnect } from "@/server/sources";
import { sanitizeReturnTo, withQueryParam } from "@/server/sources/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const redirect = (path: string) => new Response(null, { status: 302, headers: { location: `${config().baseUrl}${path}`, "cache-control": "no-store" } });

/** GET /api/sources/{sourceId}/connect?returnTo=/path → 302 to Google's consent screen. */
export async function GET(req: Request, ctx: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await ctx.params;
  const returnTo = sanitizeReturnTo(new URL(req.url).searchParams.get("returnTo"));
  try {
    const user = await requireRole("owner");
    const target = beginConnect(user, sourceId, returnTo);
    return new Response(null, { status: 302, headers: { location: target, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError && e.code === "unauthorized") return redirect("/login");
    if (!(e instanceof AppError)) console.error("[sources] connect failed:", e instanceof Error ? e.message : e);
    return redirect(withQueryParam(returnTo, "source", "error"));
  }
}
