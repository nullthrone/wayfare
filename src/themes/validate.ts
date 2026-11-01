import { themeSchema, type Theme } from "@/domain/theme";

export type ThemeValidation =
  | { ok: true; theme: Theme }
  | { ok: false; errors: string[] };

/**
 * Validates untrusted theme JSON (import, server actions, storage) with themeSchema
 * plus the cross-field rules zod can't express here (unique reaction keys).
 * Unknown keys (e.g. ownerId of an exported StoredTheme) are stripped.
 */
export function validateTheme(input: unknown): ThemeValidation {
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const keys = parsed.data.reactions.map((r) => r.key);
  if (new Set(keys).size !== keys.length) {
    return { ok: false, errors: ["reactions: duplicate key"] };
  }
  return { ok: true, theme: parsed.data };
}

/** Parses a JSON string into a validated theme (import in the Theme Builder). */
export function parseThemeJson(json: string): ThemeValidation {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, errors: ["invalid JSON"] };
  }
  return validateTheme(data);
}

/** Serialises a theme for download (strips storage metadata). */
export function serializeTheme(theme: Theme): string {
  const clean = themeSchema.parse(theme);
  return JSON.stringify(clean, null, 2) + "\n";
}
