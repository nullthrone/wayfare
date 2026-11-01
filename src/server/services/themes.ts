import "server-only";
import { nanoid } from "nanoid";
import type { SessionUser } from "@/domain/types";
import { themeSchema, type StoredTheme, type Theme } from "@/domain/theme";
import { BUILTIN_THEMES, NEUTRAL_THEME_ID, getBuiltinTheme } from "@/themes/builtin";
import { validateTheme } from "@/themes/validate";
import { COLLECTIONS } from "../ports/document-store";
import { getDb } from "../container";
import { forbidden, invalid, limitExceeded, notFound, unauthorized } from "../errors";

/**
 * Theme catalogue = 13 built-ins (src/themes/builtin) + the owner's custom themes
 * + custom themes published instance-wide by an admin (isPublic).
 * Unknown/deleted theme ids resolve to "builtin:neutral" so albums never break.
 */

const COL = COLLECTIONS.themes.name;
/** Mapped type (instead of the interface) so it satisfies the DocumentStore `Doc` constraint. */
type ThemeDoc = { [K in keyof StoredTheme]: StoredTheme[K] };
/** Soft limit of custom themes per user. */
export const MAX_CUSTOM_THEMES_PER_USER = 50;

/** Local role check (admin ⊃ owner); keeps this service independent of the auth stack. */
const hasRole = (u: SessionUser | null, role: "owner" | "admin") =>
  !!u && !u.banned && (role === "owner" ? u.role === "owner" || u.role === "admin" : u.role === "admin");

const fallback = (): Theme => getBuiltinTheme(NEUTRAL_THEME_ID)!;

/** Built-ins first, then the actor's own custom themes, then themes published by an admin. */
export async function listAvailableThemes(actor: SessionUser | null): Promise<(Theme | StoredTheme)[]> {
  const db = await getDb();
  const own = actor
    ? await db.find<ThemeDoc>(COL, { where: [{ field: "ownerId", op: "eq", value: actor.id }], sort: [{ field: "createdAt", direction: "asc" }] })
    : [];
  const pub = await db.find<ThemeDoc>(COL, { where: [{ field: "isPublic", op: "eq", value: true }], sort: [{ field: "createdAt", direction: "asc" }] });
  const seen = new Set<string>(BUILTIN_THEMES.map((t) => t.id));
  const out: (Theme | StoredTheme)[] = [...BUILTIN_THEMES];
  for (const t of [...own, ...pub]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/** Never throws: falls back to builtin:neutral. */
export async function resolveTheme(themeId: string): Promise<Theme> {
  const builtin = getBuiltinTheme(themeId);
  if (builtin) return builtin;
  try {
    const stored = await (await getDb()).get<ThemeDoc>(COL, themeId);
    if (!stored) return fallback();
    const parsed = themeSchema.safeParse(stored);
    return parsed.success ? parsed.data : fallback();
  } catch {
    return fallback();
  }
}

/**
 * Create or update an owner's custom theme. Validates with themeSchema.
 * - Existing custom theme with `theme.id`: only its owner may update it.
 * - Unknown id (or a builtin id): a new theme with a fresh id is created.
 * Returns the stored theme (use its `id`).
 */
export async function saveCustomTheme(actor: SessionUser, theme: Theme): Promise<StoredTheme> {
  if (!hasRole(actor, "owner")) throw actor ? forbidden() : unauthorized();
  const v = validateTheme(theme);
  if (!v.ok) throw invalid("themeInvalid", v.errors.join("; "));
  const db = await getDb();
  const now = new Date().toISOString();

  const existing = v.theme.id.startsWith("builtin:") ? null : await db.get<ThemeDoc>(COL, v.theme.id);
  if (existing) {
    if (existing.ownerId !== actor.id) throw forbidden();
    const updated: ThemeDoc = { ...v.theme, id: existing.id, ownerId: existing.ownerId, isPublic: existing.isPublic, createdAt: existing.createdAt, updatedAt: now };
    await db.put(COL, updated);
    return updated;
  }

  const count = await db.count(COL, { where: [{ field: "ownerId", op: "eq", value: actor.id }] });
  if (count >= MAX_CUSTOM_THEMES_PER_USER) throw limitExceeded("themeLimit");
  const created: ThemeDoc = { ...v.theme, id: nanoid(), ownerId: actor.id, isPublic: false, createdAt: now, updatedAt: now };
  await db.create(COL, created);
  return created;
}

export async function deleteCustomTheme(actor: SessionUser, themeId: string): Promise<void> {
  if (!hasRole(actor, "owner")) throw actor ? forbidden() : unauthorized();
  if (themeId.startsWith("builtin:")) throw forbidden();
  const db = await getDb();
  const existing = await db.get<ThemeDoc>(COL, themeId);
  if (!existing) throw notFound("themeNotFound");
  if (existing.ownerId !== actor.id && !hasRole(actor, "admin")) throw forbidden();
  await db.delete(COL, themeId);
}

/** Admin only: publish/unpublish a custom theme instance-wide. */
export async function setThemePublic(actor: SessionUser, themeId: string, isPublic: boolean): Promise<void> {
  if (!hasRole(actor, "admin")) throw forbidden();
  const db = await getDb();
  const updated = await db.update<ThemeDoc>(COL, themeId, { isPublic, updatedAt: new Date().toISOString() });
  if (!updated) throw notFound("themeNotFound");
}

/** Admin: list all custom themes (for the publish screen). */
export async function listAllCustomThemes(actor: SessionUser): Promise<StoredTheme[]> {
  if (!hasRole(actor, "admin")) throw forbidden();
  return (await getDb()).find<ThemeDoc>(COL, { sort: [{ field: "createdAt", direction: "desc" }] });
}
