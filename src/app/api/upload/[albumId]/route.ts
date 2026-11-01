import "server-only";
import { NextResponse } from "next/server";
import { invalid } from "@/server/errors";
import { getAlbumForOwner } from "@/server/services/albums";
import { addPhoto } from "@/server/services/photos";
import { requireRole } from "@/server/services/session";
import { errorResponse, ingestFiles, preflight, readFiles } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST multipart `files[]` → { photos: [{id}], errors: [{filename, error}] }. Album owner (or admin) only. */
export async function POST(req: Request, { params }: { params: Promise<{ albumId: string }> }) {
  try {
    const { albumId } = await params;
    const actor = await requireRole("owner");
    await getAlbumForOwner(actor, albumId); // authorise before buffering the body
    await preflight(req);
    const files = await readFiles(req).catch(() => {
      throw invalid("invalidUpload");
    });
    if (files.length === 0) throw invalid("noFiles");
    // addPhoto() verifies ownership of the album and every limit (size, count).
    const result = await ingestFiles(files, (f) => addPhoto(actor, albumId, { ...f, source: "upload" }));
    // A request where nothing could be stored because of a permission problem should surface as such.
    if (result.photos.length === 0 && result.errors.length > 0 && result.errors.every((e) => e.error === "forbidden" || e.error === "albumNotFound")) {
      return NextResponse.json(result, { status: result.errors[0].error === "forbidden" ? 403 : 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
