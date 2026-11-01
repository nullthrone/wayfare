# Contributing & docs automation

Wayfare is open source (MIT) and welcomes contributions: bug reports, themes, translations, photo sources, login providers and documentation. The full guide is [CONTRIBUTING.md](https://github.com/nullthrone/wayfare/blob/main/CONTRIBUTING.md). The highlights:

## Quick start

```bash
git clone https://github.com/nullthrone/wayfare.git && cd wayfare
npm ci
cp .env.example .env     # set WAYFARE_SECRET (32+ chars)
npm run dev
```

Run `npm run lint && npm run typecheck && npm test` before opening a PR. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(album): …`, `fix: …`, `docs: …`).

## Conventions in short

- Ports & adapters: only `src/server/container.ts` chooses implementations; authorisation lives in `src/server/services`.
- All UI text via next-intl, **both** `messages/de` and `messages/en`; German uses "du".
- No third-party requests from the browser (self-hosted fonts, no analytics).
- Extending: [add a theme](https://github.com/nullthrone/wayfare/blob/main/CONTRIBUTING.md#how-to-add-a-theme), [a photo source](https://github.com/nullthrone/wayfare/blob/main/CONTRIBUTING.md#how-to-add-a-photo-source-adapter) or [a login provider](https://github.com/nullthrone/wayfare/blob/main/CONTRIBUTING.md#how-to-add-a-login-provider).

## Documentation rules

Any change that users or operators can notice must update `docs/en/**` **and** `docs/de/**`. New environment variables go into `docs/{en,de}/operator/configuration.md`. If the UI changed, update the screenshot scenario `e2e/screenshots.spec.ts`.

```bash
npm run docs:dev      # live preview of this site
npm run docs:build    # production build
npm run docs:check    # verify docs are in sync with the code
```

## How the docs stay up to date

Three layers work together so documentation does not rot:

1. **Claude Code Stop hook** (`.claude/settings.json` → `.claude/hooks/docs-sync-check.mjs`). When you work with Claude Code and finish a turn, the hook compares your changes (against `origin/main` plus uncommitted files) with the docs. If user-facing code changed without docs changes — or an env key from `src/server/config.ts` is missing in the configuration reference — it blocks the stop and tells Claude to update the docs in both languages, or explain why none are needed. The same logic is available as `npm run docs:check` (`scripts/check-docs.mjs`), also used by CI.
2. **`claude-docs` workflow** (`.github/workflows/claude-docs.yml`). On pushes to `main` that touch `src/**` or `messages/**`, the Claude Code GitHub Action compares the diff with the docs and opens a pull request `docs: sync with <sha>` if something needs updating. It needs the repository secret `ANTHROPIC_API_KEY`; without it the job is skipped.
3. **`docs` workflow** (`.github/workflows/docs.yml`). On pushes to `main` it builds the app, starts it in demo mode with seed data (`npm run seed`), takes the screenshots with Playwright (`npm run screenshots` → `docs/public/screenshots/{de,en}/*.png`), builds this VitePress site and deploys it to GitHub Pages. Screenshots are therefore always current and never committed by hand.

## Support the project

If Wayfare is useful to you: [☕ ko-fi.com/tsprock](https://ko-fi.com/tsprock).
