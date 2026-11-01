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
