import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/server/config";
import { createFakeDb, json, setGoogleEnv } from "./helpers";
import type { OAuthTokens } from "@/server/ports/photo-source";

const dbHolder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/server/container", () => ({ getDb: async () => dbHolder.db }));

import { buildAuthUrl, createState, needsRefresh, readState, refreshTokens, sanitizeReturnTo, withQueryParam } from "@/server/sources/google-oauth";
import { connectionId, disconnect, getConnection, getValidTokens, saveConnection } from "@/server/sources/connections";
import { sealToken } from "@/server/crypto";

const PHOTOS_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

beforeEach(() => {
  setGoogleEnv();
  resetConfigForTests();
  dbHolder.db = createFakeDb();
});
afterEach(() => vi.unstubAllGlobals());

describe("buildAuthUrl", () => {
  it("sets the required OAuth parameters", () => {
    const url = new URL(buildAuthUrl({ userId: "u1", sourceId: "google-photos", returnTo: "/dashboard", scopes: [PHOTOS_SCOPE] }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("client-id.apps.googleusercontent.com");
    expect(p.get("redirect_uri")).toBe("https://wayfare.example/api/sources/callback");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("include_granted_scopes")).toBe("true");
    expect(p.get("scope")!.split(" ")).toEqual([PHOTOS_SCOPE, "openid", "email"]);
    expect(readState(p.get("state"))).toEqual({ userId: "u1", sourceId: "google-photos", returnTo: "/dashboard" });
  });

  it("reuses /api/auth/callback/google when falling back to AUTH_GOOGLE_ID", () => {
    delete process.env.GOOGLE_SOURCES_CLIENT_ID;
    delete process.env.GOOGLE_SOURCES_CLIENT_SECRET;
    process.env.AUTH_GOOGLE_ID = "shared-client.apps.googleusercontent.com";
    process.env.AUTH_GOOGLE_SECRET = "shared-secret";
    resetConfigForTests();
    const url = new URL(buildAuthUrl({ userId: "u1", sourceId: "google-photos", returnTo: "/account", scopes: [PHOTOS_SCOPE] }));
    expect(url.searchParams.get("client_id")).toBe("shared-client.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe("https://wayfare.example/api/auth/callback/google");
  });

  it("rejects when the operator did not configure credentials", () => {
    delete process.env.GOOGLE_SOURCES_CLIENT_ID;
    delete process.env.AUTH_GOOGLE_ID;
    resetConfigForTests();
    expect(() => buildAuthUrl({ userId: "u", sourceId: "google-photos", returnTo: "/", scopes: [] })).toThrowError(/sourceNotConfigured/);
  });
});

describe("state", () => {
  it("round-trips and sanitises returnTo", () => {
    const s = createState({ userId: "u1", sourceId: "google-drive", returnTo: "https://evil.example/x" });
    expect(readState(s)).toEqual({ userId: "u1", sourceId: "google-drive", returnTo: "/account" });
  });

  it("rejects tampered, expired and foreign tokens", () => {
    const s = createState({ userId: "u1", sourceId: "google-drive", returnTo: "/a" });
    const [body, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: "admin", sourceId: "google-drive", returnTo: "/a", exp: 9999999999 })).toString("base64url");
    expect(readState(`${forged}.${sig}`)).toBeNull();
    expect(readState(`${body}.x${sig}`)).toBeNull();
    expect(readState("garbage")).toBeNull();
    expect(readState(null)).toBeNull();
    expect(readState(sealToken("oauth-state", { userId: "u", sourceId: "google-drive", returnTo: "/" }, -10))).toBeNull();
    // token sealed for a different purpose must not validate as oauth state
    expect(readState(sealToken("unlock", { userId: "u", sourceId: "google-drive", returnTo: "/" }, 100))).toBeNull();
  });
});

describe("sanitizeReturnTo", () => {
  it.each([
    ["/albums/1?x=1", "/albums/1?x=1"],
    ["/", "/"],
    ["//evil.example", "/account"],
    ["https://evil.example", "/account"],
    ["/\\evil.example", "/account"],
    ["javascript:alert(1)", "/account"],
    ["/ok\nSet-Cookie: x", "/account"],
    ["", "/account"],
    [null, "/account"],
  ])("%j → %j", (input, expected) => expect(sanitizeReturnTo(input)).toBe(expected));

  it("withQueryParam overwrites existing values", () => {
    expect(withQueryParam("/a?source=error&x=1", "source", "connected")).toBe("/a?source=connected&x=1");
  });
});

describe("token refresh", () => {
  const tokens = (over: Partial<OAuthTokens> = {}): OAuthTokens => ({ accessToken: "old", refreshToken: "r1", expiresAt: Date.now() + 3_600_000, scope: PHOTOS_SCOPE, ...over });

  it("needsRefresh uses a 60 s safety window", () => {
    const now = 1_000_000;
    expect(needsRefresh(tokens({ expiresAt: now + 61_000 }), now)).toBe(false);
    expect(needsRefresh(tokens({ expiresAt: now + 59_000 }), now)).toBe(true);
  });

  it("refreshTokens keeps the refresh token and posts the right form", async () => {
    const fetchMock = vi.fn(async () => json({ access_token: "new", expires_in: 3600, scope: PHOTOS_SCOPE }));
    vi.stubGlobal("fetch", fetchMock);
    const fresh = await refreshTokens(tokens());
    expect(fresh.accessToken).toBe("new");
    expect(fresh.refreshToken).toBe("r1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("r1");
  });

  it("maps invalid_grant to reconnect required", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid_grant" }, { status: 400 })));
    await expect(refreshTokens(tokens())).rejects.toMatchObject({ messageKey: "sourceReconnectRequired" });
    await expect(refreshTokens(tokens({ refreshToken: null }))).rejects.toMatchObject({ messageKey: "sourceReconnectRequired" });
  });

  it("getValidTokens returns stored tokens without a network call when still valid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await saveConnection("u1", "google-photos", tokens(), "me@example.com");
    const got = await getValidTokens("u1", "google-photos");
    expect(got.accessToken).toBe("old");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("getValidTokens refreshes expiring tokens once (shared in flight) and persists them encrypted", async () => {
    const fetchMock = vi.fn(async () => json({ access_token: "new", expires_in: 3600, scope: PHOTOS_SCOPE }));
    vi.stubGlobal("fetch", fetchMock);
    await saveConnection("u1", "google-photos", tokens({ expiresAt: Date.now() + 10_000 }), "me@example.com");
    const [a, b] = await Promise.all([getValidTokens("u1", "google-photos"), getValidTokens("u1", "google-photos")]);
    expect(a.accessToken).toBe("new");
    expect(b.accessToken).toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stored = await getConnection("u1", "google-photos");
    expect(stored!.tokensEnc.startsWith("v1.")).toBe(true);
    expect(stored!.tokensEnc).not.toContain("new");
    // second read comes from the persisted fresh token
    expect((await getValidTokens("u1", "google-photos")).accessToken).toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when not connected", async () => {
    await expect(getValidTokens("nobody", "google-drive")).rejects.toMatchObject({ messageKey: "sourceNotConnected" });
  });

  it("saveConnection keeps an existing refresh token if Google sent none", async () => {
    await saveConnection("u1", "google-photos", tokens({ refreshToken: "keep" }), "a@b.c");
    await saveConnection("u1", "google-photos", tokens({ refreshToken: null, accessToken: "second" }), null);
    const t = await getValidTokens("u1", "google-photos");
    expect(t.refreshToken).toBe("keep");
    expect(t.accessToken).toBe("second");
    expect((await getConnection("u1", "google-photos"))!.accountEmail).toBe("a@b.c");
  });

  it("disconnect revokes at Google (last connection) and deletes", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await saveConnection("u1", "google-photos", tokens(), null);
    await disconnect("u1", "google-photos");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(new URLSearchParams(init.body as string).get("token")).toBe("r1");
    expect(await getConnection("u1", "google-photos")).toBeNull();
  });

  it("disconnect does not revoke the shared grant while another source is connected, and survives revoke errors", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    await saveConnection("u1", "google-photos", tokens(), null);
    await saveConnection("u1", "google-drive", tokens(), null);
    await disconnect("u1", "google-photos");
    expect(fetchMock).not.toHaveBeenCalled();
    await disconnect("u1", "google-drive"); // revoke throws → ignored
    expect(await getConnection("u1", "google-drive")).toBeNull();
    expect(connectionId("u1", "google-drive")).toBe("u1_google-drive");
  });
});
