"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

/**
 * Better Auth browser client (same-origin, talks to /api/auth/*).
 *
 *  - Magic link:      authClient.signIn.magicLink({ email, callbackURL })
 *  - Passkey sign-in: authClient.signIn.passkey()  (conditional UI: { autoFill: true })
 *  - Add passkey:     authClient.passkey.addPasskey({ name? })
 *  - List passkeys:   authClient.passkey.listUserPasskeys()  /  authClient.useListPasskeys() hook
 *  - Delete passkey:  authClient.passkey.deletePasskey({ id })
 *  - Social:          authClient.signIn.social({ provider: "google" | "apple" | "facebook" | "discord", callbackURL })
 *  - E-mail/password: authClient.signIn.email({ email, password }) / authClient.signUp.email({ name, email, password })
 *  - Sign out:        authClient.signOut()
 */
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), passkeyClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
