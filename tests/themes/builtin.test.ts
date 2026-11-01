import { describe, expect, it } from "vitest";
import { OCCASIONS, PATTERNS, themeSchema } from "@/domain/theme";
import { BUILTIN_THEMES, NEUTRAL_THEME_ID, getBuiltinTheme } from "@/themes/builtin";
import { MIN_CONTRAST, contrastRatio } from "@/themes/contrast";

describe("built-in themes", () => {
  it("has one theme per occasion with builtin:<occasion> ids", () => {
    expect(BUILTIN_THEMES).toHaveLength(13);
    expect(BUILTIN_THEMES.map((t) => t.occasion).sort()).toEqual([...OCCASIONS].sort());
    for (const t of BUILTIN_THEMES) expect(t.id).toBe(`builtin:${t.occasion}`);
    expect(getBuiltinTheme(NEUTRAL_THEME_ID)?.occasion).toBe("neutral");
    expect(getBuiltinTheme("builtin:nope")).toBeUndefined();
  });

  it.each(BUILTIN_THEMES.map((t) => [t.id, t] as const))("%s validates against themeSchema", (_id, t) => {
    const r = themeSchema.safeParse(t);
    expect(r.success).toBe(true);
    expect(t.reactions.length).toBeGreaterThanOrEqual(3);
    expect(t.reactions.length).toBeLessThanOrEqual(6);
    expect(new Set(t.reactions.map((x) => x.key)).size).toBe(t.reactions.length);
    expect(PATTERNS).toContain(t.pattern.kind);
  });

  it.each(BUILTIN_THEMES.map((t) => [t.id, t] as const))("%s has WCAG AA contrast", (_id, t) => {
    const c = t.colors;
    expect(contrastRatio(c.text, c.background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(c.text, c.surface)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(c.muted, c.background)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(c.accentContrast, c.accent)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("memorial is calm and respectful", () => {
    const m = getBuiltinTheme("builtin:memorial")!;
    expect(m.pattern.kind).toBe("none");
    expect(m.fonts.heading).toBe("Cormorant Garamond");
    const emojis = m.reactions.map((r) => r.emoji);
    for (const e of ["🕯️", "🤍", "🕊️", "🌹"]) expect(emojis).toContain(e);
    for (const bad of ["😂", "🎉", "🥳", "😍", "🥂", "👏"]) expect(emojis).not.toContain(bad);
  });
});
