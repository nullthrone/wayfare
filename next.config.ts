import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Cache Components is intentionally disabled (see docs/adr/0002-no-cache-components.md):
 * nearly every Wayfare route reads the session or album-access cookies.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: false,
  serverExternalPackages: ["better-sqlite3", "sharp", "firebase-admin"],
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
  },
  poweredByHeader: false,
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
    ];
    return [
      { source: "/:path*", headers: security },
      // Album pages must never be indexed by search engines.
      { source: "/a/:slug*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noimageindex" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
