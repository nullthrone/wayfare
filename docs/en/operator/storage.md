# Storage

Photos (thumbnail, display version, original) are stored through the `BlobStorage` port. Wayfare **always serves media itself** via signed, short-lived URLs (`/api/media/...`) so access control and download protection apply — never expose a bucket publicly.

Select the driver with `STORAGE_DRIVER` (default `local` when self-hosting, `firebase` on Firebase).

## Local filesystem

```ini
STORAGE_DRIVER=local
DATA_DIR=/data
```

Files go to `$DATA_DIR/blobs/`. Simple and fast; remember to back up the volume ([Self-hosting](./self-hosting#backups)). Use a volume large enough for originals.

## S3-compatible (AWS S3, MinIO, Cloudflare R2, Backblaze B2 …)

```ini
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # empty for AWS
S3_REGION=auto
S3_BUCKET=wayfare
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

Create a **private** bucket and an access key limited to it (read, write, list, delete). No CORS or public access is needed because the browser never talks to the bucket.

**Try it with MinIO:**

```bash
docker compose --profile minio up -d
```

then use `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET=wayfare` (created automatically), `S3_ACCESS_KEY_ID=wayfare`, `S3_SECRET_ACCESS_KEY=wayfare-secret`. The MinIO console is at `http://localhost:9001`.

For **AWS S3** leave `S3_ENDPOINT` empty, set the real region (e.g. `eu-central-1`) and `S3_FORCE_PATH_STYLE=false`.

## Firebase Storage

```ini
STORAGE_DRIVER=firebase
FIREBASE_PROJECT_ID=...
FIREBASE_STORAGE_BUCKET=my-project.firebasestorage.app
```

Default when `WAYFARE_RUNTIME=firebase`. Access uses the Admin SDK; `storage.rules` deny all direct client access. See [Firebase](./firebase). You can also combine the Firebase runtime with `STORAGE_DRIVER=s3` (e.g. R2 for cheaper egress).

## Migrating between drivers

There is no automatic migration. Copy the objects (same keys: `albums/{albumId}/{photoId}/...`) with a tool of your choice (`rclone`, `gsutil`) and switch the driver.
