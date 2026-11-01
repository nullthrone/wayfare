/** WCAG 2.x colour contrast helpers (pure, client + server safe). */

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Minimum ratio for normal text (WCAG AA). */
export const MIN_CONTRAST = 4.5;

export interface ContrastIssue {
  pair: "text-background" | "text-surface" | "muted-background" | "accentContrast-accent";
  ratio: number;
}

/** Returns all colour pairs of a theme palette that fall below WCAG AA (4.5:1). */
export function contrastIssues(colors: {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentContrast: string;
}): ContrastIssue[] {
  const checks: [ContrastIssue["pair"], string, string][] = [
    ["text-background", colors.text, colors.background],
    ["text-surface", colors.text, colors.surface],
    ["muted-background", colors.muted, colors.background],
    ["accentContrast-accent", colors.accentContrast, colors.accent],
  ];
  return checks
    .map(([pair, fg, bg]) => ({ pair, ratio: contrastRatio(fg, bg) }))
    .filter((c) => c.ratio < MIN_CONTRAST);
}
