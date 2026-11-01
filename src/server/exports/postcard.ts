import { rgb, type PDFPage } from "pdf-lib";
import type { ExportContext } from "./index";
import { exportStrings } from "./strings";
import {
  color, coverJpeg, drawCentered, drawCenteredLines, drawDiamonds, drawQr, embedFonts, mm, newPdf, qrDark,
} from "./pdf-common";
import { displayUrl, fitText, limitLines, pdfSafe, wrapText } from "./text";

/** A6 postcard: 105×148 mm trim + 3 mm bleed on each side, crop marks in the bleed. */
export const POSTCARD = { trimW: 105, trimH: 148, bleed: 3 } as const;

export async function renderPostcard(ctx: ExportContext): Promise<Buffer> {
  const { album, theme, url, locale } = ctx;
  const s = exportStrings(locale);
  const { trimW, trimH, bleed } = POSTCARD;
  const W = trimW + bleed * 2;
  const H = trimH + bleed * 2;
  const pdf = await newPdf(album.title || s.defaultTitle);
  const fonts = await embedFonts(pdf, theme);
  const bg = color(theme.colors.background);
  const accent = color(theme.colors.accent);
  const accentText = color(theme.colors.accentContrast);
  const text = color(theme.colors.text);
  const muted = color(theme.colors.muted);
  const cx = mm(W / 2);
  const title = pdfSafe(album.title || s.defaultTitle, fonts.heading);

  // ---------- page 1: front
  const front = pdf.addPage([mm(W), mm(H)]);
  front.drawRectangle({ x: 0, y: 0, width: mm(W), height: mm(H), color: bg });
  const jpeg = ctx.cover ? await coverJpeg(ctx.cover, W, H) : null;
  if (jpeg) {
    const img = await pdf.embedJpg(jpeg);
    front.drawImage(img, { x: 0, y: 0, width: mm(W), height: mm(H) });
  } else {
    // no cover: soft accent circles on the theme background
    front.drawCircle({ x: mm(W * 0.78), y: mm(H * 0.72), size: mm(46), color: accent, opacity: 0.18 });
    front.drawCircle({ x: mm(W * 0.2), y: mm(H * 0.5), size: mm(30), color: accent, opacity: 0.12 });
    front.drawCircle({ x: mm(W * 0.6), y: mm(H * 0.38), size: mm(18), color: accent, opacity: 0.2 });
  }
  const bandH = 42; // mm, from the bottom edge of the bleed
  front.drawRectangle({ x: 0, y: 0, width: mm(W), height: mm(bandH), color: accent, opacity: 0.95 });
  front.drawRectangle({ x: 0, y: mm(bandH), width: mm(W), height: mm(0.8), color: accentText, opacity: 0.85 });
  drawDiamonds(front, cx, mm(bandH - 7), accentText);
  const t = fitText(title, fonts.heading, 24, 12, mm(trimW - 22), 2);
  const lineH = t.size * 1.15;
  const blockH = t.lines.length * lineH;
  // centre the title in the band area between diamonds (y = band-11mm) and the safe bottom edge (trim + 7 mm)
  const areaTop = mm(bandH - 11);
  const areaBottom = mm(bleed + 7);
  const topY = areaBottom + (areaTop - areaBottom + blockH) / 2;
  drawCenteredLines(front, t.lines, fonts.heading, t.size, cx, topY, lineH, accentText);

  // ---------- page 2: back
  const back = pdf.addPage([mm(W), mm(H)]);
  back.drawRectangle({ x: 0, y: 0, width: mm(W), height: mm(H), color: bg });
  const inset = bleed + 6;
  back.drawRectangle({ x: mm(inset), y: mm(inset), width: mm(W - inset * 2), height: mm(H - inset * 2), borderColor: accent, borderWidth: 0.9, color: undefined });
  back.drawRectangle({ x: mm(inset + 1.4), y: mm(inset + 1.4), width: mm(W - (inset + 1.4) * 2), height: mm(H - (inset + 1.4) * 2), borderColor: accent, borderWidth: 0.3, color: undefined });

  const contentW = trimW - 30; // 75 mm
  const tt = fitText(title, fonts.heading, 19, 12, mm(contentW), 2);
  const tLine = tt.size * 1.15;
  let y = mm(H - bleed - 16);
  y = drawCenteredLines(back, tt.lines, fonts.heading, tt.size, cx, y, tLine, text);
  y -= mm(3);
  drawDiamonds(back, cx, y, accent);
  y -= mm(6);

  // QR block is anchored at the bottom; the message uses the space in between
  const showHint = !!ctx.options.showPasswordHint && album.access.mode === "password";
  const qrSize = mm(34);
  const urlBaseline = mm(inset + (showHint ? 11 : 7.5));
  const hintBaseline = mm(inset + 6.2);
  const qrY = urlBaseline + mm(4);
  const scanBaseline = qrY + qrSize + mm(4);
  const scanSize = 15;

  const msgSize = 10;
  const msgLine = msgSize * 1.4;
  const msgBottom = scanBaseline + scanSize + mm(5);
  const maxMsgLines = Math.max(0, Math.floor((y - msgBottom) / msgLine));
  const message = pdfSafe(album.message ?? "", fonts.body, true);
  if (message && maxMsgLines > 0) {
    const wrapped = wrapText(message, fonts.body, msgSize, mm(contentW));
    const { lines } = limitLines(wrapped, maxMsgLines, fonts.body, msgSize, mm(contentW));
    drawCenteredLines(back, lines, fonts.body, msgSize, cx, y, msgLine, text);
  }

  drawCentered(back, s.scanMe, fonts.heading, scanSize, cx, scanBaseline, accent);
  drawQr(back, url, cx - qrSize / 2, qrY, qrSize, qrDark(theme));
  drawCentered(back, displayUrl(url), fonts.bodyBold, 8, cx, urlBaseline, text);
  if (showHint) drawCentered(back, pdfSafe(s.passwordHint, fonts.body), fonts.body, 6.5, cx, hintBaseline, muted);

  // ---------- crop marks (in the bleed area, outside the trim box)
  for (const page of [front, back]) {
    page.setTrimBox(mm(bleed), mm(bleed), mm(trimW), mm(trimH));
    page.setBleedBox(0, 0, mm(W), mm(H));
    drawCropMarks(page, mm(bleed), mm(bleed), mm(trimW), mm(trimH), mm(W), mm(H));
  }
  return Buffer.from(await pdf.save());
}

function drawCropMarks(page: PDFPage, tx: number, ty: number, tw: number, th: number, W: number, H: number) {
  const len = mm(2.4);
  const lines: [number, number, number, number][] = [];
  const xs = [tx, tx + tw];
  const ys = [ty, ty + th];
  for (const x of xs) {
    lines.push([x, 0, x, len], [x, H - len, x, H]);
  }
  for (const y of ys) {
    lines.push([0, y, len, y], [W - len, y, W, y]);
  }
  for (const [x1, y1, x2, y2] of lines) {
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.1, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.35, color: rgb(0, 0, 0) });
  }
}
