import "server-only";
import type { Album } from "@/domain/types";
import type { Theme } from "@/domain/theme";
import { renderPostcard } from "./postcard";
import { renderPoster } from "./posters";
import { qrPng, qrSvg } from "./qr";
import { renderSocialPng, renderSocialSvg } from "./social";
import { renderStickers } from "./stickers";
import { safeSlug } from "./text";

/**
 * QR code + print/social exports.
 * Route: GET /api/albums/{albumId}/export/{format}  (owner/admin only)
 *   format ∈ ExportFormat; responds with the file as attachment.
 *
 * Print specs:
 *  - postcard-a6: 2 pages, 105×148 mm trim + 3 mm bleed (111×154 mm media box), crop marks;
 *    front = cover photo (display variant) with title + ornament band in theme colours,
 *    back = greeting message, QR code (≥ 30 mm), short URL, "Scan me" hint, optional password hint.
 *  - stickers: A4 sheet, 12 stickers (3×4), 60 mm, round or square (query ?shape=round|square).
 *  - poster-a4 / poster-a3: title, message excerpt, large QR, theme background colour + accent.
 *  - social-story (1080×1920) / social-square (1080×1080): PNG (?type=png) or SVG (?type=svg)
 *  - qr-svg / qr-png: bare QR code.
 * PDF text uses pdf-lib StandardFonts (WinAnsi); emojis are stripped, umlauts work.
 */
export type ExportFormat =
  | "postcard-a6"
  | "stickers"
  | "poster-a4"
  | "poster-a3"
  | "social-story"
  | "social-square"
  | "qr-svg"
  | "qr-png";

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  "postcard-a6",
  "stickers",
  "poster-a4",
  "poster-a3",
  "social-story",
  "social-square",
  "qr-svg",
  "qr-png",
];

export function isExportFormat(v: string): v is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(v);
}

export interface ExportContext {
  album: Album;
  theme: Theme;
  url: string;
  /** Display-variant bytes of the cover photo, if any. */
  cover: Buffer | null;
  locale: "de" | "en";
  options: { shape?: "round" | "square"; type?: "png" | "svg"; showPasswordHint?: boolean };
}

export interface ExportResult {
  data: Buffer;
  contentType: string;
  filename: string;
}

const PDF = "application/pdf";

export async function renderExport(format: ExportFormat, ctx: ExportContext): Promise<ExportResult> {
  const base = `wayfare-${safeSlug(ctx.album.slug || ctx.album.title)}`;
  switch (format) {
    case "postcard-a6":
      return { data: await renderPostcard(ctx), contentType: PDF, filename: `${base}-postcard-a6.pdf` };
    case "stickers": {
      const shape = ctx.options.shape === "square" ? "square" : "round";
      return { data: await renderStickers({ ...ctx, options: { ...ctx.options, shape } }), contentType: PDF, filename: `${base}-stickers-${shape}.pdf` };
    }
    case "poster-a4":
      return { data: await renderPoster(ctx, "a4"), contentType: PDF, filename: `${base}-poster-a4.pdf` };
    case "poster-a3":
      return { data: await renderPoster(ctx, "a3"), contentType: PDF, filename: `${base}-poster-a3.pdf` };
    case "social-story":
    case "social-square": {
      const kind = format === "social-story" ? "story" : "square";
      if (ctx.options.type === "svg") {
        return { data: renderSocialSvg(ctx, kind), contentType: "image/svg+xml", filename: `${base}-${format}.svg` };
      }
      return { data: await renderSocialPng(ctx, kind), contentType: "image/png", filename: `${base}-${format}.png` };
    }
    case "qr-svg":
      return { data: Buffer.from(qrSvg(ctx.url)), contentType: "image/svg+xml", filename: `${base}-qr.svg` };
    case "qr-png":
      return { data: await qrPng(ctx.url), contentType: "image/png", filename: `${base}-qr.png` };
  }
}
