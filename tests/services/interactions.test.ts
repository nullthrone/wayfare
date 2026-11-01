import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/container", async () => (await import("./fakes")).containerMock);
vi.mock("next/headers", async () => (await import("./fakes")).nextHeadersMock);
vi.mock("@/server/services/session", async () => (await import("./fakes")).sessionMock);
vi.mock("@/server/services/themes", async () => (await import("./fakes")).themesMock);

import { createAlbum, updateAlbumSettings } from "@/server/services/albums";
import {
  addComment,
  deleteComment,
  getUserReactions,
  listComments,
  listModerationQueue,
  moderateComment,
  reportComment,
  resolveReport,
  setViewerBlocked,
  toggleReaction,
} from "@/server/services/interactions";
import { addPhoto, getPhoto } from "@/server/services/photos";
import type { Doc } from "@/server/ports/document-store";
import { ctx, jpeg, makeUser, resetCtx } from "./fakes";

beforeEach(() => resetCtx());

async function setup(settings: Parameters<typeof updateAlbumSettings>[2] = {}) {
  const owner = await makeUser("owner", { name: "Olivia" });
  const created = await createAlbum(owner, { title: "Trip", themeId: "builtin:neutral" });
  const album = await updateAlbumSettings(owner, created.id, { status: "published", notifyMode: "off", ...settings });
  const photo = await addPhoto(owner, album.id, { data: await jpeg(), filename: "a.jpg", contentType: "image/jpeg", source: "upload" });
  const viewer = await makeUser("viewer", { name: "Vera" });
  return { owner, album, photo, viewer };
}
const count = async (photoId: string) => (await getPhoto(photoId))!.commentCount;

describe("comments", () => {
  it("post mode: visible immediately, counted, validated", async () => {
    const { photo, viewer } = await setup({ commentMode: "post" });
    const c = await addComment(viewer, photo.id, "  Nice shot!  ");
    expect(c).toMatchObject({ body: "Nice shot!", status: "visible", authorId: viewer.id, authorName: "Vera", photoId: photo.id, reportCount: 0 });
    expect(await count(photo.id)).toBe(1);
    expect((await listComments(photo.id, null)).map((x) => x.id)).toEqual([c.id]);

    await expect(addComment(viewer, photo.id, "   ")).rejects.toMatchObject({ messageKey: "commentEmpty" });
    await expect(addComment(viewer, photo.id, "x".repeat(1001))).rejects.toMatchObject({ messageKey: "commentTooLong" });
    await expect(addComment(viewer, photo.id, "x".repeat(1000))).resolves.toBeTruthy();
    expect(await count(photo.id)).toBe(2);
  });

  it("pre mode: pending until approved; commentCount counts only visible", async () => {
    const { owner, photo, viewer } = await setup({ commentMode: "pre" });
    const other = await makeUser("viewer");
    const c = await addComment(viewer, photo.id, "hello");
    expect(c.status).toBe("pending");
    expect(await count(photo.id)).toBe(0);

    // author sees own pending comment, others do not, owner sees all
    expect((await listComments(photo.id, viewer)).map((x) => x.id)).toEqual([c.id]);
    expect(await listComments(photo.id, other)).toEqual([]);
    expect(await listComments(photo.id, null)).toEqual([]);
    expect((await listComments(photo.id, owner)).map((x) => x.id)).toEqual([c.id]);

    const queue = await listModerationQueue(owner, c.albumId);
    expect(queue.pendingComments.map((x) => x.id)).toEqual([c.id]);

    await expect(moderateComment(viewer, c.id, "visible")).rejects.toMatchObject({ code: "forbidden" });
    await moderateComment(owner, c.id, "visible");
    expect(await count(photo.id)).toBe(1);
    await moderateComment(owner, c.id, "visible"); // idempotent
    expect(await count(photo.id)).toBe(1);
    expect((await listComments(photo.id, other)).map((x) => x.id)).toEqual([c.id]);

    await moderateComment(owner, c.id, "hidden");
    expect(await count(photo.id)).toBe(0);
    expect(await listComments(photo.id, other)).toEqual([]);

    // the owner's own comments skip moderation
    expect((await addComment(owner, photo.id, "mine")).status).toBe("visible");
  });

  it("off mode rejects new comments and hides existing ones from viewers", async () => {
    const { owner, album, photo, viewer } = await setup({ commentMode: "post" });
    await addComment(viewer, photo.id, "before");
    await updateAlbumSettings(owner, album.id, { commentMode: "off" });
    await expect(addComment(viewer, photo.id, "after")).rejects.toMatchObject({ code: "validation", messageKey: "commentsDisabled" });
    expect(await listComments(photo.id, viewer)).toEqual([]);
    expect(await listComments(photo.id, owner)).toHaveLength(1);
  });

  it("delete: author or owner/admin only; keeps the counter honest", async () => {
    const { owner, photo, viewer } = await setup();
    const other = await makeUser("viewer");
    const c1 = await addComment(viewer, photo.id, "one");
    const c2 = await addComment(other, photo.id, "two");
    expect(await count(photo.id)).toBe(2);
    await expect(deleteComment(other, c1.id)).rejects.toMatchObject({ code: "forbidden" });
    await deleteComment(viewer, c1.id);
    await deleteComment(owner, c2.id);
    expect(await count(photo.id)).toBe(0);
    await expect(deleteComment(owner, c2.id)).rejects.toMatchObject({ code: "not_found" });
    const c3 = await addComment(viewer, photo.id, "three");
    await deleteComment(await makeUser("admin"), c3.id);
    expect(await count(photo.id)).toBe(0);
  });

  it("requires access to the album and a non-banned user", async () => {
    const { owner, album, photo, viewer } = await setup();
    await expect(addComment({ ...viewer, banned: true }, photo.id, "x")).rejects.toMatchObject({ code: "forbidden" });
    await updateAlbumSettings(owner, album.id, { accessMode: "password", password: "secret1" });
    await expect(addComment(viewer, photo.id, "x")).rejects.toMatchObject({ messageKey: "albumLocked" });
    expect(await listComments(photo.id, viewer)).toEqual([]);
    await updateAlbumSettings(owner, album.id, { accessMode: "link", status: "draft" });
    await expect(addComment(viewer, photo.id, "x")).rejects.toMatchObject({ code: "not_found" });
    await expect(addComment(viewer, "missing", "x")).rejects.toMatchObject({ code: "not_found" });
  });

  it("notifies the owner (daily → pending notification, instant → mail), not for own comments", async () => {
    const { owner, album, photo, viewer } = await setup({ notifyMode: "daily" });
    await addComment(viewer, photo.id, "hi there");
    await addComment(owner, photo.id, "self");
    const pending = ctx.db.dump("pending_notifications");
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ ownerId: owner.id, albumId: album.id, kind: "comment" });
    expect(String(pending[0].summary)).toContain("hi there");

    await updateAlbumSettings(owner, album.id, { notifyMode: "instant" });
    await addComment(viewer, photo.id, "second");
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0].text).toContain("second");
  });
});

describe("blocking", () => {
  it("blocked users cannot interact; their comments are hidden and counters adjusted", async () => {
    const { owner, album, photo, viewer } = await setup();
    await addComment(viewer, photo.id, "a");
    await addComment(viewer, photo.id, "b");
    const keep = await makeUser("viewer");
    await addComment(keep, photo.id, "c");
    expect(await count(photo.id)).toBe(3);

    await expect(setViewerBlocked(viewer, album.id, keep.id, true)).rejects.toMatchObject({ code: "forbidden" });
    await expect(setViewerBlocked(owner, album.id, owner.id, true)).rejects.toMatchObject({ messageKey: "cannotBlockOwner" });
    await setViewerBlocked(owner, album.id, viewer.id, true);

    expect(await count(photo.id)).toBe(1);
    expect((await listComments(photo.id, null)).map((c) => c.body)).toEqual(["c"]);
    await expect(addComment(viewer, photo.id, "x")).rejects.toMatchObject({ messageKey: "blockedFromAlbum" });
    await expect(toggleReaction(viewer, photo.id, "heart")).rejects.toMatchObject({ messageKey: "blockedFromAlbum" });

    await setViewerBlocked(owner, album.id, viewer.id, false);
    await expect(addComment(viewer, photo.id, "x")).resolves.toBeTruthy();
  });
});

describe("reports", () => {
  it("creates one report per reporter, increments reportCount, notifies owner, can be resolved", async () => {
    const { owner, album, photo, viewer } = await setup({ notifyMode: "daily" });
    const author = await makeUser("viewer");
    const c = await addComment(author, photo.id, "rude");
    await reportComment(viewer, c.id, "  spam  ");
    expect((await ctx.db.get<Doc>("comments", c.id))!.reportCount).toBe(1);
    expect(ctx.db.dump("pending_notifications").some((n) => n.kind === "report")).toBe(true);

    await expect(reportComment(viewer, c.id, "again")).rejects.toMatchObject({ code: "conflict", messageKey: "alreadyReported" });
    await expect(reportComment(author, c.id, "mine")).rejects.toMatchObject({ messageKey: "cannotReportOwnComment" });
    await expect(reportComment(viewer, c.id, " ")).rejects.toMatchObject({ messageKey: "reportReasonRequired" });
    await reportComment(await makeUser("viewer"), c.id, "other");
    expect((await ctx.db.get<Doc>("comments", c.id))!.reportCount).toBe(2);

    const queue = await listModerationQueue(owner, album.id);
    expect(queue.reports).toHaveLength(2);
    expect(queue.reports[0]).toMatchObject({ reason: "spam", resolved: false, comment: { id: c.id } });

    await expect(resolveReport(viewer, queue.reports[0].id)).rejects.toMatchObject({ code: "forbidden" });
    await resolveReport(owner, queue.reports[0].id);
    expect((await listModerationQueue(owner, album.id)).reports).toHaveLength(1);
    await expect(listModerationQueue(viewer, album.id)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("reactions", () => {
  it("toggles on/off with counters, per user and key", async () => {
    const { photo, viewer, album } = await setup();
    const other = await makeUser("viewer");

    expect(await toggleReaction(viewer, photo.id, "heart")).toEqual({ active: true, count: 1 });
    expect(await toggleReaction(other, photo.id, "heart")).toEqual({ active: true, count: 2 });
    expect(await toggleReaction(viewer, photo.id, "wow")).toEqual({ active: true, count: 1 });
    expect((await getPhoto(photo.id))!.reactionCounts).toEqual({ heart: 2, wow: 1 });
    expect(ctx.db.dump("reactions").map((r) => r.id).sort()).toEqual([`${photo.id}_${viewer.id}_heart`, `${photo.id}_${viewer.id}_wow`, `${photo.id}_${other.id}_heart`].sort());
    expect(await getUserReactions(viewer.id, album.id)).toEqual({ [photo.id]: expect.arrayContaining(["heart", "wow"]) });

    expect(await toggleReaction(viewer, photo.id, "heart")).toEqual({ active: false, count: 1 });
    expect((await getPhoto(photo.id))!.reactionCounts.heart).toBe(1);
    expect(await getUserReactions(viewer.id, album.id)).toEqual({ [photo.id]: ["wow"] });
    expect(await getUserReactions(viewer.id, "other-album")).toEqual({});
  });

  it("validates key against the theme, honours the enabled flag and access", async () => {
    const { owner, album, photo, viewer } = await setup();
    await expect(toggleReaction(viewer, photo.id, "poop")).rejects.toMatchObject({ code: "validation", messageKey: "reactionInvalid" });
    await expect(toggleReaction({ ...viewer, banned: true }, photo.id, "heart")).rejects.toMatchObject({ code: "forbidden" });
    await expect(toggleReaction(viewer, "missing", "heart")).rejects.toMatchObject({ code: "not_found" });
    await updateAlbumSettings(owner, album.id, { reactionsEnabled: false });
    await expect(toggleReaction(viewer, photo.id, "heart")).rejects.toMatchObject({ code: "validation", messageKey: "reactionsDisabled" });
  });
});
