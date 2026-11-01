# E-Mail

Wayfare versendet E-Mails für die **Magic-Link-Anmeldung**, **Einladungen** und **Owner-Benachrichtigungen** (neue Kommentare, Gast-Uploads, Meldungen – sofort oder als täglicher Digest). Mails kommen in der Sprache des Empfängers.

## SMTP

```ini
SMTP_URL=smtps://benutzername:passwort@smtp.example.com:465
MAIL_FROM="Wayfare <no-reply@photos.example.com>"
```

Nutze `smtps://` (implizites TLS, Port 465) oder `smtp://…:587` mit STARTTLS. Sonderzeichen im Passwort müssen URL-kodiert werden (`@` → `%40`). Jeder Anbieter funktioniert (Mailgun, Postmark, Brevo, eigener Server, Gmail mit App-Passwort …).

**Gmail:** `SMTP_URL=smtps://du%40gmail.com:APP-PASSWORT@smtp.gmail.com:465` – Host ist `smtp.gmail.com`, nicht `gmail.com`. Das [App-Passwort](https://myaccount.google.com/apppasswords) braucht die Bestätigung in zwei Schritten und wird ohne Leerzeichen eingetragen; `MAIL_FROM` sollte dieselbe Adresse sein.

Eine fehlerhafte `SMTP_URL` (z. B. ohne Host) stoppt Wayfare beim Start mit einer Fehlermeldung, statt erst beim Versand aufzufallen.

Sorge dafür, dass die Absenderdomain zustellbar ist: Richte **SPF**, **DKIM** und **DMARC** für die Domain in `MAIL_FROM` ein, sonst landen Magic Links im Spam.

## Ohne SMTP

Ist `SMTP_URL` leer, schreibt der Mailer Nachrichten ins **Server-Log** (Konsole). Magic Links lassen sich dann aus `docker compose logs wayfare` kopieren. Gut für die Entwicklung, nichts für Gäste.

## Täglicher Digest

Alben mit der Benachrichtigung *täglicher Digest* sammeln Ereignisse. Etwas muss einmal täglich den Cron-Endpunkt aufrufen:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://photos.example.com/api/cron/digest
```

- **Docker Compose:** `docker compose --profile cron up -d` startet einen kleinen curl-Container, der ihn alle 24 Stunden aufruft (`CRON_SECRET` muss in `.env` stehen).
- **System-Cron:** `0 7 * * * curl -fsS -X POST -H "Authorization: Bearer …" https://…/api/cron/digest`
- **Firebase:** ein Cloud-Scheduler-Job, siehe [Firebase](./firebase#_7-taglicher-digest-mit-cloud-scheduler).

Die Antwort nennt, wie viele Owner und Benachrichtigungen verarbeitet wurden. Ohne gültiges `CRON_SECRET` antwortet der Endpunkt mit 401.

## Testen

Löse eine Magic-Link-Anmeldung mit deiner eigenen Adresse aus und prüfe Zustellung und Spam-Ordner. Beobachte `docker compose logs -f wayfare` auf SMTP-Fehler; Benachrichtigungs-Mails brechen nie die Aktion des Nutzers ab – Fehler werden nur protokolliert.
