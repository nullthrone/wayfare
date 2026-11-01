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
    // Works with the console mailer in development (the link is printed to stdout).
    magicLink: cfg.AUTH_MAGIC_LINK,
    passkey: cfg.AUTH_PASSKEY,
    emailPassword: cfg.AUTH_EMAIL_PASSWORD || cfg.WAYFARE_DEMO_MODE,
  };
}
