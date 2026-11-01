/**
 * Theme rendering contract (client + server safe, no server-only imports).
 *
 * Usage in pages:
 *   import { themeStyle, ThemedSurface } from "@/themes";
 *   <ThemedSurface theme={theme}> ... album UI ... </ThemedSurface>
 *
 * ThemedSurface sets these CSS custom properties, which all album/viewer UI must use
 * (Tailwind arbitrary values like `bg-[var(--wf-surface)]` or the utilities defined in globals.css):
 *   --wf-bg, --wf-surface, --wf-text, --wf-muted, --wf-accent, --wf-accent-contrast,
 *   --wf-font-heading, --wf-font-body, --wf-pattern (CSS background-image value)
 * and exposes `data-wf-frame="{frame}"` so `.wf-photo-frame` styles in src/themes/frames.css apply.
 *
 * Root layout must import the global CSS once:
 *   import "@/themes/fonts.css";
 *   import "@/themes/frames.css";
 */
export { BUILTIN_THEMES, getBuiltinTheme, NEUTRAL_THEME_ID } from "./builtin";
export { themeStyle, patternDataUri } from "./render";
export { ThemedSurface } from "./ThemedSurface";
export { contrastIssues, contrastRatio, MIN_CONTRAST } from "./contrast";
export { fontStack, FONT_CATEGORY } from "./fonts";
export { validateTheme, parseThemeJson, serializeTheme } from "./validate";
