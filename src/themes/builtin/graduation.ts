import type { Theme } from "@/domain/theme";

/** Notebook-grid paper, navy ink and a maroon accent. */
export const graduation: Theme = {
  id: "builtin:graduation",
  version: 1,
  name: { de: "Abschluss", en: "Graduation" },
  occasion: "graduation",
  baseThemeId: null,
  colors: { background: "#eef1f7", surface: "#ffffff", text: "#1b2540", muted: "#47557a", accent: "#8c1d2f", accentContrast: "#ffffff" },
  fonts: { heading: "Merriweather", body: "Inter" },
  pattern: { kind: "grid", opacity: 0.1 },
  frame: "soft-shadow",
  ornament: "🎓",
  reactions: [
    { key: "congrats", emoji: "🎓", label: { de: "Glückwunsch", en: "Congrats" } },
    { key: "clap", emoji: "👏", label: { de: "Bravo", en: "Bravo" } },
    { key: "party", emoji: "🎉", label: { de: "Party", en: "Party" } },
    { key: "star", emoji: "🌟", label: { de: "Spitze", en: "Brilliant" } },
    { key: "strong", emoji: "💪", label: { de: "Stark", en: "Strong" } },
  ],
};
