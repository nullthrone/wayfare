import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Bootstrap behaviour when WAYFARE_ADMIN_EMAILS is NOT configured (separate file = fresh config/auth instance).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wayfare-auth-bootstrap-"));
process.env.WAYFARE_RUNTIME = "selfhost";
process.env.DATA_DIR = dir;
process.env.AUTH_EMAIL_PASSWORD = "true";
process.env.WAYFARE_ADMIN_EMAILS = "";
process.env.WAYFARE_BASE_URL = "http://localhost:3000";
delete process.env.SMTP_URL;

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set: () => undefined, get: () => undefined, getAll: () => [] }),
}));

const ORIGIN = "http://localhost:3000";

describe("admin bootstrap without WAYFARE_ADMIN_EMAILS", () => {
  let handler: (r: Request) => Promise<Response>;
  let getDb: typeof import("@/server/container").getDb;

  beforeAll(async () => {
    const { getAuth } = await import("@/server/auth/auth");
    ({ getDb } = await import("@/server/container"));
    const auth = getAuth();
    handler = (r) => auth.handler(r);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const signUp = async (email: string) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await handler(
      new Request(`${ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({ name: email, email, password: "password-1234" }),
      }),
    );
    log.mockRestore();
    warn.mockRestore();
    const db = await getDb();
    return db.findOne<{ id: string; role: string }>("auth_user", { where: [{ field: "email", op: "eq", value: email }] });
  };

  it("only the very first account of an empty instance becomes admin, and demotion never re-arms it", async () => {
    expect((await signUp("first@example.com"))?.role).toBe("admin");
    expect((await signUp("second@example.com"))?.role).toBe("viewer");

    const db = await getDb();
    const first = await db.findOne<{ id: string }>("auth_user", { where: [{ field: "email", op: "eq", value: "first@example.com" }] });
    await db.update("auth_user", first!.id, { role: "viewer" }); // zero admins now
    expect((await signUp("third@example.com"))?.role).toBe("viewer");
  });
});
