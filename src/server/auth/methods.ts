import "server-only";
import { config } from "../config";

export type SocialProviderId = "google" | "apple" | "facebook" | "discord";

export interface LoginMethods {
  social: SocialProviderId[];
  magicLink: boolean;
  passkey: boolean;
  emailPassword: boolean;
}

/** Which sign-in methods the operator enabled (server-only; used by the login page). */
export function getLoginMethods(): LoginMethods {
  const cfg = config();
  const social: SocialProviderId[] = [];
  if (cfg.AUTH_GOOGLE_ID && cfg.AUTH_GOOGLE_SECRET) social.push("google");
  if (cfg.AUTH_APPLE_ID && cfg.AUTH_APPLE_SECRET) social.push("apple");
  if (cfg.AUTH_FACEBOOK_ID && cfg.AUTH_FACEBOOK_SECRET) social.push("facebook");
  if (cfg.AUTH_DISCORD_ID && cfg.AUTH_DISCORD_SECRET) social.push("discord");
  return {
    social,
    magicLink: magicLinkEnabled(cfg),
    passkey: cfg.AUTH_PASSKEY,
    emailPassword: cfg.AUTH_EMAIL_PASSWORD || cfg.WAYFARE_DEMO_MODE,
  };
}

/**
 * Magic links are only offered when they can be delivered privately: with SMTP, in demo mode,
 * or outside production (dev: the console mailer prints the link). In production without SMTP
 * the console mailer would write working sign-in links into the logs.
 */
export function magicLinkEnabled(cfg: ReturnType<typeof config>): boolean {
  if (!cfg.AUTH_MAGIC_LINK) return false;
  return !!cfg.SMTP_URL || cfg.WAYFARE_DEMO_MODE || process.env.NODE_ENV !== "production";
}
