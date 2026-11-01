import type { ExportContext } from "./index";
import { exportStrings } from "./strings";
import { color, drawCentered, drawCenteredLines, drawDiamonds, drawQr, embedFonts, mm, newPdf, qrDark } from "./pdf-common";
import { displayUrl, fitText, limitLines, pdfSafe, wrapText } from "./text";

export type PosterSize = "a4" | "a3";

/** A4 = 210×297 mm, A3 = 297×420 mm. Layout is designed on A4 and scaled. */
export async function renderPoster(ctx: ExportContext, size: PosterSize): Promise<Buffer> {
  const { album, theme, url, locale } = ctx;
  const s = exportStrings(locale);
  const k = size === "a3" ? 297 / 210 : 1;
  const W = 210 * k;
  const H = 297 * k;
  const pdf = await newPdf(album.title || s.defaultTitle);
  const fonts = await embedFonts(pdf, theme);
  const page = pdf.addPage([mm(W), mm(H)]);
  const bg = color(theme.colors.background);
  const accent = color(theme.colors.accent);
  const text = color(theme.colors.text);
  const muted = color(theme.colors.muted);
  const cx = mm(W / 2);
  const top = (v: number) => mm(H - v * k); // y from top (A4 mm, scaled) -> pt

  page.drawRectangle({ x: 0, y: 0, width: mm(W), height: mm(H), color: bg });
  // frame: heavy accent border + hairline
  page.drawRectangle({ x: mm(8 * k), y: mm(8 * k), width: mm(W - 16 * k), height: mm(H - 16 * k), borderColor: accent, borderWidth: 3 * k, color: undefined });
  page.drawRectangle({ x: mm(11.5 * k), y: mm(11.5 * k), width: mm(W - 23 * k), height: mm(H - 23 * k), borderColor: accent, borderWidth: 0.6 * k, color: undefined });

  // "Scan me!"
  const scan = fitText(pdfSafe(s.scanMe, fonts.heading), fonts.heading, 66 * k, 30 * k, mm(170 * k), 1);
  drawCentered(page, scan.lines[0] ?? s.scanMe, fonts.heading, scan.size, cx, top(46), accent);
  drawDiamonds(page, cx, top(56), accent, 3, mm(2 * k), mm(5 * k));

  // title
  const title = pdfSafe(album.title || s.defaultTitle, fonts.heading);
  const t = fitText(title, fonts.heading, 30 * k, 16 * k, mm(165 * k), 2);
  const tLine = t.size * 1.15;
  const y = drawCenteredLines(page, t.lines, fonts.heading, t.size, cx, top(64), tLine, text);

  // message excerpt
  const message = pdfSafe(album.message ?? "", fonts.body);
  if (message) {
    const msgSize = 13 * k;
    const wrapped = wrapText(message, fonts.body, msgSize, mm(150 * k));
    const { lines } = limitLines(wrapped, 3, fonts.body, msgSize, mm(150 * k));
    drawCenteredLines(page, lines, fonts.body, msgSize, cx, y - mm(4 * k), msgSize * 1.4, muted);
  }

  // QR
  const qr = 118 * k;
  const qrBottomY = top(128 + 118);
  drawQr(page, url, cx - mm(qr / 2), qrBottomY, mm(qr), qrDark(theme));

  // URL + hint
  const urlSize = 15 * k;
  const urlText = displayUrl(url);
  const urlFit = fitText(urlText, fonts.bodyBold, urlSize, 8, mm(170 * k), 1);
  drawCentered(page, urlFit.lines[0] ?? urlText, fonts.bodyBold, urlFit.size, cx, qrBottomY - mm(9 * k), text);
  const scanHint = pdfSafe(s.scanHint, fonts.body);
  drawCentered(page, scanHint, fonts.body, 10.5 * k, cx, qrBottomY - mm(15.5 * k), muted);
  if (ctx.options.showPasswordHint && album.access.mode === "password") {
    drawCentered(page, pdfSafe(s.passwordHint, fonts.bodyBold), fonts.bodyBold, 10 * k, cx, qrBottomY - mm(22.5 * k), accent);
  }

  return Buffer.from(await pdf.save());
}
