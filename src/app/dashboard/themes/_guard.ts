import "server-only";
import { notFound, redirect } from "next/navigation";
import type { SessionUser } from "@/domain/types";
import { AppError } from "@/server/errors";
import { requireRole } from "@/server/services/session";

/** Page-level UX guard (the services remain the real authorisation): owners and admins only. */
export async function requireThemeOwner(): Promise<SessionUser> {
  try {
    return await requireRole("owner");
  } catch (e) {
    if (e instanceof AppError && e.code === "unauthorized") redirect("/login");
    if (e instanceof AppError && e.code === "forbidden") notFound();
    throw e;
  }
}
