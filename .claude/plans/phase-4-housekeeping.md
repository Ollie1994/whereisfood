# Phase 4 — Housekeeping

**Planned:** 2026-10-11 · **Reviewed:** 2026-10-11 (versions re-checked for stability; see
decision #3) · **Status:** done (end-of-phase check 2026-10-12, #144, PR #145)
**Source:** `.claude/transition.md` (the decision to drop the ingestion lanes and the
parser) plus the planning conversation of 2026-10-10/11. Where this plan and
`project-context.md` disagree, **this plan wins**: the context described the old
design until step 10 rewrote it (#127, PR #140).

**Purpose of the phase:** clean the slate. Phase 5 starts building the new design
from a repo, a doc set and an issue tracker that contain nothing from the old one.
**No new features and no new schema in this phase.**

---

## Goal

The repo, the docs and the GitHub tracker contain only what the new admin-populated
design uses: no lane, parser or geocoding code; production dependencies free of known
advisories on settled versions; and the fake-data map still working with all gates
green.

---

## Prerequisites

- **Node `^20.19.0 || >=22.12.0`**, the floor `vite` (7 and 8 alike) and `rolldown`
  declare, which is above Next 16's `>=20.9`. Node 22.14 meets it. Older 20.x/22.x
  Node passes Next's check but fails under vitest (added in PR #137 review).
- **npm ≥ 11 locally** (`npm i -g npm@11`). Node 22.14 bundles npm **10.9.2**, which
  **crashes** resolving vitest 4.1.11's optional peer dependencies (`Cannot read
  properties of null (reading 'edgesOut')` in `#loadPeerSet`), reproduced twice on a
  clean install. npm 11 resolves the same set cleanly. The lockfile stays
  `lockfileVersion: 3`. The crash happened while *building* a dependency tree; an
  install from an existing lockfile (`npm ci`, which Vercel uses) should not hit it,
  but that's **unverified**. Check it at the first preview deploy (Phase 6).
- Docker running (local Supabase) for `npm run test:all`, as today.

---

## Out of Scope

| Item | Where it goes |
|---|---|
| New schema, squashed migration, `seed.sql` rewrite, `updated_at` trigger, exclusion constraint | Phase 5 (schema reset) |
| Rewriting `src/lib/db/locations.ts` and `tests/integration/*` | Phase 5. They still match the current schema, so they stay until it is replaced. |
| `/api/live`, `useLocations`, polling, client timer | Phase 6 (live read path) |
| `TruckPopup` freshness text, removing confidence colours from the UI | Phase 6. The fake-data map keeps working as it is. |
| Admin login, `proxy.ts` auth checks, location entry, checklist | Phase 7 (admin) |
| Hosted Supabase project and the first preview deploy | Phase 6 (live read path) |
| R2 tiles, production deploy, Supabase/Vercel Pro | Phase 8 (launch) |
| The 4 product decisions open in `transition.md` §12 (retention, checklist look-back, default times, app name) | Phases 7–8 |
| Changing the basemap's look, fonts or sprites beyond what the `@protomaps/basemaps` migration requires | not planned |

---

## Files

### Delete
| File(s) | Why |
|---|---|
| `src/app/api/email/route.ts`, `src/app/api/ingest/route.ts` | ingestion lanes |
| `src/lib/parser/*` (all modules + tests, incl. `purity.test.ts`) **except `dictionary.ts`**, which moves | parser |
| `src/lib/services/ingestion.ts` (+ test) | ingestion lanes |
| `src/lib/services/locations.ts` (+ test) | lane override/negation logic; Phase 7 writes a small new one |
| `src/lib/validators/email.ts`, `src/lib/validators/ingest.ts` (+ tests) | ingestion lanes |
| `src/lib/geocoding.ts` (+ test), `src/lib/db/geocoding.ts` | Nominatim geocoding |
| `src/lib/db/posts.ts` | `posts` table access |
| `src/lib/sources.ts` (+ test) | platform → lane → confidence mapping |
| `src/lib/test-utils/purity.ts` (+ test) | purity guard existed for the parser |
| `scripts/sign-mailgun.mjs` | Mailgun test helper |
| `vercel.json` | the 30-min cron that never could have deployed on Hobby |

### Create
| File | Content |
|---|---|
| `src/lib/spots.ts` | The `dictionary.ts` data as a plain constant of known Gothenburg places with coordinates (`SPOTS`) and its `Spot` type. Parser-only fields (aliases, match keys) removed. |
| — | (#99 needs no new file: the guard is a `package.json` script change, see Modify) |
| `.claude/plans/phase-4-housekeeping.md` | this plan |

### Modify
| File | Change |
|---|---|
| `src/lib/types.ts` | Remove `Post`, `NewPost`, `IngestPayload`, `EmailPayload`, `IngestResult`, `DictionaryEntry`, `LocationMatch`, `ResolvedPlace`, `ParseResult` and the `@/lib/parser/time` import. Keep `Truck`, `Location`, `NewLocation`, `MarkerColor`, `MarkerState` (the fake-data map and the unchanged schema still use them). |
| `src/lib/types.test.ts`, `src/lib/geo.test.ts` | Drop the purity-guard assertions (the guard is deleted); keep the behavioural tests. `types.test.ts` is mostly purity checks (13 references in 105 lines): **delete the file** if nothing behavioural remains. |
| `src/proxy.ts` | Remove `/api/ingest` and `/api/email` from `matcher`; update its comment, which promises lane checks. The stub stays a stub (auth is Phase 7). |
| `src/lib/geo.ts`, `src/lib/db/trucks.ts`, `src/lib/fake-data.ts`, `src/lib/types.ts` (comments) | **Comment clean-up only:** comments that describe the parser, geocoding or ingestion as current are reworded or removed. No behaviour change. |
| `.env.example` | Remove `MAKE_WEBHOOK_SECRET`, `MAILGUN_WEBHOOK_SIGNING_KEY`, `NOMINATIM_BASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. |
| `scripts/seed-dictionary.mjs` | Kept (decision #6). Point its comments and output at `src/lib/spots.ts` and the new shape. |
| `package.json`, `package-lock.json` | Dependency changes (decision #3). **#99:** `test:all` becomes `node scripts/test-all.mjs` (each project in its own run; see step 3), and `test:integration` drops `--passWithNoTests`. |
| `vitest.config.ts` | vitest 4 migration (`poolOptions`/`projects` per the official guide). |
| `src/hooks/useMapLibre.tsx` | MapLibre v6 imports + worker setup; `@protomaps/basemaps` instead of `protomaps-themes-base`. |
| `CLAUDE.md` | Remove rules for removed features; add the new rules (`transition.md` §14); point at the Phase 5 plan once it exists, this plan until then. **Testing section:** already updated by PR #130 (#99). Re-check it against the final versions. |
| `.claude/context/project-context.md` | Full rewrite (decision #8). |
| `README.md` | Public description of the new product and stack. **Fix a false claim:** it says `public/gothenburg.pmtiles` "is committed for dev", but the file is gitignored and untracked, so a fresh clone has no map. Document how to get it: cut a Gothenburg extract with `pmtiles extract` from a Protomaps daily build (corrected in PR #138; see Open Decisions). |
| `.claude/plans/phase-3-parser.md` | One-line "superseded" header pointing at the archive and `transition.md`. |
| `.claude/transition.md` | Header: "absorbed into project-context.md (Phase 4)"; phases renumbered (§13); archive note corrected (decision #2). |
| `.claude/process-log.md` | Phase 3 retrospective; row 258 marked resolved. *Added by #142 (PR #143):* the counting commands moved to `scripts/process-log.sh`. |
| `scripts/process-log.sh` *(created, #142 / PR #143; `add` and the values block, #155 / PR #157)* | `add`, `tally` and `check` for the process log, reading every value from the log's values block; `add` is how `CLAUDE.md` says to write a row, and `check` follows a hand correction (decision #15). |
| `scripts/claims.sh` *(created after the phase closed, #149 / PR #153)* | Lists added lines with universal or verification words; the claims step of `CLAUDE.md`'s "Review rounds" runs it before every review round. |
| `.claude/process-log.md`, `CLAUDE.md` *(after the phase closed, #152 / PR #156)* | Detail entries removed and kept on the `archive/process-log-details` tag; decisions recorded only in plans; CI/CD and code-comments rules copied into `CLAUDE.md` (decision #14). |
| `.gitattributes` *(created, #142 / PR #143)* | `*.sh text eol=lf`, so the script keeps LF endings in a Windows checkout. |
| `.claude/commands/create-issues.md` *(#142 / PR #143)* | A "Failure modes" field for guard-adding issues, and its Step 5 check. |

### Untouched (deliberately) until Phase 5
`src/lib/db/locations.ts`, `tests/integration/*`, `src/lib/database.types.ts`,
`supabase/migrations/*`, `supabase/seed.sql`. They describe the **current schema**
(which still has `posts` and `geocoding_cache`), so they legitimately keep the old
words until Phase 5 replaces schema, types, primitives and tests together.

Also untouched: `src/lib/supabase.ts`, `src/components/Map/*`, `src/app/map/page.tsx`.
*Except comments (PR #140, #127):* `supabase.ts`, `TruckPopup.tsx`, `useMapLibre.tsx` and
`vitest.config.ts` had stale comments rewritten (rows 288, 292); no behaviour changed.

### Kept on purpose with no callers after the teardown
A clean slate shouldn't keep dead code by accident. Checked 2026-10-11: these four lose
every caller once the lanes go, and are **kept deliberately** because a named later
phase uses them:

| Module | Used again in | Why keep instead of deleting and re-adding |
|---|---|---|
| `src/lib/http/handler.ts` (`withErrorHandling`) | Phase 6 (`/api/live`), Phase 7 (admin routes) | `CLAUDE.md` requires every route to use it; settled. (It had **no test** until #121 added `handler.test.ts`; process-log row 274.) |
| `src/lib/geo.ts` (Gothenburg bounding box) | Phase 7 (validate map taps and GPS) | Named in `transition.md` §11 as kept. |
| `src/lib/validators/uuid.ts` | Phase 7 (truck id on admin writes) | Small, no reason to rewrite it. (Tested only through the deleted lane validators until #121 added `uuid.test.ts`; row 274.) |
| `src/lib/db/trucks.ts` | Phase 5 (rewritten with the schema) | Matches the current schema, like `db/locations.ts`. |

---

## Steps

Strict order. Each numbered step is one PR unless marked otherwise.

1. **Archive (no PR).** Tag and branch `archive/parser-lanes` at the current `dev`
   head (after PR #117), push both. Must happen before anything is deleted.
2. **GitHub tracker (no PR).** Create milestone `phase-4` and label `phase-4`. Close
   the 22 open issues listed in `transition.md` §13 (all 23 open issues except #99),
   each with a one-line comment linking the archive and `transition.md`. Move #99 to
   `phase-4`. Close milestone `phase-3`. Comment texts shown to the owner before
   posting.
3. **#99: run each test project separately.** `test:all` becomes
   `node scripts/test-all.mjs`, which:
   - runs each project in its own `vitest run` through `test:run` and `test:integration`;
   - always runs both, and fails if either fails;
   - fails unless `RUNS` names exactly the projects the resolved config declares,
     read through vitest's Node API (since #125): a declared project missing from
     `RUNS` fails, even one that collects no files, and so does a `RUNS` entry the
     config doesn't declare. (Until #125 this used `vitest list`, which saw only
     projects that had files.)
   - refuses extra arguments.

   `test:integration` drops `--passWithNoTests`. `--project` already works on vitest
   3.2.7, so this lands **before** the teardown and guards it. Verified by breaking each
   project's `include` once (gate fails), then restoring (gate passes).

   *Changed during PR #130's two `/code-review` rounds (process-log rows 268–269):* the
   one-line `&&` form hid integration results whenever unit failed, and named projects
   with nothing checking the list. **Don't revert to the one-liner.**
4. **Teardown A: lanes, parser, geocoding.** Delete the files above, create
   `src/lib/spots.ts`, trim `types.ts`, drop the purity assertions (or delete
   `types.test.ts`), update `seed-dictionary.mjs`, clean the stale comments in the
   kept files listed under Modify. Gates green; both test projects still report a
   non-zero count (guarded by step 3), and the unit count drops by the deleted tests.
5. **Teardown B: config.** `vercel.json`, `.env.example`, `proxy.ts` matcher and
   comment, `scripts/sign-mailgun.mjs`, remove `@upstash/ratelimit` and
   `@upstash/redis`.
6. **Upgrade Next.** `next` and `eslint-config-next` 16.2.6 → **16.3.8** (exact pin).
   Gates green, `/map` renders, `npm audit --omit=dev` shows no `next` advisory.
   *Added in PR #135:* `next.config.ts` sets `agentRules: false` (decision #12).
7. **Upgrade MapLibre + basemap.** `maplibre-gl` 5.24 → **6.11.2** (exact pin),
   `protomaps-themes-base` → **`@protomaps/basemaps` 5.7.2**, `pmtiles` → **4.5.0**,
   following the official v5→v6 migration guide and the basemaps CHANGELOG. Confirm
   the CSS import (`maplibre-gl/dist/maplibre-gl.css`, still exported via `./dist/*`)
   and `pmtiles`' `addProtocol` registration work on v6. Set up the v6 worker (open
   decision #1), switch map labels to **`"sv"`**, and check the tile file matches the
   new style (open decision #2). `/map` renders with Swedish labels, markers and popups
   in the browser.
   *Done in PR #136:* worker setup is decision #13; the tile file is compatible.
8. **Upgrade vitest.** vitest 3.2.7 → **4.1.11**, migrate `vitest.config.ts` per the
   official v4 guide. Re-run step 3's check (break each project's `include` once) to
   confirm the #99 guard still works on v4.
   *Done in PR for #125:* `singleFork` → per-project `fileParallelism: false` (keeps
   per-file isolation; the guide's `maxWorkers: 1, isolate: false` mapping would turn
   it off). The sequencing probe ran on v4 with a negative control. The #99 guard
   still fails on each broken `include`, and #99's deferred gap is closed: `test:all`
   now checks `RUNS` against the projects the resolved config declares (vitest Node
   API), so an empty undeclared project fails too.
9. **Transitive clean-up.** `npm audit fix` (non-breaking only). The expected end
   state is **0 production advisories** and exactly one known dev-only chain (see
   decision #3); anything else gets a reason in the PR.
   *Done in PR for #125:* exactly that end state. npm 11.21's install-scripts warning
   was verified on a clean `npm ci`: warn-only, the script still runs.
10. **Docs.** `CLAUDE.md`, `project-context.md` rewrite, `README.md` (incl. the npm ≥ 11 prerequisite), the
    `phase-3-parser.md` header, `transition.md` header + renumbering + archive note.
11. **Phase 3 retrospective (no PR needed beyond the log).** Count Phase 3 rows by
    `Caught by` and `Cause`, act on the two biggest, mark row 258 resolved.
    *Done in PR #141 (#128); its two actions and a log value check were applied in
    PR #143 (#142): the fix-sweep rule in `CLAUDE.md`, the Failure-modes field in
    `/create-issues`, and `scripts/process-log.sh`.*

**Any time, by the owner:** rotate or delete any Mailgun, Make.com and Upstash keys
and accounts, and clean `.env.local`.

---

## Rationale

### #1 — Housekeeping only, then build from Phase 5
The owner wants a clean slate. Mixing deletion with new schema work makes every PR
harder to review: a diff that both deletes 10,000 lines and adds a migration hides
the migration. Deletion-only PRs are easy to verify (nothing new, gates green, map
works).

### #2 — Archive at the current `dev` head, not `11f081a`
`transition.md` said `11f081a`. Since then PR #117 tracked `.claude/` and `CLAUDE.md`.
Archiving after #117 captures the code **and** the plans/log that explain it in one
snapshot. Branch **and** tag, because a branch can be deleted by a clean-up and a tag
rarely is.

### #3 — Dependency changes, and why each one (researched 2026-10-11)
`npm audit` on `dev`: **19 vulnerabilities (4 critical, 12 high, 2 moderate, 1 low).**

**Version policy: settled releases, not the newest.** Each target is a patch release
on a line that has had time to settle, not a fresh `.0`. Release dates checked on npm
2026-10-11:

| Package | Now | Target | Released | Why this version | Breaking? |
|---|---|---|---|---|---|
| `next` + `eslint-config-next` | 16.2.6 | **16.3.8** (exact pin) | 2026-09-30, 8th patch of 16.3 | **Security.** 16.2.6 is affected by two critical RCEs (Image Optimization with AVIF, GHSA-2xp9-vwfh-vxw4; Windows-hosted servers, GHSA-p293-qw3h-jr36), a critical RCE in `next/og` (GHSA-vcvr-r3jv-pc5j) and a **proxy bypass** (GHSA-6gpp-xcg3-4w24), plus several high/medium. npm's advisory DB marks `next` vulnerable **up to 16.3.7**, so 16.3.8 fixes all of them. **Not 16.4.0:** released 2026-10-06, 5 days old, no patch yet, and nothing in it is needed (ISR was dropped). | Minor within 16.x; the gates and a browser check are the real test. Node 22.14 meets `>=20.9`; React 19.2 meets the peer range. |
| `maplibre-gl` | 5.24.0 | **6.11.2** (exact pin; MapLibre's maintainers advise against auto-updating) | 2026-09-24, 3rd patch of 6.11; v6 line since 2026-07-22 | Critical XSS sanitizer bypass in `DOM.sanitize()` (GHSA-jrc7-96c5-q579), affected `<=6.4.0`, **no 5.x fix**. Our exposure is low (popups render through React, not `setHTML`), but 5.x gets no more fixes and Phases 6–7 build on the map hook. **Not 6.13.0:** 5 days old. | **Yes:** ESM-only (our default `import maplibregl` must become a named/namespace import), a worker URL setup for bundlers, WebGL2 required, some API removals. |
| `protomaps-themes-base` | 4.5.0 | **`@protomaps/basemaps` 5.7.2** | 2026-03-10; v5 line since 2025-02 | **Deprecated** on npm: "migrated to @protomaps/basemaps with a new major version". No peer dependencies; ships ESM and CJS. | Yes, new major; follow its CHANGELOG. |
| `pmtiles` | 4.4.1 | **4.5.0** | 2026-08-10 | Same major; the version the target set was resolved and audited with. No peer dependency on MapLibre. | No (minor). `addProtocol` on v6 verified in step 7. |
| `vitest` | 3.2.7 | **4.1.11** | 2026-08-18, 11th patch of 4.1; maintained `V4` dist-tag | Critical prototype-pollution → RCE gadgets in `tinypool` (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr) and a moderate path traversal in `@vitest/mocker` (GHSA-82fw-gwwq-j7x9). npm's DB marks vitest vulnerable **up to 4.1.10**. **Not 5.0.3:** 5.0 is 5 weeks old, and 5.0.3 **failed to resolve** (`ERESOLVE`: it needs a newer `@types/node` than our `^20`), so it would drag in a second upgrade. | **Yes:** our config relies on `poolOptions.forks.singleFork` and `projects`; secondary sources say `poolOptions` was flattened in v4. Read the official guide. |
| `vite` (transitive, dev-only; added in PR #137 review) | 7.3.6 | **8.3.x** (8.3.4 at install) | 8.0.0 2026-03-12; 8.3.0 2026-09-10; 8.3.4 2026-10-08 | Not chosen, pulled in: vitest 4.1.11 accepts `vite ^6 \|\| ^7 \|\| ^8`, so npm took the newest. **Kept (owner's call)** over pinning `~7.3.6` as a direct devDependency: the 8.x line is 7 months old and 8.3 is on its 5th release; vite only loads `vitest.config.ts` and transforms test files (Next/Turbopack builds the app); every gate and the sequencing probe pass on it. esbuild and rollup leave the tree with it (vite 8 uses rolldown/oxc). | Unflagged until the review found it; gates are the test. Pin to 7 if a transform difference shows up. **Known warning, accepted:** every run prints `(!) Your Vite config uses features that are unsupported by configLoader: 'native'… ESM syntax in a file loaded as CommonJS (vitest.config.ts)`. It's about a *future* Vite major's default loader; when that lands, rename to `vitest.config.mts` (`tsconfig` already includes `**/*.mts`) or add `"type": "module"`. Not done now: no breakage today, and the rename ripples through every doc that names the file. |
| `@upstash/ratelimit`, `@upstash/redis` | installed | **removed** | — | Never imported anywhere; rate limiting was dropped in `transition.md` §7. | — |

**Verified, not assumed:** this exact set was resolved into a throwaway lockfile (with
npm 11) and audited:
- **`npm audit --omit=dev`: 0 vulnerabilities.** Everything that ships is clean.
- **Full `npm audit`: 5 high, all one chain:** `eslint-config-next` →
  `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → **`braces` 3.0.3**,
  advisory GHSA-vfj7-8cjw-p6xm (stack-exhaustion DoS through deeply nested glob
  patterns). **No fixed `braces` exists** (3.0.3 is the latest release), so every
  `eslint-config-next` version is flagged. `npm audit`'s suggested "fix" is a downgrade
  to `eslint-config-next@14.2.35`, which doesn't fit Next 16. **Accepted:** dev-only,
  lint-time, and the glob patterns are our own config, never attacker input.
  Revisit if `braces` ships a fix.

**Checked and kept:** `@supabase/supabase-js` (used), `date-fns-tz` (used by
`TruckPopup`), `date-fns` (no direct import, but it is `date-fns-tz`'s required peer),
`pmtiles` (used), `supabase` CLI, Tailwind, ESLint, TypeScript, `@types/*`.

### #4 — Teardown before upgrades
Upgrading vitest or MapLibre first would mean migrating test files and code that the
teardown deletes. Deleting first leaves the upgrades with the smallest surface.

### #5 — #99 lands first, before the teardown (changed in review)
An earlier draft tied #99 to the vitest upgrade, on the grounds that the guard must
be written against the config the upgrade changes. That held for a custom reporter
or a comparison script. It doesn't for the chosen form: running each project with
`--project` doesn't depend on the config's internals, and `--project` already works on
vitest 3.2.7. So #99 costs one script line and can land **before** the biggest
deletion in the phase, guarding it instead of arriving after it. Step 8 re-checks it
on vitest 4.

### #6 — Keep `scripts/seed-dictionary.mjs`
Owner's call. It's the reproducible way to regenerate known spots from OpenStreetMap.
Its comments and output now point at `spots.ts`.

### #7 — Delete the old `services/locations.ts` now, keep `db/locations.ts`
The service is lane conflict logic (override matrix, negation, replay), none of which
survives; Phase 7 writes a small new one. `db/locations.ts` and its integration tests
match the **current** schema, which still exists until Phase 5. Deleting them now
would leave the schema untested for a phase; Phase 5 replaces schema, primitives and
tests together.

### #8 — Rewrite `project-context.md` in labelled parts (two, plus Standing rules since PR #140)
After this phase the code is a fake-data map plus an old schema, while the design is
the admin-populated map. A context that only describes the target would be wrong about
the code; one that only describes the code would hide the plan. So:
**"Current state"** (what exists after Phase 4) and **"Target design"** (condensed
from `transition.md`). *Added in PR #140:* a third part, **"Standing rules"**, for the
conventions that hold in both; filing them under either part would mislabel them. `transition.md` then becomes history: kept, with an "absorbed"
header, because its §0 table is what stops removed pieces being re-added.

### #9 — Renumber the roadmap
Housekeeping takes Phase 4, so: **5 Schema reset → 6 Live read path → 7 Admin →
8 Launch.** `transition.md` §13 and the new context use the new numbers.

### #10 — Pin exact versions for the framework and the map
`next` and `eslint-config-next` were already exact pins (`16.2.6`) and stay exact
(`16.3.8` since PR #135).
`maplibre-gl` becomes an exact pin too: its maintainers advise against auto-updating,
and a map-rendering change is only caught by looking at the map. Everything else keeps
`^` within its major. Upgrades to these three are deliberate, each with a browser
check.

### #11 — npm 11 is a prerequisite
npm 10.9.2 (bundled with Node 22.14) crashes in `#loadPeerSet` on vitest 4.1.11's
optional peers. Reproduced twice on clean installs; npm 11 resolves the same set. The
alternatives were worse: `--legacy-peer-deps` hides real peer conflicts, and staying on
vitest 3 keeps a critical advisory. Upgrading a local tool costs one command.

### #12 — Next's agent-rules generator stays off (added in PR #135, owner)
Since 16.3, `next dev` writes a managed "agent rules" block when it detects an AI
coding agent, and re-adds it on every such run: into `AGENTS.md` if that exists,
otherwise `CLAUDE.md`, creating both if neither exists
(`node_modules/next/dist/server/lib/generate-agent-files.js`). It appended the block
to `CLAUDE.md` during #123's dev check. `next.config.ts` sets `agentRules: false`.
Every tracked doc is hand-written and changes only through a PR; a dependency that
rewrites one on every dev run, and again whenever its own text changes, is drift done
by a tool. The block's useful hint (version-matched docs in
`node_modules/next/dist/docs/`) is written by hand in #126. **Rejected:** committing
the generated block. Don't remove `agentRules: false` without the owner.

### #13 — MapLibre's worker is served from `public/maplibre/<version>/` (PR #136, owner)
MapLibre 6's documented Turbopack / Next.js form,
`setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url))`,
does **not** work on Next 16.3.8. Turbopack copies the worker verbatim as a static
asset, but the worker imports `./maplibre-gl-shared.mjs`, which is emitted under a
hashed name, so the worker 404s and the map draws only its background. Every gate
stayed green; the owner's browser check caught it (process-log row 282).

So `scripts/copy-maplibre-worker.mjs` copies the worker, the shared chunk and their
source maps from `node_modules` into a gitignored `public/maplibre/<version>/`, as the
`postinstall`, `predev` and `prebuild` hooks. One module,
`src/lib/maplibre-worker.mjs`, defines the folder and the file list, for both the
script and `useMapLibre` (`setWorkerUrl(workerUrl(getVersion()))`).
- **Owner chose** copying on install, dev and build over committing the copies
  (~535 KB, re-copied by hand on every upgrade).
- **Versioned path.** A tab running an old hashed client chunk after an upgrade
  deploys asks for its own version's worker. The new deploy no longer serves it, so
  it gets a clear 404 and no tiles until a reload, instead of a newer worker failing
  on a protocol mismatch. That's a clearer failure, **not a fix**: keeping old
  versions reachable (skew protection, or committing every version) isn't worth it
  for a one-admin MVP (corrected in PR #136 r2).
- **The script is idempotent:** it rewrites only changed files, removes only other
  versions' folders, and skips under `postinstall` when `maplibre-gl` isn't installed.
  Before `dev`/`build` a missing package still fails loudly.
- **Guard:** `src/lib/maplibre-worker.test.mjs` fails if the copied set stops being
  closed under its own imports, and if `getVersion()` and the package version disagree.
- **Accepted cost:** the worker fetches its own copy of the 516 KB shared chunk, which
  the main bundle already contains. Now that the path is versioned, it could be served
  with an immutable `Cache-Control`; that's left for launch (Phase 8).

### #14 — Decisions live in plans; the log's detail entries are archived (2026-10-17, #152, owner)
Added after the phase closed, under the rule it sets. The process log's 79 detail
entries (215,283 of its 474,581 bytes, mostly about the removed parser) were deleted
from the file and kept unchanged on the `archive/process-log-details` tag. Review
details had already moved to PR bodies. Of the 15 decision and review entries, 3 were
also recorded in a plan or `CLAUDE.md`, 2 still in force were copied into
`CLAUDE.md` (below), 9 covered removed code, and 1 was replaced by the Phase 3
retrospective (PR #156 lists each).
- **Settled decisions go only in the current plan's numbered decisions.** The
  end-of-phase reconciliation carries forward the ones that outlive the phase (the
  milestone-retrospective procedure's part 6).
- **Two archived decisions still in force were copied into `CLAUDE.md`:**
  - CI/CD arrives at deploy as its own piece of work, with `tsc` a gate in its own
    right meanwhile (2026-09-06);
  - comments keep evidence, not argument (2026-09-13).
- **The owner chose to keep the comments rule in `CLAUDE.md`,** although the 2026-09-13
  decision had scheduled it "deliberately not as a CLAUDE.md rule". The copy is a rule
  about the kind of comment, not a density rule, which is what that decision argued
  against (asked in PR #156 r1; process-log row 318).

### #15 — Rows are written with `add`; the log's values live in one block; new rows are capped (2026-10-17, #155, owner)
Added after the phase closed, like #14. Writing a row by hand kept going wrong (rows 272,
296, 302), and `check` reading values out of prose cost three review rounds on PR #154
(rows 315–317).
- **`bash scripts/process-log.sh add <file>` writes every new row.** It builds the row
  from `Field: value` lines, places it, and writes only if `check` passes.
- **Every value rows are checked or counted against is in one `values` block** in
  the log's Columns section. The prose explains it and is not read. The Cause table
  keeps its meanings, and `check` matches its names against the block.
- **From row 321, a Miss is at most 600 characters and a Fix at most 300.** Those are
  just above rows 1–265's 90th percentile in characters, as `check` counts them (522
  and 238); the rest of a story goes in the PR body.
- **The 77 earlier rows over the cap stay as written** (owner, 2026-10-17): rewriting
  them would break append-only, risk new imprecise claims, and push some stories onto
  the archive tag only.
- **Not part of it:** moving the rows to CSV or JSON, or splitting them across files.
  The proposal argued against both (GitHub shows cell markdown raw in CSV, and the
  retrospectives' `tally` commands and `check`'s numbering rely on one table), and the
  owner asked for the three changes above only.

---

## Acceptance Criteria

*All checked 2026-10-12 (#144). Run against `dev` at `ee53ed7`, every criterion passed
except three items, which PR #145 fixes: `fake-data.ts`'s comments, history headers on
the Phase 1–2 plans, and this plan's own status. So they hold from PR #145's merge on;
the evidence for each criterion is in that PR.*

**Archive and tracker**
- [x] `git ls-remote --tags origin archive/parser-lanes` and `--heads` both resolve
  to the same commit, which contains `src/lib/parser/`.
- [x] Milestone `phase-3` is closed; each of the 22 listed issues is closed with a
  comment linking the archive.
- [x] Milestone `phase-4` exists and contains #99.

**Code removal**
- [x] None of the deleted paths exist on `dev`.
- [x] `npx tsc --noEmit` passes, which proves no file imports a deleted module.
- [x] `grep -rliE "parser|ingestion|geocod|mailgun|upstash|nominatim" src scripts tests`
  lists **only** the files kept on purpose until Phase 5 (`src/lib/database.types.ts`,
  `src/lib/db/locations.ts`, `tests/integration/*`), `scripts/seed-dictionary.mjs`,
  and `src/lib/fake-data.ts`, whose rows use the current schema's column names
  (`parser_confidence`, `address_geocoded`) as keys until Phase 5 renames them; its
  *comments* must not match. (Planning baseline, 2026-10-11: 15 files matched before
  the clean-up, so it was real work. `fake-data.ts` added during #121, process-log row 273.)
  ⚠ The grep's paths miss **root files**: `vitest.config.ts` described the parser as
  current and passed unseen (row 275). Also run it over
  `git ls-files ':!src' ':!scripts' ':!tests' ':!supabase' ':!.claude' ':!package-lock.json'`;
  after #122 that lists only `README.md` and `CLAUDE.md`, which #126 rewrites.
  **Pass at phase end:** every remaining hit is read, and each is a history mention
  (the Docs AC's exemption), not a description of the removed code as current.
  `package-lock.json` is excluded because it always matches on third-party package
  names (`@babel/parser`, `@typescript-eslint/parser`); check the lockfile itself with
  `grep -c '"node_modules/@upstash/' package-lock.json` → `0` instead (rows 277, 278).
  ⚠ **The pattern above misses half the removed design** (row 288, PR #138): it has no
  `cron`, `realtime` or `confidence`, and `src/lib/supabase.ts` still described cron
  and Realtime as current. Also run `grep -rniE "cron|realtime|confidence|webhook|grey|CLAUDE\.md" src scripts`.
  Allowed hits: the fake-data map's **code** (`useMapLibre.tsx`, `TruckPopup.tsx`,
  `fake-data.ts`, `types.ts`; Phase 6 replaces it), the Phase 5 files above, and
  `src/lib/db/trucks.ts` (kept on purpose for Phase 5, see that table). No
  *comment* may describe them as current, and every `CLAUDE.md` citation must name a
  rule that still exists (today only `handler.ts`'s "API responses" does; the two that
  don't are fixed in #127). Round 2 of PR #138 added `grey` and `CLAUDE\.md`, which
  the first widening still missed.
  ⚠ **Phase numbers changed too** (decision #9, row 292): run `grep -rnE "Phase [0-9]" src scripts tests supabase`
  **and** the same over the root-file list above (`git ls-files ':!src' ':!scripts' ':!tests'
  ':!supabase' ':!.claude' ':!package-lock.json'`; row 275's gap, which PR #140 r1 caught
  again in `vitest.config.ts`). Read each hit against the new numbering (4 Housekeeping,
  5 Schema reset, 6 Live read path, 7 Admin, 8 Launch). Allowed: (1) Phases 1–3, whose
  numbers didn't change; (2) `src/lib/db/locations.ts`, frozen until Phase 5; (3)
  `supabase/migrations/*` (applied
  migrations aren't edited; `0001:108` and `0002:4` say "Phase 4" meaning the old
  Realtime phase, and Phase 5 squashes them).
- [x] `src/lib/spots.ts` exports `SPOTS` with the same places and coordinates as the
  old dictionary.
- [x] `.env.example` lists only the three Supabase variables and
  `NEXT_PUBLIC_PMTILES_URL`.
- [x] `vercel.json` is gone and `proxy.ts`'s matcher has no `/api/ingest` or
  `/api/email`.

**Dependencies**
- [x] `npm ls --depth=0` shows `next@16.3.8`, `eslint-config-next@16.3.8`,
  `maplibre-gl@6.11.2`, `@protomaps/basemaps@5.7.2`, `pmtiles@4.5.0`, `vitest@4.1.11`;
  no `@upstash/*`, no `protomaps-themes-base`. `package.json` pins `next`,
  `eslint-config-next` and `maplibre-gl` exactly.
- [x] `npm audit --omit=dev` reports **0 vulnerabilities**.
- [x] Full `npm audit` reports nothing beyond the `braces` chain
  (GHSA-vfj7-8cjw-p6xm), and the PR names it as accepted (decision #3).
- [x] `package-lock.json` is still `lockfileVersion: 3`.
- [x] `/map` renders in the browser with the basemap, markers and a working popup
  (manual check, noted in the PR).

**Gates**
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run test:all`, `npm run build` all exit 0
  (read unpiped).
- [x] The #99 guard fails the gate when either vitest project collects zero files
  (demonstrated by temporarily breaking each project's `include`), and passes
  normally.

**Docs**
- [x] No tracked doc describes the lanes, parser, confidence scoring, geocoding,
  cron, Realtime or Upstash as current. (History sections, the archive and the
  process log are exempt.)
- [x] `CLAUDE.md` contains the new rules from `transition.md` §14 and points at the
  current plan.
- [x] `project-context.md` has a "Current state" and a "Target design" section, and
  the roadmap uses the new numbering.
- [x] `README.md` describes the new product and stack, no longer claims the
  `.pmtiles` file is committed, and explains how to get it: cut a Gothenburg extract
  with `pmtiles extract` from a Protomaps daily build (bounding box from
  `src/lib/geo.ts`) into `public/gothenburg.pmtiles`.
- [x] `phase-3-parser.md` and `transition.md` carry their superseded/absorbed
  headers.

**Process**
- [x] The process log has a Phase 3 retrospective with counts by `Caught by` and
  `Cause`, and names an action for the two largest columns.
- [x] Row 258's fix column is marked resolved.

---

## Open Decisions

*Resolved in review (2026-10-11):*
- ~~vitest 4.1.11 or 5.x~~ → **4.1.11** (decision #3).
- ~~Basemap label language~~ → **`"sv"`** (owner). Set during step 7.
- ~~How `gothenburg.pmtiles` is produced~~ → **cut with `pmtiles extract`** from a
  Protomaps daily build, with the bounding box from `src/lib/geo.ts`, into `public/`.
  *Corrected in PR #138 (row 289):* this first said "downloaded by hand from Protomaps'
  website". The owner recalls https://maps.protomaps.com/builds/, but that page only
  lists daily builds, and its download link is the whole planet (~139 GB); Protomaps'
  docs offer no in-browser extract, only the CLI. So the 11.5 MB June file (27 June
  build, round-number box, `--maxzoom=14`) was cut from one of that page's builds with
  `pmtiles extract`. The README names the page for the build date and warns off its
  download link. The README's command was run from a fresh
  clone and the result checked in the owner's browser.
- ~~Form of the #99 guard~~ → **run each project separately** (owner), so each run
  fails by itself when it collects zero test **files**. First shipped as a one-line
  `&&` script; PR #130's code reviews turned it into `scripts/test-all.mjs` (see
  step 3), because the one-liner hid integration results and nothing checked its project
  list.
  Rejected: a custom reporter (code for the same coverage) and a disk-vs-collected
  comparison script (the only option that also catches a *partial* drop such as every
  `.tsx` test; add it only if a partial drop recurs, since `vitest.config.ts`'s
  structural include/exclude rule now guards against that).

1. ~~**MapLibre worker setup under Next.**~~ → **resolved in PR #136: copied into
   `public/maplibre/<version>/` by npm hooks** (decision #13). The bundler form does not
   work on Next 16.3.8. And "can't fail silently" was only half true: every gate stayed
   green, and only the browser check showed the missing tiles.
2. ~~**Tile file vs. new basemap style.**~~ → **compatible, no re-download** (PR #136).
   The file's own metadata says Protomaps basemap schema 4.14.9, newer than the 4.13.0
   that styles 5.7.0 shipped with, and it has all 9 source layers the style uses.

---

## Sources (2026-10-11)

- `npm audit` on `dev` at the `chore/track-dev-docs` merge, and on a throwaway lockfile
  of the target set (resolved with npm 11)
- npm release dates: `npm view <pkg> time`
- `braces` advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- Next.js security advisories: `gh api repos/vercel/next.js/security-advisories`
- MapLibre v5→v6 migration guide: https://maplibre.org/maplibre-gl-js/docs/guides/v5-to-v6-migration-guide/
- MapLibre v6 release: https://newreleases.io/project/github/maplibre/maplibre-gl-js/release/v6.0.0
- `protomaps-themes-base` deprecation notice (npm) and https://github.com/protomaps/basemaps/blob/main/CHANGELOG.md
- Vitest 4 migration (secondary; official guide to be read in step 8): https://qaskills.sh/blog/vitest-3-to-4-migration-guide
- Next.js 16.4 (secondary): https://byteiota.com/?p=24582
