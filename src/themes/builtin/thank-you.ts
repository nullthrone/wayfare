import type { Theme } from "@/domain/theme";

/** Blush pink and dusty rose with a flowing script; deckle-edged cards. */
export const thankYou: Theme = {
  id: "builtin:thank-you",
  version: 1,
  name: { de: "Danke", en: "Thank You" },
  occasion: "thank-you",
  baseThemeId: null,
  colors: { background: "#fdf0ee", surface: "#fffaf9", text: "#4a2b29", muted: "#7a504d", accent: "#a8445a", accentContrast: "#ffffff" },
  fonts: { heading: "Dancing Script", body: "Nunito" },
  pattern: { kind: "dots", opacity: 0.12 },
  frame: "deckle",
  ornament: "🌸",
  reactions: [
    { key: "thanks", emoji: "🙏", label: { de: "Danke", en: "Thanks" } },
    { key: "love", emoji: "❤️", label: { de: "Herz", en: "Love" } },
    { key: "flower", emoji: "🌸", label: { de: "Blume", en: "Flower" } },
    { key: "lovely", emoji: "😊", label: { de: "Schön", en: "Lovely" } },
    { key: "hug", emoji: "🤗", label: { de: "Umarmung", en: "Hug" } },
  ],
};
