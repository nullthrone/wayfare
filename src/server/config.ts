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

/** smtp(s)://[user[:password]@]host[:port] — validated at startup so a typo fails loudly (without echoing the secret). */
export function isValidSmtpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    if (u.protocol !== "smtp:" && u.protocol !== "smtps:") return false;
    return /^(localhost|[0-9.]+|([A-Za-z0-9-]+\.)+[A-Za-z]{2,})$/.test(u.hostname);
  } catch {
    return false;
  }
}

const smtpUrl = optStr.refine((v) => v === undefined || isValidSmtpUrl(v), {
  message: "SMTP_URL must look like smtps://user:password@smtp.example.com:465 (URL-encode special characters, e.g. @ as %40)",
});

const schema = z.object({
  WAYFARE_RUNTIME: z.enum(["selfhost", "firebase"]).default("selfhost"),
  WAYFARE_BASE_URL: z.string().url().default("http://localhost:3000"),
  WAYFARE_SECRET: z.string().min(32, "WAYFARE_SECRET must be at least 32 characters"),
  WAYFARE_ADMIN_EMAILS: z.string().default(""),
  WAYFARE_DEMO_MODE: bool(false),
  /** Number of reverse proxies in front of Wayfare that append to X-Forwarded-For (for rate limiting). */
  WAYFARE_TRUSTED_PROXIES: z.coerce.number().int().min(0).max(10).default(1),

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

  SMTP_URL: smtpUrl,
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

/**
 * Minimal dotenv parser for the WAYFARE_ENV bundle: `KEY=value` per line, `#` comments,
 * optional `export ` prefix, single/double quotes (double quotes support \n escapes).
 */
export function parseDotenv(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    out[m[1]] = value;
  }
  return out;
}

/**
 * Effective environment:
 *  1. `WAYFARE_ENV` — optional dotenv bundle (used on Firebase App Hosting, where the whole
 *     instance configuration lives in ONE Secret Manager secret, so the committed apphosting.yaml
 *     stays generic and forks need no file changes),
 *  2. real environment variables override the bundle,
 *  3. Firebase/Google defaults fill FIREBASE_PROJECT_ID / FIREBASE_STORAGE_BUCKET when unset.
 */
export function effectiveEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...parseDotenv(env.WAYFARE_ENV ?? "") };
  for (const [k, v] of Object.entries(env)) if (v !== undefined && v !== "" && k !== "WAYFARE_ENV") merged[k] = v;

  let firebaseConfig: { projectId?: string; storageBucket?: string } = {};
  try {
    if (env.FIREBASE_CONFIG?.trim().startsWith("{")) firebaseConfig = JSON.parse(env.FIREBASE_CONFIG);
  } catch {
    // ignore malformed FIREBASE_CONFIG
  }
  merged.FIREBASE_PROJECT_ID ??= firebaseConfig.projectId ?? merged.GOOGLE_CLOUD_PROJECT ?? merged.GCLOUD_PROJECT;
  if (merged.FIREBASE_PROJECT_ID) merged.FIREBASE_STORAGE_BUCKET ??= firebaseConfig.storageBucket ?? `${merged.FIREBASE_PROJECT_ID}.firebasestorage.app`;
  return merged;
}

function loadConfig() {
  const parsed = schema.safeParse(effectiveEnv());
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
