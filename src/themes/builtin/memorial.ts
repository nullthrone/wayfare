import type { Theme } from "@/domain/theme";

/**
 * Trauer & Gedenken. Deliberately calm: muted greys, serif type, no pattern, no playful frame,
 * and only respectful reactions (no laughing / party emojis).
 */
export const memorial: Theme = {
  id: "builtin:memorial",
  version: 1,
  name: { de: "Trauer & Gedenken", en: "In Memoriam" },
  occasion: "memorial",
  baseThemeId: null,
  colors: { background: "#ecebe7", surface: "#f7f6f3", text: "#2b2f35", muted: "#545a63", accent: "#4f5c6b", accentContrast: "#ffffff" },
  fonts: { heading: "Cormorant Garamond", body: "Lora" },
  pattern: { kind: "none", opacity: 0 },
  frame: "none",
  ornament: "🕯️",
  reactions: [
    { key: "candle", emoji: "🕯️", label: { de: "Kerze", en: "Candle" } },
    { key: "white-heart", emoji: "🤍", label: { de: "Weißes Herz", en: "White heart" } },
    { key: "dove", emoji: "🕊️", label: { de: "Taube", en: "Dove" } },
    { key: "rose", emoji: "🌹", label: { de: "Rose", en: "Rose" } },
  ],
};
