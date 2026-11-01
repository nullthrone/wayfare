import { requireUser } from "@/server/services/session";
import { listSources } from "@/server/sources";
import { errorResponse } from "@/server/sources/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sources → SourceInfo[] for the signed-in user. */
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json(await listSources(user), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
