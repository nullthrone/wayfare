# Claude / agent instructions

Read `ARCHITECTURE.md` (layers, conventions, security model) and `AGENTS.md` (Next.js 16 notes) first.

- Run `npm run typecheck && npm run lint && npm test` before finishing a change.
- User-facing feature changes MUST update the docs in `docs/de/**` and `docs/en/**`
  (user guide and/or operator guide) and, if the UI changed, the screenshot scenario in
  `e2e/screenshots.spec.ts`. The Stop hook in `.claude/settings.json` enforces this.
- Configuration keys in `src/server/config.ts` must be documented in
  `docs/{de,en}/operator/configuration.md`.
