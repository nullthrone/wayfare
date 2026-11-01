import type { Theme } from "@/domain/theme";

/** Deep fir green with champagne gold and falling snow; postage-stamp photos. */
export const christmas: Theme = {
  id: "builtin:christmas",
  version: 1,
  name: { de: "Weihnachten", en: "Christmas" },
  occasion: "christmas",
  baseThemeId: null,
  colors: { background: "#0e3b2c", surface: "#15503d", text: "#fbf3e2", muted: "#c5dccd", accent: "#e8b84a", accentContrast: "#1c2b22" },
  fonts: { heading: "Playfair Display", body: "Lora" },
  pattern: { kind: "snow", opacity: 0.18 },
  frame: "stamp",
  ornament: "🎄",
  reactions: [
    { key: "tree", emoji: "🎄", label: { de: "Frohes Fest", en: "Merry" } },
    { key: "gift", emoji: "🎁", label: { de: "Geschenk", en: "Gift" } },
    { key: "love", emoji: "❤️", label: { de: "Herz", en: "Love" } },
    { key: "star", emoji: "⭐", label: { de: "Stern", en: "Star" } },
    { key: "cheers", emoji: "🥂", label: { de: "Prost", en: "Cheers" } },
  ],
};
