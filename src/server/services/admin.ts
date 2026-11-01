import "server-only";
import type { InstanceSettings, Invite, OwnerRequest, Role, SessionUser } from "@/domain/types";
import { notImplemented } from "../errors";

/**
 * Instance administration + owner onboarding.
 *
 * Onboarding modes (InstanceSettings.onboardingMode):
 *  - "open":     any signed-in viewer can call becomeOwner() and is promoted immediately
 *  - "approval": viewer calls requestOwnerRole(); admin approves/denies in /admin
 *  - "invite":   admin creates invite links (/invite/{token}); redeeming promotes to owner
 * Invites work in every mode (admins can always invite).
 */

export const DEFAULT_SETTINGS: Omit<InstanceSettings, "updatedAt"> = {
  id: "instance",
  instanceName: "Wayfare",
  onboardingMode: "approval",
  legal: { imprint: "", privacy: "" },
  maxUploadMb: 25,
  maxPhotosPerAlbum: 500,
};

export async function getInstanceSettings(): Promise<InstanceSettings> {
  return notImplemented("getInstanceSettings");
}

export async function updateInstanceSettings(actor: SessionUser, patch: Partial<Omit<InstanceSettings, "id" | "updatedAt">>): Promise<InstanceSettings> {
  void actor; void patch;
  return notImplemented("updateInstanceSettings");
}

export async function becomeOwner(actor: SessionUser): Promise<void> {
  void actor;
  return notImplemented("becomeOwner");
}

export async function requestOwnerRole(actor: SessionUser, message: string): Promise<OwnerRequest> {
  void actor; void message;
  return notImplemented("requestOwnerRole");
}

export async function getMyOwnerRequest(actor: SessionUser): Promise<OwnerRequest | null> {
  void actor;
  return notImplemented("getMyOwnerRequest");
}

export async function listOwnerRequests(actor: SessionUser, status?: OwnerRequest["status"]): Promise<OwnerRequest[]> {
  void actor; void status;
  return notImplemented("listOwnerRequests");
}

export async function decideOwnerRequest(actor: SessionUser, requestId: string, decision: "approved" | "denied"): Promise<void> {
  void actor; void requestId; void decision;
  return notImplemented("decideOwnerRequest");
}

/** Default validity 14 days. If email is given and SMTP is configured, sends the invite link. */
export async function createInvite(actor: SessionUser, opts: { email?: string; validDays?: number }): Promise<Invite & { url: string }> {
  void actor; void opts;
  return notImplemented("createInvite");
}

export async function listInvites(actor: SessionUser): Promise<Invite[]> {
  void actor;
  return notImplemented("listInvites");
}

export async function revokeInvite(actor: SessionUser, inviteId: string): Promise<void> {
  void actor; void inviteId;
  return notImplemented("revokeInvite");
}

/** Returns false if token unknown/expired/used. */
export async function redeemInvite(actor: SessionUser, token: string): Promise<boolean> {
  void actor; void token;
  return notImplemented("redeemInvite");
}

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  banned: boolean;
  createdAt: string;
}

export async function listUsers(actor: SessionUser, opts?: { query?: string; limit?: number; offset?: number }): Promise<UserListItem[]> {
  void actor; void opts;
  return notImplemented("listUsers");
}

/** Admin cannot demote themselves if they are the last admin. */
export async function setUserRole(actor: SessionUser, userId: string, role: Role): Promise<void> {
  void actor; void userId; void role;
  return notImplemented("setUserRole");
}

export async function setUserBanned(actor: SessionUser, userId: string, banned: boolean): Promise<void> {
  void actor; void userId; void banned;
  return notImplemented("setUserBanned");
}

/**
 * GDPR: delete own account. Deletes the user's albums (with photos), comments, reactions,
 * connections, sessions, accounts, passkeys. Last admin cannot delete themselves.
 */
export async function deleteOwnAccount(actor: SessionUser): Promise<void> {
  void actor;
  return notImplemented("deleteOwnAccount");
}
