import type { Theme } from "@/domain/theme";

/** Midnight blue with champagne-gold fireworks. */
export const newYear: Theme = {
  id: "builtin:new-year",
  version: 1,
  name: { de: "Silvester & Neujahr", en: "New Year" },
  occasion: "new-year",
  baseThemeId: null,
  colors: { background: "#131a3a", surface: "#1d2552", text: "#f6f1e3", muted: "#bcc4e8", accent: "#f2c14e", accentContrast: "#131a3a" },
  fonts: { heading: "Playfair Display", body: "Inter" },
  pattern: { kind: "fireworks", opacity: 0.2 },
  frame: "soft-shadow",
  ornament: "🎆",
  reactions: [
    { key: "cheers", emoji: "🥂", label: { de: "Prost", en: "Cheers" } },
    { key: "fireworks", emoji: "🎆", label: { de: "Feuerwerk", en: "Fireworks" } },
    { key: "party", emoji: "🎉", label: { de: "Party", en: "Party" } },
    { key: "sparkle", emoji: "✨", label: { de: "Funkeln", en: "Sparkle" } },
    { key: "luck", emoji: "🍀", label: { de: "Glück", en: "Good luck" } },
  ],
};
