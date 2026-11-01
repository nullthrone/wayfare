import { requireRole } from "@/server/services/session";
import { startSelection } from "@/server/sources";
import { assertSameOrigin } from "@/server/sources/http-guard";
import { errorResponse } from "@/server/sources/http";
import { getSource } from "@/server/sources/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/sources/{sourceId}/selection → SelectionStart */
export async function POST(req: Request, ctx: { params: Promise<{ sourceId: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await requireRole("owner");
    const { sourceId } = await ctx.params;
    const adapter = getSource(sourceId);
    return Response.json(await startSelection(user, adapter.id), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
