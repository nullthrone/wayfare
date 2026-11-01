import type { Theme } from "@/domain/theme";

/** Rosy pink with raspberry accent, loopy script and tiny hearts. */
export const valentine: Theme = {
  id: "builtin:valentine",
  version: 1,
  name: { de: "Valentinstag", en: "Valentine's Day" },
  occasion: "valentine",
  baseThemeId: null,
  colors: { background: "#fde8ee", surface: "#fff7f9", text: "#4a1530", muted: "#7a3453", accent: "#b81656", accentContrast: "#ffffff" },
  fonts: { heading: "Dancing Script", body: "Quicksand" },
  pattern: { kind: "hearts", opacity: 0.15 },
  frame: "rounded",
  ornament: "💌",
  reactions: [
    { key: "love", emoji: "❤️", label: { de: "Liebe", en: "Love" } },
    { key: "kiss", emoji: "😘", label: { de: "Kuss", en: "Kiss" } },
    { key: "rose", emoji: "🌹", label: { de: "Rose", en: "Rose" } },
    { key: "swoon", emoji: "😍", label: { de: "Verliebt", en: "Smitten" } },
    { key: "cupid", emoji: "💘", label: { de: "Amor", en: "Cupid" } },
  ],
};
