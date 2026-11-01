import { z } from "zod";

/**
 * Theme definition. Built-in themes live in src/themes/builtin/*.ts,
 * custom themes are stored in the `themes` collection.
 * The same JSON shape is used for export/import in the Theme Builder.
 */

export const OCCASIONS = [
  "birthday",
  "wedding",
  "baby",
  "christmas",
  "easter",
  "new-year",
  "travel",
  "thank-you",
  "anniversary",
  "graduation",
  "valentine",
  "memorial",
  "neutral",
] as const;
export type Occasion = (typeof OCCASIONS)[number];

/** Fonts bundled via @fontsource (self-hosted, no third-party requests — GDPR). */
export const FONT_FAMILIES = [
  "Inter",
  "Nunito",
  "Quicksand",
  "Fredoka",
  "Lora",
  "Merriweather",
  "Playfair Display",
  "Cormorant Garamond",
  "Dancing Script",
  "Great Vibes",
  "Caveat",
] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export const PATTERNS = [
  "none",
  "dots",
  "confetti",
  "hearts",
  "stars",
  "snow",
  "leaves",
  "eggs",
  "waves",
  "balloons",
  "rings",
  "fireworks",
  "grid",
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const FRAMES = ["none", "rounded", "polaroid", "deckle", "stamp", "gold", "soft-shadow"] as const;
export type Frame = (typeof FRAMES)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb");
const localized = z.object({ de: z.string().min(1).max(60), en: z.string().min(1).max(60) });

export const themeReactionSchema = z.object({
  /** Stable key used as counter field name: [a-z0-9-]{1,24} */
  key: z.string().regex(/^[a-z0-9-]{1,24}$/),
  emoji: z.string().min(1).max(8),
  label: localized,
});
export type ThemeReaction = z.infer<typeof themeReactionSchema>;

export const themeSchema = z.object({
  /** Built-ins: `builtin:<occasion>`; custom: nanoid. */
  id: z.string().min(1).max(64),
  /** Schema version of the theme JSON, bump on breaking changes. */
  version: z.literal(1),
  name: localized,
  occasion: z.enum(OCCASIONS),
  /** Base theme the custom theme was derived from (informational). */
  baseThemeId: z.string().nullable(),
  colors: z.object({
    background: hex,
    surface: hex,
    text: hex,
    muted: hex,
    accent: hex,
    /** Text colour on accent backgrounds. */
    accentContrast: hex,
  }),
  fonts: z.object({ heading: z.enum(FONT_FAMILIES), body: z.enum(FONT_FAMILIES) }),
  pattern: z.object({
    kind: z.enum(PATTERNS),
    /** Pattern opacity 0..1 */
    opacity: z.number().min(0).max(1),
  }),
  frame: z.enum(FRAMES),
  /** Emoji ornament shown around the album title, e.g. "🎂". May be empty. */
  ornament: z.string().max(8),
  /** 1..6 reactions offered to viewers. */
  reactions: z.array(themeReactionSchema).min(1).max(6),
});
export type Theme = z.infer<typeof themeSchema>;

/** Stored custom theme = Theme + ownership metadata. */
export interface StoredTheme extends Theme {
  ownerId: string;
  /** Published instance-wide by an admin. */
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
