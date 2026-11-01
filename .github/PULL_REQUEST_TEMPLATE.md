## What & why

<!-- Short description. Link issues: Closes #123 -->

## Type of change

- [ ] feat (new feature)
- [ ] fix (bug fix)
- [ ] docs / chore / refactor / test

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (`feat(album): ...`)
- [ ] `npm run lint && npm run typecheck && npm test` pass locally
- [ ] Authorisation lives in services (not only in pages); server code imports `server-only`
- [ ] New UI strings exist in **both** `messages/de` and `messages/en` (German: informal "du")
- [ ] New/changed env keys are in `src/server/config.ts`, `.env.example` and `docs/{en,de}/operator/configuration.md`
- [ ] User-facing change: docs updated in **both** `docs/en/**` and `docs/de/**`
- [ ] UI change: screenshot scenario (`e2e/screenshots.mjs`) updated
- [ ] `node scripts/check-docs.mjs` passes
- [ ] No third-party requests from the browser (fonts self-hosted, no CDNs/analytics)

## Screenshots (UI changes)

<!-- before / after -->

## Deployment notes

<!-- Migrations? New env vars? Firebase rules/indexes? -->
