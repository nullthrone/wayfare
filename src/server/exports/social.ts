import sharp from "sharp";
import type { Theme } from "@/domain/theme";
import { FONT_CATEGORY, fontStack } from "@/themes/fonts";
import { patternDef } from "@/themes/patterns";
import type { ExportContext } from "./index";
import { exportStrings } from "./strings";
import { qrDark } from "./pdf-common";
import { QUIET_ZONE, qrMatrix, qrPathData } from "./qr";
import { displayUrl, escapeXml, excerpt, fitEstimate, stripEmoji, wrapEstimate } from "./text";

export type SocialKind = "story" | "square";

const DIMS: Record<SocialKind, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

/** Average glyph width / font size, used to wrap text without font metrics. */
function widthFactor(theme: Theme, which: "heading" | "body"): number {
  const cat = FONT_CATEGORY[theme.fonts[which]];
  // deliberately generous: the rasteriser may substitute a wider system font
  return cat === "script" ? 0.52 : cat === "serif" ? 0.62 : 0.64;
}

/**
 * Builds the social image as SVG. `emoji` = include emoji (ornament / title emojis).
 * For PNG output emojis are dropped because the rasteriser has no guaranteed emoji font.
 */
export function buildSocialSvg(ctx: ExportContext, kind: SocialKind, emoji: boolean): string {
  const { album, theme, url, locale } = ctx;
  const s = exportStrings(locale);
  const { w, h } = DIMS[kind];
  const story = kind === "story";
  const c = theme.colors;
  const clean = (t: string) => (emoji ? t : stripEmoji(t)).replace(/\s+/g, " ").trim();

  const titleText = clean(album.title || s.defaultTitle);
  const messageText = clean(excerpt(album.message ?? "", story ? 200 : 120));
  const cardX = story ? 70 : 60;
  const cardW = w - cardX * 2;
  const pad = story ? 70 : 48;
  const innerW = cardW - pad * 2;

  const { size: titleSize, lines: titleLines } = fitEstimate(titleText, story ? 88 : 64, story ? 52 : 36, innerW, widthFactor(theme, "heading") * 1.08, story ? 3 : 2);
  const titleLine = titleSize * 1.18;
  const msgSize = story ? 42 : 30;
  const msgLines = messageText ? wrapEstimate(messageText, msgSize, innerW, widthFactor(theme, "body"), story ? 4 : 2) : [];
  const msgLine = msgSize * 1.4;
  const ornamentSize = story ? 120 : 70;
  const hasOrnament = emoji && !!theme.ornament;
  const pillH = story ? 96 : 64;
  const urlSize = story ? 38 : 28;
  const gap = story ? 36 : 22;

  const fixed =
    pad * 2 +
    (hasOrnament ? ornamentSize * 1.2 + gap : story ? 40 + gap : 0) +
    titleLines.length * titleLine + gap +
    (msgLines.length ? msgLines.length * msgLine + gap : 0) +
    pillH + gap + gap + urlSize * 1.3;
  const maxCardH = h - (story ? 2 * 210 : 2 * 50);
  const qrSize = Math.max(240, Math.min(story ? 560 : 440, maxCardH - fixed));
  const cardH = fixed + qrSize;
  const cardY = Math.round((h - cardH) / 2);

  const parts: string[] = [];
  const font = (which: "heading" | "body") => escapeXml(fontStack(theme.fonts[which]));
  const pat = patternDef(theme.pattern.kind, c.accent, theme.pattern.opacity, "wf-pat");

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`);
  parts.push(`<defs>${pat ?? ""}</defs>`);
  parts.push(`<rect width="${w}" height="${h}" fill="${c.background}"/>`);
  if (pat) parts.push(`<rect width="${w}" height="${h}" fill="url(#wf-pat)"/>`);
  parts.push(`<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="44" fill="${c.surface}" stroke="${c.accent}" stroke-width="6"/>`);
  parts.push(`<rect x="${cardX + 16}" y="${cardY + 16}" width="${cardW - 32}" height="${cardH - 32}" rx="32" fill="none" stroke="${c.accent}" stroke-width="2" stroke-opacity="0.5"/>`);

  const cx = w / 2;
  let y = cardY + pad;
  if (hasOrnament) {
    parts.push(`<text x="${cx}" y="${y + ornamentSize * 0.95}" font-size="${ornamentSize}" text-anchor="middle">${escapeXml(theme.ornament)}</text>`);
    y += ornamentSize * 1.2 + gap;
  } else if (story) {
    for (const dx of [-36, 0, 36]) {
      const r = dx === 0 ? 11 : 8;
      const yy = y + 20;
      parts.push(`<path d="M${cx + dx} ${yy - r}L${cx + dx + r} ${yy}L${cx + dx} ${yy + r}L${cx + dx - r} ${yy}Z" fill="${c.accent}"/>`);
    }
    y += 40 + gap;
  }
  titleLines.forEach((line, i) => {
    parts.push(`<text x="${cx}" y="${y + titleSize * 0.9 + i * titleLine}" font-family="${font("heading")}" font-size="${titleSize}" font-weight="700" text-anchor="middle" fill="${c.text}">${escapeXml(line)}</text>`);
  });
  y += titleLines.length * titleLine + gap;
  if (msgLines.length) {
    msgLines.forEach((line, i) => {
      parts.push(`<text x="${cx}" y="${y + msgSize * 0.95 + i * msgLine}" font-family="${font("body")}" font-size="${msgSize}" text-anchor="middle" fill="${c.muted}">${escapeXml(line)}</text>`);
    });
    y += msgLines.length * msgLine + gap;
  }
  // "Scan me!" pill
  const pillW = Math.min(innerW, story ? 560 : 400);
  parts.push(`<rect x="${cx - pillW / 2}" y="${y}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${c.accent}"/>`);
  parts.push(`<text x="${cx}" y="${y + pillH * 0.68}" font-family="${font("heading")}" font-size="${pillH * 0.55}" font-weight="700" text-anchor="middle" fill="${c.accentContrast}">${escapeXml(clean(s.scanMe))}</text>`);
  y += pillH + gap;
  // QR
  const m = qrMatrix(url);
  const total = m.size + QUIET_ZONE * 2;
  const unit = qrSize / total;
  parts.push(`<rect x="${cx - qrSize / 2}" y="${y}" width="${qrSize}" height="${qrSize}" rx="${Math.round(qrSize * 0.04)}" fill="#ffffff"/>`);
  parts.push(`<path transform="translate(${cx - qrSize / 2} ${y}) scale(${unit.toFixed(5)})" d="${qrPathData(m, QUIET_ZONE)}" fill="${qrDark(theme)}" shape-rendering="crispEdges"/>`);
  y += qrSize + gap;
  parts.push(`<text x="${cx}" y="${y + urlSize * 0.8}" font-family="${font("body")}" font-size="${urlSize}" font-weight="700" text-anchor="middle" fill="${c.text}">${escapeXml(displayUrl(url))}</text>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

export function renderSocialSvg(ctx: ExportContext, kind: SocialKind): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n${buildSocialSvg(ctx, kind, true)}\n`);
}

export async function renderSocialPng(ctx: ExportContext, kind: SocialKind): Promise<Buffer> {
  const svg = buildSocialSvg(ctx, kind, false);
  return sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 }).toBuffer();
}
