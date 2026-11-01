# Konfigurationsreferenz

Wayfare wird ausschließlich über **Umgebungsvariablen** konfiguriert, die beim Start validiert werden (`src/server/config.ts`). Bei Docker Compose stammen sie aus `.env`, bei Firebase aus `apphosting.yaml` und dem Secret Manager. Ungültige Werte stoppen den Server mit einer lesbaren Fehlerliste.

Boolesche Werte akzeptieren `true`, `false`, `1`, `0`. Ein leerer Wert bedeutet „Standard verwenden“. Mit **Secret** markierte Schlüssel gehören nie ins Repository.

## Kern

| Schlüssel | Standard | Beschreibung |
|---|---|---|
| `WAYFARE_RUNTIME` | `selfhost` | `selfhost` (SQLite + lokal/S3) oder `firebase` (Firestore + Firebase Storage) |
| `WAYFARE_BASE_URL` | `http://localhost:3000` | Öffentliche URL ohne abschließenden Slash. Für Freigabelinks, QR-Codes, OAuth-Redirects und Links in E-Mails. Muss mit dem übereinstimmen, was Nutzer im Browser eingeben |
| `WAYFARE_SECRET` | *(Pflicht)* | **Secret.** Mindestens 32 Zeichen. Signiert Medien-URLs und Cookies, verschlüsselt gespeicherte Google-Tokens |
| `WAYFARE_ADMIN_EMAILS` | *(leer)* | Kommagetrennte E-Mail-Adressen, die bei Registrierung und Anmeldung **Admin** werden. Gibt es noch keinen Admin, wird der erste registrierte Nutzer Admin |
| `WAYFARE_DEMO_MODE` | `false` | Demo-Modus für Demodaten/Screenshots. Niemals in Produktion aktivieren |
| `WAYFARE_TRUSTED_PROXIES` | `1` | Anzahl der Reverse Proxies vor Wayfare, die an `X-Forwarded-For` anhängen. Bestimmt die Client-IP fürs Rate-Limiting (der N-te Eintrag von rechts). `0` = Header ignorieren (direkt erreichbar, kein Proxy) |
| `DATA_DIR` | `./data` | Ablageort von SQLite (`wayfare.db`) und lokalen Blobs (`blobs/`). Im Docker-Image `/data` |

## Speicher

| Schlüssel | Standard | Beschreibung |
|---|---|---|
| `STORAGE_DRIVER` | `local` (selfhost) / `firebase` (firebase) | `local`, `s3` oder `firebase` |
| `S3_ENDPOINT` | *(leer)* | S3-kompatibler Endpunkt, z. B. `http://minio:9000` oder die R2-URL. Leer = AWS |
| `S3_REGION` | `auto` | Region (`auto` für R2/MinIO, z. B. `eu-central-1` für AWS) |
| `S3_BUCKET` | *(leer)* | Bucket-Name (Pflicht bei `s3`) |
| `S3_ACCESS_KEY_ID` | *(leer)* | Zugriffsschlüssel (Pflicht bei `s3`) |
| `S3_SECRET_ACCESS_KEY` | *(leer)* | **Secret.** Geheimer Schlüssel (Pflicht bei `s3`) |
| `S3_FORCE_PATH_STYLE` | `true` | Path-Style-Adressierung; nötig für MinIO, für die meisten anderen unschädlich. Für AWS (Virtual-Host-Style) auf `false` setzen |

## Firebase

| Schlüssel | Standard | Beschreibung |
|---|---|---|
| `FIREBASE_PROJECT_ID` | *(leer)* | Firebase-/Google-Cloud-Projekt-ID |
| `FIREBASE_STORAGE_BUCKET` | *(leer)* | Storage-Bucket, z. B. `mein-projekt.firebasestorage.app` |
| `FIREBASE_SERVICE_ACCOUNT` | *(leer)* | **Secret.** Dienstkonto-JSON (als String). Weglassen, um Application Default Credentials zu nutzen (auf App Hosting empfohlen) |

## E-Mail

| Schlüssel | Standard | Beschreibung |
|---|---|---|
| `SMTP_URL` | *(leer)* | **Secret.** z. B. `smtps://user:pass@smtp.example.com:465`. Leer = Mails (inkl. Magic Links) werden ins Server-Log geschrieben |
| `MAIL_FROM` | `Wayfare <no-reply@localhost>` | Absenderadresse und -name |

## Login-Anbieter

Ein Social-Anbieter ist aktiv, wenn ID und Secret gesetzt sind. Siehe [Authentifizierung](./authentication).

| Schlüssel | Standard | Beschreibung |
|---|---|---|
| `AUTH_GOOGLE_ID` | *(leer)* | Google-OAuth-Client-ID |
| `AUTH_GOOGLE_SECRET` | *(leer)* | **Secret.** Google-OAuth-Client-Secret |
| `AUTH_APPLE_ID` | *(leer)* | Apple-*Services-ID* (z. B. `com.example.wayfare.web`) |
| `AUTH_APPLE_SECRET` | *(leer)* | **Secret.** Apple-Client-Secret – ein aus deinem Apple-Schlüssel signiertes JWT (läuft nach spätestens 6 Monaten ab) |
| `AUTH_APPLE_BUNDLE_ID` | *(leer)* | Optionale App-Bundle-ID, nur für die Token-Anmeldung nativer Apps nötig |
| `AUTH_FACEBOOK_ID` | *(leer)* | Meta-App-ID |
| `AUTH_FACEBOOK_SECRET` | *(leer)* | **Secret.** Meta-App-Secret |
| `AUTH_DISCORD_ID` | *(leer)* | Client-ID der Discord-Anwendung |
| `AUTH_DISCORD_SECRET` | *(leer)* | **Secret.** Discord-Client-Secret |
| `AUTH_PASSKEY` | `true` | Passkeys (WebAuthn) erlauben. Braucht HTTPS und eine stabile Domain |
| `AUTH_MAGIC_LINK` | `true` | Anmeldung per E-Mail-Link. In Produktion nur aktiv, wenn `SMTP_URL` gesetzt ist (sonst landeten Links im Log) |
| `AUTH_EMAIL_PASSWORD` | `false` | Klassische Anmeldung mit E-Mail + Passwort. Neue Konten müssen ihre E-Mail-Adresse bestätigen (braucht `SMTP_URL`) |

## Foto-Quellen (Google)

Siehe [Foto-Quellen](./photo-sources).

| Schlüssel | Standard | Beschreibung |
|---|---|---|
| `GOOGLE_SOURCES_CLIENT_ID` | fällt auf `AUTH_GOOGLE_ID` zurück | OAuth-Client für den Fotos-/Drive-Import |
| `GOOGLE_SOURCES_CLIENT_SECRET` | fällt auf `AUTH_GOOGLE_SECRET` zurück | **Secret.** Passendes Client-Secret |
| `GOOGLE_API_KEY` | *(leer)* | Browser-API-Schlüssel (auf deine Domain beschränkt) für den Google Drive Picker |
| `GOOGLE_APP_ID` | *(leer)* | **Projektnummer** des Google-Cloud-Projekts, für den Drive Picker erforderlich |

## Geplante Jobs

| Schlüssel | Standard | Beschreibung |
|---|---|---|
| `CRON_SECRET` | *(leer)* | **Secret.** Bearer-Token für `POST /api/cron/digest`, das die täglichen Digest-E-Mails versendet |

## Einstellungen im Admin-Bereich

Einige Optionen sind keine Umgebungsvariablen, sondern in der Datenbank gespeichert und werden unter **/admin** bearbeitet: Instanzname, Onboarding-Modus (*offen*, *Freigabe*, *Einladung*), maximale Uploadgröße pro Foto (Standard 25 MB), maximale Fotoanzahl pro Album (Standard 500) sowie Impressum und Datenschutzerklärung (Markdown).
