import { afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ⚠ RESOLVED FROM THIS FILE, NOT FROM `process.cwd()`. A bare `".env.local"` resolves
// against the working directory, so invoking vitest from a subdirectory produces
// "Integration tests need .env.local … run `npx supabase start`" — an error that names
// the wrong problem and sends the reader to restart a database that is already running.
// The file's location relative to this one is fixed; the caller's directory is not.
const ENV_FILE = fileURLToPath(new URL("../../.env.local", import.meta.url));

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
//
// ⚠ THE REASON IS NOT "UNFILTERED DELETES", WHICH IS WHAT THIS SAID UNTIL r2.
// `resetTables()` has been scoped to its own fixtures since r1, so the statement was
// stale the moment that landed — corrected in the helper and left here, the third time
// in this project a correction has been applied in one place and not its mirror.
//
// The real reason is stronger anyway and does not depend on how well-scoped the helper
// currently is: this suite exists to DELETE ROWS, its predicate has already been wrong
// twice (all-tables in r1, LIKE wildcards in r2), and neither failure produced a single
// red test. A guard that only holds while the predicate is correct is no guard.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// ⚠ `.env` VALUES MAY BE QUOTED, AND KEEPING THE QUOTES FAILS OPAQUELY. `next dev`
// accepts `SUPABASE_SERVICE_ROLE_KEY="ey..."`, so a `.env.local` written that way is
// legal and works everywhere except here — the literal quotes ride along into the
// header and every request comes back 401 with nothing pointing at the cause.
//
// The URL case fails legibly (`new URL('"http://…"')` throws, and `assertLocal` says
// so), which is what would have masked the key case: the first symptom anyone hits is
// the one that explains itself.
//
// Matching quotes only, and only as a PAIR. A value that legitimately starts with a
// quote and does not end with one is left alone rather than half-stripped.
function unquote(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted === null ? value : quoted[2];
}

function loadEnvLocal(): void {
  let contents: string;
  try {
    contents = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error(
      `Integration tests need ${ENV_FILE} (Supabase URL + service role key). ` +
        "Copy .env.example and run `npx supabase start`.",
    );
  }

  for (const line of contents.split(/\r?\n/)) {
    // ⚠ THE VALUE STOPS AT AN UNQUOTED `#`. A first version captured everything after
    // `=`, so an inline comment rode into the value — and Next.js's dotenv stops at
    // `#`, so a `.env.local` written that way works for `next dev` and fails only here.
    //
    // Same failure SHAPE as the quoting bug: a service-role key with a trailing
    // " # note" attached returns an opaque 401 with nothing pointing at the cause.
    // Quoted values keep their `#`, which is why the quote is matched first.
    const match = /^\s*([A-Z0-9_]+)\s*=\s*("[^"]*"|'[^']*'|[^#]*)/.exec(line);
    if (match === null) continue;
    // Do not clobber a variable the shell already set — an explicit
    // `NOMINATIM_BASE_URL=… npm run test:integration` should win over the file.
    if (process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = unquote(match[2].trim());
  }
}

// ⚠ REFUSES TO RUN AGAINST ANYTHING BUT A LOCAL DATABASE. This suite deletes rows, its
// cleanup predicate has now been wrong three times (all-tables, `_` as a LIKE wildcard,
// `*` as one), and not one of those failures produced a red test. A `.env.local`
// pointing at a deployed Supabase project — a copy-paste away, and the exact thing
// `.env.local` is for — would take rows with it, with no confirmation and no undo.
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

// ⚠ CLEAN UP AFTER THE LAST TEST, NOT ONLY BEFORE THE NEXT ONE. Suites call
// `resetTables()` in `beforeEach`, which leaves the FINAL test's fixtures behind until
// something runs again — so a developer opening Supabase Studio after a green run sees
// `itest-fixture-…` rows sitting next to the seed data and has to work out whether they
// matter.
//
// Harmless (prefixed, and the next run collects them) but noise in a database whose
// whole purpose is being inspected by hand. `setupFiles` runs per test FILE, so this
// fires after each one and the last leaves the database as it found it.
//
// Imported lazily inside the hook rather than at module scope: `helpers.ts` imports
// `supabaseAdmin`, which reads `process.env` on import, and the whole point of this file
// is that the environment is not populated until `loadEnvLocal()` has run below.
afterAll(async () => {
  const { resetTables } = await import("./helpers");
  await resetTables();
});
