# Configuration reference

Wayfare is configured exclusively through **environment variables**, validated at start-up (`src/server/config.ts`). With Docker Compose they come from `.env`; on Firebase from `apphosting.yaml` and Secret Manager. Invalid values stop the server with a readable error list.

Booleans accept `true`, `false`, `1`, `0`. An empty value means "use the default". Keys marked **secret** should never be committed.

## Core

| Key | Default | Description |
|---|---|---|
| `WAYFARE_RUNTIME` | `selfhost` | `selfhost` (SQLite + local/S3) or `firebase` (Firestore + Firebase Storage) |
| `WAYFARE_BASE_URL` | `http://localhost:3000` | Public URL without trailing slash. Used for share links, QR codes, OAuth redirects and e-mail links. Must match what users type in the browser |
| `WAYFARE_SECRET` | *(required)* | **Secret.** At least 32 characters. Signs media URLs and cookies, encrypts stored Google tokens |
| `WAYFARE_ADMIN_EMAILS` | *(empty)* | Comma-separated e-mail addresses that become **admin** on sign-up and sign-in. Without any admin, the first user to sign up becomes admin |
| `WAYFARE_DEMO_MODE` | `false` | Demo mode for seeded demo data/screenshots. Never enable in production |
| `DATA_DIR` | `./data` | Where SQLite (`wayfare.db`) and local blobs (`blobs/`) live. `/data` in the Docker image |

## Storage

| Key | Default | Description |
|---|---|---|
| `STORAGE_DRIVER` | `local` (selfhost) / `firebase` (firebase) | `local`, `s3` or `firebase` |
| `S3_ENDPOINT` | *(empty)* | S3-compatible endpoint, e.g. `http://minio:9000` or the R2 URL. Empty = AWS |
| `S3_REGION` | `auto` | Region (`auto` for R2/MinIO, e.g. `eu-central-1` for AWS) |
| `S3_BUCKET` | *(empty)* | Bucket name (required for `s3`) |
| `S3_ACCESS_KEY_ID` | *(empty)* | Access key (required for `s3`) |
| `S3_SECRET_ACCESS_KEY` | *(empty)* | **Secret.** Secret key (required for `s3`) |
| `S3_FORCE_PATH_STYLE` | `true` | Path-style addressing; needed for MinIO, harmless for most others. Set `false` for AWS virtual-host style |

## Firebase

| Key | Default | Description |
|---|---|---|
| `FIREBASE_PROJECT_ID` | *(empty)* | Firebase/Google Cloud project ID |
| `FIREBASE_STORAGE_BUCKET` | *(empty)* | Storage bucket, e.g. `my-project.firebasestorage.app` |
| `FIREBASE_SERVICE_ACCOUNT` | *(empty)* | **Secret.** Service-account JSON (stringified). Omit to use Application Default Credentials (recommended on App Hosting) |

## Mail

| Key | Default | Description |
|---|---|---|
| `SMTP_URL` | *(empty)* | **Secret.** e.g. `smtps://user:pass@smtp.example.com:465`. Empty = mails (incl. magic links) are written to the server log |
| `MAIL_FROM` | `Wayfare <no-reply@localhost>` | Sender address and name |

## Login providers

A social provider is enabled when both ID and secret are set. See [Authentication](./authentication).

| Key | Default | Description |
|---|---|---|
| `AUTH_GOOGLE_ID` | *(empty)* | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | *(empty)* | **Secret.** Google OAuth client secret |
| `AUTH_APPLE_ID` | *(empty)* | Apple *Services ID* (e.g. `com.example.wayfare.web`) |
| `AUTH_APPLE_SECRET` | *(empty)* | **Secret.** Apple client secret — a signed JWT generated from your Apple key (expires after at most 6 months) |
| `AUTH_APPLE_BUNDLE_ID` | *(empty)* | Optional app bundle ID, only needed for native-app token sign-in |
| `AUTH_FACEBOOK_ID` | *(empty)* | Meta app ID |
| `AUTH_FACEBOOK_SECRET` | *(empty)* | **Secret.** Meta app secret |
| `AUTH_DISCORD_ID` | *(empty)* | Discord application client ID |
| `AUTH_DISCORD_SECRET` | *(empty)* | **Secret.** Discord client secret |
| `AUTH_PASSKEY` | `true` | Allow passkeys (WebAuthn). Requires HTTPS and a stable domain |
| `AUTH_MAGIC_LINK` | `true` | Sign in via e-mail link. Needs `SMTP_URL` for real delivery |
| `AUTH_EMAIL_PASSWORD` | `false` | Classic e-mail + password sign-in |

## Photo sources (Google)

See [Photo sources](./photo-sources).

| Key | Default | Description |
|---|---|---|
| `GOOGLE_SOURCES_CLIENT_ID` | falls back to `AUTH_GOOGLE_ID` | OAuth client for Photos/Drive import |
| `GOOGLE_SOURCES_CLIENT_SECRET` | falls back to `AUTH_GOOGLE_SECRET` | **Secret.** Matching client secret |
| `GOOGLE_API_KEY` | *(empty)* | Browser API key (restricted to your domain) for the Google Drive Picker |
| `GOOGLE_APP_ID` | *(empty)* | Google Cloud **project number**, required for the Drive Picker |

## Scheduled jobs

| Key | Default | Description |
|---|---|---|
| `CRON_SECRET` | *(empty)* | **Secret.** Bearer token for `POST /api/cron/digest`, which sends the daily digest e-mails |

## Settings in the admin area

Some options are not environment variables but stored in the database and edited in **/admin**: instance name, onboarding mode (*open*, *approval*, *invite*), maximum upload size per photo (default 25 MB), maximum photos per album (default 500) and the imprint/privacy pages (Markdown).
