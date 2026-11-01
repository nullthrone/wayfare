# Authentication

Wayfare uses [Better Auth](https://www.better-auth.com). Which login methods appear is decided by environment variables ([reference](./configuration)). Owners and guests use the same methods.

For every OAuth provider register this **redirect (callback) URI**:

```
${WAYFARE_BASE_URL}/api/auth/callback/<provider>
```

with `<provider>` = `google`, `apple`, `facebook` or `discord`. Example: `https://photos.example.com/api/auth/callback/google`. The URL must exactly match `WAYFARE_BASE_URL`.

## Admin bootstrap

- Everyone whose e-mail is in `WAYFARE_ADMIN_EMAILS` (comma-separated) becomes **admin** on sign-up and is promoted on the next sign-in.
- If no admin exists at all, the **first user** to sign up becomes admin.
- Afterwards admins promote other users in **/admin → Users** and choose the onboarding mode.

## E-mail and password

Set `AUTH_EMAIL_PASSWORD=true`. Off by default because most people prefer magic links or social login.

## Magic link

On by default (`AUTH_MAGIC_LINK=true`). Requires working mail ([Mail](./mail)); without `SMTP_URL` the link is only printed to the server log — fine for development.

## Passkeys

`AUTH_PASSKEY=true` (default). Passkeys require **HTTPS** (except on `localhost`) and a **stable domain** — a passkey is bound to the domain name, so changing `WAYFARE_BASE_URL` invalidates existing passkeys. Do not use passkeys on a throw-away URL.

## Google

1. [Google Cloud Console](https://console.cloud.google.com) → create/select a project.
2. *APIs & Services → OAuth consent screen*: choose *External*, set app name, support e-mail and your domain; scopes `openid`, `email`, `profile` are non-sensitive.
3. *Credentials → Create credentials → OAuth client ID → Web application*.
4. Authorized redirect URI: `${WAYFARE_BASE_URL}/api/auth/callback/google`.
5. Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

Publish the consent screen (*In production*) so that not only test users can log in. You can reuse the same client for [photo import](./photo-sources) by adding the second redirect URI.

## Apple

Sign in with Apple needs an **Apple Developer Program** membership (**99 USD/year**) and an HTTPS domain.

1. *Certificates, Identifiers & Profiles → Identifiers*: create an **App ID** with the *Sign in with Apple* capability.
2. Create a **Services ID** (e.g. `com.example.wayfare.web`). Enable *Sign in with Apple* and *Configure*: primary App ID, your domain (without `https://`) and the return URL `${WAYFARE_BASE_URL}/api/auth/callback/apple`.
3. *Keys*: create a key with *Sign in with Apple*, download the `.p8` file once and note the **Key ID** and your **Team ID**.
4. Apple's "client secret" is a **JWT** signed with that key (ES256; `iss`=Team ID, `sub`=Services ID, `aud`=`https://appleid.apple.com`, lifetime max. 6 months). Generate it with a small script or the Better Auth docs' helper.
5. Set `AUTH_APPLE_ID` = **Services ID** and `AUTH_APPLE_SECRET` = the JWT. `AUTH_APPLE_BUNDLE_ID` is only needed for native apps.

::: warning The secret expires
Regenerate the JWT before it expires (at the latest every 6 months) and restart. Put a reminder in your calendar.
:::

## Facebook

1. [developers.facebook.com](https://developers.facebook.com) → *Create app* (use case: *Authenticate and request data from users with Facebook Login*).
2. Add the *Facebook Login* product → *Valid OAuth Redirect URIs*: `${WAYFARE_BASE_URL}/api/auth/callback/facebook`.
3. *Settings → Basic*: copy **App ID** and **App Secret** → `AUTH_FACEBOOK_ID`, `AUTH_FACEBOOK_SECRET`. Set privacy-policy URL (your /privacy page) and an app icon.
4. The app starts in *development mode*: only app roles (you, testers) can log in. To open it to everybody switch to *Live* — Meta may require a **business verification and app review** for permissions beyond `email` and `public_profile`. Wayfare only needs these two basic permissions, which are available without review once the app is live.

## Discord

1. [discord.com/developers/applications](https://discord.com/developers/applications) → *New Application*.
2. *OAuth2*: add the redirect `${WAYFARE_BASE_URL}/api/auth/callback/discord`; copy the **Client ID** and **Client Secret**.
3. Set `AUTH_DISCORD_ID` and `AUTH_DISCORD_SECRET`. Scopes `identify` and `email` are used.

## Check it

Restart Wayfare and open the login page — each configured provider shows a button. If something fails, check [Troubleshooting](./troubleshooting).
