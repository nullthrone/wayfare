"use server";

import { revalidatePath } from "next/cache";
import type { Theme } from "@/domain/theme";
import { runAction, type ActionResult } from "@/server/action-result";
import { invalid } from "@/server/errors";
import { requireRole } from "@/server/services/session";
import { deleteCustomTheme, saveCustomTheme, setThemePublic } from "@/server/services/themes";
import { validateTheme } from "@/themes/validate";

/**
 * Server actions of the Theme Builder. All errors are mapped to `{ ok: false, error: messageKey }`
 * by runAction; the client translates keys via the `themes.errors.*` messages.
 */

/** Creates (id "new"/unknown) or updates a custom theme. Returns the stored id. */
export async function saveThemeAction(input: Theme): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireRole("owner");
    const v = validateTheme(input);
    if (!v.ok) throw invalid("themeInvalid", v.errors.join("; "));
    const stored = await saveCustomTheme(actor, v.theme);
    revalidatePath("/dashboard/themes");
    return { id: stored.id };
  });
}

export async function deleteThemeAction(themeId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const actor = await requireRole("owner");
    await deleteCustomTheme(actor, String(themeId));
    revalidatePath("/dashboard/themes");
    return null;
  });
}

/** Admin only (enforced in the service). */
export async function setThemePublicAction(themeId: string, isPublic: boolean): Promise<ActionResult<null>> {
  return runAction(async () => {
    const actor = await requireRole("admin");
    await setThemePublic(actor, String(themeId), Boolean(isPublic));
    revalidatePath("/dashboard/themes");
    return null;
  });
}
