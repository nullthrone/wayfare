import type { Theme } from "@/domain/theme";

/** Fallback theme for unknown ids and for albums without an occasion. Clean, quiet, works with every photo. */
export const neutral: Theme = {
  id: "builtin:neutral",
  version: 1,
  name: { de: "Neutral", en: "Neutral" },
  occasion: "neutral",
  baseThemeId: null,
  colors: { background: "#f6f5f2", surface: "#ffffff", text: "#1f2328", muted: "#586070", accent: "#3652c9", accentContrast: "#ffffff" },
  fonts: { heading: "Inter", body: "Inter" },
  pattern: { kind: "none", opacity: 0 },
  frame: "soft-shadow",
  ornament: "",
  reactions: [
    { key: "love", emoji: "❤️", label: { de: "Gefällt mir", en: "Love it" } },
    { key: "like", emoji: "👍", label: { de: "Super", en: "Great" } },
    { key: "wow", emoji: "😍", label: { de: "Wow", en: "Wow" } },
    { key: "laugh", emoji: "😂", label: { de: "Lustig", en: "Funny" } },
    { key: "clap", emoji: "👏", label: { de: "Bravo", en: "Bravo" } },
  ],
};
