import "server-only";
import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { invalid } from "../errors";
import { parseExifDate } from "./exif";

/**
 * Image pipeline (sharp). Pure functions over buffers, no I/O besides sharp itself.
 *
 *  - detects the REAL format from the bytes (the client-provided content type is only a hint)
 *  - auto-rotates by EXIF orientation, reads oriented width/height, EXIF capture date, dominant colour
 *  - produces `thumb` (max 480 px, webp q75) and `display` (max 1600 px, webp q82). sharp drops
 *    ALL metadata (EXIF/GPS/ICC) on output unless asked otherwise, and we never ask.
 *  - the original is stored untouched by the caller.
 */

export const THUMB_MAX = 480;
export const DISPLAY_MAX = 1600;
const MAX_INPUT_PIXELS = 120_000_000;

const FORMATS = {
  jpeg: { ext: "jpg", contentType: "image/jpeg" },
  png: { ext: "png", contentType: "image/png" },
  webp: { ext: "webp", contentType: "image/webp" },
  gif: { ext: "gif", contentType: "image/gif" },
  heif: { ext: "heic", contentType: "image/heic" },
} as const;

export type AcceptedFormat = keyof typeof FORMATS;

export interface ProcessedImage {
  width: number;
  height: number;
  takenAt: string | null;
  dominantColor: string;
  thumb: Buffer;
  display: Buffer;
  /** Extension and content type of the stored original, derived from the detected format. */
  originalExt: string;
  originalContentType: string;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

export async function processImage(data: Buffer, declaredContentType?: string): Promise<ProcessedImage> {
  if (declaredContentType) {
    const ct = declaredContentType.toLowerCase().split(";")[0].trim();
    if (ct && !ct.startsWith("image/") && ct !== "application/octet-stream") throw invalid("imageUnsupported");
  }

  const opts = { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS } as const;
  let meta: Metadata;
  try {
    meta = await sharp(data, opts).metadata();
  } catch {
    throw invalid("imageUnsupported");
  }
  const fmt = meta.format as string | undefined;
  if (!fmt || !(fmt in FORMATS)) throw invalid("imageUnsupported");
  const format = FORMATS[fmt as AcceptedFormat];
  if (!meta.width || !(meta.pageHeight ?? meta.height)) throw invalid("imageUnsupported");

  let display: Buffer;
  let thumb: Buffer;
  let dominantColor = "#cccccc";
  try {
    display = await sharp(data, opts)
      .rotate()
      .resize({ width: DISPLAY_MAX, height: DISPLAY_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    thumb = await sharp(display)
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    const { dominant } = await sharp(thumb).stats();
    dominantColor = `#${hex2(dominant.r)}${hex2(dominant.g)}${hex2(dominant.b)}`;
  } catch {
    // e.g. HEIC without HEVC decoder in the bundled libheif
    throw invalid(fmt === "heif" ? "heicUnsupported" : "imageUnsupported");
  }

  // Oriented dimensions of the original (EXIF orientation 5..8 swaps axes).
  const rawW = meta.width;
  const rawH = meta.pageHeight ?? meta.height!;
  const swap = (meta.orientation ?? 1) >= 5;
  return {
    width: swap ? rawH : rawW,
    height: swap ? rawW : rawH,
    takenAt: parseExifDate(meta.exif),
    dominantColor,
    thumb,
    display,
    originalExt: format.ext,
    originalContentType: format.contentType,
  };
}

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Short stable hash of the watermark text, used in the cache key. */
export const watermarkHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 12);

/**
 * Tiled, diagonal, subtle watermark: white text (~18 % opacity) with a soft dark shadow,
 * composited as an SVG overlay. Output is webp q82 at the input's size.
 */
export async function renderWatermark(displayBuffer: Buffer, text: string): Promise<Buffer> {
  const meta = await sharp(displayBuffer).metadata();
  const w = meta.width ?? DISPLAY_MAX;
  const h = meta.height ?? DISPLAY_MAX;
  const label = escapeXml(text.trim().slice(0, 60) || "Wayfare");
  const fontSize = Math.max(14, Math.round(Math.min(w, h) / 26));
  const tileW = Math.round(label.length * fontSize * 0.62 + fontSize * 4);
  const tileH = Math.round(fontSize * 5);
  const y = Math.round(tileH / 2);
  const font = `font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-weight="600" font-size="${fontSize}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="s" x="-10%" y="-10%" width="120%" height="140%"><feGaussianBlur stdDeviation="${Math.max(1, fontSize / 14).toFixed(1)}"/></filter>
    <pattern id="p" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="${Math.round(fontSize * 2)}" y="${y + 2}" ${font} fill="#000" fill-opacity="0.22" filter="url(#s)">${label}</text>
      <text x="${Math.round(fontSize * 2)}" y="${y}" ${font} fill="#fff" fill-opacity="0.18">${label}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#p)"/>
</svg>`;
  return sharp(displayBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 82 })
    .toBuffer();
}
