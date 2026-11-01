import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { config } from "@/server/config";
import { sendDailyDigests } from "@/server/services/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** POST with `Authorization: Bearer ${CRON_SECRET}`. 404 when CRON_SECRET is not configured. */
export async function POST(req: Request) {
  const secret = config().CRON_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  if (!authorized(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sendDailyDigests());
  } catch (err) {
    console.error("[cron] digest failed", err);
    return NextResponse.json({ error: "generic" }, { status: 500 });
  }
}
