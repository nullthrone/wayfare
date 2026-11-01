import type { Theme } from "@/domain/theme";

/** Warm cream, tangerine accent, bubbly rounded type and confetti. */
export const birthday: Theme = {
  id: "builtin:birthday",
  version: 1,
  name: { de: "Geburtstag", en: "Birthday" },
  occasion: "birthday",
  baseThemeId: null,
  colors: { background: "#fff3df", surface: "#fffcf6", text: "#3b2314", muted: "#7a4a29", accent: "#c2410c", accentContrast: "#ffffff" },
  fonts: { heading: "Fredoka", body: "Nunito" },
  pattern: { kind: "confetti", opacity: 0.16 },
  frame: "polaroid",
  ornament: "🎂",
  reactions: [
    { key: "cake", emoji: "🎂", label: { de: "Torte", en: "Cake" } },
    { key: "party", emoji: "🎉", label: { de: "Party", en: "Party" } },
    { key: "love", emoji: "❤️", label: { de: "Herz", en: "Love" } },
    { key: "laugh", emoji: "😂", label: { de: "Lustig", en: "Funny" } },
    { key: "hooray", emoji: "🥳", label: { de: "Hurra", en: "Hooray" } },
  ],
};
