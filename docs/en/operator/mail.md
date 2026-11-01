# Mail

Wayfare sends e-mail for **magic-link sign-in**, **invites** and **owner notifications** (new comments, guest uploads, reports — instant or daily digest). Mails are sent in the recipient's language.

## SMTP

```ini
SMTP_URL=smtps://username:password@smtp.example.com:465
MAIL_FROM="Wayfare <no-reply@photos.example.com>"
```

Use `smtps://` (implicit TLS, port 465) or `smtp://…:587` with STARTTLS. URL-encode special characters in the password (`@` → `%40`). Any provider works (Mailgun, Postmark, Brevo, your own server, Gmail with an app password …).

Make the sender domain deliverable: configure **SPF**, **DKIM** and **DMARC** for the domain in `MAIL_FROM`, or magic links will end up in spam.

## Without SMTP

If `SMTP_URL` is empty the mailer writes messages to the **server log** (console). Magic links can then be copied from `docker compose logs wayfare`. Good for development, not for guests.

## Daily digest

Albums with notifications set to *daily digest* collect events. Something must call the cron endpoint once a day:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://photos.example.com/api/cron/digest
```

- **Docker Compose:** `docker compose --profile cron up -d` runs a tiny curl container that calls it every 24 hours (needs `CRON_SECRET` in `.env`).
- **System cron:** `0 7 * * * curl -fsS -X POST -H "Authorization: Bearer …" https://…/api/cron/digest`
- **Firebase:** a Cloud Scheduler job, see [Firebase](./firebase#_7-daily-digest-with-cloud-scheduler).

The response reports how many owners and notifications were handled. Without a valid `CRON_SECRET` the endpoint answers 401.

## Testing

Trigger a magic-link login with your own address and check delivery and spam folder. Watch `docker compose logs -f wayfare` for SMTP errors; notification mails never break the user's action — errors are only logged.
