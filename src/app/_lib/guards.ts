import "server-only";
import { notFound, redirect } from "next/navigation";
import type { SessionUser } from "@/domain/types";
import { AppError } from "@/server/errors";
import { getCurrentUser, hasRole } from "@/server/services/session";

export function loginHref(callbackPath: string): string {
  return `/login?callbackURL=${encodeURIComponent(callbackPath)}`;
}

/**
 * Runs a service call from a page. Maps domain errors to navigation:
 * unauthorized → login, not_found / forbidden → 404 page.
 */
export async function guard<T>(callbackPath: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) {
      if (e.code === "unauthorized") redirect(loginHref(callbackPath));
      if (e.code === "not_found" || e.code === "forbidden") notFound();
    }
    throw e;
  }
}

/** Signed-in user or redirect to login. (Authorisation itself is enforced by the services.) */
export async function requireUserPage(callbackPath: string): Promise<SessionUser> {
  const user = await guard(callbackPath, () => getCurrentUser());
  if (!user) redirect(loginHref(callbackPath));
  return user;
}

/** Owner (or admin); viewers are sent to the onboarding page. */
export async function requireOwnerPage(callbackPath: string): Promise<SessionUser> {
  const user = await requireUserPage(callbackPath);
  if (!hasRole(user, "owner")) redirect("/become-owner");
  return user;
}

export async function requireAdminPage(callbackPath: string): Promise<SessionUser> {
  const user = await requireUserPage(callbackPath);
  if (!hasRole(user, "admin")) notFound();
  return user;
}
