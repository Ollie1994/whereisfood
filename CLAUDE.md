# Foodtruck Map Gothenburg — Claude Instructions

Full project reference: `.claude/context/project-context.md`
Read it at the start of any non-trivial task.

**Current phase plan: `.claude/plans/phase-4-housekeeping.md` (until the Phase 5 plan
exists) — read it too, and when the two disagree, THE PLAN WINS.**

`project-context.md` is only reconciled with reality at the END of a phase (it is a
tracked task in each plan — Phase 4's is issue #127). So for the whole duration of a
phase it is a snapshot of the phase *before* it, while the plan carries the decisions
that were actually settled. Reading only the context is how a resolved question gets
re-litigated with a stale answer. **If it has no "Current state" section, it predates
the Phase 4 rewrite (#127) and describes the old three-lane design**, which Phase 4
removed.

The plan is also where the numbered decision records live (`#1`, `#2`, …) —
those are the reasoning behind rules the context states as bare facts, and an issue
saying "see the plan" means that section.

The removed design (ingestion lanes, parser, geocoding) is archived on the
`archive/parser-lanes` branch and tag. Don't re-add any of it, or Realtime, cron or
Upstash, without a concrete problem that needs it.

---

## What This Is

A map showing where Gothenburg food trucks are today.
At launch one admin enters every location by hand from a phone-first admin screen.
No login for consumers. Only the admin logs in; truck owners get accounts later
(Owners phase).

---

## Tech Stack

```
Next.js 16.3 (App Router) · React 19 · TypeScript · Tailwind CSS v4
MapLibre GL JS 6 + Protomaps PMTiles (local file now, Cloudflare R2 at launch)
Supabase (Postgres + Auth)
Vitest 4 · date-fns-tz
```

**Read the Next docs that ship with the installed version** before writing Next code:
`node_modules/next/dist/docs/`. They match the pinned release; memory and the web may
describe a different one.

**Dependencies**
- `next`, `eslint-config-next` and `maplibre-gl` are **exact pins**. Upgrade them
  deliberately, each with a browser check of `/map` (Phase 4 plan decision #10). `next` and
  `eslint-config-next` move together, to the same version (PR #135).
- **Node `^20.19.0 || >=22.12.0`** (vite/rolldown's floor; older 20.x/22.x pass Next's
  check and fail under vitest) and **npm ≥ 11** (npm 10 crashes resolving vitest 4's
  optional peers, Phase 4 decision #11). Prose only: `package.json` doesn't enforce either.
- `next.config.ts` sets `agentRules: false`. Don't remove it without the owner
  (Phase 4 decision #12).
- MapLibre's worker is copied into `public/maplibre/<version>/` by the
  `postinstall`/`predev`/`prebuild` hooks. Don't switch to MapLibre's documented
  `setWorkerUrl(new URL(…, import.meta.url))` form: on Next 16.3 the worker 404s and
  the map draws only its background, with every gate green (Phase 4 decision #13).

---

## Architecture Rules

```
app/api/*/route.ts   → HTTP only, no business logic
src/lib/services/    → all business logic, no HTTP knowledge
src/lib/db/          → database access only
src/lib/validators/  → input validation
```

Route handlers call services. Services call DB layer. Never mix layers.

---

## Hard Rules

**Supabase**
- `supabaseAdmin` (service role) — server only, imported by the db layer (`src/lib/db/`)
  and the integration test helpers. Routes and services reach the database through the
  db layer, never this client directly
- `supabaseClient` (anon key) — browser only, and only for Auth (admin login, Phase 7).
  Never for data: see the next rules
- Never use `supabaseAdmin` in client components
- Never use `NEXT_PUBLIC_` prefix on secret keys
- **The browser never reads or writes the database.** Public map data comes only from
  `/api/live`; the admin screen reads through its own (uncached) API routes; every
  write goes through an API route. Server-side, all of them go route → service → db
  layer, and only the db layer uses `supabaseAdmin`
- Anon gets **no SELECT on `trucks` or `locations`** (Phase 5). With history kept, anon access
  would make every truck's movement history public through Supabase's API
- RLS on every table, an explicit `GRANT` per table that matches its RLS policies, and
  no owner self-UPDATE on `users` (blocks `is_admin` self-escalation and `truck_id`
  hijack). **Applies now** to every new migration: a `GRANT` per table, `service_role`
  included. 0001 has RLS everywhere and no self-UPDATE, but grants `service_role` with
  one blanket `on all tables` grant that doesn't reach later tables; don't copy it

**proxy.ts**
- File is `src/proxy.ts` — this is the Next.js 16 name for middleware
- **Never** export `runtime` (or any route segment config) from this file. Next 16
  fails the build: "Route segment config is not allowed in Proxy file". It is also
  unnecessary — the proxy always runs on Node.js in Next 16, which is what Supabase
  auth requires. `tsc`/lint/tests all pass with it, so only `next build` catches it.
- Must export a named function: `export function proxy(request: NextRequest)`
- Must export `config` with `matcher` to scope to protected routes only
- The proxy and the admin routes check for a session cookie **before any network or
  DB call**, so a cookie-less flood costs only the function run (Phase 7)

**API responses**
- All errors return `{ "error": "message" }` with the correct HTTP status code
- Never expose stack traces or internal errors to the client
- Every route handler wraps its body in `withErrorHandling()` (`src/lib/http/handler.ts`) so an unexpected throw becomes a 500 `{ error }` instead of Next's default error page. Expected failures are **returned** (`NextResponse.json({ error: msg }, { status: 400 })`), never thrown — returns pass through the wrapper untouched; the catch only intercepts genuine exceptions (e.g. a DB error from the db layer).

**`/api/live` (the public read path, Phase 6)**
- An ordinary (dynamic) route, cached by Vercel's CDN through
  `Cache-Control: public, s-maxage=60, stale-while-revalidate=60`. **Never ISR**, and
  no route segment config on it
- Never `Set-Cookie`, `Vary: Cookie`, `private` or `no-store` on its response: any of
  them stops Vercel caching it
- **Never return `[]` on error.** An error goes through `withErrorHandling` → 500,
  which Vercel doesn't cache; an empty 200 would be cached and wipe the map
- Reads through the db layer (which uses `supabaseAdmin`), and selects an **explicit
  column list, never `*`**, so
  `created_by` and future columns can't leak

**Target-design rules, enforced from Phase 5.** The Locations rules below and the
no-anon-SELECT bullet above describe the Phase 5 schema. Today's schema (0001–0006)
still breaks them: 0001 grants anon SELECT on `trucks` and `locations`, `ends_at` is
nullable (0002), there is no exclusion constraint, and `src/lib/db/locations.ts`
exports `deleteLocations`. Don't "fix" today's code to match; Phase 5 replaces schema,
db layer and tests together. (Time and Scheduling below apply now.)

**Locations** (Phase 5)
- Overlapping non-cancelled entries for a truck are refused by the DB exclusion
  constraint (`23P01` → 409, Swedish "överlappar" message). Never auto-resolve,
  replace or delete
- Locations are never deleted (except a takedown, which deletes the truck's whole
  history). Ended (`ends_at <= now()`) and cancelled (`cancelled_at`) are filters
- `starts_at` and `ends_at` are both required; a human always knows the end time

**Time**
- Timezone handling via `date-fns-tz`, always store UTC, display as `Europe/Stockholm`
- Validators stay pure: no `new Date()`, no env. Anything clock-dependent lives in the
  service

**Scheduling**
- No Vercel cron for the MVP: nothing needs one, and Hobby allows only daily jobs (a more
  frequent schedule fails at deploy). If a scheduler is ever needed, use pg_cron or an
  external service, never Vercel's free cron

---

## UI Rules

- Swedish language throughout all user-facing text
- All `useState` / `useEffect` live in hooks, not components
- Components only describe what to render
- Map markers are HTML elements via MapLibre Marker API — no image files
- **(Phase 6)** Only trucks with an entry today appear on the map; the popup always
  shows when it was updated. Today's fake-data map still does the old design's
  version: grey markers at `last_known_*` for trucks with no entry, colours and popup
  labels from confidence, no updated time. Don't change it before Phase 6 (Phase 4
  plan, Out of Scope)
- Never fully re-render the map — only update affected markers

---

## Testing

Vitest, split into two **projects** (`vitest.config.ts`, #61) by what a test needs to
run — not by what it tests:
- Unit: everything vitest collects **except** `tests/integration/`. Needs nothing.
  Co-located next to source by convention.
- Integration: `tests/integration/` only. Needs local Supabase. Runs files
  **sequentially** (`fileParallelism: false` on the project, since vitest 4) because
  they share one database.

Toolchain: the Node floor and npm ≥ 11 under Dependencies.

| Script | Runs | Needs Docker |
|---|---|---|
| `npm run test:run` | unit only | no |
| `npm run test:integration` | integration only (fails if it collects zero files) | yes |
| `npm run test:all` | **every project in `RUNS`** of `scripts/test-all.mjs` (today `unit` + `integration`), checked against the projects `vitest.config.ts` declares; takes no arguments | yes |

**There is no CI — every gate is manual.** The gate list is four commands, and
`test:run` is *not* one of them once integration tests exist:

```
npx tsc --noEmit      npm run lint      npm run test:all      npm run build
```

Use `test:run` for the fast inner loop with Docker down; use `test:all` before opening
or merging a PR. `test:run` passing is not evidence the integration suite passes — it
does not run it.

⚠ **Read an exit code unpiped.** `cmd | tail; echo $?` reports `tail`'s status, not the
command's, and has already produced a confident wrong gate result here (process-log
#169). Use `cmd >/dev/null 2>&1; echo $?`.

⚠ **After deleting or renaming a route, clear `.next/` before the gates.** `tsconfig`
includes Next's generated `.next/types` and `.next/dev/types`, which keep referencing
the old route until regenerated, so `tsc` and `build` fail with `Cannot find module
'…/route.js'`, which reads like a broken import. `rm -rf .next` (gitignored build
output) and re-run (process-log row 275, PR #133).

⚠ **Browser checks: confirm which server answered, and that it is gone afterwards.**
Stopping `npm start` or `npm run dev` from a background task on Windows ends `npm` but
leaves its Next child processes running, still holding the port. The next server
then silently takes the next free port (:3001), and a request to :3000 is answered by
the stale one. So:
- read the URL from the server's own `Local:` line before requesting or sharing it;
- after stopping, check that no `node` process with this repo in its command line is
  left (`Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"`), and stop any
  that are (process-log row 279, PR #135).

⚠ **Green gates don't show the map renders.** After a change to the map code, its
dependencies or the tile file, look at `/map` in a real browser: basemap, markers and
a popup. MapLibre's worker 404'd with all four gates green (process-log row 282).
Headless Edge on this machine doesn't load the style at all, even on a working build,
so it is no substitute (PR #138).

**`test:all` fails if any project collects zero test files** (fixed by #99). Vitest's
empty-match check is per-**run**, not per-project, so `test:all` (`scripts/test-all.mjs`)
runs each project in its own `vitest run` (via `test:run` and `test:integration`),
always runs all of them, and fails if any fails. Before #99 a broken `unit` glob with
one integration test present gave `exit 0`, with 917 tests silently gone.

**Adding a vitest project?** Add it to `RUNS` in `scripts/test-all.mjs`. The gate
reads the declared projects from the resolved config and **fails** while one is missing
there, even a project that collects no files (or while `RUNS` names one the config
doesn't declare). To narrow a run, use vitest directly (`npx vitest run --project <name> <filter>`);
`test:all` refuses arguments rather than ignoring them.

⚠ **What the gate still can't see:** a *partial* drop (some files silently uncollected
while others run) and files whose tests are all skipped. So glance at each project's
file/test counts when tests are added, moved or deleted.

---

## Doc changes — always issue → branch → PR

Every change to a tracked doc goes through an issue, a branch and a PR into `dev`,
exactly like code. Tracked docs are `CLAUDE.md`, `README.md` and everything under
`.claude/` (plans, `project-context.md`, `transition.md`, commands and
**`process-log.md`**). Never commit one straight to `dev`, and never leave one sitting
uncommitted on `dev`. Every doc change then has a reviewable diff and a
`PR #n / IS #n` to point at.

- **Part of tracked work → ride along.** A log row from a review round, a doc claim a
  fix made stale, a plan tweak while working an issue: commit it on that issue's
  branch, in its PR, and name it in the PR body.
- **Nothing covers it → open one.** A dedicated issue (same format as the others), a
  branch off `dev`, a PR. That includes a log row written outside any issue's work,
  e.g. a miss found while surveying the repo (IS #131).
- GitHub issue and PR text is not a repo file, so editing it needs no branch. It is
  still a doc: a corrected claim there gets the same sweep as one in a file ("Review
  rounds" below; process-log rows 269, 271).

---

## Review rounds — sweep every fix, then check claims

Why: the process log's Phase 3 retrospective (its Action 1) and Phase 4 retrospective
(#149). Before asking for any review round, do the sweep (after a round's fixes) and
then the claims check (every round, the first included), in that order, so the claims
check also reads what the sweep changed.

**The sweep: after applying a round's fixes** (or whenever a claim is corrected
outside a review):

1. **List from the diff** (`git diff <last reviewed commit>`) each claim, term or rule
   the fixes changed or added, not only the ones a finding named. A list from memory
   is what let the sweep miss copies in PRs #143, #145 and #147 (rows 301, 304, 306).
   A correction with no commit (an issue body) lists from the edit itself: the old
   and new text.
2. **Grep every mention** of each across the tracked docs (`CLAUDE.md`, `README.md`,
   `.claude/`), code comments and tests, **every open issue body**, and the PR body if
   there is one.
3. **Read every hit.** Fix the stale ones. A hit that restates a rule owned elsewhere
   becomes a pointer to that copy, not a second edit (rows 294–295, 307). History
   (process-log rows from earlier work, dated entries) stays as written; rows this PR
   added are its own claims and get fixed.
4. **Record the sweep** where the correction lives: that round's section of the PR
   body, or a comment on the issue when only an issue body was corrected. Claim →
   where it was checked → result.

Fixing only the lines a finding names is what let one correction miss its copies three
rounds running; the sweep found the copy no finding had named (process-log row 295).

**The claims check: last, before every round.** Run
`bash scripts/claims.sh "<rev>" <PR-body file>`, where `<rev>` is the last reviewed
commit, or `"$(git merge-base origin/dev HEAD)"` for the first round (plain `dev`
would also list lines `dev` changed after the branch was cut; quoted, so a failed
merge-base stops the script instead of shifting its arguments). It lists added lines
with words like "every", "only", "always" or "checked". For each hit, do one of three
things:
- back it with a command whose result is in the PR body;
- reword it;
- or note it is a rule, not a claim of fact.

Record the hit count and how each was settled in the PR body, under the round the
check comes before (the first round's goes in the body as opened). The script lists
claims, it doesn't judge them; its header says what it can't see.

---

## Process Log — always record misses

`.claude/process-log.md` is the record of what the development process got wrong.
It only works if entries are written **as they happen**, in the same session. A miss
reconstructed a week later loses the detail that made it useful.

**Add a row to the `## Log` table when any of these happen — no exceptions, including
when the miss is mine:**

- A defect gets past a gate that should have caught it (tests, `tsc`, lint, build, review)
- A rule in `CLAUDE.md`, `project-context.md`, a plan, a command or an issue turns out
  **wrong**, **stale**, or **was not consulted**
- A fix introduces a new defect (**overcorrection**) — the most expensive category
- A confident claim turns out to be unverified or false
- The same class of problem is caught twice
- A settled decision gets re-proposed, or a preference is assumed instead of asked
- A review round finds anything — that is the signal an earlier gate missed it

**Do not** log ordinary bugs found and fixed while writing the code. That is just
work. The bar is *"this says something about the process."* Bugs belong in GitHub
issues; this file is for what the bug reveals about how we work.

**Also record settled decisions** with their rationale, so a resolved question stays
resolved and is not re-litigated next session.

**Every milestone includes a retrospective.** The procedure, with its order,
blocking and closing rules, is in the log's "How to use it" section;
`/create-milestone` and `/create-issues` apply it.

**Before adding a row, read the file's own `Columns` and `Cause taxonomy` sections** and
use those exact values — do not invent new ones and do not copy the taxonomy here.
Duplicating it in two files is the same `manual-drift` the log exists to catch.

**A row goes directly after the last row of the `## Log` table, not at the end of the
file.** Detail entries follow the table, so a row appended to the file lands outside
it and renders as plain text (row 272).

**After adding or editing rows, run `bash scripts/process-log.sh check`.** It must
print nothing and exit 0. It checks every row: placement in the table, numbering, cell
count, and values against the log's own lists. Exit 2 means it couldn't read the log or
its lists.

Include the `PR #n / IS #n` reference. Those numbers link each row to the diff and the
review discussion. The log is tracked in the repo (since IS #116), and the repo is
**public**, so never paste secrets, keys or real personal data into it.
