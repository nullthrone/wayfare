import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/container", async () => (await import("./fakes")).containerMock);
vi.mock("next/headers", async () => (await import("./fakes")).nextHeadersMock);
vi.mock("@/server/services/session", async () => (await import("./fakes")).sessionMock);
vi.mock("@/server/services/themes", async () => (await import("./fakes")).themesMock);

import { POST as uploadPost } from "@/app/api/upload/[albumId]/route";
import { POST as guestUploadPost } from "@/app/api/upload/guest/[slug]/route";
import { POST as cronPost } from "@/app/api/cron/digest/route";
import { resetConfigForTests } from "@/server/config";
import { runAction } from "@/server/action-result";
import { conflict, forbidden } from "@/server/errors";
import { createAlbum, updateAlbumSettings } from "@/server/services/albums";
import { listPhotos } from "@/server/services/photos";
import { notifyOwner, sendDailyDigests } from "@/server/services/notifications";
import { ctx, jpeg, makeUser, resetCtx } from "./fakes";

beforeEach(() => resetCtx());

async function form(files: { name: string; data: Buffer; type: string }[], field = "files") {
  const fd = new FormData();
  for (const f of files) fd.append(field, new File([new Uint8Array(f.data)], f.name, { type: f.type }));
  return new Request("http://localhost:3000/api/upload/x", { method: "POST", body: fd });
}

describe("POST /api/upload/[albumId]", () => {
  it("stores valid files, reports per-file errors, owner only", async () => {
    const owner = await makeUser("owner");
    const album = await createAlbum(owner, { title: "A", themeId: "t" });
    const good = await jpeg();
    const call = async (req: Request, albumId = album.id) => uploadPost(req, { params: Promise.resolve({ albumId }) });

    ctx.currentUser = null;
    expect((await call(await form([{ name: "a.jpg", data: good, type: "image/jpeg" }]))).status).toBe(401);

    ctx.currentUser = await makeUser("viewer");
    expect((await call(await form([{ name: "a.jpg", data: good, type: "image/jpeg" }]))).status).toBe(403);

    ctx.currentUser = await makeUser("owner"); // owner role, but not the album's owner
    const foreign = await call(await form([{ name: "a.jpg", data: good, type: "image/jpeg" }]));
    expect(foreign.status).toBe(403);
    expect(await listPhotos(album.id)).toHaveLength(0);

    ctx.currentUser = owner;
    const res = await call(await form([
      { name: "a.jpg", data: good, type: "image/jpeg" },
      { name: "notes.txt", data: Buffer.from("hello"), type: "text/plain" },
      { name: "b.jpg", data: good, type: "image/jpeg" },
    ], "files[]"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photos).toHaveLength(2);
    expect(body.errors).toEqual([{ filename: "notes.txt", error: "imageUnsupported" }]);
    expect(await listPhotos(album.id)).toHaveLength(2);

    expect((await call(await form([]))).status).toBe(400);
    expect((await call(await form([{ name: "a.jpg", data: good, type: "image/jpeg" }]), "missing")).status).toBe(404);
  });
});

describe("POST /api/upload/guest/[slug]", () => {
  it("requires sign-in, enabled uploads and access; stores pending photos", async () => {
    const owner = await makeUser("owner");
    const created = await createAlbum(owner, { title: "A", themeId: "t" });
    const album = await updateAlbumSettings(owner, created.id, { status: "published", notifyMode: "off", guestUploadsEnabled: true, guestUploadLimit: 1 });
    const good = await jpeg();
    const call = async (n = 1) =>
      guestUploadPost(await form(Array.from({ length: n }, (_, i) => ({ name: `g${i}.jpg`, data: good, type: "image/jpeg" }))), { params: Promise.resolve({ slug: album.slug }) });

    ctx.currentUser = null;
    expect((await call()).status).toBe(401);

    ctx.currentUser = await makeUser("viewer");
    const res = await call(2);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.photos).toHaveLength(1);
    expect(body.errors).toEqual([{ filename: "g1.jpg", error: "guestUploadLimit" }]);
    expect(await listPhotos(album.id)).toHaveLength(0);
    expect(await listPhotos(album.id, "pending")).toHaveLength(1);

    // password-protected album without unlock → forbidden per file
    await updateAlbumSettings(owner, album.id, { accessMode: "password", password: "secret1" });
    ctx.currentUser = await makeUser("viewer");
    expect(await (await call()).json()).toMatchObject({ photos: [], errors: [{ error: "albumLocked" }] });
  });
});

describe("POST /api/cron/digest", () => {
  const req = (auth?: string) => new Request("http://localhost:3000/api/cron/digest", { method: "POST", headers: auth ? { authorization: auth } : {} });

  it("is 404 without CRON_SECRET, 401 with a wrong token, 200 with the right one", async () => {
    delete process.env.CRON_SECRET;
    resetConfigForTests();
    expect((await cronPost(req("Bearer anything"))).status).toBe(404);

    process.env.CRON_SECRET = "cron-secret-value";
    resetConfigForTests();
    try {
      expect((await cronPost(req())).status).toBe(401);
      expect((await cronPost(req("Bearer nope"))).status).toBe(401);
      expect((await cronPost(req("Bearer cron-secret-value-extra"))).status).toBe(401);
      const ok = await cronPost(req("Bearer cron-secret-value"));
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ owners: 0, notifications: 0 });
    } finally {
      delete process.env.CRON_SECRET;
      resetConfigForTests();
    }
  });
});

describe("notifications", () => {
  async function album(mode: "off" | "instant" | "daily", locale?: string) {
    const owner = await makeUser("owner", { name: "Olga", locale });
    const created = await createAlbum(owner, { title: "Beach", themeId: "t" });
    return { owner, album: await updateAlbumSettings(owner, created.id, { notifyMode: mode }) };
  }

  it("off does nothing; instant mails in the owner locale; mail errors never throw", async () => {
    const off = await album("off");
    await notifyOwner(off.album, { kind: "comment", summary: "x" });
    expect(ctx.sent).toHaveLength(0);
    expect(ctx.db.dump("pending_notifications")).toHaveLength(0);

    const de = await album("instant", "de");
    await notifyOwner(de.album, { kind: "guest-upload", summary: "Gast: a.jpg" });
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0]).toMatchObject({ to: de.owner.email });
    expect(ctx.sent[0].subject).toBe("Neues Foto wartet auf Freigabe in „Beach“");
    expect(ctx.sent[0].text).toContain("Hallo Olga");
    expect(ctx.sent[0].text).toContain("Gast: a.jpg");

    const en = await album("instant");
    await notifyOwner(en.album, { kind: "report", summary: "bad" });
    expect(ctx.sent[1].subject).toBe('A comment was reported in "Beach"');

    // unknown owner → silently skipped ; failing mailer → swallowed
    await notifyOwner({ ...en.album, ownerId: "ghost" }, { kind: "comment", summary: "x" });
    expect(ctx.sent).toHaveLength(2);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    ctx.db.get = async () => {
      throw new Error("db down");
    };
    await expect(notifyOwner(en.album, { kind: "comment", summary: "x" })).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("daily mode queues and sendDailyDigests sends one mail per owner and clears the queue", async () => {
    const a = await album("daily", "de");
    const b = await album("daily");
    await notifyOwner(a.album, { kind: "comment", summary: "Anna: toll" });
    await notifyOwner(a.album, { kind: "guest-upload", summary: "Ben: x.jpg" });
    await notifyOwner(b.album, { kind: "report", summary: "Bad one" });
    expect(ctx.db.dump("pending_notifications")).toHaveLength(3);
    expect(ctx.sent).toHaveLength(0);

    expect(await sendDailyDigests()).toEqual({ owners: 2, notifications: 3 });
    expect(ctx.sent).toHaveLength(2);
    const mailA = ctx.sent.find((m) => m.to === a.owner.email)!;
    expect(mailA.subject).toBe("Deine tägliche Wayfare-Zusammenfassung (2)");
    expect(mailA.text).toContain("Beach (2)");
    expect(mailA.text).toContain("Kommentar: Anna: toll");
    expect(mailA.text).toContain("Gäste-Upload: Ben: x.jpg");
    const mailB = ctx.sent.find((m) => m.to === b.owner.email)!;
    expect(mailB.subject).toBe("Your Wayfare daily digest (1)");
    expect(mailB.text).toContain("Report: Bad one");
    expect(ctx.db.dump("pending_notifications")).toHaveLength(0);
    expect(await sendDailyDigests()).toEqual({ owners: 0, notifications: 0 });
  });

  it("keeps notifications when the mail fails", async () => {
    const a = await album("daily");
    await notifyOwner(a.album, { kind: "comment", summary: "x" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const original = ctx.mailerKind;
    const mod = await import("@/server/container");
    const getMailer = vi.spyOn(mod, "getMailer").mockResolvedValue({ kind: "console", send: async () => { throw new Error("smtp down"); } });
    expect(await sendDailyDigests()).toEqual({ owners: 0, notifications: 0 });
    expect(ctx.db.dump("pending_notifications")).toHaveLength(1);
    getMailer.mockRestore();
    spy.mockRestore();
    ctx.mailerKind = original;
    expect(await sendDailyDigests()).toEqual({ owners: 1, notifications: 1 });
  });
});

describe("runAction", () => {
  it("wraps results and maps errors", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
    expect(await runAction(async () => { throw forbidden("albumLocked"); })).toEqual({ ok: false, error: "albumLocked" });
    expect(await runAction(async () => { throw conflict("lastAdmin"); })).toEqual({ ok: false, error: "lastAdmin" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await runAction(async () => { throw new Error("boom"); })).toEqual({ ok: false, error: "generic" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/x;307;" });
    await expect(runAction(async () => { throw redirect; })).rejects.toBe(redirect);
  });
});
