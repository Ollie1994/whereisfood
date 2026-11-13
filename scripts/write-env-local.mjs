// `npx supabase status -o env | node scripts/write-env-local.mjs` — writes `.env.local`
// from the local Supabase stack. Every CI job that starts the stack runs it (IS #286).
//
// The mapping is README's "3. Environment" table: the CLI's `API_URL`, `ANON_KEY` and
// `SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_PMTILES_URL` from `.env.example`. The values are
// the local stack's, which aren't secrets (CLAUDE.md, "Secrets"). Each is written in double
// quotes. A missing or empty value, or one holding `"` or a line break (which can't be
// quoted), fails with exit 1, and the message names every such value; nothing is written.
// The tiles URL is required too: `.env.example` marks it "Required: the map draws nothing
// without it".
//
// Overwrites `.env.local`. In CI the checkout has none; locally, this replaces yours.

import { readFileSync, writeFileSync } from "node:fs";
import { isatty } from "node:tty";
import { fileURLToPath } from "node:url";
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
// naming every value that's missing or empty and every one that can't be quoted.
//
// Quoted, a value reads back whole: Node v26.13.0's process.loadEnvFile and setup.ts's
// pattern both read `A="a#b"`, `B="a b"`, `C=" pad "` and `D="it's"` back exactly, where
// unquoted `X=a#b` read as "a" (IS #286's PR). A `"` or a line break would end the quoted
// value early, so those are refused.
export function envLocalText(statusText, exampleText) {
  const sources = { status: parseEnv(statusText), example: parseEnv(exampleText) };
  const lines = [];
  const problems = [];
  for (const { name, from, key } of MAPPING) {
    const value = sources[from].get(key);
    const source = from === "status" ? "supabase status" : ".env.example";
    if (!value) problems.push(`${key} (from ${source}) is missing or empty`);
    else if (/["\r\n]/.test(value)) problems.push(`${key} (from ${source}) holds a " or a line break`);
    else lines.push(`${name}="${value}"`);
  }
  if (problems.length > 0) throw new Error(problems.join("; "));
  return `${lines.join("\n")}\n`;
}

// `import.meta.main` is undefined on a Node without it, where this would otherwise do
// nothing and exit 0; package.json's devEngines asks for 26.x, which has it (true when run,
// false when imported: Node v26.13.0, IS #286's PR).
if (import.meta.main === undefined) {
  console.error("write-env-local: this Node has no import.meta.main; use the Node devEngines names (26.x)");
  process.exit(2);
}
if (import.meta.main) {
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
