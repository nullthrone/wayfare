import type { FontFamily } from "@/domain/theme";

export type FontCategory = "sans" | "serif" | "script";

export const FONT_CATEGORY: Record<FontFamily, FontCategory> = {
  Inter: "sans",
  Nunito: "sans",
  Quicksand: "sans",
  Fredoka: "sans",
  Lora: "serif",
  Merriweather: "serif",
  "Playfair Display": "serif",
  "Cormorant Garamond": "serif",
  "Dancing Script": "script",
  "Great Vibes": "script",
  Caveat: "script",
};

const FALLBACK: Record<FontCategory, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  script: '"Segoe Script", "Brush Script MT", cursive, ui-serif, Georgia, serif',
};

/** CSS font-family stack for a bundled font, with category-appropriate fallbacks. */
export function fontStack(font: FontFamily): string {
  return `"${font}", ${FALLBACK[FONT_CATEGORY[font]]}`;
}
