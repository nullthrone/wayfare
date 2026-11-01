# e2e: demo seed and documentation screenshots

`scripts/seed.ts` fills a **demo instance** with users, albums, photos, comments, reactions, a moderation
queue and a custom theme. `e2e/screenshots.mjs` then drives a real browser (Playwright, plain library, no
test runner) through the app and writes the PNGs the docs use to `docs/public/screenshots/{de,en}/`.

## Run it locally

```bash
export WAYFARE_SECRET=docs-demo-secret-0123456789-0123456789-abcdef   # 32+ chars
export WAYFARE_DEMO_MODE=true          # enables e-mail/password login; the seed refuses to run without it
export WAYFARE_BASE_URL=http://localhost:3000
export DATA_DIR=./data-demo

npm run build
npm run seed -- --reset                # --reset wipes DATA_DIR first (without it a non-empty instance aborts)
npm start &                            # serves on :3000
npx playwright install chromium        # once (CI does this too)
npm run screenshots                    # waits for /api/health, then captures de + en
```

Environment for `npm run screenshots`:

| Variable | Default | Meaning |
|---|---|---|
| `WAYFARE_BASE_URL` | `http://localhost:3000` | where the running app is reachable |
| `WAYFARE_SCREENSHOT_LOCALES` | `de,en` | comma-separated subset, e.g. `de` |
| `WAYFARE_SCREENSHOT_ONLY` | all | comma-separated screenshot names, e.g. `viewer-grid,dashboard` |

## Demo accounts

All accounts use the password **`wayfare-demo`**.

| Role | E-mail |
|---|---|
| admin | `admin@wayfare.demo` (Alex Admin) |
| owner | `thomas@wayfare.demo` (Thomas) |
| viewers | `mia@`, `jonas@`, `oma.erika@`, `ben@wayfare.demo` |

Album **Hochzeit Lena & Jonas** is password protected: `lena-jonas`. The seed prints all album URLs.

## Photos

For every file listed in `e2e/fixtures/photos/PROMPTS.md` the seed uses `e2e/fixtures/photos/<file>` if it
exists. Otherwise it renders a deterministic procedural placeholder (gradient, hills, bokeh, film grain) in the
documented aspect ratio (4:3 = 1600x1200, 3:4 = 1200x1600, 1:1 = 1400x1400). Dropping the real photos into the
folder is all that is needed; no code change.

## What gets captured

`landing, login, dashboard, album-new, album-photos, album-settings, album-share, album-moderation, album-stats,
theme-builder, account` (owner), `viewer-cover, viewer-grid, viewer-lightbox, viewer-comments, viewer-mobile`
(signed-in guest "Mia", 390x844 @2x for mobile), `viewer-password` (logged out), `admin-settings, admin-users`
(admin). Desktop is 1440x900 at DPR 1; tall pages are captured at full height (capped). PNGs are optimised with
sharp; photo-heavy ones fall back to a 256-colour palette to stay below ~400 KB.
