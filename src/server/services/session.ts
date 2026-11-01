import "server-only";
import type { Role, SessionUser } from "@/domain/types";
import { notImplemented } from "../errors";

/**
 * Session helpers on top of Better Auth (src/server/auth/auth.ts).
 * Role hierarchy: admin ⊃ owner ⊃ viewer.
 *
 * Role assignment rules (implemented in the Better Auth databaseHooks):
 *  - New users get "viewer".
 *  - Users whose e-mail is in WAYFARE_ADMIN_EMAILS get "admin" on sign-up AND are promoted on sign-in.
 *  - If no admin exists at all, the first user to sign up becomes "admin" (bootstrap).
 */

export async function getCurrentUser(): Promise<SessionUser | null> {
  return notImplemented("getCurrentUser");
}

/** Throws AppError("unauthorized") if not signed in. */
export async function requireUser(): Promise<SessionUser> {
  return notImplemented("requireUser");
}

/** Throws unauthorized / forbidden. requireRole("owner") also accepts admins. */
export async function requireRole(role: Exclude<Role, "viewer">): Promise<SessionUser> {
  void role;
  return notImplemented("requireRole");
}

export function hasRole(user: SessionUser | null, role: Role): boolean {
  if (!user || user.banned) return false;
  const rank: Record<Role, number> = { viewer: 0, owner: 1, admin: 2 };
  return rank[user.role] >= rank[role];
}
