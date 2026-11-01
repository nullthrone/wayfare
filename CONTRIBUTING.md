# Contributing to Wayfare

Thanks for helping! Wayfare is a small, friendly project — bug reports, docs fixes, translations, themes and new features are all welcome. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

> 🌱 **New here?** Look for issues labelled [`good first issue`](https://github.com/nullthrone/wayfare/labels/good%20first%20issue) or [`help wanted`](https://github.com/nullthrone/wayfare/labels/help%20wanted). Adding a theme or fixing a doc page is a great start. Not sure whether an idea fits? Open a feature request first.

## Setup

Requirements: **Node.js 22**, npm. (Docker only if you want to test the container.)

```bash
git clone https://github.com/<you>/wayfare.git && cd wayfare
npm ci
cp .env.example .env        # set WAYFARE_SECRET to 32+ random characters
npm run dev                 # http://localhost:3000 (SQLite in ./data, console mailer)
```

Useful commands:

| Command | Purpose |
|---|---|
| `npm run lint` · `npm run typecheck` · `npm test` | The checks CI runs (run all three before pushing) |
| `npm run build` | Production build |
| `npm run docs:dev` | Documentation site with live reload (first: `npm --prefix docs ci`) |
| `npm run docs:check` | Verifies docs are in sync with the code |
| `npm run seed` / `npm run screenshots` | Demo data and docs screenshots (Playwright) |

Read **[ARCHITECTURE.md](ARCHITECTURE.md)** and **[AGENTS.md](AGENTS.md)** first. This is Next.js 16 — `middleware` is `proxy`, `params`/`cookies()`/`headers()` are async.

## Project structure

```
src/domain/       pure types + zod schemas (no I/O)
src/server/       config, container (composition root), ports, adapters, services, media, exports, sources
src/themes/       built-in themes, CSS-variable rendering (client-safe)
src/components/   React components
src/app/          routes (thin: call services, render components)
messages/{de,en}/ UI strings per namespace
docs/             VitePress site (user + operator guides, DE + EN); ADRs in docs/adr
tests/  e2e/      vitest unit/contract tests; Playwright screenshots
```

## Conventions

- **Ports & adapters.** Only `src/server/container.ts` picks adapters. Business logic lives in `src/server/services`.
- **`server-only`.** Server modules import `"server-only"`; client components never import from `src/server/**`.
- **Authorisation in services** (`requireUser` / `requireRole` + ownership checks), never only in pages.
- **Mutations** are Server Actions in `actions.ts` next to the route; they map `AppError` → `{ ok: false, error: messageKey }`. Binary uploads/media use route handlers.
- **Validation** with zod at service boundaries. **IDs** `nanoid()`, **time** ISO strings.
- **Config** is read only in `src/server/config.ts`. A new env key must also be added to `.env.example` and to `docs/{en,de}/operator/configuration.md`.
- **Styling:** Tailwind v4; album UI uses theme CSS variables (`--wf-*`).
- **Privacy:** no third-party requests from the browser (fonts via `@fontsource`, no CDNs, no analytics).
- **Persistence:** stick to the lowest common denominator of the `DocumentStore` port (see ADR 0001).

## i18n rules

- Every user-facing string goes through next-intl (`useTranslations` / `getTranslations`). No hard-coded text in components.
- Add keys to **both** `messages/de/<ns>.json` and `messages/en/<ns>.json` — both must be complete.
- German uses the informal **"du"**.
- Keep keys stable and grouped by namespace (`common`, `dashboard`, `album`, `viewer`, …).

## How to add a theme

1. Create `src/themes/builtin/<occasion>.ts` exporting a `Theme` (see `src/domain/theme.ts` for the schema): colours (`#rrggbb`), fonts from `FONT_FAMILIES`, `pattern`, `frame`, `ornament` emoji and 1–6 `reactions` with `key` (`[a-z0-9-]{1,24}`), `emoji` and `de`/`en` labels.
2. Register it in `src/themes/builtin/index.ts`. Built-in ids are `builtin:<occasion>`.
3. New pattern/frame/font? Add it to the enums in `src/domain/theme.ts` (additive only), render it in `src/themes/patterns.ts` / `frames.css` / `fonts.ts`, and install the `@fontsource` package for fonts.
4. Check contrast (text on background and accent).
5. Add the theme to `docs/{en,de}/guide/themes.md`.

## How to add a photo source adapter

1. Implement the `PhotoSourceAdapter` interface from `src/server/ports/photo-source.ts` in `src/server/sources/<id>.ts`: `id`, `labelKey`, `scopes`, `isConfigured()`, `startSelection()`, `listSelected()`, `fetchItem()` (validate hosts — SSRF!), and optionally `pollSelection()` / `finishSelection()`.
2. Register it in the source registry (`src/server/sources/registry.ts`) and extend `CloudSourceId`/`PhotoSourceId` in the domain types if you add a new id.
3. Always **import (copy)** items through the normal ingest pipeline — see ADR 0003.
4. Add env keys to `src/server/config.ts`, `.env.example`, the operator docs ([photo sources](docs/en/operator/photo-sources.md)) and a user-guide paragraph.
5. Add `sources` i18n keys (DE + EN) and tests with a mocked provider.

## How to add a login provider

1. Add `AUTH_<PROVIDER>_ID` / `AUTH_<PROVIDER>_SECRET` to `src/server/config.ts` (optional strings) and `.env.example`.
2. Register the provider in the Better Auth setup (`src/server/auth/`), enabled only when both values are set.
3. Add the button and `auth` i18n keys (DE + EN).
4. Document the redirect URI `${WAYFARE_BASE_URL}/api/auth/callback/<provider>` and the console setup in `docs/{en,de}/operator/authentication.md`, plus the config table.

## Documentation is part of the change

User-facing changes **must** update `docs/en/**` **and** `docs/de/**` (user guide and/or operator guide). If the UI changed, update the screenshot scenario `e2e/screenshots.spec.ts`; the images in `docs/public/screenshots/` are generated by CI — do not commit them by hand. `npm run docs:check` verifies the config reference and language parity; a Claude Code Stop hook and a CI workflow remind you as well (see [docs/en/contributing.md](docs/en/contributing.md)).

## Commits and pull requests

We use **[Conventional Commits](https://www.conventionalcommits.org/)**:

```
feat(album): add expiry reminder
fix(media): reject expired signatures
docs: explain Apple client secret renewal
chore(deps): bump sharp
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`. Breaking changes: `feat!:` plus a `BREAKING CHANGE:` footer.

**PR checklist** (also in the PR template):

- [ ] `npm run lint && npm run typecheck && npm test` pass
- [ ] Tests for new logic (services, adapters — contract tests for ports)
- [ ] Both languages (`messages/de`, `messages/en`) complete
- [ ] Docs updated in `docs/en` + `docs/de`; `npm run docs:check` passes
- [ ] Screenshot scenario updated if the UI changed
- [ ] No secrets, no third-party browser requests
- [ ] Small, focused PR with a clear description (screenshots for UI)

Thank you! ☕ If you like the project, you can [support it on Ko-fi](https://ko-fi.com/tsprock).
