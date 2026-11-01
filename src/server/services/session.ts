import "server-only";
import { headers } from "next/headers";
import type { Role, SessionUser } from "@/domain/types";
import { forbidden, unauthorized } from "../errors";
import { getAuth } from "../auth/auth";

/**
 * Session helpers on top of Better Auth (src/server/auth/auth.ts).
 * Role hierarchy: admin ⊃ owner ⊃ viewer.
 *
 * Role assignment rules (implemented in the Better Auth databaseHooks):
 *  - New users get "viewer".
 *  - Users whose e-mail is in WAYFARE_ADMIN_EMAILS get "admin" on sign-up AND are promoted on sign-in.
 *  - If no admin exists at all, the first user to sign up becomes "admin" (bootstrap).
 */

const ROLES: readonly Role[] = ["viewer", "owner", "admin"];

/** The signed-in user, or null when signed out or blocked (banned users count as signed out). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as typeof session.user & { role?: string; banned?: boolean | null };
  if (u.banned) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    role: ROLES.includes(u.role as Role) ? (u.role as Role) : "viewer",
    banned: false,
  };
}

/** Throws AppError("unauthorized") if not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/** Throws unauthorized / forbidden. requireRole("owner") also accepts admins. */
export async function requireRole(role: Exclude<Role, "viewer">): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user, role)) throw forbidden();
  return user;
}

export function hasRole(user: SessionUser | null, role: Role): boolean {
  if (!user || user.banned) return false;
  const rank: Record<Role, number> = { viewer: 0, owner: 1, admin: 2 };
  return rank[user.role] >= rank[role];
}
