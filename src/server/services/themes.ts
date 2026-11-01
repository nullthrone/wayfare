import "server-only";
import type { SessionUser } from "@/domain/types";
import type { StoredTheme, Theme } from "@/domain/theme";
import { notImplemented } from "../errors";

/**
 * Theme catalogue = 13 built-ins (src/themes/builtin) + the owner's custom themes
 * + custom themes published instance-wide by an admin (isPublic).
 * Unknown/deleted theme ids resolve to "builtin:neutral" so albums never break.
 */

export async function listAvailableThemes(actor: SessionUser | null): Promise<(Theme | StoredTheme)[]> {
  void actor;
  return notImplemented("listAvailableThemes");
}

/** Never throws: falls back to builtin:neutral. */
export async function resolveTheme(themeId: string): Promise<Theme> {
  void themeId;
  return notImplemented("resolveTheme");
}

/** Create or update an owner's custom theme. Validates with themeSchema. Owner can only edit own themes. */
export async function saveCustomTheme(actor: SessionUser, theme: Theme): Promise<StoredTheme> {
  void actor; void theme;
  return notImplemented("saveCustomTheme");
}

export async function deleteCustomTheme(actor: SessionUser, themeId: string): Promise<void> {
  void actor; void themeId;
  return notImplemented("deleteCustomTheme");
}

/** Admin only: publish/unpublish a custom theme instance-wide. */
export async function setThemePublic(actor: SessionUser, themeId: string, isPublic: boolean): Promise<void> {
  void actor; void themeId; void isPublic;
  return notImplemented("setThemePublic");
}

/** Admin: list all custom themes (for the publish screen). */
export async function listAllCustomThemes(actor: SessionUser): Promise<StoredTheme[]> {
  void actor;
  return notImplemented("listAllCustomThemes");
}
