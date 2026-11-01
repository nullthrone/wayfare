import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/container", async () => (await import("./fakes")).containerMock);
vi.mock("next/headers", async () => (await import("./fakes")).nextHeadersMock);
vi.mock("@/server/services/session", async () => (await import("./fakes")).sessionMock);
vi.mock("@/server/services/themes", async () => (await import("./fakes")).themesMock);

import {
  DEFAULT_SETTINGS,
  becomeOwner,
  createInvite,
  decideOwnerRequest,
  deleteOwnAccount,
  getInstanceSettings,
  getMyOwnerRequest,
  listInvites,
  listOwnerRequests,
  listUsers,
  redeemInvite,
  requestOwnerRole,
  revokeInvite,
  setUserBanned,
  setUserRole,
  updateInstanceSettings,
} from "@/server/services/admin";
import { createAlbum, updateAlbumSettings } from "@/server/services/albums";
import { addComment, toggleReaction } from "@/server/services/interactions";
import { addGuestPhoto, addPhoto, getPhoto } from "@/server/services/photos";
import type { Doc } from "@/server/ports/document-store";
import { ctx, jpeg, makeUser, resetCtx } from "./fakes";

beforeEach(() => resetCtx());

const roleOf = async (id: string) => (await ctx.db.get<Doc>("auth_user", id))!.role;
const setMode = async (admin: Awaited<ReturnType<typeof makeUser>>, onboardingMode: "open" | "approval" | "invite") => updateInstanceSettings(admin, { onboardingMode });

describe("instance settings", () => {
  it("falls back to defaults, validates and persists, admin only", async () => {
    const admin = await makeUser("admin");
    const initial = await getInstanceSettings();
    expect(initial).toMatchObject(DEFAULT_SETTINGS);

    await expect(updateInstanceSettings(await makeUser("owner"), { instanceName: "x" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateInstanceSettings(admin, { maxUploadMb: 0 })).rejects.toMatchObject({ messageKey: "settingsOutOfRange" });
    await expect(updateInstanceSettings(admin, { instanceName: "  " })).rejects.toMatchObject({ messageKey: "instanceNameRequired" });

    const s = await updateInstanceSettings(admin, { instanceName: " Family ", maxUploadMb: 10, legal: { imprint: "I", privacy: "" } });
    expect(s).toMatchObject({ instanceName: "Family", maxUploadMb: 10, onboardingMode: "approval", legal: { imprint: "I", privacy: "" } });
    expect(await getInstanceSettings()).toMatchObject({ instanceName: "Family", maxUploadMb: 10, maxPhotosPerAlbum: 500 });

    // partial legacy document still resolves
    await ctx.db.put("settings", { id: "instance", instanceName: "Old" });
    expect(await getInstanceSettings()).toMatchObject({ instanceName: "Old", onboardingMode: "approval", maxUploadMb: 25 });
  });
});

describe("onboarding: open", () => {
  it("promotes viewers immediately, only in open mode", async () => {
    const admin = await makeUser("admin");
    const viewer = await makeUser("viewer");
    await expect(becomeOwner(viewer)).rejects.toMatchObject({ code: "forbidden", messageKey: "onboardingNotOpen" });
    await setMode(admin, "open");
    await expect(becomeOwner({ ...viewer, banned: true })).rejects.toMatchObject({ code: "forbidden" });
    await becomeOwner(viewer);
    expect(await roleOf(viewer.id)).toBe("owner");
    await becomeOwner({ ...viewer, role: "owner" }); // no-op
    await becomeOwner(admin);
    expect(await roleOf(admin.id)).toBe("admin"); // never demoted
  });
});

describe("onboarding: approval", () => {
  it("one pending request per user; admin approves or denies", async () => {
    const admin = await makeUser("admin");
    const viewer = await makeUser("viewer");
    const other = await makeUser("viewer");

    expect(await getMyOwnerRequest(viewer)).toBeNull();
    const req = await requestOwnerRole(viewer, "  I take photos  ");
    expect(req).toMatchObject({ status: "pending", message: "I take photos", userId: viewer.id, userEmail: viewer.email });
    await expect(requestOwnerRole(viewer, "again")).rejects.toMatchObject({ code: "conflict", messageKey: "requestPending" });
    await expect(requestOwnerRole(viewer, "x".repeat(501))).rejects.toMatchObject({ messageKey: "requestMessageTooLong" });
    await expect(requestOwnerRole(await makeUser("owner"), "x")).rejects.toMatchObject({ messageKey: "alreadyOwner" });
    expect((await getMyOwnerRequest(viewer))!.id).toBe(req.id);

    const req2 = await requestOwnerRole(other, "me too");
    expect((await listOwnerRequests(admin, "pending")).map((r) => r.id).sort()).toEqual([req.id, req2.id].sort());
    await expect(listOwnerRequests(viewer)).rejects.toMatchObject({ code: "forbidden" });
    await expect(decideOwnerRequest(viewer, req.id, "approved")).rejects.toMatchObject({ code: "forbidden" });

    await decideOwnerRequest(admin, req.id, "approved");
    expect(await roleOf(viewer.id)).toBe("owner");
    expect(await getMyOwnerRequest(viewer)).toMatchObject({ status: "approved", decidedBy: admin.id });
    await decideOwnerRequest(admin, req2.id, "denied");
    expect(await roleOf(other.id)).toBe("viewer");
    await expect(decideOwnerRequest(admin, req.id, "denied")).rejects.toMatchObject({ messageKey: "requestAlreadyDecided" });
    await expect(decideOwnerRequest(admin, "missing", "denied")).rejects.toMatchObject({ code: "not_found" });
    expect(await listOwnerRequests(admin, "pending")).toEqual([]);

    // after a denial the user may ask again
    await expect(requestOwnerRole(other, "please")).resolves.toMatchObject({ status: "pending" });
  });

  it("is disabled in other modes", async () => {
    const admin = await makeUser("admin");
    const viewer = await makeUser("viewer");
    await setMode(admin, "invite");
    await expect(requestOwnerRole(viewer, "x")).rejects.toMatchObject({ messageKey: "onboardingNotApproval" });
  });
});

describe("onboarding: invites", () => {
  it("creates, lists, redeems once, expires and can be revoked", async () => {
    const admin = await makeUser("admin");
    const viewer = await makeUser("viewer");
    const invite = await createInvite(admin, {});
    expect(invite.url).toBe(`http://localhost:3000/invite/${invite.token}`);
    expect(invite.token.length).toBeGreaterThanOrEqual(24);
    const days = (Date.parse(invite.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
    expect(ctx.sent).toHaveLength(0);
    await expect(createInvite(viewer, {})).rejects.toMatchObject({ code: "forbidden" });
    await expect(createInvite(admin, { validDays: 0 })).rejects.toMatchObject({ messageKey: "inviteDaysInvalid" });
    await expect(createInvite(admin, { email: "nope" })).rejects.toMatchObject({ messageKey: "emailInvalid" });
    expect((await listInvites(admin)).map((i) => i.id)).toEqual([invite.id]);

    expect(await redeemInvite(viewer, "unknown-token-xyz")).toBe(false);
    expect(await redeemInvite({ ...viewer, banned: true }, invite.token)).toBe(false);
    expect(await redeemInvite(viewer, invite.token)).toBe(true);
    expect(await roleOf(viewer.id)).toBe("owner");
    const stored = (await listInvites(admin))[0];
    expect(stored).toMatchObject({ usedBy: viewer.id });
    expect(stored.usedAt).not.toBeNull();

    const second = await makeUser("viewer");
    expect(await redeemInvite(second, invite.token)).toBe(false); // used
    expect(await roleOf(second.id)).toBe("viewer");

    // expiry
    const expired = await createInvite(admin, {});
    await ctx.db.update("invites", expired.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(await redeemInvite(second, expired.token)).toBe(false);

    // revoke
    const revoked = await createInvite(admin, {});
    await expect(revokeInvite(second, revoked.id)).rejects.toMatchObject({ code: "forbidden" });
    await revokeInvite(admin, revoked.id);
    expect(await redeemInvite(second, revoked.token)).toBe(false);
    await expect(revokeInvite(admin, revoked.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("works in every onboarding mode and only mails with SMTP", async () => {
    const admin = await makeUser("admin", { locale: "de", name: "Alice" });
    await setMode(admin, "open");
    await createInvite(admin, { email: "friend@example.com" });
    expect(ctx.sent).toHaveLength(0); // console mailer → no mail

    ctx.mailerKind = "smtp";
    const inv = await createInvite(admin, { email: "friend@example.com", validDays: 3 });
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0].to).toBe("friend@example.com");
    expect(ctx.sent[0].text).toContain(inv.url);
    expect(ctx.sent[0].text).toContain("Alice");
    expect(ctx.sent[0].text).toContain("3 Tage"); // German (inviter locale)
  });
});

describe("users", () => {
  it("lists and searches users (admin only)", async () => {
    const admin = await makeUser("admin", { name: "Zed Admin", email: "zed@example.com" });
    await makeUser("viewer", { name: "Maria", email: "maria@example.com" });
    await makeUser("owner", { name: "Bob", email: "bob@corp.test" });
    expect(await listUsers(admin)).toHaveLength(3);
    expect((await listUsers(admin, { query: "MARIA" })).map((u) => u.name)).toEqual(["Maria"]);
    expect((await listUsers(admin, { query: "corp.test" })).map((u) => u.name)).toEqual(["Bob"]);
    expect(await listUsers(admin, { limit: 1, offset: 1 })).toHaveLength(1);
    expect(Object.keys((await listUsers(admin))[0]).sort()).toEqual(["banned", "createdAt", "email", "id", "image", "name", "role"]);
    await expect(listUsers(await makeUser("owner"))).rejects.toMatchObject({ code: "forbidden" });
  });

  it("setUserRole guards the last admin", async () => {
    const admin = await makeUser("admin");
    const viewer = await makeUser("viewer");
    await expect(setUserRole(viewer, viewer.id, "admin")).rejects.toMatchObject({ code: "forbidden" });
    await expect(setUserRole(admin, admin.id, "owner")).rejects.toMatchObject({ code: "conflict", messageKey: "lastAdmin" });
    expect(await roleOf(admin.id)).toBe("admin");

    await setUserRole(admin, viewer.id, "admin");
    expect(await roleOf(viewer.id)).toBe("admin");
    await setUserRole(admin, admin.id, "owner"); // now there is another admin
    expect(await roleOf(admin.id)).toBe("owner");
    await expect(setUserRole({ ...viewer, role: "admin" }, viewer.id, "viewer")).rejects.toMatchObject({ messageKey: "lastAdmin" });
    await expect(setUserRole({ ...viewer, role: "admin" }, "missing", "viewer")).rejects.toMatchObject({ code: "not_found" });
  });

  it("setUserBanned flags the user and deletes their sessions", async () => {
    const admin = await makeUser("admin");
    const victim = await makeUser("viewer");
    await ctx.db.put("auth_session", { id: "s1", userId: victim.id, token: "t1" });
    await ctx.db.put("auth_session", { id: "s2", userId: victim.id, token: "t2" });
    await ctx.db.put("auth_session", { id: "s3", userId: admin.id, token: "t3" });

    await expect(setUserBanned(admin, admin.id, true)).rejects.toMatchObject({ messageKey: "cannotBanSelf" });
    await expect(setUserBanned(victim, admin.id, true)).rejects.toMatchObject({ code: "forbidden" });
    await setUserBanned(admin, victim.id, true);
    expect((await ctx.db.get<Doc>("auth_user", victim.id))!.banned).toBe(true);
    expect(ctx.db.dump("auth_session").map((s) => s.id)).toEqual(["s3"]);
    await setUserBanned(admin, victim.id, false);
    expect((await ctx.db.get<Doc>("auth_user", victim.id))!.banned).toBe(false);
  });
});

describe("deleteOwnAccount", () => {
  it("cascades through albums, interactions, connections and auth records", async () => {
    const admin = await makeUser("admin");
    const me = await makeUser("owner");
    const friend = await makeUser("owner");

    // my album with a photo and someone else's comment on it
    const mine = await createAlbum(me, { title: "Mine", themeId: "t" });
    await updateAlbumSettings(me, mine.id, { status: "published" });
    const myPhoto = await addPhoto(me, mine.id, { data: await jpeg(), filename: "m.jpg", contentType: "image/jpeg", source: "upload" });
    await addComment(friend, myPhoto.id, "on my album");

    // friend's album where I commented, reacted and uploaded as guest
    const theirs = await createAlbum(friend, { title: "Theirs", themeId: "t" });
    await updateAlbumSettings(friend, theirs.id, { status: "published", guestUploadsEnabled: true, notifyMode: "off" });
    const theirPhoto = await addPhoto(friend, theirs.id, { data: await jpeg(), filename: "t.jpg", contentType: "image/jpeg", source: "upload" });
    await addComment(me, theirPhoto.id, "mine 1");
    await addComment(friend, theirPhoto.id, "friend");
    await toggleReaction(me, theirPhoto.id, "heart");
    await toggleReaction(friend, theirPhoto.id, "heart");
    const guestPhoto = await addGuestPhoto(me, theirs.slug, { data: await jpeg(), filename: "g.jpg", contentType: "image/jpeg" });
    await ctx.db.put("connections", { id: `${me.id}_google-photos`, userId: me.id });
    await ctx.db.put("connections", { id: `${friend.id}_google-photos`, userId: friend.id });
    await ctx.db.put("auth_session", { id: "s1", userId: me.id });
    await ctx.db.put("auth_account", { id: "a1", userId: me.id });
    await ctx.db.put("auth_passkey", { id: "k1", userId: me.id });
    await ctx.db.put("pending_notifications", { id: "n1", ownerId: me.id, albumId: mine.id });
    await ctx.db.put("owner_requests", { id: "o1", userId: me.id });
    await ctx.db.put("auth_session", { id: "s2", userId: friend.id });

    expect((await getPhoto(theirPhoto.id))!.commentCount).toBe(2);
    expect((await getPhoto(theirPhoto.id))!.reactionCounts.heart).toBe(2);

    await deleteOwnAccount(me);

    expect(await ctx.db.get("auth_user", me.id)).toBeNull();
    expect(await ctx.db.get("albums", mine.id)).toBeNull();
    expect(await getPhoto(myPhoto.id)).toBeNull();
    expect(ctx.blobs.keys().filter((k) => k.startsWith(`albums/${mine.id}/`))).toEqual([]);
    expect(await getPhoto(guestPhoto.id)).toBeNull();
    expect(ctx.blobs.keys().filter((k) => k.includes(guestPhoto.id))).toEqual([]);

    // friend's data survives, counters are adjusted
    expect(await ctx.db.get("auth_user", friend.id)).not.toBeNull();
    expect(await ctx.db.get("albums", theirs.id)).not.toBeNull();
    const photo = (await getPhoto(theirPhoto.id))!;
    expect(photo.commentCount).toBe(1);
    expect(photo.reactionCounts.heart).toBe(1);
    expect(ctx.db.dump("comments").map((c) => c.body)).toEqual(["friend"]);
    expect(ctx.db.dump("reactions").map((r) => r.userId)).toEqual([friend.id]);
    expect(ctx.db.dump("connections").map((c) => c.userId)).toEqual([friend.id]);
    expect(ctx.db.dump("auth_session").map((c) => c.id)).toEqual(["s2"]);
    for (const c of ["auth_account", "auth_passkey", "pending_notifications", "owner_requests"]) expect(ctx.db.dump(c)).toEqual([]);
    expect(admin.id).toBeTruthy();
  });

  it("refuses for the last admin", async () => {
    const admin = await makeUser("admin");
    await expect(deleteOwnAccount(admin)).rejects.toMatchObject({ code: "conflict", messageKey: "lastAdmin" });
    expect(await ctx.db.get("auth_user", admin.id)).not.toBeNull();
    const second = await makeUser("admin");
    await deleteOwnAccount(admin);
    expect(await ctx.db.get("auth_user", admin.id)).toBeNull();
    expect(second.id).toBeTruthy();
  });
});
