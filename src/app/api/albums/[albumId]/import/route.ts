import { requireRole } from "@/server/services/session";
import { importBatch } from "@/server/sources";
import { assertSameOrigin } from "@/server/sources/http-guard";
import { errorResponse } from "@/server/sources/http";
import { invalid } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One batch downloads + processes up to 10 images sequentially. */
export const maxDuration = 120;

/** POST /api/albums/{albumId}/import  body { sourceId, sessionId?, refs?, offset? } */
export async function POST(req: Request, ctx: { params: Promise<{ albumId: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await requireRole("owner");
    const { albumId } = await ctx.params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw invalid("validation");
    }
    return Response.json(await importBatch(user, albumId, body as Parameters<typeof importBatch>[2]), {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
