import "server-only";
import { NextResponse } from "next/server";
import { invalid } from "@/server/errors";
import { addGuestPhoto } from "@/server/services/photos";
import { requireUser } from "@/server/services/session";
import { errorResponse, ingestFiles, readFiles } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST multipart `files[]` → { photos: [{id}], errors: [{filename, error}] }.
 * Signed-in guests only; addGuestPhoto() requires album access (published, not expired,
 * unlocked via the unlock cookie), enabled guest uploads, not blocked, within the per-guest limit.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const actor = await requireUser();
    const files = await readFiles(req).catch(() => {
      throw invalid("invalidUpload");
    });
    if (files.length === 0) throw invalid("noFiles");
    const result = await ingestFiles(files, (f) => addGuestPhoto(actor, slug, f));
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
