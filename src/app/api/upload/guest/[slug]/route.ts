import "server-only";
import { NextResponse } from "next/server";
import { forbidden, invalid, notFound } from "@/server/errors";
import { resolveAlbumAccess } from "@/server/services/albums";
import { addGuestPhoto } from "@/server/services/photos";
import { requireUser } from "@/server/services/session";
import { errorResponse, ingestFiles, preflight, readFiles } from "../../_shared";

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
    // Authorise before buffering the body (addGuestPhoto re-checks everything per file).
    const access = await resolveAlbumAccess(slug, actor);
    if (access.status === "not-found") throw notFound("albumNotFound");
    if (access.status === "expired") throw forbidden("albumExpired");
    if (access.status === "password-required") throw forbidden("albumLocked");
    if (!access.album.guestUploads.enabled || access.album.blockedUserIds.includes(actor.id)) throw forbidden("guestUploadsDisabled");
    await preflight(req);
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
