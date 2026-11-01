import type { Theme } from "@/domain/theme";

/** Ivory paper, antique gold, calligraphy headings, gold double-border frames. */
export const wedding: Theme = {
  id: "builtin:wedding",
  version: 1,
  name: { de: "Hochzeit", en: "Wedding" },
  occasion: "wedding",
  baseThemeId: null,
  colors: { background: "#fbf6ee", surface: "#fffdf9", text: "#3a2f2c", muted: "#6b5a52", accent: "#8a6a1f", accentContrast: "#fffdf9" },
  fonts: { heading: "Great Vibes", body: "Cormorant Garamond" },
  pattern: { kind: "rings", opacity: 0.1 },
  frame: "gold",
  ornament: "💍",
  reactions: [
    { key: "ring", emoji: "💍", label: { de: "Ringe", en: "Rings" } },
    { key: "love", emoji: "❤️", label: { de: "Liebe", en: "Love" } },
    { key: "cheers", emoji: "🥂", label: { de: "Prost", en: "Cheers" } },
    { key: "dreamy", emoji: "😍", label: { de: "Traumhaft", en: "Dreamy" } },
  ],
};
