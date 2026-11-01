import type { Theme } from "@/domain/theme";

/** Soft sky blue, round friendly type, twinkling stars. */
export const baby: Theme = {
  id: "builtin:baby",
  version: 1,
  name: { de: "Baby & Geburt", en: "New Baby" },
  occasion: "baby",
  baseThemeId: null,
  colors: { background: "#eaf4f9", surface: "#ffffff", text: "#27404f", muted: "#4b6577", accent: "#2b7aa6", accentContrast: "#ffffff" },
  fonts: { heading: "Quicksand", body: "Nunito" },
  pattern: { kind: "stars", opacity: 0.14 },
  frame: "rounded",
  ornament: "🍼",
  reactions: [
    { key: "cute", emoji: "🥰", label: { de: "Zuckersüß", en: "Adorable" } },
    { key: "love", emoji: "❤️", label: { de: "Herz", en: "Love" } },
    { key: "baby", emoji: "👶", label: { de: "Willkommen", en: "Welcome" } },
    { key: "teddy", emoji: "🧸", label: { de: "Knuffig", en: "Cuddly" } },
    { key: "star", emoji: "⭐", label: { de: "Sternchen", en: "Little star" } },
  ],
};
