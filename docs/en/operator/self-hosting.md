# Self-hosting with Docker

You need a server with Docker (and the compose plugin), a domain name and ideally HTTPS. 1 vCPU and 1 GB RAM are enough for a small circle of friends; image processing profits from 2 GB.

## 1. Get the code and configure

```bash
git clone https://github.com/nullthrone/wayfare.git
cd wayfare
cp .env.example .env
```

Edit `.env` — at least:

```ini
WAYFARE_BASE_URL=https://photos.example.com   # the public URL, no trailing slash
WAYFARE_SECRET=<32+ random characters>        # openssl rand -base64 48
WAYFARE_ADMIN_EMAILS=you@example.com
```

::: danger Keep WAYFARE_SECRET secret and stable
It signs media URLs and cookies and encrypts stored Google tokens. Changing it logs everyone out and makes stored Google connections unusable.
:::

All options: [Configuration reference](./configuration).

## 2. Start

```bash
docker compose up -d --build
docker compose logs -f wayfare
```

Open `http://localhost:3000`. The first user to sign up (or anyone listed in `WAYFARE_ADMIN_EMAILS`) becomes **admin**.

The compose file defines:

- `wayfare` — the app, port 3000, data in the named volume `wayfare-data` mounted at `/data` (`DATA_DIR=/data`);
- `cron` *(profile)* — calls the daily digest endpoint, see [Mail](./mail);
- `minio` *(profile)* — S3-compatible storage for testing, see [Storage](./storage).

```bash
docker compose --profile cron up -d     # with daily digest
docker compose --profile minio up -d    # with local MinIO
```

## 3. HTTPS with a reverse proxy

Passkeys, Apple login and secure cookies need HTTPS. Do not expose port 3000 directly. A [Caddy](https://caddyserver.com) example (automatic Let's Encrypt certificates):

```text
photos.example.com {
  encode zstd gzip
  request_body {
    max_size 30MB
  }
  reverse_proxy 127.0.0.1:3000
}
```

Bind the container to localhost only by changing the compose port mapping to `"127.0.0.1:3000:3000"`. Nginx or Traefik work equally well — pass the `Host` and `X-Forwarded-*` headers and allow bodies of at least the size of your largest photo (`maxUploadMb`, default 25 MB; the app accepts up to 30 MB per request).

## Volumes and data

Everything lives in `/data`:

| Path | Content |
|---|---|
| `/data/wayfare.db` (+ `-wal`, `-shm`) | SQLite database: users, albums, comments, settings |
| `/data/blobs/` | Photos (thumb, display, original) when `STORAGE_DRIVER=local` |

With `STORAGE_DRIVER=s3` photos live in your bucket instead; the database stays in `/data`.

## Backups

Back up **both** the database and the blobs, and keep a copy of your `.env` (especially `WAYFARE_SECRET`).

SQLite runs in WAL mode, so do not copy the `.db` file while the app is running. Use SQLite's online backup, which is safe at any time:

```bash
# consistent snapshot of the database -> /data/wayfare-backup.db (inside the volume)
docker compose exec wayfare node -e '
  const Database = require("better-sqlite3");
  new Database("/data/wayfare.db").backup("/data/wayfare-backup.db").then(() => console.log("backup ok"));
'
docker compose cp wayfare:/data/wayfare-backup.db ./wayfare-$(date +%F).db
```

If you have the `sqlite3` CLI on the host (volume mounted or bind mount), this works as well:

```bash
sqlite3 /path/to/data/wayfare.db ".backup '/backups/wayfare-$(date +%F).db'"
```

Then copy `/data/blobs` (e.g. `rsync -a`, `restic`, `borg`) and the snapshot off the machine. To restore, stop the container, put the `wayfare.db` snapshot and `blobs/` back into the volume and start again.

## Upgrades

```bash
git pull
docker compose up -d --build
```

There are no migration steps: documents are parsed and defaulted by the services. Take a backup before major upgrades. Check the [releases](https://github.com/nullthrone/wayfare/releases) for notes.

## Running without Docker

```bash
npm ci
npm run build
WAYFARE_SECRET=... WAYFARE_BASE_URL=... npm start
```

Node.js 22 and a platform supported by `better-sqlite3` and `sharp` are required.
