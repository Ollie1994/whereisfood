# Foodtruck Map Gothenburg — Claude Instructions

Full project reference: `.claude/context/project-context.md`
Read it at the start of any non-trivial task.

**Current phase plan: `.claude/plans/phase-<n>-<name>.md` — read it too, and when the
two disagree, THE PLAN WINS.**

`project-context.md` is only reconciled with reality at the END of a phase (it is a
tracked task in each plan — Phase 3's is issue #73). So for the whole duration of a
phase it is a snapshot of the phase *before* it, while the plan carries the decisions
that were actually settled. Reading only the context is how a resolved question gets
re-litigated with a stale answer.

The plan is also where the numbered decision records live (`#1`…`#7` in Phase 3) —
those are the reasoning behind rules the context states as bare facts, and an issue
saying "see the plan" means that section.

---

## What This Is

A live map showing where Gothenburg food trucks are right now.
Three ingestion lanes: Dashboard (manual), Make.com webhooks, Mailgun email.
No login for consumers. Truck owners have accounts.

---

## Tech Stack

```
Next.js 16 (App Router) · TypeScript · Tailwind CSS v4
MapLibre GL JS + Protomaps PMTiles + Cloudflare R2
Supabase (Postgres + Realtime + Auth)
Vitest · date-fns-tz · Upstash Redis · Nominatim
```

---

## Architecture Rules

```
app/api/*/route.ts   → HTTP only, no business logic
src/lib/services/    → all business logic, no HTTP knowledge
src/lib/db/          → database access only
src/lib/parser/      → pure functions, no DB, no HTTP, no side effects
src/lib/validators/  → input validation
```

Route handlers call services. Services call DB layer. Parser is pure.
Never mix layers.

---

## Hard Rules

**Supabase**
- `supabaseAdmin` (service role) — server only, API routes and services
- `supabaseClient` (anon key) — browser only, components and hooks
- Never use `supabaseAdmin` in client components
- Never use `NEXT_PUBLIC_` prefix on secret keys
- All writes go through API routes using `supabaseAdmin` — never write from the browser

**proxy.ts**
- File is `src/proxy.ts` — this is the Next.js 16 name for middleware
- **Never** export `runtime` (or any route segment config) from this file. Next 16
  fails the build: "Route segment config is not allowed in Proxy file". It is also
  unnecessary — the proxy always runs on Node.js in Next 16, which is what Supabase
  auth requires. `tsc`/lint/tests all pass with it, so only `next build` catches it.
- Must export a named function: `export function proxy(request: NextRequest)`
- Must export `config` with `matcher` to scope to protected routes only

**API responses**
- Use `after()` from `next/server` for post-response async work — `unstable_after` does not exist in Next.js 16
- All errors return `{ "error": "message" }` with the correct HTTP status code
- Never expose stack traces or internal errors to the client
- Return 200 immediately from webhook endpoints, run parsing inside `after()`
- Every route handler wraps its body in `withErrorHandling()` (`src/lib/http/handler.ts`) so an unexpected throw becomes a 500 `{ error }` instead of Next's default error page. Expected failures are **returned** (`errorResponse(msg, 400/401)`), never thrown — returns pass through the wrapper untouched; the catch only intercepts genuine exceptions (e.g. a DB error from the db layer).

**Email lane (Mailgun)**
- Verify the HMAC signature before anything else, then evaluate timestamp freshness
- **A stale timestamp is never a rejection.** Signature = "did this come through Mailgun" (bad → 400). Freshness = "may we act on it" (stale → store with `parsing_status = 'skipped'`, return 200). Freshness governs whether we ACT on a post, not whether we KEEP it
- **The HMAC covers only `timestamp + token`** — not `recipient`, not `body-plain`. It authenticates the *relay*, not the *content*, so one captured tuple could carry an arbitrary recipient and body. Inherent to Mailgun's scheme. Bounded by the replay index (one row per tuple) and the 15-min window (after which the row is `skipped` and never parsed). Never describe the signature as proving the truck sent it
- Replay window is **±15 minutes** (`REPLAY_WINDOW_SECONDS`, `src/lib/services/ingestion.ts`)
- **Never tighten below 10 minutes.** Mailgun retries a failed POST at 10/20/35/65/125/245/485 min (cumulative), and 15 min is Mailgun's own documented tolerance — they warn against being more aggressive. A shorter window makes even the first retry unparseable
- Never return 400 or a 5xx for a stale-but-signed payload — that discards a genuine truck email and breaks "never lose incoming data"
- **The HMAC boundary is ambiguous, and the defence is structural — not validation.** Mailgun signs `timestamp + token` with **no delimiter**, so the same signed string re-splits at any interior index, every split verifies under the *same* signature, and each yields a different token (41 working variants, verified). Do **not** "fix" this by constraining the timestamp format: that rejects validly-signed payloads and reintroduces permanent data loss. The index keys on the concatenation, which is identical across every split, so variants collapse to one row — and none can fall inside the freshness window, so none becomes a live location
- **Replay is blocked by `posts_email_token_unique`** (migration 0004), a unique index on `(raw_json->>'timestamp') || (raw_json->>'token')` for `source = 'email'`. The key is the **concatenation**, not the token alone — that is exactly the string Mailgun signed, so it is invariant under re-splitting. Mailgun's token is single-use, so a replay raises 23505, which `persistPost` already swallows as a benign discard. Do not remove it — the Phase 7 Redis token cache is a *complement*, not a replacement (a cache TTL is a finite window; the index never expires)
- **Never store the Mailgun `signature`.** `redactSignature()` strips it before the row is persisted. `posts` is never purged, so a stored signature would make every row a ready-to-replay request, reachable via a leaked service-role key, a DB backup, or the ML export
- **`token` and `timestamp` MUST be retained.** Replay needs all three fields, and the signature can't be recomputed without the key — so those two are inert alone. The token is also what 0004 keys on; strip it and the replay guard silently stops working
- These guards protect the **corpus, not the database** — a replay still costs a `trucks` lookup and a failed insert. Short-circuiting before the DB round trip is Phase 7 work
- Freshness lives in the service, never the validator — validators stay pure (no `new Date()`, no env)
- **Phase 3:** the parser must exclude `parsing_status = 'skipped'` rows when writing `locations`, or stale posts become locations anyway

**Parser**
- All parser functions are pure — no DB calls, no HTTP, no `new Date()`
- Always receive `parsedAt: string` (Stockholm date, "yyyy-MM-dd") as a parameter
- Timezone handling via `date-fns-tz`, always store UTC, display as `Europe/Stockholm`

**Confidence**
- Display threshold: combined >= 0.45
- `confidence = parser_confidence × source_confidence`
- Source confidence: manual = 1.0 · webhook = 0.85 · email = 0.55
- Never show raw confidence to users — always human language

**Override logic**
- Conflict detection is time-window overlap, not same-day
  `existing.starts_at < incoming.ends_at AND existing.ends_at > incoming.starts_at`
- Manual always overrides. Higher source confidence replaces lower. Same confidence → discard incoming.

**Geocoding**
- If geocoding fails → do not insert the location row, set `parsing_status = 'failed'`
- Never update `last_known_latitude` / `last_known_longitude` on a failed geocode

**Posts table**
- Never purge the `posts` table — it is the ML training corpus for the future parser replacement
- Vercel cron cleans `locations` only — this is intentional

---

## UI Rules

- Swedish language throughout all user-facing text
- All `useState` / `useEffect` live in hooks, not components
- Components only describe what to render
- Map markers are HTML elements via MapLibre Marker API — no image files
- Never show confidence below 0.45 — show grey marker instead
- Never fully re-render the map — only update affected markers

---

## Testing

Vitest, split into two **projects** (`vitest.config.ts`, #61) by what a test needs to
run — not by what it tests:
- Unit: everything vitest collects **except** `tests/integration/`. Needs nothing.
  Co-located next to source by convention.
- Integration: `tests/integration/` only. Needs local Supabase. Runs files
  **sequentially** (`poolOptions.forks.singleFork`) because they share one database.

| Script | Runs | Needs Docker |
|---|---|---|
| `npm run test:run` | unit only | no |
| `npm run test:integration` | integration only (fails if it collects zero files) | yes |
| `npm run test:all` | **every project in `RUNS`** of `scripts/test-all.mjs` (today `unit` + `integration`), checked against `vitest list`; takes no arguments | yes |

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

**`test:all` fails if any project collects zero test files** (fixed by #99). Vitest's
empty-match check is per-**run**, not per-project, so `test:all` (`scripts/test-all.mjs`)
runs each project in its own `vitest run` (via `test:run` and `test:integration`),
always runs all of them, and fails if any fails. Before #99 a broken `unit` glob with
one integration test present gave `exit 0`, with 917 tests silently gone.

**Adding a vitest project?** Add it to `RUNS` in `scripts/test-all.mjs`. The gate
cross-checks `vitest list` and **fails** while a project with test files is missing
there. To narrow a run, use vitest directly (`npx vitest run --project <name> <filter>`);
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
  still a doc: when correcting a claim, check every copy, **open issue bodies
  included** (process-log rows 269, 271).

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

**Before adding a row, read the file's own `Columns` and `Cause taxonomy` sections** and
use those exact values — do not invent new ones and do not copy the taxonomy here.
Duplicating it in two files is the same `manual-drift` the log exists to catch.

**A row goes directly after the last row of the `## Log` table, not at the end of the
file.** Detail entries follow the table, so a row appended to the file lands outside
it and renders as plain text (row 272).

Include the `PR #n / IS #n` reference. Those numbers link each row to the diff and the
review discussion. The log is tracked in the repo (since IS #116), and the repo is
**public**, so never paste secrets, keys or real personal data into it.
