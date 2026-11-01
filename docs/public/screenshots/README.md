# Screenshots

The images in `de/` and `en/` are **generated automatically** and are not committed by hand:

```bash
npm run build && npm run seed && npm start   # demo mode with seed data
npm run screenshots                           # Playwright writes docs/public/screenshots/{de,en}/*.png
```

The scenario lives in `e2e/screenshots.spec.ts`. The `docs.yml` GitHub workflow runs it on every
push to `main` and publishes the site. Until they exist, pages simply show a missing image.

Names used by the docs: `landing, login, dashboard, album-new, album-photos, album-settings,
album-share, album-moderation, album-stats, theme-builder, viewer-cover, viewer-grid,
viewer-lightbox, viewer-comments, viewer-password, admin-settings, admin-users, account`.
