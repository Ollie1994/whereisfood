// `npx supabase status -o env | node scripts/write-env-local.mjs` — writes `.env.local`
// from the local Supabase stack (IS #286; it replaced `ci.yml`'s inline step, which #285
// wrote, so every CI job that starts the stack shares one definition).
//
// The mapping is README's "3. Environment" table: the CLI's `API_URL`, `ANON_KEY` and
// `SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_PMTILES_URL` from `.env.example`. The values are
// the local stack's, which aren't secrets (CLAUDE.md, "Secrets"). A missing or empty
// value fails with exit 1 and names every one missing, writing nothing.
//
// Overwrites `.env.local`. In CI the checkout has none; locally, this replaces yours.

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// `.env.local`'s variable ← where its value comes from.
export const MAPPING = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", from: "status", key: "API_URL" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", from: "status", key: "ANON_KEY" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", from: "status", key: "SERVICE_ROLE_KEY" },
  { name: "NEXT_PUBLIC_PMTILES_URL", from: "example", key: "NEXT_PUBLIC_PMTILES_URL" },
];

// `KEY=value` and `KEY="value"` lines into a map; anything else is skipped. The CLI's
// `-o env` quotes every value (`API_URL="http://127.0.0.1:54321"`, CLI 2.109.1);
// `.env.example` doesn't.
export function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(?:"(.*)"|(.*))$/.exec(line.trim());
    if (match) values.set(match[1], match[2] ?? match[3]);
  }
  return values;
}

// Pure. Returns `.env.local`'s text, or throws naming every missing or empty value.
export function envLocalText(statusText, exampleText) {
  const sources = { status: parseEnv(statusText), example: parseEnv(exampleText) };
  const lines = [];
  const missing = [];
  for (const { name, from, key } of MAPPING) {
    const value = sources[from].get(key);
    if (!value) missing.push(`${key} (from ${from === "status" ? "supabase status" : ".env.example"})`);
    else lines.push(`${name}=${value}`);
  }
  if (missing.length > 0) throw new Error(`missing or empty: ${missing.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
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
