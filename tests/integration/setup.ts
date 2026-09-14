import { readFileSync } from "node:fs";

// Runs before any test module in the integration project. It exists because
// `src/lib/supabase.ts` reads `process.env` AT MODULE SCOPE and throws when a variable
// is missing — so the environment has to be populated before anything imports it, which
// a helper module cannot guarantee (ESM evaluates imports in declaration order, and a
// linter is free to reorder them). A `setupFiles` entry is the only deterministic seam.
//
// Next.js loads `.env.local` for `next dev` and `next build`; vitest does not, and
// adding `dotenv` for one file is more dependency than this needs.

// ⚠ THIS FILE'S CONSUMERS DELETE ROWS, so the local-only guard below is a safety
// requirement rather than a nicety.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function loadEnvLocal(): void {
  let contents: string;
  try {
    contents = readFileSync(".env.local", "utf8");
  } catch {
    throw new Error(
      "Integration tests need .env.local (Supabase URL + service role key). " +
        "Copy .env.example and run `npx supabase start`.",
    );
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match === null) continue;
    // Do not clobber a variable the shell already set — an explicit
    // `NOMINATIM_BASE_URL=… npm run test:integration` should win over the file.
    if (process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].trim();
  }
}

// ⚠ REFUSES TO RUN AGAINST ANYTHING BUT A LOCAL DATABASE. `resetTables()` issues
// unfiltered deletes, so a `.env.local` pointing at a deployed Supabase project — a
// copy-paste away, and the exact thing `.env.local` is for — would empty it with no
// confirmation and no undo.
//
// Checked on the HOST rather than on a substring of the URL: `https://prod.example.com/
// ?x=localhost` contains "localhost" and is not local. `new URL` is what makes the
// question answerable rather than guessable — the same lesson as `geocoding.ts`'s
// base-URL handling, where two successive string predicates were both wrong.
function assertLocal(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Integration tests need NEXT_PUBLIC_SUPABASE_URL");

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a URL: ${url}`);
  }

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run integration tests against ${host}. These tests DELETE ROWS, ` +
        "and this guard exists so a deployed project cannot be emptied by a stray " +
        ".env.local. Point NEXT_PUBLIC_SUPABASE_URL at the local Supabase instance.",
    );
  }
}

loadEnvLocal();
assertLocal();
