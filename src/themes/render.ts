import type { CSSProperties } from "react";
import type { Theme } from "@/domain/theme";
import { fontStack } from "./fonts";
import { patternDataUri } from "./patterns";

export { patternDataUri } from "./patterns";

/** CSS custom properties documented in src/themes/index.ts. */
export function themeStyle(theme: Theme): CSSProperties {
  const vars: Record<string, string> = {
    "--wf-bg": theme.colors.background,
    "--wf-surface": theme.colors.surface,
    "--wf-text": theme.colors.text,
    "--wf-muted": theme.colors.muted,
    "--wf-accent": theme.colors.accent,
    "--wf-accent-contrast": theme.colors.accentContrast,
    "--wf-font-heading": fontStack(theme.fonts.heading),
    "--wf-font-body": fontStack(theme.fonts.body),
    "--wf-pattern": patternDataUri(theme.pattern.kind, theme.colors.accent, theme.pattern.opacity),
  };
  return vars as CSSProperties;
}
