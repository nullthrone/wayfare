import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Integration test: real Better Auth instance on the SQLite DocumentStore adapter.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wayfare-auth-"));
process.env.WAYFARE_RUNTIME = "selfhost";
process.env.DATA_DIR = dir;
process.env.AUTH_EMAIL_PASSWORD = "true";
process.env.AUTH_MAGIC_LINK = "true";
process.env.AUTH_PASSKEY = "true";
process.env.WAYFARE_ADMIN_EMAILS = "boss@example.com";
process.env.WAYFARE_BASE_URL = "http://localhost:3000";
delete process.env.SMTP_URL;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set: () => undefined, get: () => undefined, getAll: () => [] }),
}));

const ORIGIN = "http://localhost:3000";
const jsonHeaders = { "content-type": "application/json", origin: ORIGIN };

function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function post(handler: (r: Request) => Promise<Response>, url: string, body: unknown, cookie?: string) {
  return handler(new Request(`${ORIGIN}${url}`, { method: "POST", headers: { ...jsonHeaders, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));
}

describe("Better Auth on the DocumentStore adapter", () => {
  let handler: (r: Request) => Promise<Response>;
  let getDb: typeof import("@/server/container").getDb;

  beforeAll(async () => {
    const { getAuth } = await import("@/server/auth/auth");
    ({ getDb } = await import("@/server/container"));
    const auth = getAuth();
    handler = (r) => auth.handler(r);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const session = async (cookie: string) => {
    const res = await handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie, origin: ORIGIN } }));
    return (await res.json()) as { user?: { id: string; email: string; role: string; banned: boolean; createdAt: string } } | null;
  };

  it("first user becomes admin, later users viewers, admin e-mails are admins", async () => {
    const r1 = await post(handler, "/api/auth/sign-up/email", { name: "First", email: "first@example.com", password: "password-1234" });
    expect(r1.status).toBe(200);
    const s1 = await session(cookieFrom(r1));
    expect(s1?.user?.email).toBe("first@example.com");
    expect(s1?.user?.role).toBe("admin");
    expect(s1?.user?.banned).toBe(false);

    const r2 = await post(handler, "/api/auth/sign-up/email", { name: "Second", email: "second@example.com", password: "password-1234" });
    expect((await session(cookieFrom(r2)))?.user?.role).toBe("viewer");

    const r3 = await post(handler, "/api/auth/sign-up/email", { name: "Boss", email: "Boss@Example.com", password: "password-1234" });
    expect((await session(cookieFrom(r3)))?.user?.role).toBe("admin");
  });

  it("clients cannot set role/banned at sign-up", async () => {
    const r = await post(handler, "/api/auth/sign-up/email", { name: "Sneaky", email: "sneaky@example.com", password: "password-1234", role: "admin", banned: false });
    const s = await session(cookieFrom(r));
    expect(s?.user?.role).toBe("viewer");
  });

  it("stores dates as ISO strings and returns Dates through the API", async () => {
    const db = await getDb();
    const user = await db.findOne<{ id: string; createdAt: unknown }>("auth_user", { where: [{ field: "email", op: "eq", value: "second@example.com" }] });
    expect(typeof user?.createdAt).toBe("string");
    const sessions = await db.find<{ id: string; expiresAt: unknown }>("auth_session", { where: [{ field: "userId", op: "eq", value: user!.id }] });
    expect(sessions).toHaveLength(1);
    expect(typeof sessions[0].expiresAt).toBe("string");
  });

  it("signs in with e-mail/password and signs out", async () => {
    const res = await post(handler, "/api/auth/sign-in/email", { email: "second@example.com", password: "password-1234" });
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    expect((await session(cookie))?.user?.email).toBe("second@example.com");
    expect((await post(handler, "/api/auth/sign-out", {}, cookie)).status).toBe(200);
    expect(await session(cookie)).toBeNull();
    expect((await post(handler, "/api/auth/sign-in/email", { email: "second@example.com", password: "wrong-password" })).status).toBe(401);
  });

  it("magic link: mail is printed to the console, link works exactly once and creates a user", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const res = await post(handler, "/api/auth/sign-in/magic-link", { email: "magic@example.com", callbackURL: "/dashboard" });
    expect(res.status).toBe(200);
    const printed = log.mock.calls.map((c) => String(c[0])).join("\n");
    log.mockRestore();
    expect(printed).toContain("To:      magic@example.com");
    expect(printed).toContain("Dein Anmeldelink / Your sign-in link");
    const url = printed.match(/https?:\/\/\S+magic-link\/verify\?\S+/)?.[0];
    expect(url).toBeTruthy();

    const verify = await handler(new Request(url!, { headers: { origin: ORIGIN } }));
    expect([200, 302]).toContain(verify.status);
    const s = await session(cookieFrom(verify));
    expect(s?.user?.email).toBe("magic@example.com");
    expect(s?.user?.role).toBe("viewer");

    const again = await handler(new Request(url!, { headers: { origin: ORIGIN } }));
    expect(cookieFrom(again)).not.toContain("session_token");
  });

  it("banned users cannot sign in and existing sessions are rejected by the role check in getCurrentUser", async () => {
    const res = await post(handler, "/api/auth/sign-in/email", { email: "sneaky@example.com", password: "password-1234" });
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    const db = await getDb();
    const user = await db.findOne<{ id: string }>("auth_user", { where: [{ field: "email", op: "eq", value: "sneaky@example.com" }] });
    await db.update("auth_user", user!.id, { banned: true });
    expect((await session(cookie))?.user?.banned).toBe(true); // surfaced so getCurrentUser() can treat it as signed out
    const denied = await post(handler, "/api/auth/sign-in/email", { email: "sneaky@example.com", password: "password-1234" });
    expect(denied.status).toBe(403);
    expect(cookieFrom(denied)).not.toContain("session_token");
  });

  it("passkey endpoints work on the adapter (options, list)", async () => {
    const login = await post(handler, "/api/auth/sign-in/email", { email: "second@example.com", password: "password-1234" });
    const cookie = cookieFrom(login);
    const reg = await handler(new Request(`${ORIGIN}/api/auth/passkey/generate-register-options?name=Laptop`, { headers: { cookie, origin: ORIGIN } }));
    expect(reg.status).toBe(200);
    const opts = (await reg.json()) as { rp: { id: string; name: string } };
    expect(opts.rp).toEqual({ id: "localhost", name: "Wayfare" });
    const list = await handler(new Request(`${ORIGIN}/api/auth/passkey/list-user-passkeys`, { headers: { cookie, origin: ORIGIN } }));
    expect(await list.json()).toEqual([]);
    const auth = await handler(new Request(`${ORIGIN}/api/auth/passkey/generate-authenticate-options`, { headers: { origin: ORIGIN } }));
    expect(auth.status).toBe(200);
  });

  it("promotes a user whose e-mail was added to WAYFARE_ADMIN_EMAILS on the next sign-in", async () => {
    const db = await getDb();
    await post(handler, "/api/auth/sign-up/email", { name: "Boss", email: "boss@example.com", password: "password-1234" }).catch(() => undefined);
    const boss = await db.findOne<{ id: string }>("auth_user", { where: [{ field: "email", op: "eq", value: "boss@example.com" }] });
    await db.update("auth_user", boss!.id, { role: "viewer" });
    const res = await post(handler, "/api/auth/sign-in/email", { email: "boss@example.com", password: "password-1234" });
    expect((await session(cookieFrom(res)))?.user?.role).toBe("admin");
  });
});
