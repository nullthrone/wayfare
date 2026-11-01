# Wayfare Architecture

Wayfare is a Next.js 16 (App Router, TypeScript, Tailwind v4) application built with
**Ports & Adapters**. One codebase, two runtimes:

| Port (`src/server/ports`) | Self-hosted (`WAYFARE_RUNTIME=selfhost`) | Firebase (`WAYFARE_RUNTIME=firebase`) |
|---|---|---|
| `DocumentStore` | SQLite (`better-sqlite3`, JSON documents) | Firestore (`firebase-admin`) |
| `BlobStorage` | Local filesystem or S3-compatible | Firebase Storage (or S3) |
| `Mailer` | SMTP or console | SMTP or console |
| `PhotoSourceAdapter` | Google Photos Picker, Google Drive Picker | same |
| Auth | Better Auth on top of `DocumentStore` | same |

`src/server/container.ts` is the composition root and the only place that picks adapters.

## Layers

```
src/
  domain/            Pure types + zod schemas (no I/O). Shared by client and server.
  server/
    config.ts        Validated env config. The ONLY place reading process.env.
    container.ts     Composition root (adapters)
    errors.ts        AppError + helpers
    ports/           Interfaces
    adapters/        db/ storage/ mail/  — implementations of ports
    auth/            Better Auth instance + DocumentStore adapter
    services/        Use cases. Authorisation happens HERE, not in pages.
    media/           Image pipeline (sharp)
    exports/         QR / PDF / social image rendering
    sources/         Photo source adapters (Google Photos, Google Drive) + OAuth
    crypto.ts        HMAC signing, AES-GCM token encryption, password hashing
  themes/            Built-in themes, CSS-variable rendering, patterns (client-safe)
  components/        React components (ui/, album/, viewer/, share/, theme-builder/, import/, admin/)
  app/               Routes. Pages are thin: call services, render components.
  i18n/              next-intl config (no URL prefix; cookie/Accept-Language)
messages/{de,en}/{namespace}.json   UI strings
docs/                VitePress documentation (user + operator, DE + EN), ADRs in docs/adr
tests/               vitest (unit + contract tests), e2e/ Playwright (screenshots)
```

## Conventions

- **Server code** imports `"server-only"`. Client components never import from `src/server/**`.
- **Mutations** use Server Actions colocated as `actions.ts` next to the route (`"use server"`),
  which call services and map `AppError` → `{ ok: false, error: messageKey }`. Binary uploads and
  media delivery use Route Handlers under `src/app/api/**`.
- **Authorisation** is enforced in services (`requireUser` / `requireRole` + ownership checks).
  Pages may additionally redirect for UX, never as the only guard.
- **Validation** with zod at service boundaries.
- **IDs:** `nanoid()` (21 chars); album slugs: `customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10)`.
- **Time:** ISO strings, `new Date().toISOString()`.
- **i18n:** every user-facing string goes through next-intl (`useTranslations("ns")` /
  `getTranslations("ns")`). Each workstream owns its namespaces (see below). Both `de` and `en`
  must be complete. German uses informal "du".
- **Styling:** Tailwind v4 utilities. App chrome uses the neutral design tokens in `globals.css`;
  album/viewer UI uses theme CSS variables (`--wf-*`, see `src/themes/index.ts`).
- **No third-party requests at runtime from the browser** (GDPR): fonts via `@fontsource`,
  no CDNs, no analytics. Exception: the Google Drive Picker script, loaded only when an owner opens it.
- **Next.js 16 specifics:** `middleware` is now `proxy` (`src/proxy.ts`); `params`/`searchParams`/
  `cookies()`/`headers()` are async; read `node_modules/next/dist/docs/` when unsure.
  Cache Components are disabled (ADR 0002).

## Security model (summary)

- Album access: `/a/{slug}`; slug is 10 random chars (~50 bits). Password mode stores a scrypt hash;
  unlocking sets an HMAC cookie bound to `passwordVersion`. Rotating the slug revokes all QR codes.
- Media is only served via `/api/media/{photoId}/{variant}?exp&sig` (HMAC, short TTL). Originals are
  served only if the owner allows downloads. Display/thumb variants have metadata (GPS) stripped.
- Download protection when disabled: no original access, signed short-lived URLs, display ≤ 1600 px,
  context-menu/drag/long-press suppression, transparent overlay, optional watermark. Screenshots
  cannot be prevented — the docs say so honestly.
- OAuth tokens of photo sources are AES-256-GCM encrypted with a key derived from `WAYFARE_SECRET`.
- Firestore/Storage security rules deny all client access; the server uses the Admin SDK.

## Workstream ownership (initial build)

| Workstream | Owns |
|---|---|
| Persistence & Auth | `src/server/adapters/**`, `src/server/auth/**`, `src/server/services/session.ts`, `src/app/api/auth/**`, `tests/contract/**`; i18n: `auth` |
| Domain services | `src/server/services/{albums,photos,interactions,admin,notifications}.ts`, `src/server/media/**`, `src/app/api/{media,upload,cron}/**`, `tests/services/**`; i18n: `errors`, `mail` |
| UI | `src/app/**` (except `api/`, `dashboard/themes/`), `src/components/{ui,album,viewer,admin,layout}/**`, `src/app/globals.css`, `src/proxy.ts`; i18n: `common`, `landing`, `dashboard`, `album`, `viewer`, `admin`, `legal`, `account` |
| Themes & exports | `src/themes/**`, `src/domain/theme.ts` (additive only), `src/server/services/themes.ts`, `src/server/exports/**`, `src/components/{theme-builder,share}/**`, `src/app/dashboard/themes/**`, `src/app/api/albums/[albumId]/export/**`; i18n: `themes`, `share` |
| Photo sources | `src/server/sources/**`, `src/app/api/sources/**`, `src/app/api/albums/[albumId]/import/**`, `src/components/import/**`; i18n: `sources` |
| Repo, ops & docs | `README.md`, `CONTRIBUTING.md`, community files, `.github/**`, `.claude/**`, `Dockerfile`, `docker-compose.yml`, `firebase.json`, `apphosting.yaml`, `*.rules`, `docs/**` (except `docs/adr`), `scripts/**` |
