import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { magicLink } from "better-auth/plugins/magic-link";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { config } from "../config";
import { getDb, getMailer } from "../container";
import { COLLECTIONS } from "../ports/document-store";
import { documentStoreAdapter } from "./adapter";

/**
 * Better Auth instance (lazy). `config()` reads the environment at call time, so the instance is built
 * on first use (route handler / server component) and cached on globalThis (survives dev HMR).
 * Do NOT construct it at module load time: `next build` imports route modules without the runtime env.
 */

function buildAuth() {
  const cfg = config();
  const baseUrl = cfg.baseUrl;
  const social: NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]> = {};
  const trustedOrigins: string[] = [];

  if (cfg.AUTH_GOOGLE_ID && cfg.AUTH_GOOGLE_SECRET) {
    social.google = { clientId: cfg.AUTH_GOOGLE_ID, clientSecret: cfg.AUTH_GOOGLE_SECRET };
  }
  if (cfg.AUTH_APPLE_ID && cfg.AUTH_APPLE_SECRET) {
    social.apple = {
      clientId: cfg.AUTH_APPLE_ID,
      clientSecret: cfg.AUTH_APPLE_SECRET,
      ...(cfg.AUTH_APPLE_BUNDLE_ID ? { appBundleIdentifier: cfg.AUTH_APPLE_BUNDLE_ID } : {}),
    };
    trustedOrigins.push("https://appleid.apple.com");
  }
  if (cfg.AUTH_FACEBOOK_ID && cfg.AUTH_FACEBOOK_SECRET) {
    social.facebook = { clientId: cfg.AUTH_FACEBOOK_ID, clientSecret: cfg.AUTH_FACEBOOK_SECRET };
  }
  if (cfg.AUTH_DISCORD_ID && cfg.AUTH_DISCORD_SECRET) {
    social.discord = { clientId: cfg.AUTH_DISCORD_ID, clientSecret: cfg.AUTH_DISCORD_SECRET };
  }

  const isAdminEmail = (email: string | undefined | null) => !!email && cfg.adminEmails.includes(email.trim().toLowerCase());

  const plugins = [
    ...(cfg.AUTH_MAGIC_LINK
      ? [
          magicLink({
            expiresIn: 60 * 10,
            async sendMagicLink({ email, url }) {
              const mailer = await getMailer();
              await mailer.send({
                to: email,
                subject: "Dein Anmeldelink / Your sign-in link",
                text: [
                  "Hallo!",
                  "",
                  "Mit diesem Link meldest du dich bei Wayfare an (10 Minuten gültig, nur einmal nutzbar):",
                  url,
                  "",
                  "Du hast das nicht angefordert? Dann kannst du diese E-Mail ignorieren.",
                  "",
                  "————————————",
                  "",
                  "Hello!",
                  "",
                  "Use this link to sign in to Wayfare (valid for 10 minutes, single use):",
                  url,
                  "",
                  "Didn't request this? You can safely ignore this e-mail.",
                ].join("\n"),
                html: `<p>Hallo!</p><p>Mit diesem Link meldest du dich bei Wayfare an (10&nbsp;Minuten gültig, nur einmal nutzbar):</p><p><a href="${url}">Jetzt anmelden</a></p><p style="color:#666">Du hast das nicht angefordert? Dann kannst du diese E-Mail ignorieren.</p><hr><p>Hello!</p><p>Use this link to sign in to Wayfare (valid for 10&nbsp;minutes, single use):</p><p><a href="${url}">Sign in now</a></p><p style="color:#666">Didn't request this? You can safely ignore this e-mail.</p>`,
              });
            },
          }),
        ]
      : []),
    ...(cfg.AUTH_PASSKEY ? [passkey({ rpID: new URL(baseUrl).hostname, rpName: "Wayfare", origin: new URL(baseUrl).origin })] : []),
    nextCookies(), // must stay the last plugin
  ];

  return betterAuth({
    appName: "Wayfare",
    baseURL: baseUrl,
    secret: cfg.WAYFARE_SECRET,
    database: documentStoreAdapter(),
    trustedOrigins,
    emailAndPassword: {
      enabled: cfg.AUTH_EMAIL_PASSWORD || cfg.WAYFARE_DEMO_MODE,
      autoSignIn: true,
      minPasswordLength: 8,
    },
    socialProviders: social,
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "apple"],
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "viewer", input: false },
        banned: { type: "boolean", required: false, defaultValue: false, input: false },
        locale: { type: "string", required: false, input: true },
      },
    },
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            let role: "admin" | "viewer" = "viewer";
            if (isAdminEmail(user.email)) {
              role = "admin";
            } else {
              // Bootstrap: the very first user of a fresh instance becomes admin.
              const db = await getDb();
              const admins = await db.count(COLLECTIONS.authUser.name, { where: [{ field: "role", op: "eq", value: "admin" }] });
              if (admins === 0) role = "admin";
            }
            return { data: { ...user, role, banned: false } };
          },
        },
      },
      session: {
        create: {
          async before(session) {
            const db = await getDb();
            const user = await db.get<{ id: string; email: string; role?: string; banned?: boolean }>(COLLECTIONS.authUser.name, session.userId);
            if (!user) return;
            if (user.banned) {
              throw new APIError("FORBIDDEN", { message: "This account has been blocked.", code: "USER_BANNED" });
            }
            if (isAdminEmail(user.email) && user.role !== "admin") {
              await db.update(COLLECTIONS.authUser.name, user.id, { role: "admin" });
            }
          },
        },
      },
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof buildAuth>;

const g = globalThis as unknown as { __wayfareAuth?: Auth };

/** Lazily constructed, process-wide Better Auth instance. */
export function getAuth(): Auth {
  if (!g.__wayfareAuth) g.__wayfareAuth = buildAuth();
  return g.__wayfareAuth;
}
