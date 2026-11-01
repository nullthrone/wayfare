# Security & privacy

## Security model

- **Album access** — albums live at `/a/{slug}`. The slug is 10 random characters from a 31-letter alphabet (~50 bits) and cannot be enumerated. Drafts are invisible to everybody except owner and admins.
- **Password albums** — passwords are stored as **scrypt** hashes. A correct password sets a signed cookie bound to the album's `passwordVersion`; changing the password invalidates all unlock cookies. Attempts are rate-limited.
- **Revocation** — rotating the slug invalidates every QR code and link at once. Expiry dates are enforced on every request.
- **Media delivery** — photos are only served through `/api/media/{photoId}/{variant}?exp&sig` (HMAC-signed, short TTL) after re-checking album access. Originals are delivered only if the owner allows downloads. Responses use `Cache-Control: private`.
- **Download protection** — see the [user guide](../guide/download-protection) for what it does and where it ends: screenshots cannot be prevented.
- **Authorisation** is enforced in the service layer, not only in pages. Roles: viewer < owner < admin.
- **Secrets** — Google tokens for photo sources are encrypted with AES-256-GCM using a key derived from `WAYFARE_SECRET`. Rotating the secret invalidates sessions and stored connections.
- **Cloud rules** — `firestore.rules` and `storage.rules` deny all client access; the server uses the Admin SDK.
- **Headers** — `X-Content-Type-Options`, `X-Frame-Options: DENY`, strict `Referrer-Policy`, restrictive `Permissions-Policy`; album pages send `noindex`.
- **Uploads** are re-encoded by `sharp` (no raw user files are served except the stored original when downloads are allowed) and size-limited.
- **Cron endpoint** requires the `CRON_SECRET` bearer token.

### Operator checklist

- [ ] HTTPS everywhere (reverse proxy), `WAYFARE_BASE_URL` is the https URL
- [ ] Long random `WAYFARE_SECRET`, `.env` not world-readable, not in git
- [ ] Backups of database and blobs, tested restore
- [ ] Keep Docker image and dependencies updated (Dependabot is configured in the repo)
- [ ] Limit admins to people you trust
- [ ] Private bucket for S3

Found a vulnerability? Please report it privately — see [SECURITY.md](https://github.com/nullthrone/wayfare/blob/main/SECURITY.md).

## Privacy and GDPR notes

::: warning Not legal advice
The following are technical measures that help with privacy. Whether your setup is compliant depends on your situation; consult a lawyer or data-protection officer if in doubt.
:::

- **No tracking.** No analytics, no advertising, no third-party scripts. Album views are counted anonymously with a one-way hash per day, without IP addresses.
- **Self-hosted fonts** (`@fontsource`) — no requests to Google Fonts or any CDN. The only exception is the Google Drive Picker script, loaded only when an owner opens it.
- **EXIF/GPS removed.** Thumbnails and display versions carry no metadata. Originals are kept untouched and only delivered with download permission — tell owners.
- **Cookies** — only functional cookies (session, album unlock, language). No consent banner is needed for strictly necessary cookies, but check your local law.
- **Legal pages** — admins edit the **imprint** and **privacy policy** (Markdown) in **/admin → Settings**. The footer links to them when filled. You are responsible for their content: name the controller, list the processors (hosting provider, SMTP provider, Google if import/login is used, Firebase if used), purposes and retention.
- **Data subject rights** — users can delete their own account (**Account → Delete**), which removes albums, photos, comments, reactions, connections, sessions and passkeys. Admins can ban users and export/delete data on request via the admin area and database.
- **Data processing agreements** — if you use Firebase/Google Cloud, S3 providers or an SMTP provider, conclude the providers' DPAs and choose EU regions where required.
- **Children and sensitive photos** — baby and memorial albums contain personal data; recommend a password and an expiry date to owners.
