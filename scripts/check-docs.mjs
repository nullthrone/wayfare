#!/usr/bin/env node
/**
 * Docs consistency checks, shared by the Claude Code Stop hook (.claude/hooks/docs-sync-check.mjs),
 * `npm run docs:check` and CI.
 *
 * Checks
 *   1. config:  every env key of the zod schema in src/server/config.ts appears in
 *               docs/{en,de}/operator/configuration.md
 *   2. parity:  docs/en and docs/de contain the same markdown files
 *   3. changes: user-facing code changed (vs origin/main or HEAD~1, plus uncommitted work)
 *               but docs/de + docs/en were not touched
 *
 * Usage
 *   node scripts/check-docs.mjs               # all checks (exit 1 on problems)
 *   node scripts/check-docs.mjs --static      # config + parity only (CI, no git history needed)
 *   node scripts/check-docs.mjs --base main   # compare against a specific ref
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..");

/** Paths whose changes are user- or operator-facing and therefore need documentation. */
export const USER_FACING = [
  /^src\/app\//,
  /^src\/components\//,
  /^src\/server\/services\//,
  /^src\/server\/sources\//,
  /^src\/server\/exports\//,
  /^src\/themes\//,
  /^messages\//,
  /^src\/server\/config\.ts$/,
];
export const DOCS_LOCALES = ["en", "de"];

/** Env keys declared in the zod schema of src/server/config.ts. */
export function configKeys(root = ROOT) {
  const src = readFileSync(join(root, "src/server/config.ts"), "utf8");
  const start = src.indexOf("z.object({");
  if (start === -1) return [];
  const end = src.indexOf("\n});", start);
  const body = src.slice(start, end === -1 ? undefined : end);
  const keys = new Set();
  for (const m of body.matchAll(/^\s{2}([A-Z][A-Z0-9_]+)\s*:/gm)) keys.add(m[1]);
  return [...keys];
}

/** @returns {{locale: string, missing: string[]}[]} for locales with missing keys */
export function missingConfigKeys(root = ROOT) {
  const keys = configKeys(root);
  const out = [];
  for (const locale of DOCS_LOCALES) {
    const file = join(root, "docs", locale, "operator", "configuration.md");
    const text = existsSync(file) ? readFileSync(file, "utf8") : "";
    const missing = keys.filter((k) => !new RegExp(`(^|[^A-Z0-9_])${k}([^A-Z0-9_]|$)`).test(text));
    if (missing.length) out.push({ locale, missing, fileMissing: !existsSync(file) });
  }
  return out;
}

function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const res = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) res.push(...walk(p, base));
    else if (name.endsWith(".md")) res.push(relative(base, p).split("\\").join("/"));
  }
  return res;
}

/** Markdown files that exist in one locale but not in the other. */
export function localeParity(root = ROOT) {
  const [a, b] = DOCS_LOCALES.map((l) => new Set(walk(join(root, "docs", l))));
  const problems = [];
  for (const f of a) if (!b.has(f)) problems.push(`docs/de/${f} is missing (exists in docs/en)`);
  for (const f of b) if (!a.has(f)) problems.push(`docs/en/${f} is missing (exists in docs/de)`);
  return problems;
}

function git(args, root = ROOT) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
const lines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** Files changed vs. base (origin/main merge-base, fallback HEAD~1) plus uncommitted + untracked files. */
export function changedFiles(root = ROOT, baseRef) {
  const files = new Set();
  try {
    let base = null;
    for (const ref of baseRef ? [baseRef] : ["origin/main", "main"]) {
      try {
        base = git(["merge-base", ref, "HEAD"], root);
        if (base) break;
      } catch {
        /* try next */
      }
    }
    if (!base) {
      try {
        base = git(["rev-parse", "HEAD~1"], root);
      } catch {
        base = null;
      }
    }
    if (base) for (const f of lines(git(["diff", "--name-only", base, "HEAD"], root))) files.add(f);
    for (const f of lines(git(["diff", "--name-only", "HEAD"], root))) files.add(f);
    for (const f of lines(git(["ls-files", "--others", "--exclude-standard"], root))) files.add(f);
  } catch {
    /* not a git repo / no commits: nothing to compare */
  }
  return [...files];
}

/** @returns {string[]} problems regarding docs not following code changes */
export function docsChangeProblems(files) {
  const userFacing = files.filter((f) => USER_FACING.some((re) => re.test(f)));
  if (userFacing.length === 0) return [];
  const touched = Object.fromEntries(DOCS_LOCALES.map((l) => [l, files.some((f) => f.startsWith(`docs/${l}/`))]));
  const uiChanged = userFacing.some((f) => /^(src\/app|src\/components|src\/themes|messages)\//.test(f));
  const shown = userFacing.slice(0, 8).join(", ") + (userFacing.length > 8 ? `, … (+${userFacing.length - 8})` : "");
  if (!touched.en && !touched.de) {
    return [
      `User-facing code changed (${shown}) but nothing under docs/en/ or docs/de/ was updated. ` +
        "Update the user guide (docs/*/guide) and/or operator guide (docs/*/operator) in BOTH languages" +
        (uiChanged ? ", and the screenshot scenario e2e/screenshots.spec.ts if the UI changed" : "") +
        ". If no documentation change is needed (pure refactor, internal change), say so explicitly in your reply and why.",
    ];
  }
  if (touched.en !== touched.de) {
    const missing = touched.en ? "docs/de/" : "docs/en/";
    return [`Docs were updated in only one language. Mirror the change in ${missing} (German: informal "du").`];
  }
  return [];
}

export function collectProblems({ staticOnly = false, root = ROOT, base } = {}) {
  const problems = [];
  for (const { locale, missing, fileMissing } of missingConfigKeys(root)) {
    problems.push(
      `docs/${locale}/operator/configuration.md ${fileMissing ? "does not exist" : "is missing env keys"}: ${missing.join(", ")}. ` +
        "Document every key of src/server/config.ts there (default + description).",
    );
  }
  problems.push(...localeParity(root));
  if (!staticOnly) problems.push(...docsChangeProblems(changedFiles(root, base)));
  return problems;
}

// ----------------------------------------------------------------- CLI
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const staticOnly = args.includes("--static") || args.includes("--config-only");
  const baseIdx = args.indexOf("--base");
  const base = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
  const problems = collectProblems({ staticOnly, base });
  if (problems.length === 0) {
    console.log("docs check: OK");
  } else {
    console.error("docs check failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
}
