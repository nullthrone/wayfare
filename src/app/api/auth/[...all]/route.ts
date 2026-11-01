import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";
import { readState } from "@/server/sources/google-oauth";
import { GET as handleSourcesCallback } from "../../sources/callback/route";

// Better Auth needs the Node.js runtime (better-sqlite3, crypto) and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The instance is created lazily on the first request (config() reads env at call time).
const authHandler = toNextJsHandler((request: Request) => getAuth().handler(request));

export const POST = authHandler.POST;

// When GOOGLE_SOURCES_CLIENT_ID is unset and AUTH_GOOGLE_ID is reused for photo sources,
// Google redirects back to /api/auth/callback/google with a signed "oauth-state" token.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/api/auth/callback/google" && readState(url.searchParams.get("state"))) {
    return handleSourcesCallback(request);
  }
  return authHandler.GET(request);
}
