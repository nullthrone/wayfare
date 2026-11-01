import { PDFPage } from "pdf-lib";
import type { ExportContext } from "./index";
import { exportStrings } from "./strings";
import { color, drawCenteredLines, drawQr, embedFonts, mm, newPdf, qrDark, roundedRectPath } from "./pdf-common";
import { fitText, pdfSafe } from "./text";

/** A4 sheet with 12 stickers (3 × 4) of 60 mm. */
export const STICKERS = { pageW: 210, pageH: 297, size: 60, cols: 3, rows: 4, gap: 4 } as const;

export async function renderStickers(ctx: ExportContext): Promise<Buffer> {
  const { album, theme, url, locale } = ctx;
  const shape = ctx.options.shape === "square" ? "square" : "round";
  const s = exportStrings(locale);
  const { pageW, pageH, size, cols, rows, gap } = STICKERS;
  const pdf = await newPdf(album.title || s.defaultTitle);
  const fonts = await embedFonts(pdf, theme);
  const page = pdf.addPage([mm(pageW), mm(pageH)]);

  const gridW = cols * size + (cols - 1) * gap;
  const gridH = rows * size + (rows - 1) * gap;
  const x0 = (pageW - gridW) / 2;
  const yTop0 = (pageH - gridH) / 2;
  const title = pdfSafe(album.title || s.defaultTitle, fonts.bodyBold);
  const dark = qrDark(theme);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const left = x0 + c * (size + gap);
      const bottom = pageH - (yTop0 + r * (size + gap) + size);
      drawSticker(page, left, bottom);
    }
  }

  function drawSticker(pg: PDFPage, left: number, bottom: number) {
    const cx = left + size / 2;
    const cy = bottom + size / 2;
    const round = shape === "round";
    const bg = color(theme.colors.background);
    const accent = color(theme.colors.accent);
    if (round) {
      pg.drawCircle({ x: mm(cx), y: mm(cy), size: mm(size / 2), color: bg, borderColor: accent, borderWidth: 1.4 });
      pg.drawCircle({ x: mm(cx), y: mm(cy), size: mm(size / 2 - 2.2), borderColor: accent, borderWidth: 0.35, borderOpacity: 0.7 });
    } else {
      pg.drawSvgPath(roundedRectPath(mm(size), mm(size), mm(6)), { x: mm(left), y: mm(bottom + size), color: bg, borderColor: accent, borderWidth: 1.4 });
      pg.drawSvgPath(roundedRectPath(mm(size - 4.4), mm(size - 4.4), mm(4.2)), { x: mm(left + 2.2), y: mm(bottom + size - 2.2), borderColor: accent, borderWidth: 0.35, borderOpacity: 0.7 });
    }
    const tile = round ? 32 : 36;
    const tileCy = cy + (round ? 7 : 6.5);
    drawQr(pg, url, mm(cx - tile / 2), mm(tileCy - tile / 2), mm(tile), dark);
    const textW = round ? 40 : 46;
    const t = fitText(title, fonts.bodyBold, 8.5, 6, mm(textW), 2);
    const lineH = t.size * 1.2;
    const textTop = mm(tileCy - tile / 2 - (round ? 2.2 : 2.6));
    drawCenteredLines(pg, t.lines, fonts.bodyBold, t.size, mm(cx), textTop, lineH, color(theme.colors.text));
  }

  return Buffer.from(await pdf.save());
}
