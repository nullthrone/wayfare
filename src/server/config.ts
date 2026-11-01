import "server-only";
import { z } from "zod";

/**
 * Central, validated runtime configuration. ALL environment access goes through here.
 * Documented for operators in docs/{de,en}/operator/configuration.md — keep in sync
 * (the docs-sync hook checks that every key below appears in the docs).
 */

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

const optStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  WAYFARE_RUNTIME: z.enum(["selfhost", "firebase"]).default("selfhost"),
  WAYFARE_BASE_URL: z.string().url().default("http://localhost:3000"),
  WAYFARE_SECRET: z.string().min(32, "WAYFARE_SECRET must be at least 32 characters"),
  WAYFARE_ADMIN_EMAILS: z.string().default(""),
  WAYFARE_DEMO_MODE: bool(false),

  DATA_DIR: z.string().default("./data"),
  STORAGE_DRIVER: z.enum(["local", "s3", "firebase"]).optional(),

  S3_ENDPOINT: optStr,
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: optStr,
  S3_ACCESS_KEY_ID: optStr,
  S3_SECRET_ACCESS_KEY: optStr,
  S3_FORCE_PATH_STYLE: bool(true),

  FIREBASE_PROJECT_ID: optStr,
  FIREBASE_STORAGE_BUCKET: optStr,
  /** Optional service-account JSON (stringified). Without it, Application Default Credentials are used. */
  FIREBASE_SERVICE_ACCOUNT: optStr,

  SMTP_URL: optStr,
  MAIL_FROM: z.string().default("Wayfare <no-reply@localhost>"),

  AUTH_GOOGLE_ID: optStr,
  AUTH_GOOGLE_SECRET: optStr,
  AUTH_APPLE_ID: optStr,
  AUTH_APPLE_SECRET: optStr,
  AUTH_APPLE_BUNDLE_ID: optStr,
  AUTH_FACEBOOK_ID: optStr,
  AUTH_FACEBOOK_SECRET: optStr,
  AUTH_DISCORD_ID: optStr,
  AUTH_DISCORD_SECRET: optStr,
  AUTH_PASSKEY: bool(true),
  AUTH_MAGIC_LINK: bool(true),
  AUTH_EMAIL_PASSWORD: bool(false),

  /** OAuth client for photo sources; falls back to AUTH_GOOGLE_*. */
  GOOGLE_SOURCES_CLIENT_ID: optStr,
  GOOGLE_SOURCES_CLIENT_SECRET: optStr,
  /** Browser API key + Cloud project number, required for the Google Drive Picker. */
  GOOGLE_API_KEY: optStr,
  GOOGLE_APP_ID: optStr,

  CRON_SECRET: optStr,
});

export type AppConfig = ReturnType<typeof loadConfig>;

function loadConfig() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid Wayfare configuration:\n${issues}`);
  }
  const env = parsed.data;
  const storageDriver = env.STORAGE_DRIVER ?? (env.WAYFARE_RUNTIME === "firebase" ? "firebase" : "local");
  return {
    ...env,
    storageDriver,
    adminEmails: env.WAYFARE_ADMIN_EMAILS.split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    baseUrl: env.WAYFARE_BASE_URL.replace(/\/$/, ""),
    googleSources: {
      clientId: env.GOOGLE_SOURCES_CLIENT_ID ?? env.AUTH_GOOGLE_ID,
      clientSecret: env.GOOGLE_SOURCES_CLIENT_SECRET ?? env.AUTH_GOOGLE_SECRET,
    },
  };
}

let cached: AppConfig | null = null;
export function config(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Only for tests. */
export function resetConfigForTests() {
  cached = null;
}
