import { describe, expect, it } from "vitest";
import { PATTERNS } from "@/domain/theme";
import { patternDataUri, patternTileSvg } from "@/themes/patterns";
import { themeStyle } from "@/themes/render";
import { getBuiltinTheme } from "@/themes/builtin";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemedSurface } from "@/themes/ThemedSurface";

describe("patterns", () => {
  it("returns none for kind none", () => {
    expect(patternDataUri("none", "#ff0000", 0.5)).toBe("none");
  });

  it.each(PATTERNS.filter((p) => p !== "none"))("patternDataUri(%s) is a valid data URI with a parseable SVG tile", (kind) => {
    const uri = patternDataUri(kind, "#aa3366", 0.2);
    expect(uri).toMatch(/^url\("data:image\/svg\+xml,[^"]+"\)$/);
    expect(uri).not.toContain("#"); // must be percent-encoded
    const svg = patternTileSvg(kind, "#aa3366", 0.2)!;
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("#aa3366");
    expect(svg.endsWith("</svg>")).toBe(true);
    // balanced tags (crude well-formedness check)
    expect((svg.match(/<(?!\/)[a-z]+/g) ?? []).length).toBe(
      (svg.match(/<\/[a-z]+>/g) ?? []).length + (svg.match(/\/>/g) ?? []).length,
    );
    const decoded = decodeURIComponent(uri.slice(`url("data:image/svg+xml,`.length, -2));
    expect(decoded).toBe(svg);
  });

  it("rejects malicious colours", () => {
    const uri = decodeURIComponent(patternDataUri("dots", '"/><script>', 1));
    expect(uri).not.toContain("script");
  });
});

describe("themeStyle / ThemedSurface", () => {
  it("sets all custom properties", () => {
    const t = getBuiltinTheme("builtin:wedding")!;
    const style = themeStyle(t) as Record<string, string>;
    for (const k of ["--wf-bg", "--wf-surface", "--wf-text", "--wf-muted", "--wf-accent", "--wf-accent-contrast", "--wf-font-heading", "--wf-font-body", "--wf-pattern"]) {
      expect(style[k]).toBeTruthy();
    }
    expect(style["--wf-font-heading"]).toContain('"Great Vibes"');
    expect(style["--wf-font-heading"]).toContain("cursive");
    expect(style["--wf-pattern"]).toMatch(/^url\(/);
    expect(style["--wf-bg"]).toBe(t.colors.background);
  });

  it("renders data-wf-frame on the root", () => {
    const t = getBuiltinTheme("builtin:birthday")!;
    const html = renderToStaticMarkup(createElement(ThemedSurface, { theme: t, as: "section", className: "x" }, "hi"));
    expect(html).toContain('data-wf-frame="polaroid"');
    expect(html.startsWith("<section")).toBe(true);
    expect(html).toContain("--wf-accent:#c2410c");
  });
});
