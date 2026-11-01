# Self-Hosting mit Docker

Du brauchst einen Server mit Docker (und dem Compose-Plugin), einen Domainnamen und idealerweise HTTPS. 1 vCPU und 1 GB RAM reichen für einen kleinen Freundeskreis; die Bildverarbeitung profitiert von 2 GB.

## 1. Code holen und konfigurieren

```bash
git clone https://github.com/nullthrone/wayfare.git
cd wayfare
cp .env.example .env
```

Bearbeite `.env` – mindestens:

```ini
WAYFARE_BASE_URL=https://photos.example.com   # öffentliche URL, ohne abschließenden Slash
WAYFARE_SECRET=<32+ zufällige Zeichen>        # openssl rand -base64 48
WAYFARE_ADMIN_EMAILS=du@example.com
```

::: danger WAYFARE_SECRET geheim und stabil halten
Er signiert Medien-URLs und Cookies und verschlüsselt gespeicherte Google-Tokens. Änderst du ihn, werden alle abgemeldet und gespeicherte Google-Verbindungen unbrauchbar.
:::

Alle Optionen: [Konfigurationsreferenz](./configuration).

## 2. Starten

```bash
docker compose up -d --build
docker compose logs -f wayfare
```

Öffne `http://localhost:3000`. Der erste Nutzer, der sich registriert (oder jeder aus `WAYFARE_ADMIN_EMAILS`), wird **Admin**.

Die Compose-Datei definiert:

- `wayfare` – die App, Port 3000, Daten im benannten Volume `wayfare-data`, eingehängt unter `/data` (`DATA_DIR=/data`);
- `cron` *(Profil)* – ruft den Endpunkt für den täglichen Digest auf, siehe [E-Mail](./mail);
- `minio` *(Profil)* – S3-kompatibler Speicher zum Testen, siehe [Speicher](./storage).

```bash
docker compose --profile cron up -d     # mit täglichem Digest
docker compose --profile minio up -d    # mit lokalem MinIO
```

## 3. HTTPS mit Reverse Proxy

Passkeys, Apple-Login und sichere Cookies brauchen HTTPS. Gib Port 3000 nicht direkt ins Internet frei. Ein Beispiel mit [Caddy](https://caddyserver.com) (automatische Let's-Encrypt-Zertifikate):

```text
photos.example.com {
  encode zstd gzip
  request_body {
    max_size 30MB
  }
  reverse_proxy 127.0.0.1:3000
}
```

Binde den Container nur an localhost, indem du das Port-Mapping in der Compose-Datei auf `"127.0.0.1:3000:3000"` änderst. Nginx oder Traefik funktionieren genauso – reiche die Header `Host` und `X-Forwarded-*` durch und erlaube Request-Bodies mindestens in der Größe deines größten Fotos (`maxUploadMb`, Standard 25 MB; die App akzeptiert bis zu 30 MB pro Request).

## Volumes und Daten

Alles liegt in `/data`:

| Pfad | Inhalt |
|---|---|
| `/data/wayfare.db` (+ `-wal`, `-shm`) | SQLite-Datenbank: Nutzer, Alben, Kommentare, Einstellungen |
| `/data/blobs/` | Fotos (Vorschau, Anzeige, Original) bei `STORAGE_DRIVER=local` |

Mit `STORAGE_DRIVER=s3` liegen die Fotos stattdessen in deinem Bucket; die Datenbank bleibt in `/data`.

## Backups

Sichere **beides**, Datenbank und Blobs, und bewahre eine Kopie deiner `.env` auf (vor allem `WAYFARE_SECRET`).

SQLite läuft im WAL-Modus, kopiere die `.db`-Datei also nicht, während die App läuft. Nutze SQLites Online-Backup, das jederzeit sicher ist:

```bash
# konsistenter Snapshot der Datenbank -> /data/wayfare-backup.db (im Volume)
docker compose exec wayfare node -e '
  const Database = require("better-sqlite3");
  new Database("/data/wayfare.db").backup("/data/wayfare-backup.db").then(() => console.log("backup ok"));
'
docker compose cp wayfare:/data/wayfare-backup.db ./wayfare-$(date +%F).db
```

Hast du die `sqlite3`-CLI auf dem Host (Volume bzw. Bind-Mount eingehängt), geht es auch so:

```bash
sqlite3 /pfad/zu/data/wayfare.db ".backup '/backups/wayfare-$(date +%F).db'"
```

Kopiere danach `/data/blobs` (z. B. mit `rsync -a`, `restic`, `borg`) und den Snapshot vom Rechner weg. Zum Wiederherstellen stoppst du den Container, legst den `wayfare.db`-Snapshot und `blobs/` zurück ins Volume und startest neu.

## Updates

```bash
git pull
docker compose up -d --build
```

Es gibt keine Migrationsschritte: Dokumente werden von den Services geparst und mit Standardwerten ergänzt. Mache vor größeren Updates ein Backup. Hinweise findest du in den [Releases](https://github.com/nullthrone/wayfare/releases).

## Ohne Docker

```bash
npm ci
npm run build
WAYFARE_SECRET=... WAYFARE_BASE_URL=... npm start
```

Nötig sind Node.js 22 und eine Plattform, die von `better-sqlite3` und `sharp` unterstützt wird.
