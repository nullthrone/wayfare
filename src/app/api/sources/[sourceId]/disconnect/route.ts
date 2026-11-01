import { requireUser } from "@/server/services/session";
import { disconnectSource } from "@/server/sources";
import { assertSameOrigin } from "@/server/sources/http-guard";
import { errorResponse } from "@/server/sources/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/sources/{sourceId}/disconnect → revokes at Google (best effort) and deletes the connection. */
export async function POST(req: Request, ctx: { params: Promise<{ sourceId: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await requireUser();
    const { sourceId } = await ctx.params;
    await disconnectSource(user, sourceId);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
