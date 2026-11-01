import { createElement, type CSSProperties, type ElementType, type ReactNode } from "react";
import type { Theme } from "@/domain/theme";
import { themeStyle } from "./render";

export interface ThemedSurfaceProps {
  theme: Theme;
  className?: string;
  children?: ReactNode;
  /** Element to render, default "div". */
  as?: ElementType;
  style?: CSSProperties;
}

/**
 * Applies a theme: CSS custom properties, background colour + pattern, text colour,
 * body font and `data-wf-frame` (for `.wf-photo-frame`, see frames.css).
 * Server-compatible: no hooks, no client directive.
 */
export function ThemedSurface({ theme, className, children, as = "div", style }: ThemedSurfaceProps) {
  const merged: CSSProperties = {
    ...themeStyle(theme),
    backgroundColor: "var(--wf-bg)",
    backgroundImage: "var(--wf-pattern)",
    color: "var(--wf-text)",
    fontFamily: "var(--wf-font-body)",
    ...style,
  };
  return createElement(as, { className, style: merged, "data-wf-frame": theme.frame, "data-wf-theme": theme.id }, children);
}
