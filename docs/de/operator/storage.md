# Speicher

Fotos (Vorschau, Anzeigeversion, Original) werden über den `BlobStorage`-Port gespeichert. Wayfare **liefert Medien immer selbst aus**, über signierte, kurzlebige URLs (`/api/media/...`), damit Zugriffskontrolle und Download-Schutz greifen – gib einen Bucket niemals öffentlich frei.

Den Treiber wählst du mit `STORAGE_DRIVER` (Standard `local` beim Self-Hosting, `firebase` auf Firebase).

## Lokales Dateisystem

```ini
STORAGE_DRIVER=local
DATA_DIR=/data
```

Dateien landen in `$DATA_DIR/blobs/`. Einfach und schnell; denk ans Backup des Volumes ([Self-Hosting](./self-hosting#backups)). Nutze ein Volume, das für die Originale groß genug ist.

## S3-kompatibel (AWS S3, MinIO, Cloudflare R2, Backblaze B2 …)

```ini
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # leer für AWS
S3_REGION=auto
S3_BUCKET=wayfare
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

Lege einen **privaten** Bucket und einen darauf beschränkten Zugriffsschlüssel an (lesen, schreiben, auflisten, löschen). CORS oder öffentlicher Zugriff sind nicht nötig, da der Browser nie mit dem Bucket spricht.

**Mit MinIO ausprobieren:**

```bash
docker compose --profile minio up -d
```

Verwende dann `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET=wayfare` (wird automatisch angelegt), `S3_ACCESS_KEY_ID=wayfare`, `S3_SECRET_ACCESS_KEY=wayfare-secret`. Die MinIO-Konsole erreichst du unter `http://localhost:9001`.

Für **AWS S3** lässt du `S3_ENDPOINT` leer, setzt die echte Region (z. B. `eu-central-1`) und `S3_FORCE_PATH_STYLE=false`.

## Firebase Storage

```ini
STORAGE_DRIVER=firebase
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=mein-projekt.firebasestorage.app
```

Standard bei `WAYFARE_RUNTIME=firebase`. Der Zugriff läuft über das Admin SDK; `storage.rules` verbieten jeden direkten Client-Zugriff. Siehe [Firebase](./firebase). Du kannst die Firebase-Runtime auch mit `STORAGE_DRIVER=s3` kombinieren (z. B. R2 für günstigeren Egress).

## Zwischen Treibern wechseln

Es gibt keine automatische Migration. Kopiere die Objekte (gleiche Schlüssel: `albums/{albumId}/{photoId}/...`) mit einem Werkzeug deiner Wahl (`rclone`, `gsutil`) und stelle den Treiber um.
