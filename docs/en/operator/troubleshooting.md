# Troubleshooting

## The server does not start: "Invalid Wayfare configuration"

The message lists every invalid variable. Typical: `WAYFARE_SECRET must be at least 32 characters`, or a malformed `WAYFARE_BASE_URL` (needs `http://` or `https://`). See [Configuration](./configuration).

## Login with Google/Apple/… fails

- `redirect_uri_mismatch` — the registered URI must be exactly `${WAYFARE_BASE_URL}/api/auth/callback/<provider>`. Check scheme (http vs https), host and port. Behind a reverse proxy, `WAYFARE_BASE_URL` must be the **public** URL.
- Provider button missing — ID **and** secret must both be set; restart the server.
- Apple stopped working after months — the client-secret JWT expired; regenerate it ([Authentication](./authentication#apple)).
- Facebook: only developers can log in — the app is still in *development mode*.

## Magic link does not arrive

Without `SMTP_URL` it is only in the log (`docker compose logs wayfare`). With SMTP: check credentials, port/TLS mode, SPF/DKIM and the spam folder.

## Passkeys cannot be created

They need HTTPS (or `localhost`) and the domain from `WAYFARE_BASE_URL`. After changing the domain old passkeys no longer work; sign in another way and add a new one.

## Uploads fail

- "File too large" — raise the limit in **/admin → Settings** (`maxUploadMb`) *and* your reverse proxy's body size (nginx `client_max_body_size`, Caddy `max_size`). Server actions accept up to 30 MB.
- Album full — `maxPhotosPerAlbum` (default 500).
- HEIC not decoded — convert on the phone (share as "Most compatible") or upload JPEG.
- Out of memory on Firebase — raise `memoryMiB` in `apphosting.yaml`.

## Photos show but broken after restart / images 403

Media URLs are signed with `WAYFARE_SECRET`. A changed secret invalidates open pages — reload. A clock skew between server and client is not an issue, since expiry is checked by the server.

## "Database is locked" / permission errors with SQLite

The container user is `node` (UID 1000). A bind-mounted `/data` must be writable by it: `chown -R 1000:1000 ./data`. Do not share one SQLite database between several running instances.

## Import from Google fails

See [Photo sources → Troubleshooting](./photo-sources#troubleshooting). Also check that `WAYFARE_BASE_URL` matches the registered redirect URI and the consent screen is not in *Testing* with an unlisted account.

## Daily digest never arrives

The cron job must call `POST /api/cron/digest` with `Authorization: Bearer $CRON_SECRET`. Check the HTTP status (401 = wrong secret) and that albums use notification mode *daily digest*. See [Mail](./mail).

## Health check

`curl -fsS http://localhost:3000/api/health` → `{"status":"ok"}`. HTTP 503 means the database/storage layer is not reachable; check the logs and credentials.

## Still stuck?

Open an [issue](https://github.com/nullthrone/wayfare/issues/new/choose) with your deployment type, version and logs (remove secrets).
