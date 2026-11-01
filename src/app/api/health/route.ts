import { getDb } from "@/server/container";
import { COLLECTIONS } from "@/server/ports/document-store";

export const dynamic = "force-dynamic";

/** Liveness + storage connectivity probe for Docker HEALTHCHECK / uptime monitors. */
export async function GET() {
  try {
    const db = await getDb();
    await db.get(COLLECTIONS.settings.name, "instance");
    return Response.json({ status: "ok" });
  } catch (e) {
    console.error("[health]", e);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
