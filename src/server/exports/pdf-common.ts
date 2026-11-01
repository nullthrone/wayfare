import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import type { Theme } from "@/domain/theme";
import { contrastRatio, hexToRgb } from "@/themes/contrast";
import { FONT_CATEGORY } from "@/themes/fonts";
import { qrMatrix, qrRuns, QUIET_ZONE } from "./qr";

/** 1 mm in PDF points. */
export const MM = 72 / 25.4;
export const mm = (v: number) => v * MM;

export function color(hex: string): Color {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r / 255, g / 255, b / 255);
}

/** Dark QR colour that scans reliably on a white tile: theme text if dark enough, else near-black. */
export function qrDark(theme: Theme): string {
  return contrastRatio(theme.colors.text, "#ffffff") >= 7 ? theme.colors.text : "#111111";
}

export interface PdfFonts {
  heading: PDFFont;
  body: PDFFont;
  bodyBold: PDFFont;
}

/** StandardFonts by theme font category: sans -> Helvetica, serif -> Times, script -> Times italic. */
export async function embedFonts(pdf: PDFDocument, theme: Theme): Promise<PdfFonts> {
  const headCat = FONT_CATEGORY[theme.fonts.heading];
  const bodyCat = FONT_CATEGORY[theme.fonts.body];
  const heading = await pdf.embedFont(
    headCat === "sans" ? StandardFonts.HelveticaBold : headCat === "serif" ? StandardFonts.TimesRomanBold : StandardFonts.TimesRomanBoldItalic,
  );
  const sans = bodyCat === "sans";
  const body = await pdf.embedFont(sans ? StandardFonts.Helvetica : StandardFonts.TimesRoman);
  const bodyBold = await pdf.embedFont(sans ? StandardFonts.HelveticaBold : StandardFonts.TimesRomanBold);
  return { heading, body, bodyBold };
}

export async function newPdf(title: string): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("Wayfare");
  pdf.setProducer("Wayfare (pdf-lib)");
  return pdf;
}

/** Cover photo cropped to the target aspect ratio and re-encoded as JPEG (pdf-lib embeds JPEG/PNG only). */
export async function coverJpeg(cover: Buffer, widthMm: number, heightMm: number, dpi = 220): Promise<Buffer | null> {
  try {
    return await sharp(cover)
      .rotate()
      .resize(Math.round((widthMm / 25.4) * dpi), Math.round((heightMm / 25.4) * dpi), { fit: "cover", position: "centre" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

/** Draws centered text; `x` is the centre, `y` the baseline. Returns text width. */
export function drawCentered(page: PDFPage, text: string, font: PDFFont, size: number, cx: number, y: number, c: Color): number {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color: c });
  return w;
}

/** Draws lines centered, top-down from `topY` (baseline of the first line = topY - size). Returns the y below the last line. */
export function drawCenteredLines(page: PDFPage, lines: string[], font: PDFFont, size: number, cx: number, topY: number, lineHeight: number, c: Color): number {
  let y = topY - size;
  for (const l of lines) {
    if (l) drawCentered(page, l, font, size, cx, y, c);
    y -= lineHeight;
  }
  return y + size;
}

/**
 * Draws a QR code in a white tile. Coordinates in pt: (x, y) = bottom-left of the tile,
 * `size` = tile edge (QR + quiet zone of 4 modules).
 */
export function drawQr(page: PDFPage, text: string, x: number, y: number, size: number, dark: string): void {
  const m = qrMatrix(text);
  const total = m.size + QUIET_ZONE * 2;
  const unit = size / total;
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
  const c = color(dark);
  for (const [mx, my, len] of qrRuns(m)) {
    // overlap by a hair to avoid hairline gaps between adjacent rows in some viewers
    page.drawRectangle({
      x: x + (QUIET_ZONE + mx) * unit,
      y: y + size - (QUIET_ZONE + my + 1) * unit - 0.02,
      width: len * unit,
      height: unit + 0.04,
      color: c,
    });
  }
}

/** Rounded rectangle path (SVG syntax, pt units, origin top-left) for drawSvgPath. */
export function roundedRectPath(w: number, h: number, r: number): string {
  return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

/** Small decorative diamonds row (vector replacement for emoji ornaments). */
export function drawDiamonds(page: PDFPage, cx: number, y: number, c: Color, count = 3, size = mm(1.6), gap = mm(4)): void {
  const total = (count - 1) * gap;
  for (let i = 0; i < count; i++) {
    const s = i === Math.floor(count / 2) ? size * 1.35 : size;
    const x = cx - total / 2 + i * gap;
    page.drawSvgPath(`M0 ${-s}L${s} 0L0 ${s}L${-s} 0Z`, { x, y, color: c, borderWidth: 0 });
  }
}
