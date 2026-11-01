import "server-only";
import { NextResponse } from "next/server";
import type { PhotoVariant } from "@/domain/types";
import { AppError } from "@/server/errors";
import { canManageAlbum, getAlbumById, isExpired } from "@/server/repo";
import { getPhoto, isPlausibleMediaRequest, readVariant, verifyMediaSignature } from "@/server/services/photos";
import { getCurrentUser } from "@/server/services/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VARIANTS = ["thumb", "display", "original"] as const;

function deny(status: number) {
  return new NextResponse(null, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function downloadName(original: string, variant: PhotoVariant): string {
  const safe = original.replace(/[\r\n"\\/]/g, "_");
  if (variant === "original") return safe;
  return `${safe.replace(/\.[^.]+$/, "")}.webp`;
}

/** RFC 6266: ASCII fallback + RFC 5987 UTF-8 filename* so umlauts survive. */
function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/**
 * GET /api/media/{photoId}/{variant}?exp&sig[&dl=1]
 * Format + expiry are checked first, then the signature (bound to the album scope) and the album policy on every request.
 */
export async function GET(req: Request, { params }: { params: Promise<{ photoId: string; variant: string }> }) {
  const { photoId, variant } = await params;
  const url = new URL(req.url);
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  const wantsDownload = url.searchParams.get("dl") === "1";

  if (!(VARIANTS as readonly string[]).includes(variant) || !isPlausibleMediaRequest(variant, exp, sig)) {
    return deny(403);
  }
  const v = variant as PhotoVariant;

  try {
    const photo = await getPhoto(photoId);
    if (!photo) return deny(404);
    const album = await getAlbumById(photo.albumId);
    if (!album) return deny(404);
    // Bound to slug + passwordVersion: revoked links / changed passwords invalidate old URLs.
    if (!verifyMediaSignature(photoId, variant, exp, sig, wantsDownload, album)) return deny(403);

    const user = await getCurrentUser().catch(() => null);
    const manager = canManageAlbum(user, album);

    if (!manager) {
      if (photo.status !== "approved") return deny(404);
      if (album.status !== "published" || isExpired(album)) return deny(403);
    }
    if (v === "original" && !album.downloads.allowed) return deny(403);

    const { data, contentType } = await readVariant(photo, album, v);
    const asAttachment = wantsDownload && album.downloads.allowed;
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=600",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Content-Disposition": asAttachment ? attachment(downloadName(photo.originalFilename, v)) : "inline",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return deny(err.status);
    console.error("[media] failed", err);
    return deny(500);
  }
}
