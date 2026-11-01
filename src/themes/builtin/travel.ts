import type { Theme } from "@/domain/theme";

/** Kraft-paper postcard from far away: airmail red, handwriting, stamp-style photos. */
export const travel: Theme = {
  id: "builtin:travel",
  version: 1,
  name: { de: "Reise", en: "Travel" },
  occasion: "travel",
  baseThemeId: null,
  colors: { background: "#f3eee2", surface: "#fffaf0", text: "#26343c", muted: "#51656f", accent: "#b23a24", accentContrast: "#ffffff" },
  fonts: { heading: "Caveat", body: "Lora" },
  pattern: { kind: "waves", opacity: 0.12 },
  frame: "deckle",
  ornament: "✈️",
  reactions: [
    { key: "love", emoji: "❤️", label: { de: "Herz", en: "Love" } },
    { key: "dreamy", emoji: "😍", label: { de: "Traumhaft", en: "Dreamy" } },
    { key: "wanderlust", emoji: "✈️", label: { de: "Fernweh", en: "Wanderlust" } },
    { key: "sunny", emoji: "☀️", label: { de: "Sonne", en: "Sunny" } },
    { key: "mountain", emoji: "🏔️", label: { de: "Berge", en: "Mountains" } },
  ],
};
