import type { PDFFont } from "pdf-lib";

const EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE00}-\u{FE0F}\u{200B}-\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

/** Removes emojis, joiners and variation selectors. */
export function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, "");
}

const charsetCache = new WeakMap<PDFFont, Set<number>>();
function charset(font: PDFFont): Set<number> {
  let set = charsetCache.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsetCache.set(font, set);
  }
  return set;
}

const REPLACEMENTS: Record<string, string> = {
  "‐": "-", "‑": "-", "‒": "-", "―": "-", " ": " ", " ": " ", " ": " ",
  "′": "'", "″": '"', "−": "-", "→": "->", "←": "<-", "✓": "", "❤": "",
};

/**
 * Makes text safe for a WinAnsi standard font: strips emojis, maps a few typographic
 * characters, drops everything the font can't encode (umlauts / ß / € / quotes are kept).
 * Keeps "\n" if `keepNewlines`.
 */
export function pdfSafe(text: string, font: PDFFont, keepNewlines = false): string {
  const cs = charset(font);
  let out = "";
  for (const ch of stripEmoji(text.normalize("NFC"))) {
    if (ch === "\n" || ch === "\r") {
      out += keepNewlines ? "\n" : " ";
      continue;
    }
    if (ch === "\t") {
      out += " ";
      continue;
    }
    const rep = REPLACEMENTS[ch];
    if (rep !== undefined) {
      out += rep;
      continue;
    }
    const cp = ch.codePointAt(0)!;
    if (cp < 32) continue;
    if (cs.has(cp)) out += ch;
  }
  return keepNewlines ? out.replace(/[ ]+/g, " ").replace(/ ?\n ?/g, "\n").trim() : out.replace(/\s+/g, " ").trim();
}

export interface WrapResult {
  lines: string[];
  size: number;
  truncated: boolean;
}

/** Greedy word wrap; words longer than `maxWidth` are split by character. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(" ").filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    const push = () => {
      if (line) lines.push(line);
      line = "";
    };
    for (let word of words) {
      while (font.widthOfTextAtSize(word, size) > maxWidth) {
        // split an over-long word
        let cut = word.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
        push();
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        push();
        line = word;
      }
    }
    push();
  }
  return lines;
}

/** Truncates to `maxLines`, ending the last line with an ellipsis if text was cut. */
export function limitLines(lines: string[], maxLines: number, font: PDFFont, size: number, maxWidth: number): { lines: string[]; truncated: boolean } {
  if (lines.length <= maxLines) return { lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1]!;
  while (last.length > 0 && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return { lines: kept, truncated: true };
}

/** Shrinks the font size from `maxSize` towards `minSize` until the text fits in `maxLines`; truncates as a last resort. */
export function fitText(text: string, font: PDFFont, maxSize: number, minSize: number, maxWidth: number, maxLines: number): WrapResult {
  let size = maxSize;
  for (;;) {
    const lines = wrapText(text, font, size, maxWidth);
    if (lines.length <= maxLines) return { lines, size, truncated: false };
    if (size <= minSize) {
      const limited = limitLines(lines, maxLines, font, size, maxWidth);
      return { lines: limited.lines, size, truncated: limited.truncated };
    }
    size = Math.max(minSize, size - 0.5);
  }
}

/** Plain-text excerpt (for SVG output, no font metrics): collapses whitespace, cuts at a word boundary. */
export function excerpt(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > maxChars * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Rough word-wrap for SVG text without font metrics (average glyph width = `factor` × size). */
export function wrapEstimate(text: string, size: number, maxWidth: number, factor: number, maxLines: number): string[] {
  const perLine = Math.max(4, Math.floor(maxWidth / (size * factor)));
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${word}` : word;
      if (cand.length <= perLine) line = cand;
      else {
        if (line) lines.push(line);
        let w = word;
        while (w.length > perLine) {
          lines.push(w.slice(0, perLine));
          w = w.slice(perLine);
        }
        line = w;
      }
    }
    if (line) lines.push(line);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1]!;
    kept[maxLines - 1] = `${last.length >= perLine ? last.slice(0, perLine - 1) : last}…`;
    return kept;
  }
  return lines;
}

/**
 * Largest font size in [minSize, maxSize] (step 4) for which `text` wraps into <= maxLines
 * (conservative width estimate); falls back to minSize with truncation.
 */
export function fitEstimate(text: string, maxSize: number, minSize: number, maxWidth: number, factor: number, maxLines: number): { size: number; lines: string[] } {
  for (let size = maxSize; size > minSize; size -= 4) {
    const lines = wrapEstimate(text, size, maxWidth, factor, maxLines + 1);
    if (lines.length <= maxLines) return { size, lines };
  }
  return { size: minSize, lines: wrapEstimate(text, minSize, maxWidth, factor, maxLines) };
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Strips protocol (and trailing slash) for display: https://x.y/a/abc -> x.y/a/abc */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** File-name-safe slug part. */
export function safeSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "album";
}
