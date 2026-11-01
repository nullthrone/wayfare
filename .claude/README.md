# `.claude/` — project-level Claude Code configuration

## Docs-sync Stop hook

`settings.json` registers a **Stop** hook that runs `node .claude/hooks/docs-sync-check.mjs`
whenever Claude is about to finish a turn.

The hook (logic in `scripts/check-docs.mjs`, shared with CI and `npm run docs:check`):

1. reads the hook JSON from stdin and exits immediately if `stop_hook_active` is true
   (Claude already continued once because of this hook — no loops);
2. collects changed files: `git diff` against the merge-base with `origin/main`
   (fallback `HEAD~1`), plus uncommitted and untracked files;
3. if user-facing code changed (`src/app/**`, `src/components/**`, `src/server/services/**`,
   `src/server/sources/**`, `src/server/exports/**`, `src/themes/**`, `messages/**`,
   `src/server/config.ts`) but nothing under `docs/en/` **and** `docs/de/` changed, it prints
   `{"decision":"block","reason":"…"}` — Claude then has to update the user/operator docs in both
   languages (and `e2e/screenshots.spec.ts` for UI changes) or explain why no docs change is needed;
4. checks that every env key of the zod schema in `src/server/config.ts` appears in
   `docs/en/operator/configuration.md` and `docs/de/operator/configuration.md`;
5. checks that `docs/en` and `docs/de` contain the same pages.

Otherwise it exits 0 silently. Errors inside the hook never block the session.

Run the same checks manually: `npm run docs:check` (or `node scripts/check-docs.mjs --static` for the
git-independent subset used in CI).

To disable locally, override in `.claude/settings.local.json` (git-ignored by convention):
`{ "hooks": { "Stop": [] } }`.
