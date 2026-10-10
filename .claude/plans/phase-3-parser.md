# Phase 3 — Parser

## Goal
An ingested caption resolves to the truck's live map state: normalized, parsed,
geocoded and override-resolved into a `locations` row with
`trucks.last_known_latitude/longitude` updated — or, for a cancellation, into the
**removal** of the locations it supersedes (#1).

---

## Out of Scope

| Deferred | To | Why |
|---|---|---|
| `GET /api/locations` read route | Phase 4 | Phase 3 only **writes** locations. The read contract belongs with Realtime, which shapes it. |
| Wiring the map to real data (`src/lib/fake-data.ts` stays) | Phase 4 | Pulling it forward drags in the `supabase.ts` client/admin file split, which is a Phase 4 prerequisite in its own right. |
| Backfilling existing `parsing_status = 'pending'` posts | — | **First deploy is Phase 5** — there is no production database, so every such row is local and cleared by `supabase db reset`. Nothing to backfill (#7). Note `scripts/reparse.mjs` **is** built this phase, as a development loop and a `'failed'` recovery path — not as a backfill. |
| Supabase Realtime | Phase 4 | — |
| Vercel cron cleanup of expired locations | Phase 6 | Phase 3 **computes** `expires_at`; nothing deletes on it yet. |
| Manual/dashboard lane (`source = 'manual'`) | Phase 5 | Override logic must still **support** `manual`, but no manual ingestion path exists to produce it. |
| Rate limiting, Mailgun IP allowlist, body-size guard | Phase 7 | — |

**Explicitly IN scope**, despite looking deferrable: the Nominatim **1 req/sec throttle
and identifying User-Agent**. Complying with the usage policy is basic good citizenship
toward a free service, and the User-Agent is required. Per #2 it is *per-instance* and
we do not pretend otherwise — Vercel egresses from a shared IP pool, so there is no
dedicated IP for a global limiter to protect. That is exactly why runtime Nominatim is
never load-bearing here: dictionary hits skip it, and a failure degrades to
`parsing_status = 'failed'` with a recovery path (#7), not to a broken system.

---

## Files

### New — parser (all pure, all co-located `*.test.ts`)

| File | Purpose |
|---|---|
| `src/lib/parser/dictionary.ts` | Gothenburg location dictionary. Each entry: `id`, `match[]` (aliases + common misspellings), `address`, `lat`, `lng`, `source: 'manual' \| 'nominatim'`, `verified`. |
| `src/lib/parser/normalize.ts` | `normalizeCaption()` — strip emoji, hashtags, mentions, collapse whitespace. Step 0. |
| `src/lib/parser/negation.ts` | `detectNegation()` — `inte`, `inställt`, `ej`, `stängt`, … |
| `src/lib/parser/location.ts` | `extractLocation()` — match normalized caption against the dictionary. |
| `src/lib/parser/date.ts` | `extractDate(caption, parsedAt)` — `idag`, `imorgon`, named weekdays → nearest **future** occurrence. |
| `src/lib/parser/time.ts` | `extractTime(caption, date)` — `11-14`, `11.30-13.00`, `lunchtid` → 11:00–14:00. |
| `src/lib/parser/address.ts` | `extractAddressCandidate()` — pulls an address-shaped substring (Swedish street suffixes + optional house number) for the Nominatim fallback. Returns `null` when the caption contains no address, which suppresses the network call entirely. |
| `src/lib/parser/confidence.ts` | `scoreConfidence()` — the documented matrix → `parser_confidence`, minus one notch when the location came from the geocode fallback rather than the dictionary. |
| `src/lib/parser/index.ts` | `parseCaption(caption, parsedAt): ParseResult` — composes the full pure pipeline (normalize → negation → location → address fallback candidate → date → time → confidence). **Pure.** The single seam the future ML parser swaps behind. |

### New — pure, outside the parser

| File | Purpose |
|---|---|
| `src/lib/sources.ts` | `postSourceToLane()` maps the six-value `posts.source` platform (`instagram`/`facebook`/`tiktok` → `webhook`; `email` → `email`; `manual` → `manual`) onto the three-value `locations.source` lane, and `sourceConfidence()` maps that lane to 1.0 / 0.85 / 0.55. Deferred here explicitly by the comment at `ingestion.ts:41-43`. Without it every location insert violates `locations_source_check`. |
| `src/lib/geo.ts` | The Gothenburg bounding box (≈ 11.6–12.2 E, 57.5–57.85 N) and `isInGothenburg(lat, lng)`. **One definition, two consumers** — `geocoding.ts` validates Nominatim responses against it (#3) and the dictionary test asserts every entry falls inside it. Two copies would drift (M6). |

### New — impure layers

| File | Purpose |
|---|---|
| `src/lib/geocoding.ts` | `geocode(address)` — cache lookup, then Nominatim fallback: per-instance 1 req/s throttle, identifying User-Agent, **~3 s timeout**, `countrycodes=se` + Gothenburg `viewbox` + `bounded=1`, and the returned coordinates **re-validated against that box** before acceptance. Returns `null` on failure or out-of-box; a failure is **never** written to `geocoding_cache` (#2, #3). |
| `src/lib/db/geocoding.ts` | `geocoding_cache` read/write, keyed on `address_raw`. |
| `src/lib/db/locations.ts` | `insertLocation()`, `findOverlapping(truck_id, starts_at, effectiveEnd)` — **compares against `expires_at`, not `ends_at`; see H4**, `deleteLocations(ids)` (plural: a negation cancels a whole day). |
| `src/lib/services/locations.ts` | Owns the impure half: geocode → overlap query → override decision → insert → `last_known` update. |
| `supabase/migrations/0005_parsing_status_duplicate.sql` | Extends the `parsing_status` CHECK to include `'duplicate'`. Atomicity is **earned, not assumed** — see H5. |
| `supabase/migrations/0006_locations_overlap_index.sql` | Reshapes `locations_truck_starts` to `(truck_id, starts_at, expires_at)` for H4's query. **Split from 0005 deliberately** — unrelated concerns, and migration 0004 doing two things at once is the direct cause of process-log #5. One migration, one concern, granular rollback. |
| `scripts/seed-dictionary.mjs` | Local-only, one-off. Queries Nominatim (politely throttled, outside the runtime path) and prints `DictionaryEntry` stubs for human review. Sits alongside the existing `scripts/sign-mailgun.mjs`. |
| `scripts/reparse.mjs` | Replays stored posts through `services/locations.ts` — same priority matrix, same dedup, no parallel write path. Selectable by post id / truck / status, with `--dry-run`. Development loop first, `'failed'` recovery second. **`parsedAt` is derived from each post's own `posted_at`, never from `Date.now()`** — see #7. |
| `tests/integration/*.test.ts` | Override matrix, overlap detection, crosspost dedup, geocode failure, `parsing_status` transitions. |

### Modified

| File | Change |
|---|---|
| `src/lib/services/ingestion.ts` | **`persistPost` must return `Post \| null`** (null = discarded on 23505) — it currently returns `void` and swallows the id, so the parse path can neither reference `post_id` nor tell a real insert from a swallowed replay. See the H1 note under Steps. Plus caption+60s crosspost dedup and the call into `services/locations.ts`. |
| `src/lib/db/posts.ts` | `updateParsingStatus()`, `findRecentByTruckAndCaption(truck_id, caption, 60s)` (served by the existing `posts_truck_created` index), and the `isParseable(status)` predicate. |
| `src/lib/db/trucks.ts` | `updateLastKnownPosition(truck_id, lat, lng)`. |
| `src/lib/types.ts` | `ParseResult`, `NewLocation`, `DictionaryEntry`. Types only — `isParseable` is a predicate and lives in `db/posts.ts`. |
| `vitest.config.ts` | Split into two projects: `unit` (`src/**`) and `integration` (`tests/integration/**`). The integration project runs files **sequentially** — vitest parallelises test files by default, and concurrent files mutating the same local database produce order-dependent flakes that read like logic bugs (M5). ⚠ **Corrected in PR #98, see below.** |
| `src/lib/services/ingestion.test.ts` | H1's widening of `persistPost` changes its return type; the existing `describe("persistPost")` block at line 581 asserts against the current shape and must be updated alongside. |
| `package.json` | Add `test:integration`. |
| `.claude/context/project-context.md` | Record Phase 3 decisions. |
| `README.md` | Phase 3 status. |

---

## Steps

Strict order. Parser before persistence throughout, so every impure step has a
tested pure input to build on.

1. **`geo.ts`, `dictionary.ts` + `normalize.ts`** — no dependencies; everything
   downstream matches against the dictionary, and every extractor consumes
   normalized text. `geo.ts` belongs **here, not with geocoding** — the dictionary's
   bounding-box test consumes it at this step, so scheduling it later inverts the
   dependency.
2. **`negation.ts`, `date.ts`, `time.ts`** — mutually independent, pure, can be
   written in any order or in parallel. `time.ts` carries the `end < start` → roll
   `ends_at` +1 day rule from #5.
3. **`location.ts`, then `address.ts`** — `location.ts` needs the dictionary from
   step 1. `address.ts` does **not**: it matches Swedish street suffixes and is
   dictionary-independent. Only the *sequencing* couples them — `address.ts` runs
   solely when `location.ts` misses (#3).
4. **`confidence.ts`** — needs the outputs of steps 2–3 to score against, including
   the dictionary-vs-fallback distinction that drives the #3 penalty.
5. **`parser/index.ts`** — composes 1–4 into `parseCaption()`. Still pure; unit
   tested as one unit so the **step order itself** is under test (negation must
   bail before anything else runs).
6. **`db/geocoding.ts` + `geocoding.ts`** — cache layer first, then the Nominatim
   fallback on top of it, so the cache path is exercised without the network.
   Consumes `geo.ts` from step 1 for response validation.
7. **`db/locations.ts` + `sources.ts`** — insert / overlap-query / delete
   primitives, and the platform→lane→confidence mapping the insert depends on.
8. **`services/locations.ts`** — geocode → overlap → override → insert →
   `last_known`, plus the negation delete path (#1) and the `>=` comparison (#6).
   Needs 5, 6 and 7 to exist.
9. **Widen `persistPost`, then wire into `ingestion.ts`** — crosspost dedup + the
   call into step 8. Last, because there is nothing to wire until 8 exists.
10. **`scripts/reparse.mjs`** — needs step 8 to route through. Available from here
    on as the parser-iteration loop.
11. **Migrations 0005 and 0006**, `vitest.config.ts` split, integration tests, docs.

### ⚠ H1 — `persistPost` must be widened before step 9 can work

`persistPost(post): Promise<void>` (`ingestion.ts:174`) swallows 23505 and discards
the row, while `insertPost` (`db/posts.ts:14`) *does* return the stored `Post`. As
written, step 9 is not implementable and is unsafe:

- **No post id** → cannot set `locations.post_id`, cannot update `parsing_status` to
  `'parsed'` / `'failed'` / `'duplicate'`. Every status transition in the acceptance
  criteria depends on it.
- **No success signal** → a swallowed duplicate is indistinguishable from a real
  insert, so a **replayed Mailgun email inside the 15-minute window would be parsed
  and would write a `locations` row** (with `post_id` null, there being no id).
  Migration 0004 would stop the corpus row but not the map pin.

**Change:** `persistPost` returns `Post | null` — `null` meaning discarded. Step 9
proceeds to parse **only** on a non-null return.

⚠ This also makes a CLAUDE.md line stale: *"a replay still costs a `trucks` lookup and
a failed insert"* frames a replay as otherwise inert. That stays true **only** because
of the null check — worth saying so where the rule is stated, or the next person
removes the check as redundant.

### ⚠ H3 — `parsedAt` derives from `posted_at`, never from `Date.now()`

`parseCaption(caption, parsedAt)` resolves `idag` / `imorgon` / weekday names against
`parsedAt`. Replaying a three-day-old post with today's date makes `"idag"` mean
**today**, minting a fresh pin from a stale caption — the exact stale-pin hazard used
to reject the cron-retry option in #7, which applies just as much to the script.

**Rule:** `parsedAt = format(toZonedTime(post.posted_at, TZ), 'yyyy-MM-dd')`. On the
live path `posted_at` ≈ now, so this is identical there and correct on replay. The
live path must use it too — one derivation, no branch.

### ⚠ H4 — The documented overlap predicate is NULL-blind

`project-context.md:343` specifies overlap as:

```sql
existing.starts_at < incoming.ends_at AND existing.ends_at > incoming.starts_at
```

`ends_at` is **nullable by design** — `0001:68`, and `0002:19` records the reason:
*"the expiry rule explicitly handles 'no ends_at extracted'"*. Under SQL's
three-valued logic every comparison against NULL yields NULL, and `WHERE NULL`
drops the row. So:

- **An existing location with `ends_at = NULL` is never matched as overlapping.** It
  can never be overridden — a 0.55 email pin becomes permanently unreplaceable, even
  by a manual post, and duplicate pins accumulate for the same truck and window.
- **An incoming location with no `ends_at` cannot form the query at all.**

Not an edge case: this is the `location only (no time)` row of the confidence matrix
(`parser_confidence 0.6`) — an ordinary caption like *"Vi står vid Järntorget idag"*.

**Fix — compare against `expires_at`:**

```sql
existing.starts_at < incoming_effective_end AND existing.expires_at > incoming.starts_at
```

`expires_at` is NOT NULL and always computed, and by construction *is* the effective
end: `ends_at` when extracted, the capped `posted_at + 8h` otherwise (#5). It means
exactly "when this location stops being live", which is what overlap is asking.

Index `locations_truck_starts` is `(truck_id, starts_at, ends_at)` — wrong trailing
column for this query. Reshape it in **0006**, its own migration; immaterial at
current volume, but it should not be discovered later.

⚠ This is a defect in `project-context.md`, not only in the plan. Correct the rule at
source, or the next reader reimplements the NULL-blind version.

### ⚠ H5 — Migration 0005's atomicity must be earned

`0001:53-54` declares the CHECK **inline and unnamed**, so Postgres auto-generates
the name. Two things follow:

1. **The constraint name is a guess.** Almost certainly `posts_parsing_status_check`
   — but confirm it against the live database (`\d posts`) before writing the
   migration. This is process-log #5's lesson verbatim: *a confident comment is not
   evidence*.
2. **Extending a CHECK is DROP + ADD.** Written as two statements, psql autocommit
   will leave the constraint dropped if the ADD fails — the same shape as 0004's
   failure. Use the single-statement comma form, or a `DO` block:
   `alter table posts drop constraint <name>, add constraint <name> check (…);`

Verify in both directions before landing, per #5.

**Docs to correct in step 11** — every place the resolved decisions and the review
rounds made stale. *(No count here on purpose: a hand-maintained number beside a
growing table drifted twice — L8, then again in round 3. The table is the count.)*

| Doc | What changes | From |
|---|---|---|
| `project-context.md` — Expiry Logic | "location stored with `is_negation: true`" → negation **deletes**, writes no row | #1 |
| `project-context.md` — Map Behaviour | the client rule "a Realtime INSERT triggers a marker removal" → a DELETE removes the marker | #1 |
| `project-context.md` + `CLAUDE.md` — confidence matrix | scores by *what* was extracted; must also account for *how it was resolved* (dictionary vs geocode fallback) | #3 |
| `project-context.md` — Expiry Logic | "hard cap: never show past midnight" → applies to the `posted_at + 8h` fallback only, relative to `starts_at`'s Stockholm day | #5 |
| `CLAUDE.md` — email lane | "a replay still costs a `trucks` lookup and a failed insert" → true only while the `persistPost` null check exists; say so | H1 |
| `project-context.md` — Deduplication | rule 1 (`instagram_post_id` seen before → discard) is already **structural** — `posts_instagram_post_id_unique` (0001:93) plus `constraintName`. Mark it done so nobody adds a redundant pre-check | L6 |
| `project-context.md` — Override / Priority Logic | the overlap predicate compares `ends_at`, which is nullable — must compare `expires_at` | H4 |

---

## Rationale

**Dictionary carries coordinates; Nominatim is the fallback.**
`extractLocation()` matching the dictionary *is* successful identification — routing
that certainty back through a fallible network service adds a failure mode and buys
nothing, and a geocode failure costs the entire `locations` row. Hand-picked pins are
also more accurate here than an OSM centroid, which can sit 50–150 m off or on a tram
platform; what matters is where trucks actually park. The "authoritative, current
coordinates" argument for a names-only dictionary does not survive the `cache forever`
rule — you freeze the provider's first answer permanently either way, so the real
choice is between coordinates someone reviewed and coordinates nobody ever looked at.

*Scales to a paid provider.* The dictionary is a **matcher**, not a geocoder — no
provider extracts Swedish place mentions from captions, so it survives any swap. The
seam is already `geocode(address) → {lat,lng} | null`; a provider change is one
function body, and fewer calls go through it under this design. Per-request billing
makes dictionary hits free, and premium geocoders commonly restrict long-term storage
of derived coordinates (verify terms at the time) — under this design most coordinates
are our own data, not provider output. The one real weakness, unverified hand-entered
coordinates, is what a paid provider later **fixes**: a reconciliation script
re-geocodes every entry and flags disagreements over ~150 m, using the paid service as
a validation tool rather than a runtime dependency. Hence the `source` / `verified`
provenance fields now — they cost nothing and make that script possible without a
migration.

**`parser/index.ts` orchestrator + `services/locations.ts`.**
The step order is a business rule (negation bails first), so it belongs in the pure,
unit-tested layer rather than in a service. Keeping the impure half in its own service
avoids doubling `ingestion.ts`, which already owns HMAC, freshness and replay
concerns — two unrelated responsibilities in one file.

**Crosspost dedup stores the row as `parsing_status = 'duplicate'`.**
The governing principle: **structural certainty may discard; heuristic judgment must
retain.** `instagram_post_id` equality is exact — the same ID is definitionally the
same post, so the existing unique-index discard is safe. Caption+60s is a *guess* from
a hand-picked window, and a wrong guess that discards the row is silent and
unrecoverable, whereas a wrong guess that keeps it is re-parseable. That distinction
also resolves the apparent inconsistency between the two dedup paths instead of
papering over it.

Note the #53 "never lose incoming data" rule is **not** the deciding argument here —
a crosspost's information is already stored in the first copy, so nothing unique is
lost. Nor is the ML-corpus argument: a byte-identical caption adds no signal, and
duplicate examples overweight themselves in training.

A distinct `'duplicate'` status rather than reusing `'skipped'` because `'skipped'` is
load-bearing for monitoring the 15-minute freshness window — *"are we skipping genuine
truck emails?"* is a question we will want to answer, and crossposts in the same bucket
pollute that count. Splitting later would cost a migration **plus** a backfill that
reverse-engineers intent from `raw_json`; splitting now costs one `ALTER`. Cost
accepted: the locations filter must exclude two statuses, mitigated by a single named
`isParseable(status)` helper rather than inline comparisons scattered across queries.

**Split vitest projects.** The override matrix is five branches of silent
data-correctness logic — a regression wrongly deletes a truck's location and nothing
fails loudly — so it needs real coverage. Splitting keeps `npm run test:run` fast and
green with no Docker running, instead of holding the 88 existing pure tests hostage to
local Supabase being up.

---

## Acceptance Criteria

**Parser (pure)**
- `parseCaption("Idag lunch vid Järntorget 11-14 🌮 #gbg", "2026-08-22")` returns the
  dictionary entry for Järntorget, `starts_at`/`ends_at` as UTC instants
  corresponding to 11:00–14:00 Europe/Stockholm on 2026-08-22, and
  `parser_confidence === 1.0`.
- No parser file imports `supabaseAdmin`, calls `fetch`, or calls `new Date()` —
  verified by test, not by inspection.
- `extractDate()` never returns a date before `parsedAt`. A named weekday matching
  today resolves to today, not +7.
- `lunchtid` → 11:00–14:00 Europe/Stockholm, stored UTC.
- Confidence matrix: all six documented rows covered, **plus** the fallback penalty
  from #3 — the same caption scores lower when the location came from a geocode than
  from a dictionary hit.
- `normalizeCaption()` strips emoji, hashtags, mentions, collapses whitespace.
- Every dictionary entry's `lat`/`lng` falls inside a Gothenburg bounding box —
  catches typos and the lat/lng transposition that lands a pin in the Indian Ocean.
- `extractTime("22-01")` rolls `ends_at` to the next day — window is 3 h, never
  negative (#5).
- `extractAddressCandidate()` returns `null` for a caption with no address, and the
  address substring (not the whole caption) when there is one (#3).

**Geocoding**
- A dictionary hit produces coordinates with **zero** network calls.
- A cache hit produces coordinates with zero network calls.
- `extractAddressCandidate()` returning `null` produces **zero** network calls — a
  caption with no address must never reach Nominatim (#3).
- A cache miss calls Nominatim at most 1 req/sec **per instance**, sends an
  identifying User-Agent, times out at ~3 s, and writes the result to
  `geocoding_cache`.
- A Nominatim result **outside** the Gothenburg bounding box is treated as a miss,
  not accepted (#3).
- A failed or timed-out geocode is **not** written to `geocoding_cache` — the cache
  has no expiry, so a negative entry would be permanent (#2).
- `geocode()` returning `null` → **no** `locations` row, `parsing_status = 'failed'`,
  and `trucks.last_known_*` left untouched (never nulled).

**Locations writes**
- Non-overlapping windows for the same truck coexist (lunch 11–14 + dinner 18–21).
- Overlap uses `existing.starts_at < incoming_effective_end AND existing.expires_at > incoming.starts_at` (H4).
- **A location with `ends_at = NULL` is still found as overlapping and still gets
  overridden** — the named regression test for H4. A manual post must be able to
  replace an email pin that carried no end time.
- All five override-matrix rows verified in `tests/integration/`, including
  `manual` replacing regardless of existing confidence.
- Every NOT NULL column on `locations` is set on insert — `confidence`,
  `parser_confidence`, `source_confidence`, `is_negation`, `expires_at` included.
- `confidence === parser_confidence × source_confidence`.
- `trucks.last_known_latitude/longitude` updated **only** on successful insert.

**Negation (#1, #6)**
- "Inställt idag" **deletes** overlapping locations and writes no `locations` row.
- With no time range, the cancellation window is the **full Stockholm day** of the
  extracted date — every location for that truck that day, not zero.
- A webhook negation cancels a webhook location (`0.85 >= 0.85`). This is the named
  test that stops the `>=` being "fixed" to `>`.
- An email negation does **not** cancel a webhook or manual location.
- A negation with no matching location is a silent no-op, not an error.
- After a cancellation, the active query (`is_negation = false AND expires_at > now()`)
  returns nothing for that truck — verified by **re-query**, not just by the delete
  call, since the whole point of #1 was that refetch and live must agree.

**Expiry (#5)**
- An explicit `ends_at` is **not** capped: "Järntorget 22-01" expires at 01:00.
- The `posted_at + 8h` fallback **is** capped, at midnight of `starts_at`'s Stockholm
  day.
- "imorgon lunch 11-14" expires tomorrow at 14:00 — never before its own `starts_at`.

**Re-parse (#7)**
- `scripts/reparse.mjs` routes through `services/locations.ts`; replaying a post does
  not bypass the priority matrix or dedup.
- Replaying an old post does **not** override a newer location for the same window.
- `--dry-run` writes nothing.

**Source mapping (H2)**
- `postSourceToLane()` maps all six `posts.source` values onto the three
  `locations.source` lanes — `instagram`/`facebook`/`tiktok` → `webhook`. Every
  branch covered; no insert ever violates `locations_source_check`.
- `sourceConfidence()` returns 1.0 / 0.85 / 0.55 for manual / webhook / email, and
  those constants exist in exactly one place. (Today they appear only in
  `fake-data.ts`, which is fixture data, not a source of truth.)

**Replay and status (H1)**
- `persistPost` returns the stored `Post` on insert and `null` on a swallowed 23505.
- A replayed Mailgun email inside the freshness window writes **no** `locations` row —
  asserted directly, since this is the regression the null check exists to prevent.
- `locations.post_id` is set to the originating post on every ingest-path insert.

**Re-parse date (H3)**
- Replaying a post whose caption says `"idag"` produces a location for the post's
  **own** day, not today's.
- `parsedAt` has exactly one derivation, shared by the live path and the script.

**Post status**
- `parsing_status = 'skipped'` rows are **never** turned into locations. This is the
  Phase 3 dependency flagged in three separate docs — it needs an explicit test, not
  a code comment.
- A crosspost within 60 s stores a `posts` row with `parsing_status = 'duplicate'`
  and creates no location.
- Successful parse → `'parsed'`. Geocode failure → `'failed'`.
- `address_raw` holds the text the location was resolved *from* (the matched caption
  substring, or the extracted address candidate); `address_geocoded` holds the
  canonical string — the dictionary entry's `address` on a hit, Nominatim's
  `display_name` on a fallback. Both stay null only when neither is available.

**Gates**

⚠ **The merge gate is `npm run test:all`, not `test:run`** (PR #98). The split made
`test:run` unit-only, and the four-gate list below kept naming it — so after #72 all
four gates could pass without a single integration test executing, a gate drifting in
the direction of easier merges (process-log #174). The four gates are:

```
npx tsc --noEmit      npm run lint      npm run test:all      npm run build
```

`test:run` remains the fast inner loop with Docker down. ⚠ And a green `test:all` is not
proof both projects ran — see the per-run empty-match correction above, and #99.

- `npm run test:run` passes with no Supabase running — **every test that passed
  before this phase still passes**, phrased as a property rather than a pinned count
  (88 at the time of writing; this phase adds many, and a written number would be stale
  on day one — process-log #10).
  Split via `test.projects` — **verified available**: vitest 3.2.7's own types mark
  the old `workspace` field `@deprecated use the 'projects' field in the root config
  instead`.
- `npm run test:integration` passes against local Supabase.
- `npx tsc --noEmit` clean, `npm run lint` clean, **`npm run build` passes** — the
  build is in the loop per process-log #4.
- Migrations 0005 and 0006 each verified in both directions before landing
  (process-log #5). For 0005 specifically: the constraint name **confirmed against
  the live DB** rather than assumed, and the DROP+ADD proven atomic under a failing
  ADD (H5).
- `npm run test:integration` is green on three consecutive runs — integration files
  share one database, so a single pass does not prove sequential execution is
  actually holding (M5).

### ⚠ CORRECTION (PR #98, 2026-09-13) — the mechanism named above does not exist

This plan specified **`fileParallelism: false` on the integration project**, and #61
copied it verbatim. **It cannot be set there.** vitest 3.2.7 types:

```ts
type ProjectConfig = Omit<InlineConfig, NonProjectOptions | "sequencer" | "deps" | "poolOptions"> & {
  poolOptions?: { forks?: Pick<NonNullable<PoolOptions["forks"]>, "singleFork" | "isolate"> }
};
type NonProjectOptions = … | "passWithNoTests" | … | "fileParallelism" | …
```

Both `fileParallelism` and `passWithNoTests` are project-level no-ops. Implemented as
written, **the sequencing silently did not hold** — a two-file probe interleaved
(`b-start a-start a-end b-end`), which is the M5 flake class itself, live from the
moment the config landed. `tsc` does reject the config, so the gate catches it, but only
after the wrong behaviour is already in.

**What actually shipped:**

| Intent | Wrong mechanism | Correct mechanism |
|---|---|---|
| files run one at a time | `fileParallelism: false` on the project | `pool: "forks"` + `poolOptions.forks.singleFork: true` |
| empty match is not an error | `passWithNoTests: true` on the project | `--passWithNoTests` on the `test:integration` script |

`pool` is pinned beside `singleFork` because `singleFork` configures that pool
specifically and would silently stop applying if the default changed.

⚠ **This paragraph originally continued:** *"The flag sits on the script rather than at
the root so it does not also weaken `unit`, where an empty match means a broken glob and
should stay loud."* **That is false, and it was written into a block titled CORRECTION —
the most-trusted place in this document.** Vitest's empty-match check is per-RUN, not
per-project, so the flag's location changes nothing about `unit`. Verified by breaking
the unit `include` with one real integration test present:

```
npx vitest run                     → exit 0, "Test Files  1 passed"
npx vitest run --passWithNoTests   → exit 0, identical
npx vitest run --project unit      → exit 1
```

`test:all` reports success while running **zero unit tests**. The flag is not what
allows it; only running a project alone makes its emptiness visible, because then the
whole run is empty. `--passWithNoTests` has since been removed from `test:all` (it was
unnecessary — a run collecting the unit suite is never empty) and kept on
`test:integration`, where it is genuinely load-bearing.

Tracked as issue #99, which was rewritten rather than amended: it affects **both**
projects, the flag is not the cause, and it cannot be fixed from inside the project it
protects — an assertion in `unit` does not run when `unit` collects nothing. Process-log
#175, #176.

**A third correction, from PR #98 r4.** Vitest's `defaultExclude` does not cover build
output — no `.next`, `out`, `build` or `coverage` — so a `*.test.*` file emitted into one
is collected by the unit project. Verified with a failing `.next/zz/orphan.test.ts`.
Latent, and not a regression against `dev`, but the unit `exclude` now mirrors
`.gitignore`'s generated directories.

**A second correction from the same PR.** The `unit` include was written here as
`src/**/*.test.ts`, which narrows vitest's extension set as a side effect of scoping the
directory — and silently. A failing `src/lib/x.test.tsx` and a failing `src/lib/x.spec.ts`
both reported `917 passed`, exit 0, never collected. Phase 4 and 5 add `.tsx` hook and
component tests, so the first UI test written would have passed by not running. The fix
reuses vitest's own default pattern (`*.{test,spec}.?(c|m)[jt]s?(x)`) with a directory
prefix — **not** a hand-written `{ts,tsx}`, which drops `.spec.*`, `.mts` and `.cts` and
is the same enumerate-and-miss mistake `test-utils/purity.ts` paid for four times.

Process-log #168 and #170. Recorded here rather than only in the log because CLAUDE.md
makes this plan authoritative: a later session reading the uncorrected line would treat
the shipped config as drift and "restore" the interleaving.

---

## Resolved During Planning

### #1 — Negation deletes; it does not write a `locations` row ✅

**Decision.** `detectNegation()` firing means: resolve the cancellation window,
find overlapping locations for that truck, delete each one that passes the override
matrix, and write **no** `locations` row. The post is marked `'parsed'`.

**Why.** The tombstone design in the docs has a correctness bug independent of the
NOT NULL conflict: the active query is `is_negation = false AND expires_at > now()`,
so a tombstone is invisible to it by construction — while the *original* row still
matches. Insert-only cancellation therefore works for clients listening live and
silently fails for anyone who refreshes or reconnects. The original must be deleted
regardless, and once it is, the tombstone's only remaining job (signalling the
client) is already done by the DELETE event. It is redundant, not load-bearing.

Relaxing the NOT NULL instead was rejected: it does not fix the refetch bug, so it
buys a migration *and* the delete *and* two rows, and pushes nullable coordinates
onto every consumer.

**Two rules that ship with it:**

- **Negation goes through the same override/priority matrix.** CLAUDE.md is explicit
  that Mailgun's HMAC does not authenticate content, so a forged email could
  otherwise delete a manually-posted location — a denial-of-service on truck
  visibility via the *lowest*-confidence lane. The matrix means email (0.55) cannot
  cancel manual (1.0). Comparison uses `source_confidence`, so a negation's
  `parser_confidence = 0.0` does not interfere.
- **Cancellation window:** the extracted time range if there is one, otherwise the
  **full Stockholm day** of the extracted date. "Inställt idag" must cancel every
  location for that truck that day, not nothing.

**Consequences.**
- `is_negation` stays in the schema — unused in Phase 3, kept for a possible Phase 5
  manual "closed today" toggle.
- **Phase 4 dependency:** DELETE payloads carry only the primary key under the
  default replica identity. Either the client maps `location_id → truck_id` from
  state it already holds, or `locations` needs `REPLICA IDENTITY FULL`. Joins the
  two Realtime gaps already flagged in the build order.
- **Docs to correct in this phase:** the expiry section's "location stored with
  `is_negation: true`" and the client-side "a Realtime INSERT triggers a marker
  removal" rule are both now wrong.

### #2 — In-process throttle is sufficient; make failure safe instead ✅

**Decision.** Keep the 1 req/s limiter in-process and document it as per-instance.
Pair it with three measures that make a geocode failure genuinely harmless:

1. **~3 s timeout** so a blocked or slow Nominatim cannot hold the lambda open.
2. **Never cache negative results.** `geocoding_cache` has no expiry by design, so
   caching a transient failure would poison that address permanently.
3. **No runtime retry.** The post is already stored; `'failed'` is re-parseable
   later, and retrying in-request multiplies load against an endpoint that may
   already be throttling us.

**Why not a distributed limiter.** Two reasons, and the second is the real one:

- Dictionary-first keeps Nominatim off the hot path — only novel free-text
  addresses reach it. At ~150 posts/day spread over hours, two instances geocoding
  in the same second is a rare coincidence producing a burst of 2, not the
  sustained bulk pattern that gets an IP blocked.
- **Vercel egresses from a shared IP pool.** There is no dedicated IP to protect, so
  a global limiter cannot actually deliver the guarantee it appears to — another
  tenant's traffic can get the shared IP throttled regardless of our behaviour. The
  correct conclusion is not "build a better limiter" but **runtime Nominatim must
  never be load-bearing**, which dictionary-first already ensures.

`@upstash/ratelimit` is already installed and the env vars are declared in
`.env.example`, but `UPSTASH_REDIS_REST_URL` is empty in `.env.local`. Upstash stays
Phase 7 alongside the rate limiting and the email token cache, by which point there
is real volume data instead of a guess.

### #3 — Extract an address candidate; guard the response; penalise the fallback ✅

**Framing.** With the dictionary carrying coordinates, a hit never geocodes — so the
*only* runtime Nominatim call is on a miss. Sending nothing would make runtime
geocoding dead code and leave #2's throttle protecting nothing.

**The failure mode that drives this** is not "Nominatim returns nothing." It is
**Nominatim returning a confidently wrong result** — a wrong pin sends people to the
wrong place and, unlike a missing pin, nothing signals that it is wrong. So the
decision is about precision, not coverage.

**Decision — three parts:**

1. **Extract before querying.** `extractAddressCandidate()` matches Swedish street
   suffixes (`-gatan`, `-vägen`, `-torget`, `-platsen`, `-allén`, `-kajen`,
   `-liden`, `-berget`) with an optional house number. `null` → **no Nominatim call
   at all**. Most captions contain no address, and that is the correct outcome.
2. **Bound the query and re-validate the response.** `countrycodes=se`,
   `viewbox` ≈ 11.6–12.2 E / 57.5–57.85 N, `bounded=1`, `limit=1` — then check the
   returned coordinates against that box before accepting them. `bounded=1` is a
   request parameter, not a guarantee worth trusting blindly. Out of box → miss.
3. **Score the fallback one notch below a dictionary hit** (1.0 → 0.85, 0.85 → 0.7,
   0.6 → 0.45). A hand-reviewed coordinate and a fuzzy geocode are not equally
   trustworthy, and confidence is the mechanism for saying so.

⚠ **Part 3 changes the documented confidence matrix** in both `CLAUDE.md` and
`project-context.md`, which currently score by *what* was extracted and not by *how
it was resolved*. Both need updating in this phase.

Sanity check at the display threshold: an email post (0.55) with a geocoded address
and an explicit time range lands at `0.85 × 0.55 = 0.47`, just above the 0.45 line —
so it renders yellow rather than vanishing. The penalty makes it look less certain
without hiding it, which is the intended behaviour.

**Consequences.** Adds `parser/address.ts` + tests; `geocoding.ts` gains bounding-box
validation; `NOMINATIM_BASE_URL` becomes genuinely load-bearing.

### #4 — Seed ~15–20 spots via a local script, then review ✅

**Decision.** Seed the central squares (Järntorget, Masthuggstorget,
Kungsportsplatsen, Linnéplatsen, Brunnsparken, Gustaf Adolfs torg) plus the
office/campus clusters that actually generate food-truck demand (Lindholmen,
Chalmers Johanneberg, Gårda, Heden, Sahlgrenska, Mölndal). Generate them with
`scripts/seed-dictionary.mjs`, then review by hand.

**Why not broader.** We have **zero real caption data** — Phase 8 is when real trucks
onboard. Beyond the obvious spots, every entry is a guess about where trucks park,
and unverified hand-entered coordinates are the acknowledged weakness of the
dictionary-carries-coordinates design (#5). A 40-entry seed means ~25 coordinates
nobody has checked, carried indefinitely, several for spots no truck will ever use.

**Why not fixture-only.** Phase 3's integration tests would then exercise the
Nominatim fallback almost exclusively and barely touch the dictionary — the phase
would ship with its primary matching mechanism unproven.

**The seeding workflow, and a correction to #5's framing.** Hand-entering coordinates
is not the real cost: a local script queries Nominatim once, offline, politely
throttled, entirely outside the runtime concerns of #2. The `source` provenance field
exists for exactly this — script output is `'nominatim'`, and anything a human
adjusts flips to `'manual'`. That matters because a square's Nominatim centroid is
often *not* where trucks actually park, so the pins that matter get reviewed while
the rest come for free.

**Covering the gap:** #3's fallback pins novel spots, and the bounding-box test in the
acceptance criteria catches gross coordinate errors regardless of provenance.

### #5 — Cap the fallback only; honour an explicit `ends_at` ✅

Two ambiguities surfaced in the documented three-line rule.

**(a) Midnight of which day — settled, not optional.** The cap is relative to
**`starts_at`'s** Stockholm day, never `posted_at`'s. Read the other way, a caption
posted today saying "imorgon lunch 11-14" produces a location that expires *tonight,
before its own `starts_at`* — never visible for a single second. This applies
regardless of (b).

DST is safe: Sweden transitions at 03:00 local, so midnight is never doubled or
missing. `fromZonedTime(\`${date}T23:59:59\`, TZ)` is correct year-round.

**(b) The cap does not override an explicit `ends_at`.**

```
ends_at extracted → expires_at = ends_at                     (uncapped)
                    if end < start → ends_at rolls +1 day
no ends_at        → expires_at = min(posted_at + 8h,
                                     midnight of starts_at's SE day)
```

**Why.** The cap exists to stop the `posted_at + 8h` *fallback* producing absurd
expiries — a 20:00 post would otherwise linger until 04:00 with no evidence the truck
is there. That is a guess, and guesses need guards. An extracted `ends_at` is not a
guess; it is the truck stating when they close. "Vi står vid Järntorget 22-01" is an
ordinary late-night pattern here, and truncating it at 23:59 discards genuine data to
satisfy a guard — the same shape as process-log #7.

This is the phase's recurring principle: **guards constrain what the system infers,
never what it was told.** Same reasoning as #1 (negations go through the priority
matrix rather than being trusted blindly) and #3 (fuzzy geocodes are penalised, not
discarded).

**Bundled parser rule:** `extractTime` must detect `end < start` and roll `ends_at`
to the next day, or "22-01" yields a negative-length window.

**Residual risk, accepted:** a mis-parsed "öppet till 03" keeps a pin up overnight.
Bounded by the confidence score and the Phase 6 cron sweep.

#### ⚠ CORRECTION (PR #107, 2026-09-20) — the fallback's BASE is `starts_at`, not `posted_at`

**Settled with the user, 2026-09-20. The rule above is superseded in one term:**

```
no ends_at → expires_at = min(starts_at + 8h, midnight of starts_at's SE day)
                               ^^^^^^^^^
```

**Part (a) fixed the cap and left its own argument unapplied to the neighbouring
term.** (a) reasons that the cap must key on `starts_at`'s Stockholm day *"or an
'imorgon' location expires before its own `starts_at`"* — never visible for a single
second. True, and incomplete: `min` has two terms, and only one of them was corrected.

Take **"Vi står vid Järntorget imorgon"** — a place, a future day, no time. Ordinary,
and it scores 0.6 on the dictionary/none row of the matrix:

```
posted_at + 8h  = tonight 19:00      ← the SMALLER term, so the cap never applies
starts_at + 8h  = tomorrow 08:00
cap             = tomorrow 23:59
```

`min` picks tonight. The row expires roughly five hours **before** its own
`starts_at` of tomorrow 00:00 — the exact defect (a) exists to prevent, reached
through the term (a) did not touch. Capping harder cannot fix it; the base is what is
wrong.

**Why this is not a behaviour change anywhere the original rule was right.** For a
same-day caption `starts_at` IS `posted_at` — `services/locations.ts` assigns it
literally — so the two readings are the same arithmetic on the same instant. That
covers every caption the original wording had in mind, which is why the defect
survived review: the rule is correct wherever it was tested.

**Why `starts_at` is also the better statement of the intent.** The 8 h fallback is a
guess at *how long the truck is there*, and a truck is there from when it says it will
be, not from when it typed the message. `posted_at` was standing in for `starts_at`
in the common case where they coincide.

**Implemented in `computeExpiresAt` (`src/lib/services/locations.ts`) with a named
test**, plus a property test asserting `expires_at > starts_at` across five shapes —
the form that catches a future change to *either* term rather than to the one that
prompted this. Process-log #229.

⚠ **`project-context.md`'s Expiry Logic repeats the `posted_at + 8h` phrasing and is
now wrong too.** Added to #73's correction table; recorded on that issue.

**The generalisable lesson, which is this phase's most expensive one restated:** the
defect is the SET, never the mechanism. (a) is a correct fix to one member of a
two-member set, written up as though it closed the class. `incomplete-guard` is the
phase's largest cause at 26 of 72 findings and almost never means "no guard existed".

### #6 — Negations compare with `>=`; locations keep `>` ✅

**The bug in "just use the matrix."** The rule is
`new.source_confidence > existing.source_confidence → replace, else discard`. Applied
to a negation: a truck posts its location via Make.com (webhook, 0.85), then cancels
via Make.com — `0.85 > 0.85` is false, so the cancellation is **discarded**. A truck
cannot retract a post through the lane it posted from, and it fails silently. That is
the most common cancellation path, not an edge case.

**Why the strict comparison does not apply.** `>` exists to stop *competing location
claims* flip-flopping — two webhooks disagreeing about position, keep the first. A
cancellation is not a competing claim; it is the same source retracting its own
earlier statement. Arbitration rules for claims should not govern retractions, or the
system can accept a statement it will never allow you to take back.

**Decision:**

```
location:  new.source_confidence >  existing.source_confidence → replace
negation:  new.source_confidence >= existing.source_confidence → cancel
```

The #1 security property survives: email (0.55) still cannot cancel webhook (0.85) or
manual (1.0); manual still cancels anything.

**Residual, accepted:** a forged email (0.55) can cancel a genuine *email-sourced*
location. Identical in kind to the forged-creation exposure that already exists,
already bounded by the replay index and the 15-minute window, and closed properly by
Phase 7's Mailgun IP allowlist.

⚠ **The asymmetry must carry an explicit comment in the code and a named test.** It
reads like a typo, and someone will "fix" it — process-log #7 in miniature.

### #7 — No backfill; add a re-parse script ✅

**Backfill: confirmed out, for a stronger reason than "dev-only rows."** The **first
deploy is Phase 5** — there is no production database. Every
`parsing_status = 'pending'` row in existence lives in the local Supabase, and
applying migration 0005 in dev normally means a `supabase db reset`, which clears
them outright. There is nothing to backfill and never will be.

**What that was hiding.** #2's safety argument — *"the post is already stored;
`'failed'` is re-parseable later"* — assumes a re-parse path. Nothing in the plan
created one. So: Nominatim has a bad five minutes, three trucks post, geocoding
returns nothing, three `'failed'` rows, three trucks with no pin, and no mechanism to
recover them. Preservation without a replay path is data loss with better branding.

**Decision.** Add `scripts/reparse.mjs`, selectable by post id, truck or status
filter, with `--dry-run`. It routes through the **same** `services/locations.ts` path
so the priority matrix and dedup apply identically — no parallel write path.

**Why in this phase rather than later.** It is a *development* tool first: while
iterating on the Swedish parser you will constantly want to replay it across the
stored corpus and diff the results. That is the fastest feedback loop available in
Phase 3, and it is the same mechanism that eventually makes the corpus useful for the
ML replacement. Closing #2's gap is a bonus, not the main reason.

**Needs a test:** replaying an old post must not override a newer location. The
priority matrix already covers this, but it must be asserted rather than assumed.

⚠ **Correction from review (H3).** This decision rejected the cron-retry option partly
because automatic replay "risks resurrecting stale pins" — and then failed to notice
that the script shares that hazard exactly. `parseCaption` resolves `"idag"` against
`parsedAt`, so replaying a three-day-old post with today's date mints a fresh pin from
a stale caption. **`parsedAt` must derive from the post's own `posted_at`**, in
Stockholm, on both the live path and the replay path. With that, the objection to
cron-retry narrows to timing rather than correctness — the decision stands, but for a
smaller reason than originally stated.

**Rejected — automatic retry in the Phase 6 cron:** leaves the gap open through
Phases 4 and 5, and automatic replay risks resurrecting stale pins (a post from three
days ago must not create a location today), which needs a freshness guard of its own
to solve a problem a script solves now.

### #8 — `ParseResult` stays SINGULAR in Phase 3; multi-claim captions are Phase 8 ✅

*Resolved 2026-09-13, after #67 shipped. Not a planning decision — it arose from four
review-found defects that turned out to share one cause.*

**The problem.** `parseCaption` asks each extractor one question about the whole caption,
then pairs the answers. When a caption carries more than one claim, the pairing is a
triple no clause states — and it scores at the maximum, because every part was extracted
successfully:

```
parseCaption("Heden 11-14, imorgon Lindholmen 17-20", "2026-08-22")
  → place Heden (clause 1), date tomorrow (clause 2), time 11-14 (clause 1), 1.0
```

Filed as #94, with #80 (a negation scoped to one clause cancelling another's day) and
#96 (an excluded weekday becoming the pin's date) as the same shape.

**The ladder considered:**

| Tier | Approach | Cost |
|---|---|---|
| 1 | Detect that fields came from distant spans and lower the confidence | cheap; partial |
| 2 | Segment into clauses, extract a triple per clause, keep the first usable one | needs a Swedish clause-boundary rule |
| 3 | Emit N locations per caption | `ParseResult` goes plural → #68, #69, the override matrix and dedup all change |

**Decision: Tier 1 in Phase 3. Tiers 2 and 3 are deferred to Phase 8.**
**`ParseResult` stays singular for the rest of this phase.**

**Why.** Tier 2 means inventing a clause-boundary rule for Swedish with **zero real
caption data** — the same bet this phase has declined four times (#4's dictionary size,
`address.ts`'s suffix list, `negation.ts`'s vocabulary, #85's number words). Every one of
those refusals has held; `address.ts` records that each round which ADDED a condition was
refuted one round later, and each that REMOVED a form was not. Segmentation is an added
condition, calibrated against nothing.

Tier 3 is correct and is the largest possible change to land late in a phase: it rewrites
the contract #68 and #69 are about to be built on.

**The consequence that matters, and the reason this is recorded rather than left
implicit:** #68 consumes `ParseResult` and is **not** listed as blocked by #94, but it
would have been rewritten if #94 later went plural. This decision is what unblocks #68 to
be written against a singular contract. If Phase 8 goes Tier 3, that rewrite is expected
and scheduled, not a surprise.

**Honest limit on Tier 1.** Lowering a bad pin from 1.0 to ~0.6 puts email
(× 0.55 = 0.33) below the 0.45 display threshold, but webhook (0.51) and manual (0.6)
still render. It reduces harm in one lane of three. It is mitigation, not a fix, and
saying otherwise would be the kind of over-claim this phase has logged six times.

**Not covered by this decision, because it needs no segmentation:**
- **#96** — an exclusion marker before a weekday (`ej`/`utom`/`förutom söndag`) is a
  lookbehind in `date.ts`, mirroring the `NOT_BACKWARD` already there. Independent, and
  proceeding now.
- **#90 and #80** — both need extractors to report WHERE they matched, not just what.
  Today none does: `detectNegation` returns a boolean, `extractDate` a string,
  `extractTime` instants, `extractLocation` the matched substring without its index.
  #90 is fully solved by spans alone — drop the house number only when `extractTime`'s
  span actually covers those characters — with no linguistic guesswork, which makes it
  the cheapest of the four. Doing #90 and #80 together as one change to the return
  shapes is the recommendation; Tier 1 then falls out of the same spans.

### #9 — `extractDate` and `ParseResult.date` stay `string`; "no usable date" is Phase 8 ✅

*Resolved 2026-09-14, before #68 is written. The question is what the parser returns when
there is no day the caption is about — asked twice, by #95 and #102, and it determines a
field #68 consumes.*

**The two askers are not the same question, and they do not get the same answer.**

| | Cause | Answer |
|---|---|---|
| #95 | `parsedAt` itself is unusable — a caller passed garbage | validate at the derivation point |
| #102 | `parsedAt` is fine; the caption **excludes** it | deferred to Phase 8 |

**#95 — validate where it is derived. No parser change.**
`extractDate` returns `parsedAt` untouched on every non-match path, so
`parseCaption("Järntorget 11-14", "not-a-date")` yields a placed, scored result carrying
`"not-a-date"` toward `locations.starts_at`, which is NOT NULL. But a malformed
`parsedAt` is a **violated input contract**, not a caption the parser failed to read —
`date.ts` already says so in the guard that handles it: *"this is a guard against a
throw, not a validation layer — `parsedAt` is validated where it is derived."*

So #68 and #71 validate before calling, and this costs no new machinery: **#68 already
implements "write no location row, set `parsing_status`, leave `trucks.last_known_*`
untouched" three times over** — geocode returning null, a `skipped` post, and #69's
negation path. A bad `parsedAt` becomes a fourth caller of an exit that has to exist
anyway.

**#102 — moved to Phase 8, with #94's reshape.**
This one genuinely needs the parser to express something it currently cannot: *"the
caption named a day and then ruled it out, and there is no other."* No existing field
carries it — `place` is known so it cannot be nulled, and `parserConfidence = 0` does not
prevent an insert, only a display.

Two reasons to defer rather than widen now:

- **Phase 8 is already reshaping `ParseResult` if #94 goes Tier 2 or 3** (decision #8).
  Adding a "no usable date" state during a reshape that is happening anyway costs
  approximately nothing; adding it today costs a branch in #68 with no live producer.
- **#102 part 2 — the exclusion chain crossing a clause boundary — is segmentation**,
  which decision #8 already placed in Phase 8. Splitting one issue across two phases to
  save one branch is worse than moving both.

**So: `extractDate: string` and `ParseResult.date: string` are unchanged for the rest of
Phase 3, and #68 may be written against them.**

**⚠ The requirement this places on #68, which is the whole point of deciding now.** Its
"produce no location" path must be **one named exit**, not three inline early-returns. It
has three callers on day one and will gain #95's and later #102's. If it is inlined,
#102 lands as a rewrite; if it is named, #102 lands as one more caller.

**What would falsify this.** If real captions in Phase 8 show "excludes the posting day"
is common enough to need fixing before `ParseResult` is reshaped, the cost is one branch
in #68 plus its tests — bounded, and far smaller than the plural-`ParseResult` rewrite
decision #8 avoided. That asymmetry is why deferring is safe here and was not safe there.

**Not covered, and deliberately still open:** the span cluster (#90, #80, #94 Tier 1,
#101). Every one of those changes a VALUE that `parseCaption` returns — a candidate
string, a date, a confidence — and none changes `ParseResult`'s shape, so none blocks
#68. They are one piece of work (no extractor currently reports a position) and can be
consolidated whenever #90 is picked up.

---

## Open Decisions

*None outstanding — seven resolved during planning, #8 and #9 resolved mid-phase.*
