import "server-only";
import type { Album } from "@/domain/types";
import type { Theme } from "@/domain/theme";
import { notImplemented } from "../errors";

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

export interface ExportContext {
  album: Album;
  theme: Theme;
  url: string;
  /** Display-variant bytes of the cover photo, if any. */
  cover: Buffer | null;
  locale: "de" | "en";
  options: { shape?: "round" | "square"; type?: "png" | "svg"; showPasswordHint?: boolean };
}

export async function renderExport(format: ExportFormat, ctx: ExportContext): Promise<{ data: Buffer; contentType: string; filename: string }> {
  void format; void ctx;
  return notImplemented("renderExport");
}
