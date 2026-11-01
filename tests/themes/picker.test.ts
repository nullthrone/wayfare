import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { BUILTIN_THEMES } from "@/themes/builtin";
import { ThemePicker } from "@/components/theme-builder/ThemePicker";
import de from "../../messages/de/themes.json";
import en from "../../messages/en/themes.json";

function Wrapper({ children }: { children?: ReactNode }) {
  // eslint-disable-next-line react/no-children-prop
  return createElement(NextIntlClientProvider, { locale: "de", timeZone: "UTC", messages: { themes: de }, children: null }, children);
}

describe("ThemePicker", () => {
  it("renders one radio per theme with the default checked", () => {
    const html = renderToStaticMarkup(
      createElement(Wrapper, null, createElement(ThemePicker, { themes: BUILTIN_THEMES, name: "themeId", defaultValue: "builtin:wedding", locale: "de" })),
    );
    expect((html.match(/type="radio"/g) ?? []).length).toBe(13);
    expect(html).toContain('role="radiogroup"');
    const tag = (name: string) => html.match(new RegExp(`<input[^>]*value="${name}"[^>]*>`))?.[0] ?? "";
    expect(tag("builtin:wedding")).toContain("checked");
    expect(tag("builtin:wedding")).toContain('name="themeId"');
    expect(tag("builtin:birthday")).not.toContain("checked");
    expect(html).toContain("Trauer &amp; Gedenken");
  });
});

describe("message files", () => {
  const flat = (o: Record<string, unknown>, p = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
  it("themes.json has identical keys in de and en", () => {
    expect(flat(de).sort()).toEqual(flat(en).sort());
  });
});
