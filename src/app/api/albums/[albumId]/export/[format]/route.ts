import "server-only";
import { resolveLocale } from "@/i18n/request";
import { AppError } from "@/server/errors";
import { isExportFormat, renderExport, type ExportContext } from "@/server/exports";
import { getAlbumForOwner, shareUrl } from "@/server/services/albums";
import { getPhoto, readVariant } from "@/server/services/photos";
import { requireUser } from "@/server/services/session";
import { resolveTheme } from "@/server/services/themes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/albums/{albumId}/export/{format}
 *   format: postcard-a6 | stickers | poster-a4 | poster-a3 | social-story | social-square | qr-svg | qr-png
 * Query:
 *   shape=round|square      (stickers)
 *   type=png|svg            (social-*)
 *   passwordHint=1          (print "password is shared separately" on postcard / posters)
 *   inline=1                (Content-Disposition: inline; qr-svg is always inline)
 * Owner/admin only.
 */
export async function GET(req: Request, { params }: { params: Promise<{ albumId: string; format: string }> }) {
  const { albumId, format } = await params;
  if (!isExportFormat(format)) return Response.json({ error: "unknownFormat" }, { status: 404 });

  try {
    const user = await requireUser();
    const album = await getAlbumForOwner(user, albumId);
    const theme = await resolveTheme(album.themeId);

    let cover: Buffer | null = null;
    if (album.coverPhotoId) {
      try {
        const photo = await getPhoto(album.coverPhotoId);
        if (photo && photo.albumId === album.id) cover = (await readVariant(photo, album, "display")).data;
      } catch {
        cover = null; // a missing cover must never break an export
      }
    }

    const q = new URL(req.url).searchParams;
    const options: ExportContext["options"] = {
      shape: q.get("shape") === "square" ? "square" : "round",
      type: q.get("type") === "svg" ? "svg" : "png",
      showPasswordHint: q.get("passwordHint") === "1" || q.get("passwordHint") === "true",
    };

    const out = await renderExport(format, {
      album,
      theme,
      url: shareUrl(album),
      cover,
      locale: await resolveLocale(),
      options,
    });

    const inline = format === "qr-svg" || q.get("inline") === "1";
    const headers: Record<string, string> = {
      "Content-Type": out.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${out.filename}"`,
      "Content-Length": String(out.data.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    // user-controlled text ends up in SVGs; never let one execute script when opened directly in our origin
    if (out.contentType === "image/svg+xml") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    return new Response(new Uint8Array(out.data), { headers });
  } catch (e) {
    if (e instanceof AppError) return Response.json({ error: e.messageKey }, { status: e.status });
    console.error("export failed", e);
    return Response.json({ error: "exportFailed" }, { status: 500 });
  }
}
