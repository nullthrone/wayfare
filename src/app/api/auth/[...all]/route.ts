import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

// Better Auth needs the Node.js runtime (better-sqlite3, crypto) and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The instance is created lazily on the first request (config() reads env at call time).
export const { GET, POST } = toNextJsHandler((request: Request) => getAuth().handler(request));
