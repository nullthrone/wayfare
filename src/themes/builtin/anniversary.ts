import type { Theme } from "@/domain/theme";

/** Deep wine red with rose-gold details and a gold double border. */
export const anniversary: Theme = {
  id: "builtin:anniversary",
  version: 1,
  name: { de: "Jubiläum", en: "Anniversary" },
  occasion: "anniversary",
  baseThemeId: null,
  colors: { background: "#3a1220", surface: "#4c1b2d", text: "#fbeee8", muted: "#e6c6c4", accent: "#e2b48f", accentContrast: "#3a1220" },
  fonts: { heading: "Playfair Display", body: "Lora" },
  pattern: { kind: "dots", opacity: 0.14 },
  frame: "gold",
  ornament: "🥂",
  reactions: [
    { key: "love", emoji: "❤️", label: { de: "Liebe", en: "Love" } },
    { key: "rose", emoji: "🌹", label: { de: "Rose", en: "Rose" } },
    { key: "cheers", emoji: "🥂", label: { de: "Prost", en: "Cheers" } },
    { key: "sparkle", emoji: "✨", label: { de: "Funkeln", en: "Sparkle" } },
    { key: "kiss", emoji: "😘", label: { de: "Kuss", en: "Kiss" } },
  ],
};
