import "server-only";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { InstanceSettings, Invite, OwnerRequest, Role, SessionUser } from "@/domain/types";
import { config } from "../config";
import { getDb, getMailer } from "../container";
import { randomToken } from "../crypto";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { COLLECTIONS, type Doc } from "../ports/document-store";
import {
  getAuthUser,
  normalizeAuthUser,
  normalizeComment,
  normalizeInvite,
  normalizeOwnerRequest,
  normalizePhoto,
  normalizeAlbum,
  nowIso,
  toIso,
} from "../repo";
import { deleteAlbum } from "./albums";
import { afterPhotoRemoved, purgePhoto } from "./photos";
import { mailTranslator } from "./notifications";
import { hasRole } from "./session";

/**
 * Instance administration + owner onboarding.
 *
 * Onboarding modes (InstanceSettings.onboardingMode):
 *  - "open":     any signed-in viewer can call becomeOwner() and is promoted immediately
 *  - "approval": viewer calls requestOwnerRole(); admin approves/denies in /admin
 *  - "invite":   admin creates invite links (/invite/{token}); redeeming promotes to owner
 * Invites work in every mode (admins can always invite).
 *
 * Role changes write `role` on the Better Auth user document. If Better Auth session cookie
 * caching is enabled the new role becomes visible on the next session refresh.
 */

export const DEFAULT_SETTINGS: Omit<InstanceSettings, "updatedAt"> = {
  id: "instance",
  instanceName: "Wayfare",
  onboardingMode: "approval",
  legal: { imprint: "", privacy: "" },
  maxUploadMb: 25,
  maxPhotosPerAlbum: 500,
};

const SETTINGS_ID = "instance";

function requireAdmin(actor: SessionUser | null | undefined): asserts actor is SessionUser {
  if (!hasRole(actor ?? null, "admin")) throw forbidden();
}

function requireNotBanned(actor: SessionUser): void {
  if (!actor || actor.banned) throw forbidden("accountBanned");
}

// ------------------------------------------------------------------ settings

export async function getInstanceSettings(): Promise<InstanceSettings> {
  const raw = await (await getDb()).get<Doc>(COLLECTIONS.settings.name, SETTINGS_ID);
  const r = (raw ?? {}) as Record<string, unknown>;
  const legal = (r.legal && typeof r.legal === "object" ? r.legal : {}) as Record<string, unknown>;
  const posInt = (v: unknown, d: number, min: number) => (typeof v === "number" && Number.isFinite(v) && v >= min ? Math.floor(v) : d);
  return {
    id: "instance",
    instanceName: typeof r.instanceName === "string" && r.instanceName.trim() ? r.instanceName : DEFAULT_SETTINGS.instanceName,
    onboardingMode: r.onboardingMode === "open" || r.onboardingMode === "invite" || r.onboardingMode === "approval" ? r.onboardingMode : DEFAULT_SETTINGS.onboardingMode,
    legal: {
      imprint: typeof legal.imprint === "string" ? legal.imprint : DEFAULT_SETTINGS.legal.imprint,
      privacy: typeof legal.privacy === "string" ? legal.privacy : DEFAULT_SETTINGS.legal.privacy,
    },
    maxUploadMb: posInt(r.maxUploadMb, DEFAULT_SETTINGS.maxUploadMb, 1),
    maxPhotosPerAlbum: posInt(r.maxPhotosPerAlbum, DEFAULT_SETTINGS.maxPhotosPerAlbum, 0),
    updatedAt: toIso(r.updatedAt, new Date(0).toISOString())!,
  };
}

const settingsPatchSchema = z.object({
  instanceName: z.string().trim().min(1, "instanceNameRequired").max(80, "instanceNameTooLong").optional(),
  onboardingMode: z.enum(["open", "approval", "invite"]).optional(),
  legal: z
    .object({
      imprint: z.string().max(50_000, "legalTooLong"),
      privacy: z.string().max(50_000, "legalTooLong"),
    })
    .partial()
    .optional(),
  maxUploadMb: z.number().int().min(1, "settingsOutOfRange").max(500, "settingsOutOfRange").optional(),
  maxPhotosPerAlbum: z.number().int().min(0, "settingsOutOfRange").max(100_000, "settingsOutOfRange").optional(),
});

export async function updateInstanceSettings(actor: SessionUser, patch: Partial<Omit<InstanceSettings, "id" | "updatedAt">>): Promise<InstanceSettings> {
  requireAdmin(actor);
  const parsed = settingsPatchSchema.safeParse(patch);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "";
    throw invalid(/^[a-z][A-Za-z0-9]+$/.test(msg) ? msg : "invalidInput");
  }
  const current = await getInstanceSettings();
  const next: InstanceSettings = {
    ...current,
    ...parsed.data,
    legal: { ...current.legal, ...(parsed.data.legal ?? {}) },
    id: "instance",
    updatedAt: nowIso(),
  };
  await (await getDb()).put(COLLECTIONS.settings.name, next as unknown as Doc);
  return next;
}

// ------------------------------------------------------------------ onboarding

async function setRole(userId: string, role: Role): Promise<void> {
  await (await getDb()).update(COLLECTIONS.authUser.name, userId, { role, updatedAt: nowIso() });
}

export async function becomeOwner(actor: SessionUser): Promise<void> {
  requireNotBanned(actor);
  const settings = await getInstanceSettings();
  if (settings.onboardingMode !== "open") throw forbidden("onboardingNotOpen");
  if (hasRole(actor, "owner")) return;
  await setRole(actor.id, "owner");
}

export async function requestOwnerRole(actor: SessionUser, message: string): Promise<OwnerRequest> {
  requireNotBanned(actor);
  const settings = await getInstanceSettings();
  if (settings.onboardingMode !== "approval") throw forbidden("onboardingNotApproval");
  if (hasRole(actor, "owner")) throw conflict("alreadyOwner");
  const text = String(message ?? "").trim();
  if (text.length > 500) throw invalid("requestMessageTooLong");

  const db = await getDb();
  const pending = await db.count(COLLECTIONS.ownerRequests.name, {
    where: [
      { field: "userId", op: "eq", value: actor.id },
      { field: "status", op: "eq", value: "pending" },
    ],
  });
  if (pending > 0) throw conflict("requestPending");

  const request: OwnerRequest = {
    id: nanoid(),
    userId: actor.id,
    userName: actor.name,
    userEmail: actor.email,
    message: text,
    status: "pending",
    decidedBy: null,
    createdAt: nowIso(),
    decidedAt: null,
  };
  await db.create(COLLECTIONS.ownerRequests.name, request as unknown as Doc);
  return request;
}

/** Most recent request of the user (any status), or null. */
export async function getMyOwnerRequest(actor: SessionUser): Promise<OwnerRequest | null> {
  const docs = await (await getDb()).find<Doc>(COLLECTIONS.ownerRequests.name, {
    where: [{ field: "userId", op: "eq", value: actor.id }],
    sort: [{ field: "createdAt", direction: "desc" }],
    limit: 1,
  });
  return docs[0] ? normalizeOwnerRequest(docs[0]) : null;
}

export async function listOwnerRequests(actor: SessionUser, status?: OwnerRequest["status"]): Promise<OwnerRequest[]> {
  requireAdmin(actor);
  const docs = await (await getDb()).find<Doc>(COLLECTIONS.ownerRequests.name, {
    where: status ? [{ field: "status", op: "eq", value: status }] : [],
    sort: [{ field: "createdAt", direction: "desc" }],
  });
  return docs.map(normalizeOwnerRequest);
}

export async function decideOwnerRequest(actor: SessionUser, requestId: string, decision: "approved" | "denied"): Promise<void> {
  requireAdmin(actor);
  if (decision !== "approved" && decision !== "denied") throw invalid("invalidInput");
  const db = await getDb();
  const doc = await db.get<Doc>(COLLECTIONS.ownerRequests.name, requestId);
  if (!doc) throw notFound("requestNotFound");
  const request = normalizeOwnerRequest(doc);
  if (request.status !== "pending") throw conflict("requestAlreadyDecided");
  await db.update(COLLECTIONS.ownerRequests.name, request.id, { status: decision, decidedBy: actor.id, decidedAt: nowIso() });
  if (decision === "approved") {
    const user = await getAuthUser(request.userId);
    if (user && user.role === "viewer") await setRole(user.id, "owner");
  }
}

// ------------------------------------------------------------------ invites

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Default validity 14 days. If email is given and SMTP is configured, sends the invite link. */
export async function createInvite(actor: SessionUser, opts: { email?: string; validDays?: number }): Promise<Invite & { url: string }> {
  requireAdmin(actor);
  const validDays = opts.validDays ?? 14;
  if (!Number.isInteger(validDays) || validDays < 1 || validDays > 365) throw invalid("inviteDaysInvalid");
  const email = opts.email?.trim() ? opts.email.trim() : null;
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) throw invalid("emailInvalid");

  const token = randomToken(24);
  const now = Date.now();
  const invite: Invite = {
    id: nanoid(),
    token,
    createdBy: actor.id,
    email,
    usedBy: null,
    usedAt: null,
    expiresAt: new Date(now + validDays * 86_400_000).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  await (await getDb()).create(COLLECTIONS.invites.name, invite as unknown as Doc);
  const url = `${config().baseUrl}/invite/${token}`;

  if (email) {
    try {
      const mailer = await getMailer();
      if (mailer.kind === "smtp") {
        const inviter = await getAuthUser(actor.id);
        const t = mailTranslator(inviter?.locale);
        const settings = await getInstanceSettings();
        await mailer.send({
          to: email,
          subject: t("invite.subject", { instance: settings.instanceName }),
          text: t("invite.body", { inviter: actor.name || actor.email, instance: settings.instanceName, url, days: validDays }),
        });
      }
    } catch (err) {
      console.error("[admin] sending invite mail failed", err);
    }
  }
  return { ...invite, url };
}

export async function listInvites(actor: SessionUser): Promise<Invite[]> {
  requireAdmin(actor);
  const docs = await (await getDb()).find<Doc>(COLLECTIONS.invites.name, { sort: [{ field: "createdAt", direction: "desc" }] });
  return docs.map(normalizeInvite);
}

export async function revokeInvite(actor: SessionUser, inviteId: string): Promise<void> {
  requireAdmin(actor);
  const db = await getDb();
  const doc = await db.get<Doc>(COLLECTIONS.invites.name, inviteId);
  if (!doc) throw notFound("inviteNotFound");
  await db.delete(COLLECTIONS.invites.name, inviteId);
}

/**
 * Returns false if token unknown/expired/used (or the user is banned). Promotes viewers to owner.
 * Users who are already owner/admin get `true` and the invite is NOT consumed.
 */
export async function redeemInvite(actor: SessionUser, token: string): Promise<boolean> {
  if (!actor || actor.banned || typeof token !== "string" || token.length < 8 || token.length > 128) return false;
  const db = await getDb();
  const doc = await db.findOne<Doc>(COLLECTIONS.invites.name, { where: [{ field: "token", op: "eq", value: token }] });
  if (!doc) return false;
  const invite = normalizeInvite(doc);
  if (invite.usedBy || Date.parse(invite.expiresAt) <= Date.now()) return false;
  if (hasRole(actor, "owner")) return true;
  await db.update(COLLECTIONS.invites.name, invite.id, { usedBy: actor.id, usedAt: nowIso() });
  await setRole(actor.id, "owner");
  return true;
}

// ------------------------------------------------------------------ users

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
  requireAdmin(actor);
  const db = await getDb();
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 500);
  const offset = Math.max(opts?.offset ?? 0, 0);
  const q = opts?.query?.trim().toLowerCase();
  const toItem = (d: Doc): UserListItem => {
    const u = normalizeAuthUser(d);
    return { id: u.id, name: u.name, email: u.email, image: u.image, role: u.role, banned: u.banned, createdAt: u.createdAt };
  };
  if (!q) {
    const docs = await db.find<Doc>(COLLECTIONS.authUser.name, { sort: [{ field: "createdAt", direction: "desc" }], limit, offset });
    return docs.map(toItem);
  }
  // Case-insensitive substring search is done in memory (adapters differ in case sensitivity).
  const docs = await db.find<Doc>(COLLECTIONS.authUser.name, { sort: [{ field: "createdAt", direction: "desc" }], limit: 5000 });
  return docs
    .map(toItem)
    .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    .slice(offset, offset + limit);
}

async function adminCount(): Promise<number> {
  return (await getDb()).count(COLLECTIONS.authUser.name, { where: [{ field: "role", op: "eq", value: "admin" }] });
}

/** Admin cannot demote themselves if they are the last admin (nor can anyone demote the last admin). */
export async function setUserRole(actor: SessionUser, userId: string, role: Role): Promise<void> {
  requireAdmin(actor);
  if (role !== "admin" && role !== "owner" && role !== "viewer") throw invalid("invalidInput");
  const user = await getAuthUser(userId);
  if (!user) throw notFound("userNotFound");
  if (user.role === role) return;
  if (user.role === "admin" && (await adminCount()) <= 1) throw conflict("lastAdmin");
  await setRole(userId, role);
}

export async function setUserBanned(actor: SessionUser, userId: string, banned: boolean): Promise<void> {
  requireAdmin(actor);
  if (userId === actor.id) throw invalid("cannotBanSelf");
  const user = await getAuthUser(userId);
  if (!user) throw notFound("userNotFound");
  const db = await getDb();
  await db.update(COLLECTIONS.authUser.name, userId, { banned, updatedAt: nowIso() });
  if (banned) await db.deleteMany(COLLECTIONS.authSession.name, { where: [{ field: "userId", op: "eq", value: userId }] });
}

/**
 * GDPR: delete own account. Deletes the user's albums (with photos), comments, reactions,
 * connections, sessions, accounts, passkeys. Last admin cannot delete themselves.
 *
 * Also removed: photos the user uploaded as a guest to other albums, reports they filed,
 * owner requests, pending notifications, custom themes they own, verification tokens.
 */
export async function deleteOwnAccount(actor: SessionUser): Promise<void> {
  if (!actor) throw forbidden("unauthorized");
  const db = await getDb();
  const user = await getAuthUser(actor.id);
  if (!user) throw notFound("userNotFound");
  if (user.role === "admin" && (await adminCount()) <= 1) throw conflict("lastAdmin");

  const mine = (field: string) => ({ where: [{ field, op: "eq" as const, value: actor.id }] });

  // 1. own albums (cascades photos, blobs, comments, reactions, reports of those albums)
  const albums = await db.find<Doc>(COLLECTIONS.albums.name, mine("ownerId"));
  for (const a of albums) await deleteAlbum({ ...actor, banned: false }, a.id);

  // 2. photos uploaded to other people's albums
  const uploaded = await db.find<Doc>(COLLECTIONS.photos.name, mine("uploadedBy"));
  for (const d of uploaded) {
    const photo = normalizePhoto(d);
    await purgePhoto(photo);
    const album = await db.get<Doc>(COLLECTIONS.albums.name, photo.albumId);
    if (album) await afterPhotoRemoved(normalizeAlbum(album), photo);
  }

  // 3. comments authored (keep visible counters honest), reports about/by them
  const comments = (await db.find<Doc>(COLLECTIONS.comments.name, mine("authorId"))).map(normalizeComment);
  for (const c of comments) {
    if (c.status === "visible") await db.increment(COLLECTIONS.photos.name, c.photoId, "commentCount", -1);
  }
  if (comments.length > 0) {
    await db.deleteMany(COLLECTIONS.reports.name, { where: [{ field: "commentId", op: "in", value: comments.map((c) => c.id) }] });
  }
  await db.deleteMany(COLLECTIONS.comments.name, mine("authorId"));
  await db.deleteMany(COLLECTIONS.reports.name, mine("reporterId"));

  // 4. reactions (decrement counters)
  const reactions = await db.find<Doc>(COLLECTIONS.reactions.name, mine("userId"));
  for (const r of reactions) await db.increment(COLLECTIONS.photos.name, String(r.photoId), `reactionCounts.${String(r.key)}`, -1);
  await db.deleteMany(COLLECTIONS.reactions.name, mine("userId"));

  // 5. misc user-owned data
  await db.deleteMany(COLLECTIONS.connections.name, mine("userId"));
  await db.deleteMany(COLLECTIONS.pendingNotifications.name, mine("ownerId"));
  await db.deleteMany(COLLECTIONS.ownerRequests.name, mine("userId"));
  await db.deleteMany(COLLECTIONS.themes.name, mine("ownerId"));
  if (user.email) await db.deleteMany(COLLECTIONS.authVerification.name, { where: [{ field: "identifier", op: "eq", value: user.email }] });

  // 6. auth records
  await db.deleteMany(COLLECTIONS.authSession.name, mine("userId"));
  await db.deleteMany(COLLECTIONS.authAccount.name, mine("userId"));
  await db.deleteMany(COLLECTIONS.authPasskey.name, mine("userId"));
  await db.delete(COLLECTIONS.authUser.name, actor.id);
}
