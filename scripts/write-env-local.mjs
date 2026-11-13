// `npx supabase status -o env | node scripts/write-env-local.mjs` — writes `.env.local`
// from the local Supabase stack. Every CI job that starts the stack runs it (IS #286).
//
// The mapping is README's "3. Environment" table: the CLI's `API_URL`, `ANON_KEY` and
// `SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_PMTILES_URL` from `.env.example`. The values are
// the local stack's, which aren't secrets (CLAUDE.md, "Secrets"). Each is written in double
// quotes. A missing or empty value, or one holding `"`, `$`, a backslash or a line break
// (which a reader would change, below), fails with exit 1, and the message names every
// such value; nothing is written.
// The tiles URL is required too: `.env.example` marks it "Required: the map draws nothing
// without it".
//
// Overwrites `.env.local`. In CI the checkout has none; locally, this replaces yours.

import { readFileSync, writeFileSync } from "node:fs";
import { isatty } from "node:tty";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// `.env.local`'s variable ← where its value comes from.
export const MAPPING = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", from: "status", key: "API_URL" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", from: "status", key: "ANON_KEY" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", from: "status", key: "SERVICE_ROLE_KEY" },
  { name: "NEXT_PUBLIC_PMTILES_URL", from: "example", key: "NEXT_PUBLIC_PMTILES_URL" },
];

// `KEY=value` lines into a map; anything else is skipped. The pattern and the unquoting are
// tests/integration/setup.ts's loadEnvLocal's: spaces around `=`, a `"…"` or `'…'` value
// kept whole, an unquoted value stopping at `#`, then trimmed, and a matching pair of
// quotes removed. So `KEY= # note` is empty here too. The CLI's `-o env` quoted all 18 of
// its values (CLI 2.109.1); `.env.example` quotes none.
export function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*("[^"]*"|'[^']*'|[^#]*)/.exec(line);
    if (match === null) continue;
    const value = match[2].trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    values.set(match[1], quoted === null ? value : quoted[2]);
  }
  return values;
}

// Pure. Returns `.env.local`'s text, each value in double quotes, or throws one error
// naming every value that's missing or empty and every one it refuses.
//
// Quoted, `#`, spaces and an apostrophe read back whole: Next 16.4.5's loadEnvConfig,
// Node v26.13.0's process.loadEnvFile and setup.ts's pattern all read `"a#b"`, `"a b"`,
// `" pad "` and `"it's"` back exactly, where unquoted `X=a#b` read as "a". Refused, since a
// reader changes or splits them: `$` (Next read `"a$HOME"` as the home directory),
// a backslash (Next and Node read `"x\ny"` with a real newline), `"` (it ends the quoted
// value), and a line break (setup.ts reads line by line). IS #286's PR.
export function envLocalText(statusText, exampleText) {
  const sources = { status: parseEnv(statusText), example: parseEnv(exampleText) };
  const lines = [];
  const problems = [];
  for (const { name, from, key } of MAPPING) {
    const value = sources[from].get(key);
    const source = from === "status" ? "supabase status" : ".env.example";
    if (!value) problems.push(`${key} (from ${source}) is missing or empty`);
    else if (/["$\\\r\n]/.test(value)) problems.push(`${key} (from ${source}) holds ", $, \\ or a line break`);
    else lines.push(`${name}="${value}"`);
  }
  if (problems.length > 0) throw new Error(problems.join("; "));
  return `${lines.join("\n")}\n`;
}

// Run only when executed, not when a test imports it: `import.meta.main` (Node v26.13.0:
// true when run, false when imported, IS #286's PR), and on a Node without it the entry
// script's path compared with this file's.
const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url);
if (isMain) {
  // Where stdin is a terminal and nothing is piped in, reading it would wait for input, so
  // this prints the usage instead. `isatty(0)`, not `process.stdin.isTTY`: with a
  // `process.stdin.isTTY` check here, the `readFileSync(0)` below failed in CI on a piped
  // stdin with "EAGAIN: resource temporarily unavailable" (run 43413485618), and without
  // one it read it (run 43411649116); a pipe on Windows didn't show the failure.
  if (isatty(0)) {
    console.error("usage: npx supabase status -o env | node scripts/write-env-local.mjs");
    process.exit(2);
  }
  try {
    const statusText = readFileSync(0, "utf8");
    const exampleText = readFileSync(resolve(ROOT, ".env.example"), "utf8");
    writeFileSync(resolve(ROOT, ".env.local"), envLocalText(statusText, exampleText));
    console.log("write-env-local: wrote .env.local from the local stack");
  } catch (err) {
    // `::error::` makes GitHub Actions show it as an annotation; locally it's plain text.
    console.error(`::error::write-env-local: ${err.message}`);
    process.exit(1);
  }
}
