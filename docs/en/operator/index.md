# Operator guide

This part is for the person who **runs** a Wayfare instance. You can host it yourself with Docker, or on Google Firebase. The same codebase serves both.

## Architecture

Wayfare is a Next.js 16 application built with *ports & adapters*: the business logic talks to small interfaces, and the container picks the implementation at start-up based on `WAYFARE_RUNTIME`.

```mermaid
flowchart LR
  Browser["Browser<br/>(guests, owners, admins)"] --> App["Next.js app<br/>pages · server actions · API routes"]
  App --> Services["Services<br/>authorisation · use cases"]
  Services --> DS["DocumentStore port"]
  Services --> BS["BlobStorage port"]
  Services --> ML["Mailer port"]
  Services --> PS["PhotoSourceAdapter port"]
  DS --> SQLite[("SQLite<br/>self-host")]
  DS --> Firestore[("Firestore<br/>Firebase")]
  BS --> Local["Local disk"]
  BS --> S3["S3 / MinIO / R2"]
  BS --> FStorage["Firebase Storage"]
  ML --> SMTP["SMTP"]
  ML --> Console["Console log"]
  PS --> GPhotos["Google Photos Picker"]
  PS --> GDrive["Google Drive Picker"]
  Auth["Better Auth"] --> DS
  App --> Auth
```

| Port | Self-hosted (`WAYFARE_RUNTIME=selfhost`) | Firebase (`WAYFARE_RUNTIME=firebase`) |
|---|---|---|
| `DocumentStore` | SQLite (`better-sqlite3`, JSON documents) in `DATA_DIR` | Firestore (`firebase-admin`) |
| `BlobStorage` | Local filesystem or S3-compatible | Firebase Storage (or S3) |
| `Mailer` | SMTP or console | SMTP or console |
| `PhotoSourceAdapter` | Google Photos Picker, Google Drive Picker | same |
| Auth | Better Auth on top of the `DocumentStore` | same |

Why one generic `DocumentStore`? See [ADR 0001](https://github.com/nullthrone/wayfare/blob/main/docs/adr/0001-document-store-port.md).

## Pages in this guide

| Page | Topic |
|---|---|
| [Self-hosting](./self-hosting) | Docker Compose, HTTPS reverse proxy, backups, upgrades |
| [Firebase](./firebase) | App Hosting + Firestore + Storage, step by step |
| [Configuration](./configuration) | Every environment variable |
| [Authentication](./authentication) | Google, Apple, Facebook, Discord, magic link, passkeys, admins |
| [Photo sources](./photo-sources) | Google Photos / Drive import setup |
| [Storage](./storage) | Local, S3, Firebase Storage |
| [Mail](./mail) | SMTP and the daily digest |
| [Security & privacy](./security) | Security model and GDPR notes |
| [Troubleshooting](./troubleshooting) | Common problems |

## Admin area

Admins manage the instance in the browser under **/admin**: onboarding mode, instance name, upload limits, legal pages and users.

![Admin settings](/screenshots/en/admin-settings.png)

![User management](/screenshots/en/admin-users.png)

## Health check

`GET /api/health` returns `{"status":"ok"}` when the database is reachable (HTTP 503 otherwise). The Docker image uses it for its `HEALTHCHECK`; point your uptime monitor at it too.
