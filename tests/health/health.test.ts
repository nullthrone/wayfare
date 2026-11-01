import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/container", async () => (await import("../services/fakes")).containerMock);

import { GET } from "@/app/api/health/route";
import { resetConfigForTests } from "@/server/config";
import { ctx, resetCtx } from "../services/fakes";

beforeEach(() => {
  resetCtx();
  resetConfigForTests();
  delete process.env.WAYFARE_TRUSTED_PROXIES;
});

describe("GET /api/health", () => {
  it("returns only the status by default", async () => {
    const res = await GET(new Request("http://localhost:3000/api/health", { headers: { "x-forwarded-for": "1.2.3.4" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("?diag=forwarded returns the parsed X-Forwarded-For chain and the configured proxy count", async () => {
    process.env.WAYFARE_TRUSTED_PROXIES = "2";
    resetConfigForTests();
    const res = await GET(
      new Request("http://localhost:3000/api/health?diag=forwarded", {
        headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9 ,34.1.2.3" },
      }),
    );
    expect(await res.json()).toEqual({ status: "ok", forwardedFor: ["6.6.6.6", "203.0.113.9", "34.1.2.3"], trustedProxies: 2 });
  });

  it("?diag=forwarded without the header yields an empty chain", async () => {
    const res = await GET(new Request("http://localhost:3000/api/health?diag=forwarded"));
    expect(await res.json()).toEqual({ status: "ok", forwardedFor: [], trustedProxies: 1 });
  });

  it("answers 503 when the database is unreachable", async () => {
    vi.spyOn(ctx.db, "get").mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(new Request("http://localhost:3000/api/health"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error" });
  });
});
