#!/usr/bin/env node
/**
 * Claude Code Stop hook: keeps the documentation in sync with the code.
 *
 * Blocks the stop (so Claude keeps working) when
 *   - user-facing code changed but docs/de + docs/en did not, or
 *   - an env key of src/server/config.ts is missing in operator/configuration.md (en or de).
 *
 * Protocol: JSON on stdin (incl. stop_hook_active), JSON on stdout, always exit 0.
 * See .claude/README.md. The logic lives in scripts/check-docs.mjs (also used by CI).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

let input = {};
try {
  input = JSON.parse(readStdin() || "{}");
} catch {
  input = {};
}

// Claude already continued once because of a Stop hook: never loop.
if (input.stop_hook_active) process.exit(0);

try {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const { collectProblems } = await import(pathToFileURL(resolve(root, "scripts/check-docs.mjs")).href);
  const problems = collectProblems({ root });
  if (problems.length > 0) {
    const reason =
      "Documentation is out of sync (see CLAUDE.md):\n" +
      problems.map((p) => `- ${p}`).join("\n") +
      "\nFix this now (run `node scripts/check-docs.mjs` to verify), or explain in your final answer why no docs change is needed.";
    process.stdout.write(JSON.stringify({ decision: "block", reason }));
  }
} catch (err) {
  // A broken hook must never trap the session.
  console.error(`docs-sync-check: ${err instanceof Error ? err.message : err}`);
}
process.exit(0);
