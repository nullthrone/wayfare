import { requireRole } from "@/server/services/session";
import { pollSelection } from "@/server/sources";
import { errorResponse } from "@/server/sources/http";
import { getSource } from "@/server/sources/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sources/{sourceId}/selection/{sessionId} → { done } */
export async function GET(_req: Request, ctx: { params: Promise<{ sourceId: string; sessionId: string }> }) {
  try {
    const user = await requireRole("owner");
    const { sourceId, sessionId } = await ctx.params;
    const adapter = getSource(sourceId);
    return Response.json(await pollSelection(user, adapter.id, sessionId), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
