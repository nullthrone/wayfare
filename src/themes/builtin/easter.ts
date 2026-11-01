import type { Theme } from "@/domain/theme";

/** Spring meadow green, lilac accent, hand-written headings, painted eggs. */
export const easter: Theme = {
  id: "builtin:easter",
  version: 1,
  name: { de: "Ostern", en: "Easter" },
  occasion: "easter",
  baseThemeId: null,
  colors: { background: "#f4f9e6", surface: "#fffef8", text: "#33402a", muted: "#566746", accent: "#7a58b3", accentContrast: "#ffffff" },
  fonts: { heading: "Caveat", body: "Quicksand" },
  pattern: { kind: "eggs", opacity: 0.16 },
  frame: "rounded",
  ornament: "🐣",
  reactions: [
    { key: "bunny", emoji: "🐰", label: { de: "Osterhase", en: "Bunny" } },
    { key: "egg", emoji: "🥚", label: { de: "Ei", en: "Egg" } },
    { key: "tulip", emoji: "🌷", label: { de: "Tulpe", en: "Tulip" } },
    { key: "sunny", emoji: "☀️", label: { de: "Sonnig", en: "Sunny" } },
    { key: "love", emoji: "❤️", label: { de: "Herz", en: "Love" } },
  ],
};
