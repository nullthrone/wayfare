import type { Pattern } from "@/domain/theme";

/**
 * Tileable, hand-written SVG pattern tiles (single colour, transparent background).
 * Client + server safe, no dependencies. SVG attributes use single quotes so the
 * result can be embedded in a double-quoted CSS url("...").
 */

export interface PatternTile {
  width: number;
  height: number;
  /** SVG markup (children of <svg>/<pattern>), painted in `color`. */
  body: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points='${pts.join(" ")}'/>`;
}

const HEART = "M0 4.6C-7.4 -1 -5.8 -6.6 -2.5 -6.6C-1 -6.6 0 -5.6 0 -4.6C0 -5.6 1 -6.6 2.5 -6.6C5.8 -6.6 7.4 -1 0 4.6Z";
const LEAF = "M0 -9C6.5 -4.5 6.5 4.5 0 9C-6.5 4.5 -6.5 -4.5 0 -9Z";
const EGG = "M0 -9C5.4 -9 8.4 -1.5 8.4 3.2C8.4 7.4 4.8 9.6 0 9.6C-4.8 9.6 -8.4 7.4 -8.4 3.2C-8.4 -1.5 -5.4 -9 0 -9Z";

function snowflake(cx: number, cy: number, r: number): string {
  const arms = [0, 60, 120]
    .map((a) => `<line x1='0' y1='${-r}' x2='0' y2='${r}' transform='rotate(${a})'/>`)
    .join("");
  const tips = [0, 60, 120]
    .map(
      (a) =>
        `<path d='M-${r * 0.28} ${-r * 0.72}L0 ${-r * 0.5}L${r * 0.28} ${-r * 0.72}M-${r * 0.28} ${r * 0.72}L0 ${r * 0.5}L${r * 0.28} ${r * 0.72}' transform='rotate(${a})'/>`,
    )
    .join("");
  return `<g transform='translate(${cx} ${cy})' fill='none' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'>${arms}${tips}</g>`;
}

function burst(cx: number, cy: number, r0: number, r1: number, n: number): string {
  const rays: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((Math.PI * 2) / n) * i;
    const x0 = cx + r0 * Math.cos(a);
    const y0 = cy + r0 * Math.sin(a);
    const x1 = cx + r1 * Math.cos(a);
    const y1 = cy + r1 * Math.sin(a);
    rays.push(
      `<line x1='${x0.toFixed(1)}' y1='${y0.toFixed(1)}' x2='${x1.toFixed(1)}' y2='${y1.toFixed(1)}'/><circle cx='${(cx + (r1 + 3) * Math.cos(a)).toFixed(1)}' cy='${(cy + (r1 + 3) * Math.sin(a)).toFixed(1)}' r='1.3' stroke='none'/>`,
    );
  }
  return `<g stroke-width='1.4' stroke-linecap='round'>${rays.join("")}</g>`;
}

function balloon(x: number, y: number, rot: number): string {
  return (
    `<g transform='translate(${x} ${y}) rotate(${rot})'>` +
    `<ellipse cx='0' cy='0' rx='7' ry='8.6' stroke='none'/>` +
    `<path d='M-2 8.2L2 8.2L0 11Z' stroke='none'/>` +
    `<path d='M0 11C-3 14 3 16 0 20C-2 22.5 1 24 0 26' fill='none' stroke-width='1' stroke-linecap='round'/>` +
    `</g>`
  );
}

/** Returns the tile for a pattern kind, or null for "none". */
export function patternTile(kind: Pattern): PatternTile | null {
  switch (kind) {
    case "none":
      return null;
    case "dots":
      return { width: 24, height: 24, body: `<circle cx='6' cy='6' r='2'/><circle cx='18' cy='18' r='2'/>` };
    case "confetti":
      return {
        width: 84,
        height: 84,
        body:
          `<rect x='-3' y='-1.2' width='6' height='2.4' rx='1' transform='translate(12 14) rotate(35)'/>` +
          `<circle cx='44' cy='10' r='2.4'/>` +
          `<rect x='-3' y='-1.2' width='6' height='2.4' rx='1' transform='translate(70 22) rotate(-50)'/>` +
          `<path d='M8 44q4 -6 8 0t8 0' fill='none' stroke-width='1.6' stroke-linecap='round' stroke-opacity='1'/>` +
          `<polygon points='46,36 51,45 41,45' transform='rotate(18 46 41)'/>` +
          `<circle cx='72' cy='52' r='2'/>` +
          `<rect x='-3' y='-1.2' width='6' height='2.4' rx='1' transform='translate(20 70) rotate(-20)'/>` +
          `<circle cx='46' cy='68' r='2.6'/>` +
          `<path d='M62 74q3 -5 6 0t6 0' fill='none' stroke-width='1.6' stroke-linecap='round'/>`,
      };
    case "hearts":
      return {
        width: 48,
        height: 48,
        body: `<path d='${HEART}' transform='translate(12 14) rotate(-12)'/><path d='${HEART}' transform='translate(36 38) scale(.8) rotate(10)'/>`,
      };
    case "stars":
      return { width: 56, height: 56, body: `${star(14, 14, 6.5, 2.8)}${star(42, 42, 5, 2.2)}<circle cx='42' cy='12' r='1.2'/><circle cx='12' cy='44' r='1.2'/>` };
    case "snow":
      return {
        width: 64,
        height: 64,
        body: `${snowflake(16, 16, 8)}${snowflake(46, 44, 6)}<circle cx='46' cy='12' r='1.6'/><circle cx='12' cy='50' r='1.6'/>`,
      };
    case "leaves":
      return {
        width: 56,
        height: 56,
        body: `<path d='${LEAF}' transform='translate(14 16) rotate(-35) scale(.9)'/><path d='${LEAF}' transform='translate(42 40) rotate(40) scale(.75)'/>`,
      };
    case "eggs":
      return {
        width: 60,
        height: 60,
        body:
          `<g transform='translate(16 18) rotate(-12)' fill='none' stroke-width='1.5' stroke-linejoin='round'><path d='${EGG}'/><path d='M-7.6 1.5l3.2 -2.6l3.2 2.6l3.2 -2.6l3.2 2.6l3.2 -2.6l1.6 1.3' stroke-linecap='round'/></g>` +
          `<g transform='translate(44 42) rotate(14) scale(.8)' fill='none' stroke-width='1.8' stroke-linejoin='round'><path d='${EGG}'/><circle cx='0' cy='2' r='2.6'/></g>`,
      };
    case "waves":
      return {
        width: 40,
        height: 24,
        body: `<path d='M0 12q10 -9 20 0t20 0' fill='none' stroke-width='1.6' stroke-linecap='round'/>`,
      };
    case "balloons":
      return { width: 72, height: 72, body: `${balloon(18, 18, -8)}${balloon(52, 46, 10)}` };
    case "rings":
      return {
        width: 56,
        height: 56,
        body: `<g fill='none' stroke-width='1.6'><circle cx='23' cy='28' r='8'/><circle cx='33' cy='28' r='8'/></g>`,
      };
    case "fireworks":
      return { width: 88, height: 88, body: `${burst(26, 28, 5, 14, 8)}${burst(64, 64, 3, 9, 6)}<circle cx='70' cy='16' r='1.6'/><circle cx='12' cy='72' r='1.6'/>` };
    case "grid":
      return { width: 24, height: 24, body: `<path d='M24 0H0V24' fill='none' stroke-width='1'/>` };
  }
}

function safeColor(colorHex: string): string {
  return HEX.test(colorHex) ? colorHex : "#000000";
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** Complete standalone `<svg>` markup of one tile (single-quoted attributes), or null. */
export function patternTileSvg(kind: Pattern, colorHex: string, opacity: number): string | null {
  const tile = patternTile(kind);
  if (!tile) return null;
  const c = safeColor(colorHex);
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${tile.width}' height='${tile.height}' viewBox='0 0 ${tile.width} ${tile.height}'>` +
    `<g fill='${c}' stroke='${c}' opacity='${clamp01(opacity).toFixed(3).replace(/\.?0+$/, "")}'>${tile.body}</g></svg>`
  );
}

/** `<pattern>` element for embedding in another SVG (used by the social-image exports). */
export function patternDef(kind: Pattern, colorHex: string, opacity: number, id: string): string | null {
  const tile = patternTile(kind);
  if (!tile) return null;
  const c = safeColor(colorHex);
  return (
    `<pattern id='${id}' width='${tile.width}' height='${tile.height}' patternUnits='userSpaceOnUse'>` +
    `<g fill='${c}' stroke='${c}' opacity='${clamp01(opacity)}'>${tile.body}</g></pattern>`
  );
}

/**
 * CSS `background-image` value: `url("data:image/svg+xml,...")` or "none".
 * Safe for use inside inline styles and CSS (everything is percent-encoded).
 */
export function patternDataUri(kind: Pattern, colorHex: string, opacity: number): string {
  const svg = patternTileSvg(kind, colorHex, opacity);
  if (!svg) return "none";
  const encoded = encodeURIComponent(svg)
    .replace(/%20/g, " ")
    .replace(/%3D/g, "=")
    .replace(/%2F/g, "/")
    .replace(/%3A/g, ":")
    .replace(/%2C/g, ",");
  return `url("data:image/svg+xml,${encoded}")`;
}

/** Natural tile size in px for `background-size` (so patterns stay crisp). */
export function patternSize(kind: Pattern): string | undefined {
  const t = patternTile(kind);
  return t ? `${t.width}px ${t.height}px` : undefined;
}
