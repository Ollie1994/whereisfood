# Process log — misses and what they say about the process

A record of defects, wrong turns, and stale guidance **for the purpose of fixing the
development process**, not for blame or for tracking bugs. Bugs live in GitHub
issues. This file exists to answer questions like:

- Which gate actually catches things — and which ones are decorative?
- Which documents keep going stale, and why?
- Are fixes creating new defects (overcorrection)?
- Which CLAUDE.md rules turned out to be wrong or harmful?

**Append-only.** Never rewrite history here; a miss that later turned out to be a
non-issue gets a follow-up entry, not a deletion.

---

## This file is tracked in the repo (since 2026-10-11)

**DECISION (2026-10-11, Oliwer; PR for IS #116) — reverses the 2026-08-09 decision
below.** `.claude/` and `CLAUDE.md` are now committed. Only
`.claude/settings.local.json` (per-machine Claude Code permissions) stays ignored.

**Why reversed:** by October the dev docs had become the project's actual memory.
They hold the phase plans, 265+ rows of this log, and `transition.md`, which is the
only record of the decision to drop the ingestion lanes and the parser. All of it
existed on a single machine, where a disk failure, a machine change or a
`git clean -xfd` would lose it for good. Durability now outweighs keeping the docs
private.

**Accepted consequence:** `whereisfood` is a **public** repo, so these docs are
public. That includes this log's analysis of the (now archived) Mailgun lane's
weaknesses and the security review of `/api/live`. A secret scan before the first
commit found no keys, tokens or real email addresses. **Keep it that way: never paste
secrets, keys or real personal data into these files.**

**Superseded decision, kept for the record (2026-08-09, Oliwer):** all development
documentation stays off GitHub, because the repo is public and the dev docs were
not for that audience. It was raised three times before being settled. Its accepted
trade-off, that the docs existed only on one machine, is what the reversal fixes.

<details>
<summary>For the record: how the negation would have worked, had we wanted it</summary>

`.claude/` excludes the **directory**, and git does not descend into an excluded
directory, so a later `!.claude/process-log.md` is never evaluated — verified, it
stays ignored. Excluding the contents instead (`.claude/*`) leaves the negation able
to take effect. Also note `.gitignore` has **no trailing newline**, so appending
without a leading `\n` silently concatenates onto the `.claude/` line and corrupts
the pattern. Both facts cost three attempts to establish (see entry #11).

</details>

---

## How to use it

**Write an entry when:** something got through a gate it should not have; a
document or rule turned out to be wrong; a fix introduced a new defect; or the same
class of thing is caught twice.

**Do not write an entry for:** ordinary bugs found and fixed while writing the code.
That is just work. The bar is *"this says something about the process."*

**Read it at phase boundaries.** A log nobody reads is a diary. At the end of each
phase, count by `Caught by` and by `Cause`, and act on the two biggest columns.

### Columns

**`Where`** — exactly one of these three forms, no variants:

```
PR #74 / IS #55     a miss that happened in that work
→ IS #64            a miss found before any PR existed; the issue is where the fix lands
n/a                 a workflow or behavioural miss with nothing to point at
```

**Both numbers carry a prefix — `PR #` and `IS #`.** Write `PR #74 / IS #55`, never
`74 / IS #55`. The prefixes are what stop a PR and an issue being read as each other
at a glance, and both are needed for that: a bare leading number is exactly the
ambiguity the `IS` prefix exists to remove. Multiple issues share one prefix:
`→ IS #64, #68`.

*(This paragraph replaced one that gave the format correctly and then said "the PR
number needs no prefix", meaning it needs no `IS` prefix. Twenty-seven rows were
written as `74 / IS #55` before a reader caught it — see row 55.)*

Use `n/a` when a miss genuinely has no PR, rather than forcing a reference.

**A leading `→` means "fixed in", not "occurred in".** A miss found during *planning*
happened before any issue existed, so it has no origin reference — but once the fix is
scheduled, the issue that carries it is where the claim becomes checkable. `IS #53`
means the miss happened in that work; `→ IS #64` means the correction lands there.
Same durability purpose, opposite direction, so the notation distinguishes them.
Added 2026-08-22, retroactively, for the eight planning-phase rows that had one.

**Some `n/a` rows are correct and must stay that way.** Rows 11, 12, 14, 17, 21–24 are
behavioural (something was claimed, assumed, or not done) or concern the plan document
itself (which was gitignored at the time, so it had no PR). There is nothing to point at, and inventing a reference would be
worse than the gap. Do not "fix" these.

The issue carries the intent, the PR carries the change — together they answer both
"what were we trying to do" and "what did we actually do". **The PR and issue hold
the diff and the review discussion, which this log only summarises.** A row without
a reference has no evidence behind it. (Until IS #116 this was also the durability
hedge, because the log was untracked and lived on one machine. It is tracked now,
but the evidence argument still holds.)

**`Artifact`** — *the dev-process file that was wrong, missing, or not followed.*
Not "the file that got edited". Use `code-only` when no process artifact is
implicated. A doc appears here both when it was **wrong** (#1) and when it was
**correct but not consulted** (#7) — the `Cause` column disambiguates, and both are
worth counting, because "this rule keeps being ignored" is as actionable as "this
rule is stale".

Values: `CLAUDE.md` · `project-context` · `README` · `process-log` · `command` ·
`plan` · `issue` · `process` · `docs` (several at once) · `code-only`

**`Escaped`** — how far it travelled before being caught, the real cost signal:
`pre-commit` · `pre-merge` · `merged` · `crossed-phase` · `production` · `n/a`

### Cause taxonomy

Keep to these; add a value only when something genuinely does not fit.

| Cause | Meaning |
|---|---|
| `stale-doc` | A project rule/doc was wrong, and following it caused the defect |
| `missing-gate` | No check existed that would have caught it |
| `gate-skipped` | A check existed but was not run |
| `unverified-assumption` | Acted on something believed but never confirmed |
| `incomplete-guard` | A guard covered some failure modes but not all of them |
| `overcorrection` | A fix for a previous miss introduced a new defect |
| `imprecise-claim` | A comment/doc asserted more than was actually true |
| `manual-drift` | Hand-maintained data (counts, lists, status) fell out of sync |

---

## Log

| # | Date | Where | Artifact | Miss | Caught by | Escaped | Cause | Fix landed? |
|---|------|-------|----------|------|-----------|---------|-------|-------------|
| 1 | 2026-08-09 | PR #52 / IS #50 | `CLAUDE.md` | `export const runtime` in `proxy.ts` broke `next build` | review r1 (`next build`) | `crossed-phase` | `stale-doc` | ✅ rule rewritten; build added to verify loop |
| 2 | 2026-08-09 | PR #52 / IS #47 | `code-only` | `unixToIso("")` returned 1970 — `Number("")` is a finite `0` | writing its test | `pre-commit` | `incomplete-guard` | ➖ code only |
| 3 | 2026-08-09 | PR #52 / IS #47 | `code-only` | `unixToIso` threw `RangeError` on out-of-range input | review r2 | `pre-merge` | `incomplete-guard` | ✅ enumerate-failure-modes rule |
| 4 | 2026-08-09 | PR #54 / IS #53 | `code-only` | `posted_at` bounded to JS `Date` range, not `timestamptz` | review r3 | `pre-merge` | `incomplete-guard` | ➖ code only |
| 5 | 2026-08-09 | PR #54 / IS #53 | `code-only` | Migration `0004` stripped signatures **then** failed on the index | review r3 | `pre-merge` | `unverified-assumption` | ✅ fallible-before-irreversible + atomic rule |
| 6 | 2026-08-09 | PR #54 / IS #53 | `code-only` | HMAC boundary re-split bypassed the replay guard (41 variants) | review r4 | `pre-merge` | `incomplete-guard` | ✅ documented as structural, not validation |
| 7 | 2026-08-09 | PR #54 / IS #53 | `CLAUDE.md` | 10-digit pin (fix for #6) reintroduced the data loss #53 removed | review r4 | `pre-merge` | `overcorrection` | ✅ rule existed but was not consulted |
| 8 | 2026-08-09 | PR #54 / IS #53 | `docs` | "We know Mailgun sent this" overstated the HMAC; spread to 3 docs | review r4 | `pre-merge` | `imprecise-claim` | ✅ precision rule added to CLAUDE.md |
| 9 | 2026-08-09 | PR #52 / IS #45 | `process` | PR body's `Closes the … tracked in #45` did not parse | self-audit pre-merge | `pre-merge` | `unverified-assumption` | ✅ verify keywords with grep before merge |
| 10 | 2026-08-09 | PR #52 / IS #51 | `README` | Test counts, migration lists, phase status repeatedly stale | doc audit | `merged` | `manual-drift` | ❌ still manual |
| 11 | 2026-08-09 | n/a | `process-log` | This file's own `.gitignore` advice was wrong (`.claude/` + negation) | testing before publishing | `pre-commit` | `unverified-assumption` | ✅ corrected; moot — see decision above |
| 12 | 2026-08-09 | n/a | `process` | Proposed tracking the dev docs 3× without asking if it was wanted | user said no | `n/a` | `unverified-assumption` | ✅ decision recorded at top |
| 13 | 2026-08-22 | PR #54 / IS #53 | `project-context` | Schema section still keyed the replay index on `token` alone, not the `timestamp`+`token` concatenation | Phase 3 planning read-through | `merged` | `manual-drift` | ✅ schema block + trailing note corrected |
| 14 | 2026-08-22 | n/a | `process` | Said "I'll fix it and log it once we're through the plan", finished the plan, did neither — recorded the fix as future Phase 3 work instead | user asked whether I had | `n/a` | `missing-gate` | ✅ both landed; see note below |
| 15 | 2026-08-22 | → IS #70, #59 | `plan` | Phase 3 plan written from the docs without reading the Phase 2 code it extends — missed that `persistPost` returns `void` and that `posts.source`→`locations.source` needs a mapping. Both were already flagged in code comments | plan review | `pre-commit` | `unverified-assumption` | ✅ plan corrected; see note below |
| 16 | 2026-08-22 | → IS #71 | `plan` | Rejected cron-retry (#7 option C) for "risks resurrecting stale pins" while recommending option B, which shares that hazard exactly | plan review | `pre-commit` | `imprecise-claim` | ✅ `parsedAt` now derives from `posted_at`; decision stands on narrower grounds |
| 17 | 2026-08-22 | n/a | `plan` | Resolving 7 decisions one at a time left earlier sections of the same doc contradicting later ones (Out of Scope reasoning, Nominatim note, step dependencies, "steps 0–5") | plan review | `pre-commit` | `manual-drift` | ✅ all reconciled; third `manual-drift` entry — see note |
| 18 | 2026-08-22 | → IS #64 | `project-context` | Documented overlap predicate compares `ends_at`, which is nullable by design — NULL-blind, so a location with no end time can never be overridden | plan review r2 | `pre-commit` | `incomplete-guard` | ✅ compare `expires_at`; doc fix queued, regression test named |
| 19 | 2026-08-22 | → IS #60 | `plan` | Migration 0005 asserted "single statement, atomic" against an **unnamed** inline CHECK — name guessed, DROP+ADD atomicity unspecified | plan review r2 | `pre-commit` | `unverified-assumption` | ✅ verify name against live DB; comma form or `DO` block |
| 20 | 2026-08-22 | → IS #61 | `plan` | Integration tests specified without accounting for vitest's default file parallelism — concurrent files on one local DB | plan review r2 | `pre-commit` | `unverified-assumption` | ✅ `fileParallelism: false` + 3-consecutive-green criterion |
| 21 | 2026-08-22 | n/a | `plan` | Round-1 fixes introduced two new defects: `sources.ts` filed under "impure layers" while described as pure, and a "four places" count left above a six-row table | plan review r2 | `pre-commit` | `overcorrection` | ✅ both corrected; see note below |
| 22 | 2026-08-22 | n/a | `plan` | **Recurrence of #21's count drift one round after logging it** — "six places" above a seven-row table. Fixed structurally this time: count deleted, not corrected | plan review r3 | `pre-commit` | `manual-drift` | ✅ count removed; `88 tests` also de-pinned — see note |
| 23 | 2026-08-22 | n/a | `plan` | Round-2 fixes introduced two more: `geo.ts` scheduled at step 6 while step 1's test consumes it, and an index reshape bolted onto a migration named for a CHECK change | plan review r3 | `pre-commit` | `overcorrection` | ✅ `geo.ts` → step 1; index split into 0006 |
| 24 | 2026-08-22 | n/a | `process` | Claimed phase-2's branch convention was "grouping issues onto a shared branch" — generalised from PR #52, which was a one-off audit, not the norm | user corrected | `n/a` | `imprecise-claim` | ✅ 1 issue = 1 branch = 1 PR adopted |
| 25 | 2026-08-22 | → IS #67 | `issue` | Removing `extract-date` from the confidence issue's blockers orphaned it — the parser orchestrator reached it only transitively, so it could have started before `extractDate` existed | caught while applying the fix | `pre-commit` | `overcorrection` | ✅ listed as a direct blocker with a note on why it cannot be transitive |
| 26 | 2026-08-22 | → IS #64, #68 | `issue` | `NewLocation` was assigned to the locations-service issue but first needed by the db-locations issue, which that service issue is blocked by — an effective circular dependency | issue review r2 | `pre-commit` | `unverified-assumption` | ✅ type moved to its first consumer; verified each shared type has exactly one definer |
| 27 | 2026-08-22 | → IS #68, #69 | `issue` | No issue owned the negation *dispatch* — one declared it a non-goal, another added the branch, and the ingestion issue could land between them | issue review r2 | `pre-commit` | `incomplete-guard` | ✅ documented no-op stub, replaced by the negation issue |
| 28 | 2026-08-23 | PR #74 / IS #55 | `code-only` | A test comment claimed the bbox well-formedness assertions guarded against a transposed box; they cannot — Gothenburg's lat range is a subset of the valid lng range, so a transposed box passes all six | code review r1 | `pre-merge` | `imprecise-claim` | ✅ comment corrected to name REAL_SPOTS as the only real transposition gate |
| 29 | 2026-08-23 | PR #74 / IS #55 | `code-only` | The purity test's import regex was line-anchored and space-requiring, so it missed `import{x}from` and `await import("@/lib/db")` — the dynamic form being exactly the impurity it existed to prevent | code review r1 | `pre-merge` | `incomplete-guard` | ✅ bare `\bimport\b` over comment-stripped source; verified by mutation |
| 30 | 2026-08-23 | PR #74 / IS #55 | `code-only` | `geo.ts` documented "no HTTP" but no test asserted it; `fetch` is a global, so the import assertion never implied it | code review r1 | `pre-merge` | `missing-gate` | ✅ own test, alongside the clock test whose reasoning already applied |
| 31 | 2026-08-23 | PR #74 / IS #55 | `code-only` | `isInGothenburg` had no runtime numeric guard; Nominatim returns lat/lon as JSON strings and `res.json()` is `any`, so `"57.6997" >= 57.5` coerces true and a string coordinate would reach `locations.latitude` | code review r2 | `pre-merge` | `incomplete-guard` | ✅ `Number.isFinite` prefix; string/null/object cases tested, mutation-verified |
| 32 | 2026-08-23 | PR #74 / IS #55 | `code-only` | The r1 fix's comment stripper was string-literal-unaware — a `/*` in a string swallowed a real `import { supabaseAdmin }` and the guard stayed green | code review r2 | `pre-merge` | `overcorrection` | ✅ drop whole comment LINES only; cannot remove code, fails loud instead of silent |
| 33 | 2026-08-23 | PR #74 / IS #55 | `code-only` | Comment said a transposed pin lands in the "Gulf of Guinea"; that is null island (0/0), which has its own test — transposed Järntorget is the Arabian Sea. Plan says "Indian Ocean" | code review r2 | `pre-merge` | `imprecise-claim` | ✅ corrected to match the plan |
| 34 | 2026-08-23 | PR #74 / IS #55 | `code-only` | "Verified by reading the source, not by inspection" — self-contradictory, and inverts the plan's "verified by test, not by inspection". Repeated verbatim in the PR body | code review r2 | `pre-merge` | `imprecise-claim` | ✅ corrected in source and PR body |
| 35 | 2026-08-23 | PR #74 / IS #55 | `code-only` | The r2 comment-line filter dropped lines *beginning* with `/*` including code after the closing `*/`, so `/* c */ import { supabaseAdmin } …` vanished and the guard passed — falsifying the "cannot remove code" claim that was r2's sole justification | code review r3 | `pre-merge` | `overcorrection` | ✅ hand-written matcher replaced with `ts.preProcessFile` |
| 36 | 2026-08-23 | PR #74 / IS #55 | `code-only` | The `\bimport\b` matcher never covered `export {x} from` / `export * from` — static imports with full side effects — despite the test title claiming every syntactic form | code review r3 | `pre-merge` | `incomplete-guard` | ✅ same replacement; all ten forms mutation-verified |
| 37 | 2026-08-23 | PR #74 / IS #55 | `code-only` | Non-finite comment still said those values "fall out of the comparisons rather than being special-cased" — true before r2, and it argued the `Number.isFinite` guard was incidental, inviting removal of the fix from row 31 | code review r3 | `pre-merge` | `stale-doc` | ✅ corrected to state the prefix is load-bearing |
| 38 | 2026-08-23 | PR #74 / IS #55 | `code-only` | `geo.ts` header asserted in present tense that `dictionary.test.ts` and `geocoding.ts` consume the box; neither exists — the module ships ahead of both consumers by design | code review r3 | `pre-merge` | `imprecise-claim` | ✅ future tense, issue numbers named |
| 39 | 2026-08-23 | PR #74 / IS #55 | `process` | The r3 mutation harness counted `×` characters to detect failure, so a suite that failed at module load ("no tests" ran) read as MISSED — I nearly reported two holes that were not holes | re-checking a surprising result | `pre-commit` | `unverified-assumption` | ✅ switched to exit code; re-verified guard fires alone via a cleanly-loading `node:fs` import |
| 40 | 2026-08-23 | PR #76 / IS #75 | `code-only` | `ts.preProcessFile` missed `export * as ns from` and every non-literal specifier (`import(s)`, `require(s)`) — it resolves module filenames, so what it cannot resolve it omits silently. The r3 fix on PR #74 picked the wrong compiler API | code review r1 | `pre-merge` | `unverified-assumption` | ✅ replaced with `ts.createSourceFile` AST walk; detection by node kind |
| 41 | 2026-08-23 | PR #76 / IS #75 | `code-only` | Clock regex required a literal single space and a mandatory `new`, so `Date()`, `new  Date()` and `new\nDate()` all passed; inconsistent with the fetch regex's `\s*` | code review r1 | `pre-merge` | `incomplete-guard` | ✅ detected as value references in the AST; whitespace cannot matter to a parser |
| 42 | 2026-08-23 | PR #76 / IS #75 | `code-only` | fetch/clock regexes fired inside comments and template literals, so a pure parser module carrying `// never call Date.now()` would fail its own purity test — a false positive that gets guards relaxed | code review r1 | `pre-merge` | `incomplete-guard` | ✅ comments and strings are not call nodes; class removed by parsing |
| 43 | 2026-08-23 | PR #76 / IS #75 | `code-only` | The decoy fixture "a template literal mentioning fetch" contained no `fetch(`, so it never engaged the regex it existed to exercise — fetch/clock had zero false-positive coverage | code review r1 | `pre-merge` | `imprecise-claim` | ✅ fixtures replaced with ones containing the call text |
| 44 | 2026-08-23 | PR #76 / IS #75 | `code-only` | `globalThis.fetch()`, `window.fetch()`, `globalThis.Date.now()` and `module.require()` all returned no violations — the property-name exclusion added for the `config.Date` false positive also swallowed globals reached through a namespace | code review r2 | `pre-merge` | `overcorrection` | ✅ globals resolved through globalThis/window/self/global before matching |
| 45 | 2026-08-23 | PR #76 / IS #75 | `code-only` | Parse errors ignored: `createSourceFile` returns an empty tree rather than throwing, so one stray backtick made the guard return `[]` for a module with a real supabaseAdmin import and `Date.now()` | code review r2 | `pre-merge` | `missing-gate` | ✅ a parse failure is itself a violation, and names the diagnostic |
| 46 | 2026-08-23 | PR #76 / IS #75 | `code-only` | `new Date(parsedAt)` was flagged as a clock read though it is deterministic parsing — the exact form the six parser modules need. Only escape was `forbidClock: false`, which also permits `Date.now()`, so module one would have disabled clock detection wholesale | code review r2 | `pre-merge` | `incomplete-guard` | ✅ argument-aware: `new Date()`/`Date.now()`/`Date(...)` flagged; `new Date(x)`/`parse`/`UTC` not |
| 47 | 2026-08-23 | PR #76 / IS #75 | `code-only` | Header claimed "exhaustive by construction" for the whole helper; true of the import walk (closed set of node kinds), false of the globals half, which is name matching | code review r2 | `pre-merge` | `imprecise-claim` | ✅ the two halves now documented separately with their real guarantees |
| 48 | 2026-08-23 | PR #76 / IS #75 | `code-only` | Two fixtures tested nothing: one fetch case was byte-identical to the one above it, and the shadowing fixture never used its parameter — so a used shadow firing was undocumented | code review r2 | `pre-merge` | `imprecise-claim` | ✅ duplicate replaced; used-shadow pinned as an accepted false positive |
| 49 | 2026-08-23 | PR #76 / IS #75 | `code-only` | Globals reached through a namespace were caught only in call position: `const f = globalThis.fetch` and `const D = globalThis.Date` returned `[]` — the r2 fix resolved namespaces inside call shapes but left the blanket property-access exclusion in place | code review r3 | `pre-merge` | `incomplete-guard` | ✅ `denotedGlobal()` resolves any expression; deny unless deterministic |
| 50 | 2026-08-23 | PR #76 / IS #75 | `code-only` | `const n = Date.now; n()`, `fetch.call(...)` and `fetch.bind(...)` all returned `[]` — the exclusion added so `Date.parse`/`Date.UTC` would not fire also dropped every property alias of a bare global | code review r3 | `pre-merge` | `overcorrection` | ✅ same replacement; allowlist is now the two deterministic members, not an exclusion |
| 51 | 2026-08-23 | PR #76 / IS #75 | `code-only` | `type P = import("@/lib/db").Post` bypassed the import policy — it is a TYPE node, so the walk over declaration kinds never reached it, falsifying the header's "closed set of four node kinds" claim on the half that had been quiet for three rounds | code review r4 | `pre-merge` | `imprecise-claim` | ✅ handled, and closure now asserted by a `ts.SyntaxKind` enumeration test rather than in prose |
| 52 | 2026-08-23 | PR #76 / IS #75 | `code-only` | `ElementAccessExpression` was never visited: `globalThis["fetch"]` missed, and `Date["parse"]` reported a spurious clock read because the whole access went unjudged and the bare `Date` inside it was judged alone | code review r4 | `pre-merge` | `incomplete-guard` | ✅ `x["y"]` resolved the same as `x.y`, both directions tested |
| 53 | 2026-08-23 | PR #76 / IS #75 | `code-only` | Wrappers TypeScript erases (parens, `!`, `as`) were not unwrapped before resolution, so `(globalThis).fetch` and `new (Date)()` escaped | code review r4 | `pre-merge` | `incomplete-guard` | ✅ `unwrap()` + `effectiveParent()` applied before resolving and when finding the enclosing node |
| 54 | 2026-08-23 | PR #76 / IS #75 | `code-only` | Type declarations named Date reported clock reads: `interface Date`, `type Date = ...`, `class C implements Date`, `export * as Date from` | code review r4 | `pre-merge` | `incomplete-guard` | ✅ added to the type/declaration exclusions |
| 55 | 2026-08-23 | n/a | `process-log` | The `Where` column rule gave the format as `PR #<n> / IS #<n>` and then said "the PR number needs no prefix" — meaning no `IS` prefix, but read as no prefix at all. 27 consecutive rows were written `74 / IS #55`, breaking the one convention the column exists to serve | user spotted it | `merged` | `stale-doc` | ✅ rows corrected; rule rewritten to state both prefixes explicitly with a worked example |
| 56 | 2026-08-29 | PR #77 / IS #56 | `code-only` | NFD input silently defeated negation detection — 9 of 11 tokens contain `ä`, so `detectNegation("Inställt idag".normalize("NFD"))` returned false. Apple devices emit NFD, so much of the Mailgun lane arrives that way; a genuine cancellation would be missed with nothing reporting it | code review r1 | `pre-merge` | `missing-gate` | ✅ `normalize("NFC")` as step 0's first operation; asserted through the composition of both modules |
| 57 | 2026-08-29 | PR #77 / IS #56 | `code-only` | Emoji were replaced with `""`, so an emoji used as a separator glued words: `"Järntorget🌮11-14"` → one token neither the dictionary nor the time extractor can read | code review r1 | `pre-merge` | `incomplete-guard` | ✅ replaced with a space; the whitespace collapse already followed |
| 58 | 2026-08-29 | PR #77 / IS #56 | `code-only` | `String.replace` scans the original string, so a lookbehind saw characters an earlier match had removed: `#gbg#foodtruck` left `#foodtruck`. Run-together tags are normal Instagram usage. The idempotence test passed only because its fixture had no adjacent tags | code review r1 | `pre-merge` | `incomplete-guard` | ✅ strip to a fixpoint; idempotent by construction, and `#`/`@` given rules matching how each collides with text |
| 59 | 2026-08-29 | PR #77 / IS #56 | `code-only` | The parser purity glob used a flat `readdirSync`, so a module in a subdirectory would escape it while the suite stayed green — undercutting the inheritance claim made for #57/#58/#65/#66/#67 | code review r1 | `pre-merge` | `incomplete-guard` | ✅ recursive walk; mutation-verified with `rules/nested.ts` |
| 60 | 2026-08-29 | PR #77 / IS #56 | `code-only` | `inte`/`ej` were treated as cancellation words, but they are general negation PARTICLES — six realistic captions describing an OPEN truck fired, each deleting that truck's pin ("Glöm inte att vi står på Heden!", "Vi tar ej kort") | code review r2 | `pre-merge` | `incomplete-guard` | ✅ markers separated from particles; particles fire only adjacent to an operating verb or open state |
| 61 | 2026-08-29 | PR #77 / IS #56 | `code-only` | No double-negative handling: "Vi har inte stängt, vi står på Heden" fired on `stängt` independently of the `inte` in front of it | code review r2 | `pre-merge` | `incomplete-guard` | ✅ a particle immediately before a marker suppresses it |
| 62 | 2026-08-29 | PR #77 / IS #56 | `code-only` | The r1 fix allowing `.` in the tag body (for `@gbg.foodtruck`) made hashtags swallow the following word: `"#gbg.Heden idag 11-14"` → `"idag 11-14"`, deleting the location the caption was about | code review r2 | `pre-merge` | `overcorrection` | ✅ hashtag and mention bodies split — IG tags terminate at a dot, handles do not |
| 63 | 2026-08-29 | PR #77 / IS #56 | `code-only` | Module comment claimed tag text "says nothing about where the truck is" — false for Instagram captions, and the false premise hid a real cost: `"Idag står vi på #Järntorget"` loses its location entirely | code review r2 | `pre-merge` | `imprecise-claim` | ✅ behaviour kept (spec-mandated), cost stated and flagged for #65 |
| 64 | 2026-08-29 | PR #79 / IS #78 | `code-only` | Preserving tag text put a letter directly before a following `@`, so MENTION's email lookbehind refused to match and `"Lunch #gbg@foodtruckgbg"` kept the handle. The fixpoint could not recover it — the blocking character is real text | code review r1 | `pre-merge` | `incomplete-guard` | ✅ trailing space emitted, but only where an `@` follows |
| 65 | 2026-08-29 | PR #79 / IS #78 | `code-only` | The first fix for #64 — always emit a trailing space — split `"#11.30-13.00"` into `"11 .30-13.00"`, cutting a time range in half. Caught by probing before committing, not by the test suite | writing the fix | `pre-commit` | `overcorrection` | ✅ made conditional; leftover handle is noise, destroyed time is data loss |
| 66 | 2026-08-29 | PR #79 / IS #78 | `code-only` | `_` was allowed in the tag body but was not a segmentation boundary, so `#lunch_järntorget` stayed glued — the same grey-marker failure the issue existed to fix, with the boundary explicitly marked | code review r1 | `pre-merge` | `incomplete-guard` | ✅ underscore splits |
| 67 | 2026-08-29 | PR #79 / IS #78 | `code-only` | Unconditional digit→letter split detached Swedish street entrance letters: `#Nordostpassagen61B` → `"61 B"`, so one address parsed differently as a tag than as prose | code review r1 | `pre-merge` | `incomplete-guard` | ✅ split requires a word, not a single letter, to follow |
| 68 | 2026-08-29 | → IS #80 | `code-only` | A cancellation marker carries no notion of WHICH day it cancels, so `"Heden 11-14 idag, stängt på söndag"` deletes today's location. Pre-existing on `dev`; #78 widened it to tags. Neither #56 nor #78 considered that `detectNegation` reads the same string the tag change was made for | code review r1 | `merged` | `incomplete-guard` | ⏳ issue #80 filed; needs extractDate, so it lands downstream |
| 69 | 2026-08-29 | n/a | `process-log` | Rows 56–68, written on 2026-08-29 after the session resumed, were dated 2026-08-23 — the previous working day's date, carried forward instead of read. The date was available the whole time | user spotted it | `merged` | `unverified-assumption` | ✅ rows 56–68 corrected |
| 70 | 2026-08-29 | n/a | `process-log` | The fix for #69 rewrote ALL 41 session rows to 2026-08-29, corrupting the 28 (rows 28–55) that were already correct — the session spans two days and the correction assumed one | user asked for the dates to be confirmed against PR/issue timestamps | `pre-commit` | `overcorrection` | ✅ rows 28–55 restored to 2026-08-23; boundary verified against GitHub createdAt |
| 71 | 2026-08-29 | PR #79 / IS #78 | `code-only` | `#` was matched mid-word, so `"info#1@foodtruck.se"` was read as a tag and the trailing space before `@` let the mention rule eat the domain, leaving `"info 1"` | code review r2 | `pre-merge` | `incomplete-guard` | ✅ `#` now requires a non-word char in front, matching `@` |
| 72 | 2026-08-29 | PR #79 / IS #78 | `code-only` | The fix for #71 broke run-together tags, and the reasoning that it would not — "the fixpoint reaches the second `#` later" — was asserted, not tested. The replacement leaves a letter in front of it, so the string sits at a WRONG fixpoint | probing before commit | `pre-commit` | `unverified-assumption` | ✅ trailing space emitted before `#` as well as `@`; both parts documented as required |
| 73 | 2026-08-29 | PR #79 / IS #78 | `code-only` | First version of that lookbehind used `\p` inside a template literal, which collapses to `p` — the class matched literal letters and blocked nothing. Neighbouring patterns in the same file use `\p` | probing before commit | `pre-commit` | `unverified-assumption` | ✅ escaped; the probe showed the email still unprotected, which is what exposed it |
| 74 | 2026-08-29 | PR #79 / IS #78 | `code-only` | Segmentation could not split an acronym glued to a word (`#GBGJärntorget`), so the documented "all-lowercase" limit was narrower than reality | code review r2 | `pre-merge` | `imprecise-claim` | ✅ uppercase-run rule added ahead of the camelCase rule |
| 75 | 2026-08-29 | → IS #81 | `code-only` | `detectNegation` fires on invitations (`"Glöm inte öppet idag"`) and menu negations (`"Vi kör inte pizza idag men tacos"`) — verified in PROSE on dev, so PR #79's tag change widens it rather than causing it. #80 does not cover either | code review r2 | `merged` | `incomplete-guard` | ⏳ issue #81 filed; documenting it in r1 is what let it return in r2 |
| 76 | 2026-08-29 | PR #82 / IS #81 | `code-only` | The AUXILIARIES branch fired on delayed openings: `"Vi är inte öppna förrän 12"` deletes the pin of a truck that opens at 12. The verb form was already excluded, but only as a side effect of keeping `stänger` out of OPERATING_VERBS — the copula form had no equivalent guard | code review r1 | `pre-merge` | `incomplete-guard` | ✅ trailing guard rejects `förrän`/`innan`/`före` after the state |
| 77 | 2026-08-29 | PR #82 / IS #81 | `code-only` | Requiring the auxiliary to touch the particle missed Swedish V2 inversion — `"Idag är vi inte öppna"`, the most idiomatic phrasing — so the whole inverted family regressed from cancel to quiet, untested | code review r1 | `pre-merge` | `incomplete-guard` | ✅ pronouns/auxiliaries/sentence adverbs may sit between the licensing context and the particle |
| 78 | 2026-08-29 | PR #82 / IS #81 | `code-only` | Clause boundaries were only `.` and `,`, so `"- Ej öppet idag"`, `"• Ej öppet idag"` and `"(Ej öppet idag)"` were quiet — line-per-clause with a leading marker is the dominant caption shape | code review r1 | `pre-merge` | `incomplete-guard` | ✅ dashes, bullets, brackets, quotes and the ellipsis added at both clause ends |
| 79 | 2026-08-29 | PR #82 / IS #81 | `code-only` | A quantifier between particle and time dropped unambiguous cancellations: `"Vi kör inte alls idag"`, `"Vi kör inte hela veckan"` | code review r1 | `pre-merge` | `incomplete-guard` | ✅ `alls`/`hela`/`nästa`/`denna`/`kommande` may intervene; an object still may not |
| 80 | 2026-08-29 | PR #82 / IS #81 | `code-only` | The PR claimed the new allowlists covered the grammar; four separate recall families were missing and none was tested. The claim was about direction (fail-safe) and was read as though it were about coverage | code review r1 | `pre-merge` | `imprecise-claim` | ✅ each family now pinned by test; the line-break limit stated rather than implied |
| 81 | 2026-08-29 | PR #82 / IS #81 | `code-only` | The r1 `förrän` guard inspected only the token after the open-state, so a time word between defeated it: `"Vi har inte öppet idag förrän 13"` cancelled and deleted the pin of a truck opening at 13 | code review r2 | `pre-merge` | `incomplete-guard` | ✅ replaced with a clause-level check covering every word order |
| 82 | 2026-08-29 | PR #82 / IS #81 | `code-only` | `VERB_THEN_NEGATOR` had no delayed-opening guard at all — `"Vi öppnar inte idag förrän 13"` cancelled. The comment claiming the verb form was "already excluded" held only for `stänger`, and only as a side effect | code review r2 | `pre-merge` | `imprecise-claim` | ✅ same clause-level check covers both rules |
| 83 | 2026-08-29 | PR #82 / IS #81 | `code-only` | The r1 trailing constraint killed the whole `"Ej öppet <reason>"` family (pga sjukdom, tyvärr, på Heden idag) while buying only the `"öppet för barn"` restriction the left-hand allowlist already handled | code review r2 | `pre-merge` | `overcorrection` | ✅ narrowed to a `för`-restriction guard, exempting `för dagen` |
| 84 | 2026-08-29 | PR #82 / IS #81 | `code-only` | Both suppressors ran over the whole caption, so one suppressed sentence silenced every other: `"Ej öppet idag. Vi ses inte förrän imorgon"` returned false | writing a test for the new suppressor | `pre-commit` | `incomplete-guard` | ✅ evaluation split per sentence; `^`/`$` now mean the sentence |
| 85 | 2026-08-29 | PR #82 / IS #81 | `code-only` | `längre`/`riktigt` were listed in the PRE-particle filler slot though Swedish puts them after it, so they licensed only ungrammatical orders while `"Vi har inte längre öppet"` stayed missed | code review r2 | `pre-merge` | `incomplete-guard` | ✅ separate post-particle slot |
| 86 | 2026-08-29 | PR #82 / IS #81 | `code-only` | Weekdays listed as bare stems, so `"på söndag"` matched but `"på söndagen"`/`"på söndagarna"` did not — an inconsistency inside one list, next to helg/vecka which DID carry definite forms | code review r2 | `pre-merge` | `incomplete-guard` | ✅ inflection suffixes in the pattern |
| 87 | 2026-08-29 | PR #82 / IS #81 | `code-only` | r2's per-sentence split moved `NEGATED_MARKER` into the per-clause path, so a denial no longer reached a claim in an earlier sentence: `"Många frågar om vi har stängt. Vi har inte stängt…"` cancelled, reintroducing the module's own listed example | code review r3 | `pre-merge` | `overcorrection` | ✅ scope chosen per suppressor — the double negative reads the caption, the delayed-opening veto reads the sentence |
| 88 | 2026-08-29 | PR #82 / IS #81 | `code-only` | The delayed-opening veto also vetoed `MARKER`, which a delayed opening cannot masquerade as, and its span crossed commas — so `"Stängt idag, vi öppnar inte förrän måndag"` and `"Ej öppet idag, vi ses innan helgen"` lost their cancellations | code review r3 | `pre-merge` | `overcorrection` | ✅ markers judged before the veto; span stops at a comma |
| 89 | 2026-08-29 | PR #82 / IS #81 | `code-only` | The verb rule constrained only the right of the particle, so the menu-item class the issue exists to close still fired with the object fronted: `"Tacos finns inte idag, men pizza gör det"` | code review r3 | `pre-merge` | `incomplete-guard` | ✅ subject-side allowlist, symmetric with the state rule |
| 90 | 2026-08-29 | PR #82 / IS #81 | `code-only` | `"öppet hus"` is a fixed expression naming an event, not the state of being open — `"Vi har inte öppet hus idag men vi kör som vanligt"` cancelled a truck that is there | code review r3 | `pre-merge` | `incomplete-guard` | ✅ compound excluded |
| 91 | 2026-08-30 | PR #83 / IS #57 | `issue` | The issue prescribed "timezone handling via `date-fns-tz`" and its handoff comment instructed adding that package to the purity allowlist as "the one thing you must do". `extractDate` needs no date library: it maps a calendar date to a calendar date, never an instant to a wall clock, so no timezone enters. Following the prescription would have meant anchoring the date to an invented time of day — which is where the DST bugs are, not where they are avoided | writing the module and asking what the conversion would actually convert | `pre-commit` | `stale-doc` | ✅ diverged; reasoning in `date.ts`'s header and on the allowlist line, which gained `@/lib/parser/date` instead |
| 92 | 2026-08-30 | PR #83 / IS #57 | `code-only` | `"Förra fredagen var kul"` resolved to the COMING Friday, six days forward. The module documents "always resolves forward, never into the past" as an invariant, and the only thing enforcing it was omitting `s` from the inflections — which covers `i <weekday>s` and nothing else. `förra`/`senaste`/`sista` take the ordinary definite form | code review r1 | `pre-merge` | `incomplete-guard` | ✅ `BACKWARD_MODIFIERS`, scoped to the weekday branch and one adjacent word |
| 93 | 2026-08-30 | PR #83 / IS #57 | `code-only` | `WEEKDAYS.indexOf` was unchecked for `-1` and an `as` cast hid that from `tsc`. The `iu` regex matches by Unicode case folding while the lookup is exact equality, so `"tiſdag"` (U+017F) matched, missed, and the modulo turned `-1` into a plausible WRONG day — Sunday for a caption naming Tuesday | code review r1 | `pre-merge` | `unverified-assumption` | ✅ `-1` checked, cast removed; falls back to `parsedAt` |
| 94 | 2026-08-30 | PR #83 / IS #57 | `code-only` | `date.test.ts` asserted a weekday compound must not match and framed it as the `\b`-is-wrong-for-Swedish lesson. Two separate claims: the boundary mechanism is right, but whether `"lördagsöppet"` SHOULD resolve to Saturday was undecided and the test read as having decided it | code review r1 | `pre-merge` | `imprecise-claim` | ✅ split; gap listed under KNOWN LIMITS, test says what it pins |
| 95 | 2026-08-30 | PR #83 / IS #57 | `code-only` | PR body claimed `extractDate` returns the post's own day while a negation names Sunday, unblocking #80. True only when the tag TRAILS — a leading `#StängtPåSöndag` supplies the date under first-match-wins. The claim was verified on one caption order and generalised to both | code review r1 | `pre-merge` | `unverified-assumption` | ✅ both orders asserted; PR body corrected in a comment; handed to #80 as a test to flip |
| 96 | 2026-08-30 | PR #83 / IS #57 | `code-only` | `sista` in the r1 backward guard is the one member with an ordinary FORWARD reading — "Sista fredagen i månaden kör vi" is a recurring monthly slot. r1 suppressed it and returned the posting day, turning a correct future date into a wrong pin TODAY | code review r2 | `pre-merge` | `overcorrection` | ✅ removed; list's bar restated as "cannot point forwards", not "could point backwards" |
| 97 | 2026-08-30 | PR #83 / IS #57 | `code-only` | The r1 lookbehind had no left word boundary, so it matched the SUFFIX of a longer word ("Nästsista fredagen") — the unbounded-token class `BEFORE`/`AFTER` exist to prevent everywhere else in the module, while the guard's own comment claimed it spanned one word | code review r2 | `pre-merge` | `imprecise-claim` | ✅ nested boundary inside the lookbehind |
| 98 | 2026-08-30 | PR #83 / IS #57 | `code-only` | The r1 test named "scopes the backward guard to weekdays only, and to one word" asserted neither claim. Both fixtures separated modifier from date word by a clause, so it tested non-adjacency twice; hoisting the lookbehind over the whole alternation left it green. Mutation-verified by the reviewer | code review r2 | `pre-merge` | `missing-gate` | ✅ split into three mutation-verified tests — adjacency, whole-word, branch-scope |
| 99 | 2026-08-30 | PR #83 / IS #57 | `process` | Ran three mutations to verify the r2 tests and reported them from the console output without checking the mutation had APPLIED. Two of three silently no-op'd on a string mismatch, and both read as green — the same vacuous-pass the mutations were run to rule out | re-reading the output before trusting it | `pre-commit` | `unverified-assumption` | ✅ mutation helper now exits 9 when the pattern is absent |
| 100 | 2026-08-30 | PR #83 / IS #57 | `code-only` | Replacing `sista` invalidated the r2 whole-word fixture in the same commit: "Nästsista fredagen" no longer contains a listed modifier, so it passed against the unbounded lookbehind too. A vacuous fixture introduced while fixing a vacuous test | mutation B failing to fail | `pre-commit` | `overcorrection` | ✅ fixture is now "Allrasenaste fredagen", on a weekday ≠ parsedAt |
| 101 | 2026-08-30 | PR #84 / IS #58 | `CLAUDE.md` | `CLAUDE.md` names `project-context.md` as "full project reference" and never mentions `.claude/plans/` at all, so #58 was researched from the context alone. The context is only reconciled at the END of a phase (a tracked task — IS #73), so mid-phase it describes the phase before; the plan carries the settled decisions and the numbered decision records. User had to state the precedence out loud | user, mid-task | `crossed-phase` | `stale-doc` | ✅ `CLAUDE.md` now names the plan, states plan-wins, and says why |
| 102 | 2026-08-30 | PR #84 / IS #58 | `code-only` | The test named "takes the first VALID range" used `"89-119"`, which the trailing digit guard rejects before the numeric hour check ever runs — so it passed identically with and without the guard it claimed to cover. The hour check had no test at all | mutation testing (the mutant survived) | `pre-commit` | `missing-gate` | ✅ fixture is `"Korv 61-63 kr, öppet 11-14"`; mutant now dies |
| 103 | 2026-08-30 | PR #84 / IS #58 | `code-only` | The hour check looked redundant with the `isNaN` guard in `toInstant` and was nearly deleted on that basis. `fromZonedTime` ACCEPTS `T24:00:00` and silently resolves it to midnight at the start of the same day — so `"24-01"` would have become a window on the PREVIOUS day rather than no window | investigating why the mutant survived | `pre-commit` | `unverified-assumption` | ✅ both roles documented on the function; `"24-01"` pinned |
| 104 | 2026-08-30 | PR #84 / IS #58 | `code-only` | The trailing digit guard rejected any `.` or `:`, so a time at the end of a sentence matched nothing: `"Öppet 11-14."` returned null, and `"Öppet kl 11-14. Välkomna"` degraded silently to a marked start with the stated close dropped. 47 tests passed because not one put punctuation after a time | code review r1 | `pre-merge` | `incomplete-guard` | ✅ `(?![.:]?\d)` / `(?<!\d[.:]?)`; six punctuation shapes now fixtured |
| 105 | 2026-08-30 | PR #84 / IS #58 | `code-only` | The module asserted in a comment that a dash-joined pair of valid hours is a shape "prose numbers essentially never form". False — `"Burgare 10-20 kr"`, `"5 - 10 platser"`, `"2-3 rätter"` all fabricate a serving window. The existing fixtures passed only because their numbers exceeded 23 | code review r1 | `pre-merge` | `imprecise-claim` | ✅ `TRAILING_UNITS` skip; claim rewritten; the house-number residual pinned as a test |
| 106 | 2026-08-30 | PR #84 / IS #58 | `code-only` | A marked start was tagged `kind: 'range'`, which the confidence matrix scores 1.0 — so a caption giving only an opening time outranked one giving a complete window. `endsAt === null` could not be used to tell them apart, because a DST-dropped range end looks identical | code review r1 | `pre-merge` | `incomplete-guard` | ✅ `kind: 'start'` added, widening the type #58 specified |
| 107 | 2026-08-30 | PR #84 / IS #58 | `process` | The leading-guard half of the #104 fix SURVIVED the mutation run — it was correct and load-bearing (`"kl.11-14"`) but had no test, so reverting it broke nothing. A fix shipped in the same commit as its sibling, and only the sibling was covered | mutation testing | `pre-commit` | `missing-gate` | ✅ `"kl.11-14"` fixtured; mutant now dies |
| 108 | 2026-08-30 | PR #84 / IS #58 | `code-only` | Silent truncation had three separate causes, and r1 fixed only one. `"Vi kör från 11 till 14"` and `"Öppet kl 11 - kl 14"` returned a confident start with the stated close discarded — when a range form is unrecognised, `MARKED_START` still matches the opening time | realistic-caption sweep after r1 | `pre-merge` | `incomplete-guard` | ✅ `till`, `mellan … och`, repeated `kl`; the shape named in the module |
| 109 | 2026-08-30 | PR #84 / IS #58 | `code-only` | `TRAILING_UNITS` only catches a price that NAMES its unit, so the comma form went unguarded: `"Burgare 10-20, öppet 11-14"` fabricated 08:00–18:00 on position alone | realistic-caption sweep after r1 | `pre-merge` | `incomplete-guard` | ✅ `TIME_CONTEXT` preference — orders valid candidates, never removes one |
| 110 | 2026-08-30 | PR #84 / IS #58 | `code-only` | The test for the `och` separator used `"…14 sorters korv"`, and `"sorters"` is itself in `TRAILING_UNITS` — the units guard rescued the fixture, so it passed with `och` fully enabled as a separator | mutation testing | `pre-commit` | `missing-gate` | ✅ fixture ends in a word no other guard knows |
| 111 | 2026-08-30 | PR #84 / IS #58 | `code-only` | The comment on `RANGE_SEPARATOR` claimed the surrounding `\s+` is what stops `"tillbaka"` joining two numbers. It is not — `CLOCK` rejects that for needing a digit, and the fixture passes with `\s*` too. The spacing decides only the run-together form `"11till14"` | mutation testing | `pre-commit` | `imprecise-claim` | ✅ comment corrected to what the code does; `"11till14"` asserted |
| 112 | 2026-09-06 | PR #84 / IS #58 | `code-only` | `purity.test.ts` predicted that #67 "composes the two and should need nothing new". `parseCaption()` returns `ParseResult`, which lives in `types.ts` — so #67 always needed an allowlist entry, and #62 hit it first only by landing earlier | writing #62 against the allowlist | `merged` | `imprecise-claim` | ✅ prediction replaced with the actual reason `@/lib/types` is listed |
| 113 | 2026-09-06 | → IS #62 | `issue` | IS #62 names 12 seed locations and then requires 15–20 entries. The 3–8 unnamed ones had to be invented — which is exactly the unverified guessing decision #4 exists to minimise, arrived at by arithmetic rather than by decision | seeding, when the named list ran out | `pre-commit` | `imprecise-claim` | ✅ 4 extra hubs chosen and named in PR #86 for review; Volvo Torslanda rejected for having no honest pin |
| 114 | 2026-09-06 | PR #86 / IS #62 | `plan` | All 16 `address` values were the string the seeder ASKS Nominatim for, not the `display_name` it returns — shortened for readability without checking what the field feeds. The plan (line 388) makes it `address_geocoded`, the same column the geocode fallback fills with `display_name`, so a dictionary hit and a fallback hit would have rendered differently in one UI field | code review | `pre-merge` | `unverified-assumption` | ✅ `display_name` committed verbatim; the two branches now agree |
| 115 | 2026-09-06 | PR #86 / IS #62 | `code-only` | "re-running that script reproduces it" was asserted in the module header AND repeated in the PR description, while being false for 16/16 entries. One `node scripts/seed-dictionary.mjs \| diff` would have shown it; the claim was written as rhetoric and never run | code review | `pre-merge` | `imprecise-claim` | ✅ claim is now true and the header says how to check it |
| 116 | 2026-09-06 | PR #86 / IS #62 | `code-only` | A trailing `--only` read `undefined` off argv, which is falsy, so the filter was skipped and the "no seed matches" guard never fired: one requested lookup silently became 16 requests to a free service | code review | `pre-merge` | `missing-gate` | ✅ rejected with a usage message and exit 1; all four `--only` paths exercised |
| 117 | 2026-09-06 | PR #86 / IS #62 | `code-only` | The alias-collision test folded case but compared EQUALITY, while `extractLocation` (#65) will match an alias inside a caption — so containment, the shape that will actually collide, passed silently | code review | `pre-merge` | `incomplete-guard` | ✅ containment checked across entries, still allowed within one entry |
| 118 | 2026-09-06 | PR #86 / IS #62 | `code-only` | `DICTIONARY` was a mutable module-level array in a long-lived server; a matcher wanting longest-alias-first would reach for in-place `.sort()` and corrupt it for every later request | code review | `pre-merge` | `missing-gate` | ✅ `readonly` on the array and on `DictionaryEntry`; tsc rejects both sorts |
| 119 | 2026-09-06 | PR #86 / IS #62 | `code-only` | The parser purity guard is not transitive, and `@/lib/types` was the first allowlisted module outside the globbed directory. `Date.now()` appended to `types.ts` left the parser suite green at 6/6 — the plan's "verified by test" criterion had silently become a claim about one hop | code review r2 | `pre-merge` | `incomplete-guard` | ✅ `types.test.ts` asserts both `types.ts` and the generated `database.types.ts`; the non-transitivity and the obligation are now stated in `purity.test.ts` |
| 120 | 2026-09-06 | PR #86 / IS #62 | `code-only` | `readonly` was applied to `id` and `match` only, while the adjacent comment claimed the whole interface was covered. `DICTIONARY[0].lat = 0` and `.verified = true` both compiled clean — a partial `readonly` reads as protected while leaving the mutation open | code review r2 | `pre-merge` | `imprecise-claim` | ✅ every field `readonly`; guarantee stated per-field rather than in prose |
| 121 | 2026-09-06 | PR #86 / IS #62 | `code-only` | The r1 fix to `--only` enumerated the one mistake that had been noticed. `--only=heden`, a bare `heden` and `--only ""` all still fell through to the unfiltered list and fired 16 requests | code review r2 | `pre-merge` | `incomplete-guard` | ✅ recognise-everything-reject-anything-else; seven argument forms exercised |
| 122 | 2026-09-06 | PR #86 / IS #62 | `code-only` | `printEntry` hardcodes `source: "nominatim"` / `verified: false`, so the script's own documented "re-run and diff" workflow would silently revert any hand-corrected `manual` pin — the entries `types.ts` explicitly says must not be clobbered | code review r2 | `pre-merge` | `missing-gate` | ✅ output banner warns against a wholesale paste |
| 123 | 2026-09-06 | PR #86 / IS #62 | `code-only` | Aliases were not asserted NFC while `normalizeCaption` NFC-composes every caption, so an NFD alias — rendering identically in every editor — could never match while passing every other invariant. 10 of 16 entries carry a diacritic | code review r2 | `pre-merge` | `missing-gate` | ✅ per-entry NFC assertion; NFD mutant killed |
| 124 | 2026-09-06 | PR #86 / IS #62 | `code-only` | The PR body claimed `dictionary.test.ts` had 130 tests; it registers 116. The 130 was read off a MUTATED run — the 21-entry mutation adds 5 entries and therefore 30 per-entry tests | code review r2 | `pre-merge` | `imprecise-claim` | ✅ body corrected with a note naming the cause |
| 125 | 2026-09-06 | → IS #59 | `issue` | The #59 handover specified `FORBID_ALL_IMPORTS` for the purity guard because "sources.ts needs nothing at all", while the same issue specifies both functions as typed against `Post["source"]`/`Location["source"]` from `@/lib/types` — an import. The two halves contradicted each other | writing the module against the handover | `pre-commit` | `imprecise-claim` | ✅ `allowOnly(["@/lib/types"])`; the contradiction and its resolution recorded in the test |
| 126 | 2026-09-06 | PR #88 / IS #59 | `code-only` | Three parallel literal lists (`ALL_PLATFORMS`, the `it.each` expectation table, the `Record`) with a compile-time link only to the first. A 7th platform added to the union, the `Record` and `ALL_PLATFORMS` — every step forced by a compile error — but mapped to a WRONG-BUT-VALID lane left the table at six rows and the suite green at 15/15 | code review | `pre-merge` | `incomplete-guard` | ✅ parallel lists removed; `AssertCovered` anchored to the expectation table, iteration lists projected from it |
| 127 | 2026-09-12 | PR #89 / IS #65 | `issue` | #65 specifies `extractLocation(normalized): DictionaryEntry \| null`. That signature cannot produce a value the PLAN requires: `address_raw` is defined as "the matched caption substring", and the entry alone carries only `match[0]`, the canonical alias. The issue and the plan contradict each other and the issue is the wrong one | writing the module against the handover | `pre-commit` | `imprecise-claim` | ✅ widened to `LocationMatch { entry, matched }`; recorded on #66 and #67 |
| 128 | 2026-09-12 | PR #89 / IS #65 | `process` | Authoring a source file through a QUOTED bash heredoc silently halved every backslash. A JS string literal written as `"(?<![\\p{L}\\p{N}])"` landed on disk as `"(?<![\p{L}\p{N}])"`, which JS reads as `(?<![p{L}p{N}])` — a regex that compiles fine and matches the wrong thing, with no error anywhere. It was noticed only because a SECOND corruption in the same file (`\\-` collapsing to a `-` range inside a character class) happened to throw at module load. Repeated a third time while writing this very row, in `node -e` | `vitest`, on an unrelated symptom | `pre-commit` | `unverified-assumption` | ✅ source carrying escapes goes through Write/Edit, never a heredoc or `node -e` |
| 129 | 2026-09-12 | PR #89 / IS #65 | `code-only` | `escapeRegex` escaped `-` as `\-`, which is an INVALID identity escape outside a character class under the `u` flag — a `SyntaxError` at module load, not a redundant backslash. The first hyphenated dictionary alias ("Hisings-Backa" is one entry away) would have taken down every importer of `location.ts`. The comment above it argued "escape everything punctuation-shaped, the cost is a redundant backslash" and named the hyphen as the function's reason to exist | code review | `pre-merge` | `unverified-assumption` | ✅ escapes only the SyntaxCharacters + `/`; `boundary.test.ts` added, building each case under `u` |
| 130 | 2026-09-12 | PR #89 / IS #65 | `code-only` | `address.ts` required `\p{L}{2,}` in front of a street suffix and its comment claimed this "keeps the bare common nouns out". It keeps out the BARE ones and nothing else: Swedish forms common nouns by exactly that compounding, so hållplatsen, parkeringsplatsen, lekplatsen, idrottsplatsen, arbetsplatsen, spårvägen, motorvägen, hemvägen and gågatan all returned as street addresses. Leftmost matching then made it worse than a false positive — "vi står vid hållplatsen på Kungsgatan 12" returned "hållplatsen" and discarded the address the caption stated outright | code review | `pre-merge` | `incomplete-guard` | ✅ a candidate now needs corroboration (house number or modifier); `ADDRESS` global, first corroborated match wins |
| 131 | 2026-09-12 | PR #89 / IS #65 | `code-only` | The house-number range guard was hand-written as `[-–.:]` while `time.ts` had `RANGE_SEPARATOR` = `[-–—]` plus `till`. The two lists disagreed ON THE DAY THE SECOND ONE WAS WRITTEN, so "Kungsgatan 11 till 14" and "Kungsgatan 11—14" yielded house number 11 while `extractTime` read 11:00–14:00 from the same digits — the exact double meaning the guard's own comment claimed to prevent. Its tests passed because they were written against the same wrong list | code review | `pre-merge` | `manual-drift` | ✅ `RANGE_SEPARATOR` + `NOT_IN_NUMBER_AFTER` exported from `time.ts` and imported; tests now run BOTH extractors over each caption |
| 132 | 2026-09-12 | PR #89 / IS #65 | `code-only` | r1's corroboration rule accepted "a house number OR a modifier", and the modifier half admitted the SAME class r0 was reported for: `stora`, `nya`, `lilla`, `nedre`, `andra` are ordinary Swedish adjectives, so "vi står vid stora torget på Kungsgatan 12" returned "stora torget" and — being leftmost — discarded the real address behind it. The r1 comment claimed the class was closed | code review r2 | `pre-merge` | `overcorrection` | ✅ modifier demoted from licensing to naming; one condition remains — a suffix-compound plus a house number |
| 133 | 2026-09-12 | PR #89 / IS #65 | `code-only` | r1's fix for the separator drift (#131) imported `RANGE_SEPARATOR` and reassembled the guard LOCALLY, without `REPEATED_MARKER`. So "Kungsgatan 11 - kl 14", "11 till kl 14", "11 - klockan 14" and "11-kl.14" were each claimed by BOTH extractors — the identical drift, produced by the fix for drift, one level in. Importing the pieces of a construction is not sharing the construction | code review r2 | `pre-merge` | `overcorrection` | ✅ `time.ts` exports `CLOCK_JOINER`, the whole joiner, used verbatim by `RANGE`; no assembly left for a consumer to get wrong |
| 134 | 2026-09-12 | PR #89 / IS #65 | `code-only` | r1's module comment asserted the corroboration rule kept the productive common nouns out. A house number re-admits every one of them — "gågatan 5", "spårvägen 3", "hållplatsen 5" — and the test table only ever exercised the UN-numbered form, so it agreed with the claim rather than testing it. Third instance in this PR of a guard whose sufficiency was argued rather than executed | code review r2 | `pre-merge` | `imprecise-claim` | ✅ limit asserted as current behaviour with a stop rule, not described as excluded |
| 135 | 2026-09-12 | PR #89 / IS #65 | `code-only` | The PR description still claimed "a house number is dropped when a range follows it — street alone still geocodes", which the r1 corroboration commit had made false in the same push. The module comment and the test were both correct; only the document a reviewer reads first was stale | code review r2 | `pre-merge` | `manual-drift` | ✅ description rewritten; noted that a PR body is a doc like any other and goes stale inside one PR |
| 136 | 2026-09-12 | PR #89 / IS #65 | `process` | Recommended merging after r2 on the strength of a stop rule I had just written. The stop rule governs WHICH KIND of finding justifies a round — it says nothing about whether the round's own changes get reviewed. r2 was the largest change set in the PR (a restructured regex, a changed predicate signature, a deleted alternation, an edit to merged `time.ts`) and was entirely unreviewed when I proposed merging. The user asked "not worth another review?" and r3 found three defects, two of them introduced by r2 | user pushed back on the recommendation | `pre-merge` | `unverified-assumption` | ✅ a round's own additions are reviewed before merge, however confident the round felt |
| 137 | 2026-09-12 | PR #89 / IS #65 | `code-only` | r2 deleted the genitive `s?` from `ADDRESS` on the reasoning "a genitive and a house number do not co-occur in Swedish, so nothing can reach it". FALSE — "Kungsgatans 12", "Södra Vägens 12", "Andra Långgatans 5" and "gågatans 5" all reach it and all returned null without it. Established by building both patterns and diffing their outputs, which is what should have preceded the deletion. The true statement is narrower and justifies nothing: those inputs are ungrammatical, not unreachable | self-check before r3, prompted by the user | `pre-merge` | `unverified-assumption` | ✅ restored; comment states the verified fact and the general form — "this branch is unreachable" is a claim about every input |
| 138 | 2026-09-12 | PR #89 / IS #65 | `code-only` | r2's simplification flattened r1's two street branches into `(?:\p{L}{2,})?SUFFIX`, and once a house number was the only licence that made every bare definite noun a candidate: "Vi står på torget 5 minuter från Kungsgatan 12" → "torget 5", discarding the real address. That is the SAME leftmost-masking class the r2 commit message claimed to have closed. The nine "rejects the bare common noun" test rows all used the un-numbered form, so the regression was invisible to them | code review r3 | `pre-merge` | `overcorrection` | ✅ bare suffix requires a modifier, enforced in one predicate with the number rule; numbered rows added |
| 139 | 2026-09-12 | PR #89 / IS #65 | `code-only` | The r2 lookahead is broader than what `extractTime` actually claims: `extractTime` rejects a range followed by a unit (`TRAILING_UNIT`), `address.ts` does not mirror it, so "Kungsgatan 12 - 45 portioner kvar" has BOTH extractors decline and the address is lost. Third consecutive round in which `address.ts` predicted one more piece of `time.ts`'s decision and missed the next | code review r3 | `pre-merge` | `incomplete-guard` | ✅ NOT patched — documented as current behaviour with a test; architectural fix (resolve the overlap in `parseCaption`, which holds both results) filed as IS #90 |
| 140 | 2026-09-12 | PR #89 / IS #65 | `code-only` | Two module comments went stale inside the r3 edit itself: the `STREET_MODIFIERS` limit still said "Danska Vägen 12 geocodes as Vägen 12" after the fix made it null, and the rule statement still read "one condition, nothing else" after r3 restored a second. Caught re-reading before commit. Same shape as #135, one commit later | pre-commit re-read | `pre-commit` | `manual-drift` | ✅ both corrected; re-reading every comment the diff touches is now part of the commit step, not the PR step |
| 141 | 2026-09-12 | PR #89 / IS #65 | `code-only` | r3's "a bare suffix needs a modifier" cannot work: "Södra Vägen" and "lilla vägen" are the SAME SHAPE, so the condition readmitted the r1 class in its numbered form — "lilla vägen 2 kvarter till Kungsgatan 12" → "lilla vägen 2", inventing a place and discarding the stated address. r3 tested only the un-numbered form, one paragraph after writing that a guard's other parameter value must be tested | code review r4 | `pre-merge` | `overcorrection` | ✅ bare-suffix form DELETED; `\p{L}{2,}` mandatory, rule has no exceptions. "Södra Vägen"/"Nya Allén" move to the dictionary |
| 142 | 2026-09-12 | PR #89 / IS #65 | `code-only` | r3 restored the genitive `s?` because r2's justification for deleting it was false. **A false justification does not make the conclusion false**, and r3 never evaluated the conclusion on its own merits. It does not survive: genitive + numeral is ordinary Swedish when the numeral counts what follows, so "spårvägens 5 till Kungsgatan 12" → "spårvägen 5" — a REGRESSION against the version r3 was correcting. It bought back only "Kungsgatans 12", which is not how Swedish writes an address | code review r4 | `pre-merge` | `overcorrection` | ✅ deleted again, on the merits this time; `location.ts` keeps its own, where a verified alias backs the match |
| 143 | 2026-09-12 | PR #89 / IS #65 | `code-only` | r3's "KNOWN COST" test credited `TRAILING_UNIT` but used "45 portioner" and "100 gäster" — neither reaches that filter (`firstValidRange` rejects 45 and 100 as clocks first, and neither word is in `TRAILING_UNITS`). The rows passed with `TRAILING_UNIT` deleted, confirmed by mutation, so the test pinned nothing AND the mis-attribution was load-bearing in the rationale for deferring to IS #90 | code review r4 | `pre-merge` | `imprecise-claim` | ✅ rows replaced with "12 - 14 kr" / "12 - 14 platser" / "10 - 12 rätter"; mutant verified dead before the test was believed |
| 144 | 2026-09-12 | PR #89 / IS #65 | `code-only` | Two review comments stated the purity guard's module count as 9 then 10. Both were off by one: vitest's TEST count includes the `finds parser modules to check` non-vacuity assertion, and I read it as the module count without checking. At merge the parser held 8 modules / 9 tests. Nothing in the guard is affected, but a count in a review comment is a claim like any other | counting the modules while adding `confidence.ts` | `merged` | `imprecise-claim` | ✅ corrected on the PR; module counts are read from the file list, never from the test count |
| 145 | 2026-09-12 | → IS #66 | `issue` | #66 specifies `ConfidenceInput` as two pairs of booleans — `hasLocation`/`locationFromFallback` and `hasExplicitTimeRange`/`hasLunchtid`. Each pair is mutually exclusive, so half their state space has no meaning, and the second pair CANNOT express `TimeKind`'s third value: `time.ts` widened the type to `range \| lunchtid \| start` in #58 and left the instruction for #66 in its own comment. Following the issue would have scored a marked start as either a full range or as no time | writing the module against the handover | `pre-commit` | `imprecise-claim` | ✅ two exact unions instead; a fourth `TimeKind` is now a compile error here. Recorded on #67 |
| 146 | 2026-09-12 | PR #91 / IS #66 | `code-only` | The fallback penalty reads as a constant −0.15 (1.0→0.85, 0.85→0.70, 0.60→0.45) and `base - 0.15` is the obvious implementation. In IEEE 754 `0.6 - 0.15` is `0.44999999999999996`, and the display threshold is `combined >= 0.45` with plan #3 placing that row exactly ON the line — so the computed form would drop every location-only fallback pin off the map silently. Caught by checking the arithmetic before choosing the shape, not after | float check while designing | `pre-commit` | `unverified-assumption` | ✅ exact literals in two tables; a test pins the reason so nobody "simplifies" it back |
| 147 | 2026-09-12 | PR #91 / IS #66 | `code-only` | `LOCATIONS`/`TIMES` used `as const satisfies readonly T[]` under a comment claiming they were "projected from the union, not typed out beside it — a parallel list is what process-log row 126 was about". They WERE typed out beside it: `satisfies` is a subset check, catching a typo and not an omission. Verified — a `"cached"` location, and an `"allday"` TimeKind scored 0.9 (inverting the ordering the same file asserts), both left tsc clean and 48/48 green. The comment cited row 126's lesson while reproducing it | code review | `pre-merge` | `incomplete-guard` | ✅ #88's `AssertCovered`, anchored to the expectation table; both mutations now fail the build naming the missing member |
| 148 | 2026-09-12 | PR #91 / IS #66 | `code-only` | The score lookup dispatched `location === "dictionary" ? DICT : FALLBACK`, so a third way of resolving a location would silently score as a geocode fallback — while the file's header claimed drift becomes a compile error. The claim was TRUE of the `time` axis (a `Record` over `TimeKind`) and FALSE of the `location` axis. A guarantee stated for a module that holds on only one of its two axes | code review | `pre-merge` | `imprecise-claim` | ✅ both axes are `Record` keys; `ResolvedLocation` derived from the input type so the two cannot disagree |
| 149 | 2026-09-12 | → IS #92 | `code-only` | `locations.confidence` is `float4` (0001:70) and float32 stores 0.45 as 0.44999998807907104, so a server-side `.gte("confidence", 0.45)` drops exactly the row plan #3 places ON the threshold. The module's own header defends against the identical bug in double arithmetic (`0.6 - 0.15`) — I defended one narrowing of the constant and missed the second, at persistence | code review | `pre-merge` | `incomplete-guard` | ✅ hazard pinned by test and documented at the 0.45 decision; IS #92 filed with three options and a recommendation (widen to float8) |
| 150 | 2026-09-12 | PR #91 / IS #66 | `code-only` | The "six documented rows" `it.each` title had two `%s` for three args, so verbose output printed the input object instead of the expected score — defeating the block's stated purpose, which is being readable against `project-context.md` | code review | `pre-merge` | `imprecise-claim` | ✅ expected value moved to the second tuple position |
| 151 | 2026-09-12 | PR #91 / IS #66 | `code-only` | r1's float4 comment and IS #92's body both stated flatly that `.gte("confidence", 0.45)` drops the threshold row. I ran `Math.fround` in JavaScript and wrote a conclusion about SQL. Review argues the opposite for that path — PostgREST sends an untyped literal, Postgres resolves it against the column type, both sides narrow identically and the row is returned — and Docker was unavailable, so that is unrun too | code review r2 | `pre-merge` | `imprecise-claim` | ✅ comment and issue now separate VERIFIED (the float32 representation) from NOT VERIFIED (what any query does); #92's first job is to determine it against a real database |
| 152 | 2026-09-12 | PR #91 / IS #66 | `code-only` | The "#92's scope is a checked claim" test `fround`ed raw MATRIX parser scores, but `locations.confidence` stores `parser_confidence × source_confidence` — so not one value it checked is one the column ever holds, and a retuned lane constant could put a second cell on the line with the test green. `.filter(...).every(...)` would also pass vacuously on an empty filter. The file already imported `sourceConfidence` twenty lines below for exactly this | code review r2 | `pre-merge` | `incomplete-guard` | ✅ enumerates the real products, asserts the straddling set BY NAME, and asserts the product count first so `.every()` cannot be vacuous |
| 153 | 2026-09-12 | PR #91 / IS #66 | `code-only` | r1 rewrote the header to describe the parallel-list bug and left `["dictionary", "fallback"] as const` hardcoded in the two ordering tests two blocks below it — the ONLY enforcement of `start <= lunchtid`, which `time.ts` states in prose alone. Verified: a `"cached"` variant wired into the union, `SCORES` and `MATRIX` (every step forced by a compile error) scored `start` above `lunchtid` and left tsc clean and those tests green, because they never iterated it | code review r2 | `pre-merge` | `incomplete-guard` | ✅ derived from the table; the same mutant now fails two ordering tests naming the variant |
| 154 | 2026-09-12 | PR #91 / IS #66 | `code-only` | Third consecutive round of one class, each time on the axis I was not looking at. r1 fixed exhaustiveness in the `Record`s and the table; r2 derived the LOCATION list in the ordering tests and left the TIME literals hardcoded in the same assertions. Verified: `"allday"` added to `TimeKind`, scored 0.9 (above `lunchtid`), with every `MATRIX` row `_timesCovered` forces, left tsc clean, eslint clean and 884 tests green | code review r3 | `pre-merge` | `incomplete-guard` | ✅ both axes given a DECLARED rank with its own `AssertCovered` — a new member cannot compile until it is placed, and misplacing it fails the ordering walk. Both halves mutation-verified |
| 155 | 2026-09-12 | PR #91 / IS #66 | `code-only` | The float4 comment and IS #92 said "safe today only because nothing queries it yet". `useMapLibre.tsx:39` already filters `l.confidence >= DISPLAY_THRESHOLD` with 0.45 written out a second time there — a CLIENT-SIDE comparison no query typing protects, and one the issue's SQL-only enumeration would never have looked at. I asserted a consumer's absence without grepping for one. The honest claim is narrower: it reads `fake-data.ts` until Phase 4, so the path is unexercised rather than absent | code review r3 | `pre-merge` | `unverified-assumption` | ✅ third path documented; #92 updated with it and with the constant being duplicated, so the fix lands as one exported threshold |
| 156 | 2026-09-13 | PR #93 / IS #67 | `code-only` | Widened the single shared `PARSER_POLICY` allowlist by five entries so `index.ts` could import the extractors it composes. That list is applied to all ten parser modules, so the edit granted every extractor the same permission. Verified by mutation both ways: `normalize.ts` importing `@/lib/parser/negation` — the layering inversion IS #80's body explicitly forbids ("Step 0 must not be taught the negation vocabulary") — FAILS on `dev` and PASSED on the PR. The guard against #80's wrong fix would have been gone at exactly the moment #80 edits `negation.ts` and `index.ts` | code review r1 | `pre-merge` | `incomplete-guard` | ✅ policy selected per module; the composer gets its own carve-out. Mutant fails again, and a stale composer filename now fails loudly |
| 157 | 2026-09-13 | PR #93 / IS #67 | `code-only` | Called the deferred #80 gap "the conservative miss — it cancels a day the truck was plausibly talking about, and the truck can post again". Backwards. `parseCaption("Vi står på Heden 11-14 idag, stängt på söndag", …)` returns `isNegation: true` for TODAY, and per plan #1 that deletes the pin of a truck standing there right now. Both `negation.ts` and IS #80 class a false cancellation as the asymmetrically expensive failure and state the rule as "fail toward NOT a cancellation" — I wrote the opposite while citing the modules that say it | code review r1 | `pre-merge` | `imprecise-claim` | ✅ rationale corrected with the repro inline; the gap is now deferred for needing #80's span reporting, not for being safe |
| 158 | 2026-09-13 | PR #93 / IS #67 | `code-only` | `time.ts` assigned the two-clause pairing defect to #67 by name ("it belongs to `parseCaption`"), and `location.ts` carries its other half. #67 neither fixed it, commented on it, nor filed it. `parseCaption("Heden 11-14, imorgon Lindholmen 17-20", …)` yields today's place + tomorrow's date + today's window at confidence **1.0** — clears the display threshold from every lane. The sibling gap (#80) got a comment AND a pinning test in the same file; the one producing a max-confidence WRONG pin rather than a missed one got neither | code review r1 | `pre-merge` | `gate-skipped` | ✅ IS #94 filed, commented at the pairing site, pinned by a test that #94 must update |
| 159 | 2026-09-13 | PR #93 / IS #67 | `code-only` | `types.ts` documented `ParseResult.date` as "NEVER null … Stockholm calendar date, `yyyy-MM-dd`". Non-null is enforced; the format is enforced nowhere. `extractDate` returns `parsedAt` untouched on every non-match path including one it cannot read, so `parseCaption("Järntorget 11-14", "not-a-date")` scores 0.6 with a resolved place and carries the garbage toward `locations.starts_at` (NOT NULL). Each module deferred the check to the next — `date.ts` says "validated where it is derived", `index.ts` documents the derivation (H3) without checking it, and my comment then asserted the result | code review r1 | `pre-merge` | `imprecise-claim` | ✅ comment corrected to claim only what holds; IS #95 filed to pick where the check belongs |
| 160 | 2026-09-13 | PR #93 / IS #67 | `code-only` | Wrote a per-mutant failure COUNT into the mutation table, then added three known-gaps tests in the follow-up commit and never re-ran it. Three of four counts were stale within one commit: "3 failures" is 6, "1" is 2, "2" is 3. The phase plan states this rule explicitly and refuses a count beside its own acceptance criteria — "a hand-maintained number beside a growing table drifted twice … the table is the count" — and I reproduced it in a table whose entire purpose is to be checkable | code review r2 | `pre-merge` | `manual-drift` | ✅ counts deleted; the table claims "each is killed", which is a claim about the mutant rather than about a suite that grows |
| 161 | 2026-09-13 | PR #93 / IS #67 | `code-only` | `parseCaption("Heden 11-14 (ej söndag)", …)` resolves to Sunday at confidence 1.0 — the one day the caption rules out. `detectNegation` correctly does not fire (#82 constrains `ej` to an operating verb or open state), so the bail never runs, and `extractDate` is first-match-wins with the excluded weekday as the only date expression. Both halves individually correct; the composition inverts. Distinct from IS #94 (two positive clauses) and IS #80 (a negation that does fire), and reachable on `dev` through `extractDate` alone | code review r2 | `pre-merge` | `incomplete-guard` | ✅ IS #96 filed, commented at the pairing site, pinned by six tests including the regression guard |
| 162 | 2026-09-13 | PR #93 / IS #67 | `code-only` | Repeated `address.ts`'s header claim that `extractAddressCandidate` "would cheerfully re-match Järntorget" without testing it. Only `"Järntorget 12"` matches; the bare name, `"Järntorget 11-14"` and `"vid Järntorget idag"` all return null, because since PR #89 r4 a candidate needs a house number and no bare-suffix form survives. The source comment was written against the pre-r4 pattern and never revisited when the rule narrowed — so the stale claim was inherited verbatim rather than invented | code review r2 | `pre-merge` | `imprecise-claim` | ✅ corrected in both files, with the enumerated forms inline |
| 163 | 2026-09-13 | n/a | `process` | The `/code-review` run left the repo checked out on `dev` with the feature branch's work absent from the working tree. Nothing was lost — the branch was committed and pushed — but a review that mutates the caller's checkout is a hazard in its own right: had the branch been uncommitted, the state would have been gone, and the r2 findings were being read against a tree I had to verify before trusting | noticing the file-change notices | `n/a` | `missing-gate` | ➖ no fix; recorded so the next review run is checked for this. Commit before invoking review |
| 164 | 2026-09-13 | PR #93 / IS #67 | `plan` | **Plan violation shipped into the contract #68/#69 will be written against.** The negation path returned `time: null` and `date: parsedAt`, dropping the extracted window. Plan decision #1: "Cancellation window: the extracted time range if there is one, otherwise the full Stockholm day of the extracted date." Verified: `parseCaption("Inställt 11-14 idag", …)` returned null while `extractTime` returned 09:00Z–12:00Z, so a truck cancelling only lunch would have had its 17–20 pin deleted too. Cause: I argued the suppression for `place` and applied it to all three fields in one blanket early return. IS #67's AC said "no attempt to extract location, date or time" and I followed the issue over the plan — CLAUDE.md says THE PLAN WINS | code review r3 | `pre-merge` | `stale-doc` | ✅ suppression narrowed to `place` alone; both regressions now pinned as mutants |
| 165 | 2026-09-13 | PR #93 / IS #67 | `code-only` | Described `resolvePlace` as yielding the leftmost place. It yields the leftmost DICTIONARY alias, then prefers any dictionary hit over any address candidate with no positional comparison. `"Vi står på Kungsgatan 12 idag 11-14, imorgon Heden 17-20"` pins Heden from the second clause at 1.0; `"Kungsgatan 12, Heden"` pins Heden with no clauses involved. The preference is defensible, but it is a preference ORDER, not a position rule, and the wrong word hid a second way IS #94's pairing fails | code review r3 | `pre-merge` | `imprecise-claim` | ✅ corrected at the pairing site; IS #94 updated with both captions and the consequence for its option 2 |
| 166 | 2026-09-13 | PR #93 / IS #67 | `code-only` | I renamed a `types.test.ts` assertion to "imports only erased types", which `findImpurities` does not check — it matches SPECIFIERS and treats `import type` identically to a value import (deliberately, per IS #75). Switching `types.ts` to a value import of `@/lib/parser/time` keeps the test green while dragging the parser and `date-fns-tz` into the client graph via `TruckPopup.tsx` and `useMapLibre.tsx`. The old single entry had no runtime behind it; this one does, so renaming the test is what turned a true-enough name into a false one | code review r3 | `pre-merge` | `imprecise-claim` | ✅ renamed to what it checks; gap documented and filed as IS #97 against `purity.ts`, not re-derived in the test |
| 167 | 2026-09-13 | PR #93 / IS #67 | `code-only` | `SUMMER = "2026-08-22"` was commented "A Friday" (it is a Saturday) and `WINTER = "2026-01-15"` "the same weekday" (Thursday). The `#96` block eight lines below correctly called SUMMER a Saturday, so the file contradicted itself, and five assertions depend on the Saturday reading. Both comments were written by reading the constant rather than computing it | code review r3 | `pre-merge` | `unverified-assumption` | ✅ both corrected, with a note that the weekday is load-bearing for the `#96` rows and that WINTER's weekday deliberately matches nothing |
| 168 | 2026-09-13 | → IS #61 | `issue` | IS #61 specifies `fileParallelism: false` and `passWithNoTests: true` **on the integration project**. Neither can be set there: vitest 3.2.7 types `ProjectConfig` as `Omit<InlineConfig, NonProjectOptions \| …>` and `NonProjectOptions` lists both. Implemented as written, the sequencing silently did not hold — a throwaway two-file probe interleaved (`b-start a-start a-end b-end`), which is exactly the M5 flake class the setting exists to prevent, present from the moment the config landed | a sequencing probe written before trusting the setting | `pre-commit` | `stale-doc` | ✅ `poolOptions.forks.singleFork` (which `ProjectConfig` explicitly re-adds) with `pool` pinned beside it; `--passWithNoTests` moved to the script, which also scopes it away from `unit` |
| 169 | 2026-09-13 | → IS #61 | `process` | I measured `npm run test:integration`'s exit code as `npm run … \| tail -6; echo $?`, which reports **tail's** status, not npm's. Read it as exit 0 and nearly recorded "passWithNoTests works" — the true exit was 1, so the option had been ignored all along. The wrong measurement AGREED with the expected answer, which is why it was not questioned | re-measuring without a pipe while investigating #168 | `pre-commit` | `unverified-assumption` | ✅ every exit-code check in this issue re-run as `cmd >/dev/null 2>&1; echo $?`. A pipeline's `$?` is the last command's |
| 170 | 2026-09-13 | PR #98 / IS #61 | `plan` | Scoping the unit project to a directory, I wrote `src/**/*.test.ts` and narrowed vitest's extension set as a side effect. SILENT: a failing `src/lib/x.test.tsx` AND a failing `src/lib/x.spec.ts` both reported `917 passed`, exit 0, never collected. Phase 4/5 add `.tsx` hook and component tests — `useMapLibre.tsx` is already `.tsx` — so the first UI test written would have passed by not running. The glob came straight from the plan's Files table, which specifies the same string | code review r1 | `pre-merge` | `incomplete-guard` | ✅ reuse vitest's own `*.{test,spec}.?(c\|m)[jt]s?(x)` with a directory prefix, NOT a hand-written `{ts,tsx}` — that drops `.spec.*`, `.mts`, `.cts`. Plan corrected at both sites |
| 171 | 2026-09-13 | PR #98 / IS #61 | `plan` | I wrote "both documents are wrong" about `fileParallelism` in the PR body and corrected only the process log, leaving the plan's two occurrences untouched. CLAUDE.md makes the plan authoritative, so a later #72 session would have read the shipped `singleFork` config as drift and "restored" the interleaving this PR exists to fix. Knowing a doc is stale and not fixing it is the same outcome as not knowing | code review r1 | `pre-merge` | `stale-doc` | ✅ both plan sites corrected, with the wrong-vs-correct mechanism table inline so the next reader sees why rather than just what |
| 172 | 2026-09-13 | PR #98 / IS #61 | `code-only` | **Overcorrection.** r1's fix for the silently-narrowed EXTENSION set kept `src/**` as the unit root, so a test in neither root belonged to no project. Verified: failing files at `tests/helpers/zz.test.ts` and `scripts/zz.test.ts` left BOTH scripts at exit 0. `scripts/` is not hypothetical — `scripts/reparse.mjs` is IS #71, this phase. Same silent-skip class as #170, one axis over, introduced BY the fix for it | code review r2 | `pre-merge` | `overcorrection` | ✅ the split now SUBTRACTS instead of enumerating: `unit` is `defaultInclude` minus `tests/integration/**`, `integration` is that directory. Neither project states a file pattern, so neither can narrow one |
| 173 | 2026-09-13 | PR #98 / IS #61 | `code-only` | r1 hand-copied vitest's default include pattern into a `TEST_FILES` constant and argued at length for not enumerating extensions — while `vitest/config` exports `defaultInclude` and `defaultExclude` directly. The copy was correct and still weaker: it is right until vitest changes and nothing would say when it had. I checked `node_modules` for the VALUE and never checked whether it was exported | code review r2 | `pre-merge` | `manual-drift` | ✅ both imported from `vitest/config`. "Do not enumerate a set someone else owns" has a stronger form — do not copy it either |
| 174 | 2026-09-13 | PR #98 / IS #61 | `CLAUDE.md` | Splitting the suite made `npm run test:run` unit-only, while the project's documented manual gate list still named it as THE test gate and no script ran both projects. With no CI, that means all four gates could pass after IS #72 without a single integration test executing. I changed what a script covered and did not check what depended on the old coverage | code review r2 | `pre-merge` | `stale-doc` | ✅ `test:all` added; CLAUDE.md gains an explicit script/gate table stating `test:run` is the inner loop and `test:all` is the gate. Memory updated |
| 175 | 2026-09-13 | PR #98 / IS #61 | `code-only` | Added `--passWithNoTests` to the new `test:all` merge gate by copying it from `test:integration` without asking whether it was needed. It is not: vitest's empty-match check is per-RUN, and a run collecting the 917 unit tests is never empty — `npx vitest run` exits 0 with no flag and `tests/integration/` absent. Its only effect was to mute a genuinely empty run, so a broken glob would fail `test:run` and PASS the documented merge gate. Second time in two rounds I moved a gate toward easier merges (#174) | code review r3 | `pre-merge` | `overcorrection` | ✅ removed from `test:all`; kept on `test:integration`, where it IS load-bearing (exit 1 without it when run alone). `test:all` now exits 1 on a genuinely empty run |
| 176 | 2026-09-13 | PR #98 / IS #61 | `code-only` | Wrote that putting the flag on the script "is what keeps it scoped: at the root it would also apply to `unit`, where an empty match should stay loud". False — vitest never checks per-project emptiness, so the flag's location changes nothing about `unit`. Verified by breaking the unit glob with one integration test present: `npx vitest run` → exit 0, "Test Files 1 passed", identical with and without the flag, while `--project unit` alone → exit 1. **`test:all` reports success while running zero unit tests.** I invented a mechanism to justify a placement that was right for a different reason | code review r3 | `pre-merge` | `imprecise-claim` | ✅ claim replaced with the measured behaviour; IS #99 widened to both projects and retitled, with the note that a vacuity guard cannot live inside the project it protects; CLAUDE.md warns the gate's exit code is not proof both projects ran |
| 177 | 2026-09-13 | → IS #73 | `process` | Told the user the comment-heavy style was "this codebase's established convention", i.e. pre-existing. Measured instead: `src/` comment ratio is 4% at end of Phase 1 (hand-written), then 9 → 12 → 17 → 22% across Phase 2 and 38 → 43% across Phase 3, never once falling. No instruction file mandates it. It is an emergent convention I built and then attributed to the repo — an absence claim about the project's own history, the cheapest category to check and the third one I have shipped unverified | the user asking where it originates | `n/a` | `unverified-assumption` | ✅ measured and recorded in IS #73 Part 2, with the ratchet mechanism identified (a review finding lands as a ⚠ block that is never removed: 108 blocks, 42 archaeology refs) |
| 178 | 2026-09-13 | PR #98 / IS #61 | `plan` | The r1 plan correction — a block literally titled CORRECTION — still contained the sentence r3 proved false and that `vitest.config.ts` labels "IT IS FALSE": that the flag's placement keeps `unit` loud. I fixed the plan for `fileParallelism` and left the `passWithNoTests` rationale I had written beside it. Second time in this PR a doc correction was itself incomplete (#171), and worse, because a CORRECTION block is the most-trusted text in the document and CLAUDE.md makes the plan win | code review r4 | `pre-merge` | `stale-doc` | ✅ replaced with the measurement inline; the plan's Gates block also now names `test:all` as the merge gate and warns a green run is not proof both projects ran |
| 179 | 2026-09-13 | PR #98 / IS #61 | `code-only` | `defaultExclude` does not cover build output — no `.next`, `out`, `build` or `coverage` — so a `*.test.*` file emitted there is collected by the unit project. Verified with a failing `.next/zz/orphan.test.ts`. Latent, and not a regression against `dev`, but r2's `include: defaultInclude` restored that reach after r1's `src/**` had removed it, and widening something back without noticing is the same inattention that produced the r1→r2 overcorrection | code review r4 | `pre-merge` | `incomplete-guard` | ✅ unit `exclude` mirrors `.gitignore`'s generated dirs, ROOT-ANCHORED after a first pass used `**/build/**` which would have swallowed a legitimate `src/lib/build/`. Verified both directions |
| 180 | 2026-09-13 | PR #98 / IS #61 | `process` | The PR description on GitHub was still r1 text after three more rounds: no mention of `test:all` (the script the diff adds and the documented merge gate), and it still asserted the scoping rationale the same commit's code calls false. A merge commit is the permanent record, so it would have preserved a claim contradicted by the code it merges. I updated PR #93's body before merging and did not carry the habit over | code review r4 | `pre-merge` | `manual-drift` | ✅ rewritten against the shipped state. Update the PR body as part of each review round, not once before merge |
| 181 | 2026-09-13 | PR #100 / IS #96 | `code-only` | The exclusion guard suppressed only the day directly after the excluder, so a coordinated list pinned its SECOND day: `"Heden 11-14 utom lördag och söndag"` → Sunday at 1.0, the same #96 inversion the fix exists to remove. Produced BY the skip-ahead behaviour I had documented as "strictly better than bailing" — lördag is suppressed, the engine moves on, and söndag is not. A feature I praised without testing its interaction with the defect it sits next to | code review r1 | `pre-merge` | `incomplete-guard` | ✅ the lookbehind now follows a chain of weekday+conjunction links, bounded to weekday tokens so it cannot run past prose — negative controls pin that boundary |
| 182 | 2026-09-13 | PR #100 / IS #96 | `code-only` | `\s+` required the excluder to sit directly on the weekday, so `"utom på söndag"`, `"(ej på söndag)"` and `"förutom på söndag"` all pinned the excluded day. `date.ts`'s own comment calls `"på söndag"` the ordinary caption shape and its weekday tests use that phrasing throughout — so the gap was in the module's own documented common case, and I tested only the forms the issue listed | code review r1 | `pre-merge` | `incomplete-guard` | ✅ optional `(?:på\s+)?` between the excluder and the day, and inside each chain link |
| 183 | 2026-09-13 | PR #100 / IS #96 | `code-only` | Claimed the "no word precedes the negator" rule "covers start-of-string, `(`, `,` and every separator without enumerating any of them". False for a NEWLINE — `normalizeCaption` collapses it to a space, so the previous word abuts the negator and the guard does not fire. Worse, whether it fires then depends on whether that line ended in a LETTER or a DIGIT: `"Heden\nInte söndag"` pins Sunday, `"Heden 11-14\nInte söndag"` is correct. A newline is the most common separator in an Instagram caption | code review r1 | `pre-merge` | `imprecise-claim` | ✅ claim corrected with both rows inline; IS #101 filed, and the arbitrary digit/letter case is pinned as a known-gap test so the fix has something to flip |
| 184 | 2026-09-13 | PR #100 / IS #96 | `code-only` | A comment cited `"Inte söndag, utan lördag"` as the verification for skip-ahead, while the test added in the SAME commit argues that exact example proves nothing — `parsedAt` is a Saturday, a weekday that is today resolves to today, so `lördag` equals the fallback and the claim holds either way. I wrote the correct reasoning in the test and the refuted example in the comment, in one change | code review r1 | `pre-merge` | `imprecise-claim` | ✅ comment cites `måndag`, matching the test. A stated verification that cannot fail is worse than none |
| 185 | 2026-09-13 | PR #100 / IS #96 | `code-only` | Suppressing the excluded weekday falls back to `parsedAt`, which can BE an excluded day. `"Heden 11-14 alla dagar utom lördag"` posted on a Saturday pins lördag at 1.0 — the #96 inversion verbatim, relocated from "the excluded day the caption named" to "the excluded day that is today". `scoreConfidence` reads only location+time, so nothing downstream filters it | code review r2 | `pre-merge` | `incomplete-guard` | ✅ IS #102 filed. Not fixable in `date.ts`: `extractDate` is typed `: string` by IS #57 and cannot say "no usable date". Pinned as a known-gap test |
| 186 | 2026-09-13 | PR #100 / IS #96 | `code-only` | **My tests defended the bug.** The coordinated rows used `"utom lördag och söndag"` with a Saturday `parsedAt`, asserting `toBe(SATURDAY)` — which passes because the fallback coincides with an EXCLUDED day, not because the chain worked, and which would FAIL a correct fix. Three of five rows plus the composed row had it. I chose lördag as an example day without checking it against the fixture I was asserting | code review r2 | `pre-merge` | `incomplete-guard` | ✅ every coordinated row now excludes only NON-posting days, so `toBe(SATURDAY)` means what it says; the lördag rows moved to an explicit `#102` known-gap block |
| 187 | 2026-09-13 | PR #100 / IS #96 | `code-only` | Documented the chain's bound as "cannot run past ordinary prose". True but narrower than it sounds: a second clause that OPENS on a weekday is one more valid link, so `"Öppet utom lördag, söndag Lindholmen 12-16"` loses a stated Sunday booking. My negative controls only covered a non-weekday after the comma, so they confirmed the claim I made rather than testing its edge | code review r2 | `pre-merge` | `imprecise-claim` | ✅ bound narrowed with the counter-example inline, pinned as a known-gap test, folded into IS #102 rather than guarded by one more condition |
| 188 | 2026-09-13 | PR #100 / IS #96 | `code-only` | `index.ts` still documented #96 as LIVE, with the now-false worked example `→ date 2026-08-23, 1.0` and "which is why #96 lands there" in future tense. `index.ts` was not in the PR's file list, so the fix landed in `date.ts` and the composition's description of the bug was never revisited | code review r2 | `pre-merge` | `stale-doc` | ✅ rewritten as was/now, with the two live remnants named and pointed at IS #102 |
| 189 | 2026-09-13 | PR #100 / IS #96 | `code-only` | The `SUMMER` comment in `index.test.ts` said the `#96` rows resolve to 2026-08-23. True while that block pinned the DEFECT; since the flip they resolve to 2026-08-22. **Second time this exact comment has gone stale** — PR #93 r3 corrected it for calling a Saturday a Friday (row 167) — and the comment exists specifically to stop the file contradicting itself about SUMMER | code review r2 | `pre-merge` | `stale-doc` | ✅ both errors recorded in it, with the distinction: a comment about what a block asserts goes stale when the EXPECTATION changes, not only the input |
| 190 | 2026-09-14 | → IS #63 | `code-only` | The first `geocoding.test.ts` shared one module-level throttle gate across every test, because `geocoding.ts` holds it as module state and the file imported the module once. Each test appended a 1100 ms link, so the file took **13.3 s** where the whole unit suite takes 2 s, and the last test saw ZERO fetches — still queued behind the other fourteen. The comment I wrote asserted the opposite: *"the gate is empty on the first call in a process"* | running it | `pre-commit` | `unverified-assumption` | ✅ `vi.resetModules()` + dynamic import per test — 17 tests in 68 ms. Fake timers only in the block where queueing IS the subject. The module now documents that the gate outlives a request |
| 191 | 2026-09-14 | → IS #63 | `code-only` | The live verification counted `fetch` calls to prove "no network call on a cache hit" and reported **1**, which read as the cache failing. It was the SUPABASE request — the db read is itself an HTTP call. My instrument conflated two different networks, and the module comment repeated #63's own wording, "zero network calls", which is not literally true | running it | `pre-commit` | `imprecise-claim` | ✅ verification filters by host (Nominatim 1 on miss, 0 on hit; only 127.0.0.1:54321 remains); comment now claims no NOMINATIM request and says why the distinction matters |
| 192 | 2026-09-14 | → IS #63 | `code-only` | `geocoding_cache` has no `display_name` column, so `geocode()` returns Nominatim's canonical string on the request that first geocodes an address and `null` on every later one — making `locations.address_geocoded` depend on cache state rather than on the caption. Verified live: first call returned the full display name, second returned null. The issue's own contract says `displayName: string \| null`, so the shape anticipated it; nothing anticipated the INCONSISTENCY | writing the return type against the schema | `pre-commit` | `incomplete-guard` | ✅ IS #103 filed with three options; pinned by a test asserting both halves. Not fixed here — it needs a migration and #63 does not own one |
| 193 | 2026-09-14 | PR #104 / IS #63 | `code-only` | `new URL("/search", baseUrl)` sat OUTSIDE the try block, so a malformed `NOMINATIM_BASE_URL` (no scheme) throws `TypeError: Invalid URL` out of `geocode()` — the unhandled-rejection-inside-`after()` that loses a post, and exactly what the `!baseUrl` guard thirty lines above exists to prevent. I guarded the empty string and not the malformed one, which is the easy half of one class | code review r1 | `pre-merge` | `incomplete-guard` | ✅ URL construction moved inside the try; three env rows now cover missing, no-scheme and not-a-URL |
| 194 | 2026-09-14 | PR #104 / IS #63 | `code-only` | A transient Postgres error from `putCachedGeocode` propagated and discarded coordinates already fetched AND box-validated — trading a slow next lookup for a lost pin. The cache row is an optimisation and I had written it as a dependency | code review r1 | `pre-merge` | `incomplete-guard` | ✅ the write is wrapped; the geocode returns regardless, with a `console.warn` because a cache that never writes looks exactly like one that is never hit |
| 195 | 2026-09-14 | PR #104 / IS #63 | `code-only` | `"/search"` is root-absolute, so a path-prefixed base (`https://geo.internal/nominatim`) silently became `https://geo.internal/search` — verified. A self-hosted Nominatim behind a prefix would 404 every request and geocode nothing, permanently, with nothing in the logs. Invisible against the public instance, which has no prefix | code review r1 | `pre-merge` | `incomplete-guard` | ✅ relative `"search"` against a base normalised to end in `/`; both prefixed and trailing-slash forms pinned |
| 196 | 2026-09-14 | PR #104 / IS #63 | `code-only` | A 429 or 403 — being rate-limited or blocked, which decision #2 explicitly anticipates for Vercel's SHARED egress IP — collapsed into the same silent null as "no such address". The fallback path could go dark indefinitely and present as bad caption quality | code review r1 | `pre-merge` | `incomplete-guard` | ✅ those two statuses warn; 404/500 stay quiet so the warning keeps meaning something |
| 197 | 2026-09-14 | PR #104 / IS #63 | `imprecise-claim` | Claimed Nominatim "wants west,north,east,south, which is a different order from our own box — exactly the kind of transposition that produces a plausible-looking wrong answer", in a comment, a test NAME and the PR body. The docs say verbatim: *"Any two corner points of the box are accepted as long as they make a proper box."* Both orders describe the same box; there was never a wrong one. Raised by review as a NON-finding — the code worked — and confirmed against the docs and then live | code review r1 | `pre-merge` | `imprecise-claim` | ✅ claim deleted, the derivation kept for the reason that is real (a stale copy), test renamed and asserted against `GOTHENBURG_BBOX` rather than a literal |
| 198 | 2026-09-14 | PR #104 / IS #63 | `code-only` | Case-folded the cache key and wrote "One function, used by both, plus a test that a case variant hits". **No such test existed** — nothing in this repo unit-tests the db layer, and `geocoding.test.ts` mocks that module out entirely, so it cannot see the key. I described the defence I intended rather than the one I had | writing it | `pre-commit` | `imprecise-claim` | ✅ verified live instead (three casings, one row, stored lowercased); comment now says it is a manual verification and weaker than a test; obligation recorded on IS #72 |
| 199 | 2026-09-14 | PR #104 / IS #63 | `code-only` | **Overcorrection.** r1's fix wrapped the cache WRITE ("the cache row is an OPTIMISATION") and left the READ unguarded, so a DB fault rejected straight out of `geocode()` — breaking the module's own stated contract that `null` covers every failure, and skipping a Nominatim call that would have succeeded. Verified: a rejecting read threw `connection terminated` out of the function. It slipped past a test block NAMED "the cache is an optimisation, not a dependency" that only exercised the write — **a block title is not coverage** | code review r2 | `pre-merge` | `overcorrection` | ✅ `readCache()` wraps both call sites; the block now tests both halves, read case first |
| 200 | 2026-09-14 | PR #104 / IS #63 | `code-only` | Concurrent misses on the SAME address all read the cache before any row exists, then resume from the throttle straight into a request. Verified: three concurrent calls for one address produced THREE Nominatim requests and three upserts — a thundering herd against the 1 req/s budget this module exists to protect. My own unbounded-queue test used three DIFFERENT addresses, so it could not see it | code review r2 | `pre-merge` | `incomplete-guard` | ✅ re-check the cache after the wait; the caller ahead has finished, so its row is visible. Three concurrent calls now make one request and one write |
| 201 | 2026-09-14 | PR #104 / IS #63 | `code-only` | A missing `NOMINATIM_BASE_URL` returned null with no log — the same "permanently, with nothing in the logs" shape I had argued against twenty lines below for the path-prefix bug, in the same file, in the same commit | code review r2 | `pre-merge` | `incomplete-guard` | ✅ warns; a deploy that forgets the variable now says so instead of presenting as poor caption quality |
| 202 | 2026-09-14 | PR #104 / IS #63 | `code-only` | 429/403 is logged but never backed off from: the throttle keeps firing one request per interval into a service that said stop, which on Vercel's SHARED egress IP is what escalates a soft limit into a durable block — the risk decision #2 names by name. Raised as plausible-rather-than-confirmed, and it is a design gap rather than a broken line | code review r2 | `pre-merge` | `incomplete-guard` | ➖ IS #105 filed. Deliberately NOT built: a backoff is new policy, and decision #2 rules out RETRY while saying nothing about backoff — inventing the second while implementing the first is how an unreviewed rule gets in |
| 203 | 2026-09-14 | PR #104 / IS #63 | `code-only` | **Fourth instance of the same class, created by r1's fix.** r1 moved `new URL` inside `fetchFirstHit`'s try so a malformed base could not throw — but that try ends in a bare `catch` returning null, so a malformed base then produced NO request, NO warning, and nothing to distinguish it from a network failure. Verified: `NOMINATIM_BASE_URL=nominatim.openstreetmap.org` → null, **0 fetches, 0 warns**, permanently | code review r3 | `pre-merge` | `overcorrection` | ✅ `URL.canParse` at the config check, beside the `!baseUrl` guard — config errors detected where config is read |
| 204 | 2026-09-14 | PR #104 / IS #63 | `code-only` | The r2 test for that gap asserted it was UNFIXABLE: "a malformed URL is caught inside `fetchFirstHit`, which cannot distinguish it from a network failure without replicating `new URL`'s parsing". `URL.canParse` does exactly that and has since Node 18.17; this runs on Node 22. An impossibility asserted without checking — the same move as the viewbox "transposition hazard" r1 deleted, and the second invented limitation in one PR | code review r3 | `pre-merge` | `imprecise-claim` | ✅ claim deleted; every row of that table now asserts a warning AND zero fetches |
| 205 | 2026-09-14 | PR #104 / IS #63 | `code-only` | r2's herd fix re-checked the cache after the throttle and its comment asserted, as an invariant, "the caller ahead has finished by the time we resume". Its gate is scheduled from when it ENTERED the throttle, and `TIMEOUT_MS` is 3000 against a 1100 ms gate — so a leader slower than one interval has not written its row. Verified: a 1500 ms fetch gave **2 requests, 2 writes** for one address. The r2 test could not see it because `fetchMock` resolved in a microtask — a test structurally blind to its own subject, the second in this PR | code review r3 | `pre-merge` | `incomplete-guard` | ✅ replaced with an in-flight map keyed before the throttle: joiners share the leader's promise and never consult the clock. Pinned with a leader deliberately slower than the gate |
| 206 | 2026-09-14 | PR #104 / IS #63 | `code-only` | `scripts/seed-dictionary.mjs` still carried the west,north,east,south "transposition hazard" claim that r1 deleted from `geocoding.ts` — while `geocoding.ts` points readers at that file as the sanctioned copy. Corrected in one place, left in the other, and the two then contradicted each other. Third occurrence of this shape (#171, #178) | code review r3 | `pre-merge` | `stale-doc` | ✅ corrected, and the entry notes the copy's cost arrived exactly where its own comment said it would not |
| 207 | 2026-09-14 | PR #104 / IS #63 | `code-only` | **r3's fix did not fix the case it was written for.** `URL.canParse("localhost:8080")` is `true`, and `new URL("search", "localhost:8080/")` then THROWS — so both config guards passed and the malformed base fell into `fetchFirstHit`'s bare catch: null, 0 fetches, 0 warns, exactly the regression r3's comment claimed to have closed. Same for `mailto:`; `ftp://host` resolves and then `fetch` rejects into the same catch. My test table covered only strings `canParse` already rejected | code review r4 | `pre-merge` | `overcorrection` | ✅ predicate deleted. `buildSearchUrl` CONSTRUCTS the request URL and a failure to construct is the rejection; a protocol check survives because it is the one case building does not surface |
| 208 | 2026-09-14 | PR #104 / IS #63 | `code-only` | r3's in-flight map registered AFTER the cache read, so a caller whose PostgREST read was issued before the leader's write committed but resolved after the leader's `finally` removed the entry missed both and sent a second request. r3's comment claimed "no timing condition left"; there was a narrower one. Invisible to the tests because the mocked read resolves in a microtask | code review r4 | `pre-merge` | `overcorrection` | ✅ dedup now wraps the WHOLE operation, cache read included — no ordering remains. Pinned on the cache-read count, which r3's shape could not satisfy |
| 209 | 2026-09-14 | PR #104 / IS #63 | `code-only` | Cache hits bypassed `isInGothenburg` — the check sat on the fresh-geocode path only. `geocoding_cache` is permanent with no sweeper, so tightening `GOTHENBURG_BBOX` (which `geo.ts` explicitly anticipates) would leave old rows serving out-of-box pins forever while an identical FRESH lookup was rejected: same address, two answers, decided by cache state | code review r4 | `pre-merge` | `incomplete-guard` | ✅ `toResult` is the only way a `GeocodeResult` comes into existence, so the check is unconditional rather than positional and every path inherits it |
| 210 | 2026-09-14 | PR #104 / IS #63 | `incomplete-guard` | Neither Supabase call had a deadline, and `readCache`'s try/catch covers a REJECTION but not a HANG — different failures. Only the Nominatim fetch was bounded. Verified: a cache read that never settles leaves `geocode` pending forever, and a hung write strands coordinates already fetched and validated. r4's in-flight map AMPLIFIES it — the entry is never deleted, so one blackholed PostgREST request poisons that address for the life of the warm instance. Present since the first commit, not created by the restructure | code review r5 | `pre-merge` | `incomplete-guard` | ✅ one deadline around the WHOLE operation, applied BEFORE the map stores the promise so the entry self-clears on a hang |
| 211 | 2026-09-14 | PR #104 / IS #63 | `imprecise-claim` | The throttle comment stated the burst failure mode as "a null geocode — which the caller handles as `parsing_status = 'failed'`". Untrue while the queue wait was unbounded: a caller still queued when the invocation is torn down never resolves at all, so the post keeps its `'pending'` default — indistinguishable from a healthy post and invisible to any failure sweep, which is strictly WORSE than a recorded failure | code review r5 | `pre-merge` | `imprecise-claim` | ✅ the same deadline makes the documented failure mode true rather than aspirational |
| 212 | 2026-09-14 | PR #104 / IS #63 | `code-only` | `putCachedGeocode`'s upsert omitted `cached_at`, so the column default (`now()`, INSERT-only) left a re-written row carrying its ORIGINAL timestamp. Migration 0003 records that this column "drives any future cache-invalidation policy", so the semantic was implicit and decided by which branch happened to run | code review r5 | `pre-merge` | `incomplete-guard` | ✅ set explicitly to LAST WRITTEN, with the reason: an "expire rows older than X" sweep must not discard a row just re-verified against Nominatim |
| 213 | 2026-09-14 | PR #104 / IS #63 | `imprecise-claim` | Wrote that an un-cleared `setTimeout` "hangs the run" in the test suite. **Measured: 1.74 s without `clearTimeout` against 1.73 s with it, all 40 tests passing** — vitest tears the worker down regardless. Third consequence asserted in this PR without checking, after the viewbox "transposition hazard" and the `canParse` "impossibility". Found by my own mutation run producing zero failures for a line I had justified | own mutation run | `pre-commit` | `imprecise-claim` | ✅ claim replaced with the real reason (a pending timer holds a finished lambda open) and explicitly marked as unpinned by any test |
| 214 | 2026-09-14 | → IS #64 | `code-only` | A `timestamptz` does NOT survive a round trip as the same string. We send `"2026-08-22T09:00:00.000Z"` (what `toISOString()` and `time.ts` produce); Postgres returns `"2026-08-22T09:00:00+00:00"`. Same instant, different text — so `stored.expires_at === parsed.startsAt` is FALSE for identical moments, and `<`/`>` between the two formats compares text whose ordering is only coincidentally right. Ordering within ONE format is correct, which is what makes it easy to get away with. Found by the first assertion I wrote failing | writing the integration test | `pre-commit` | `unverified-assumption` | ✅ asserted as an instant AND asserted that the strings DIFFER, so the fact is pinned rather than worked around; documented in `db/locations.ts` and flagged on IS #68, which compares stored rows against a `ParseResult` in JavaScript |
| 215 | 2026-09-14 | → IS #64 | `imprecise-claim` | Claimed `.in("id", [])` is a PostgREST syntax error and that the empty-array guard in `deleteLocations` is therefore "a correctness requirement, not an optimisation" — in the module AND in the test. Measured against the real database: **204, no error**, and the equivalent select returns `[]`. Fourth invented consequence across IS #63/#64 | deleting the guard and seeing NOTHING fail | `pre-commit` | `imprecise-claim` | ✅ both comments corrected; guard kept for the smaller true reason (one skipped round trip on the ordinary empty case), and the test now pins the OUTCOME rather than the mechanism |
| 216 | 2026-09-14 | PR #106 / IS #64 | `code-only` | **`resetTables()` destroyed the dev seed data.** It deleted ALL of `locations`, `posts` and `trucks`, taking `supabase/seed.sql`'s three fixed-UUID trucks — including the deliberately INACTIVE Vintervilan that Phase 2's rejection tests need. `npm run test:all` is the documented merge gate, so RUNNING THE GATE broke every documented curl flow until someone ran `npx supabase db reset`. Confirmed empirically twice, once by review and once by my own probe run. The seed file's own comment says those UUIDs are fixed so curl commands stay copy-pasteable | code review r1 | `pre-merge` | `incomplete-guard` | ✅ fixtures carry a `__itest__` name prefix and cleanup deletes only those; guard test asserts a seed-like truck survives `resetTables()`. Seed data restored with `db reset` and confirmed surviving the gate twice |
| 217 | 2026-09-14 | PR #106 / IS #64 | `process` | **My mutation tested neither bound.** I changed `.lt`→`.lte` AND `.gt`→`.gte` together, saw one failure, and reported "inclusive bounds fail one" in the PR body. Measured atomically: mutating the `starts_at` bound ALONE left all twelve tests passing. The combined mutant was killed entirely by the `expires_at` half, so the `starts_at` bound was unpinned while looking covered | code review r1 | `pre-merge` | `unverified-assumption` | ✅ missing case added (a location starting exactly at the incoming end); every mutant re-run ONE CHANGE AT A TIME, and each bound now dies individually |
| 218 | 2026-09-14 | PR #106 / IS #64 | `code-only` | The `.env` parser kept surrounding quotes, so `SUPABASE_SERVICE_ROLE_KEY="ey…"` — legal, and what `next dev` accepts — would carry literal quotes into the header and return an opaque 401 on every request. The URL case fails legibly (`new URL` throws and `assertLocal` explains), which is exactly what would have masked the key case: the first symptom anyone hits is the one that explains itself | code review r1 | `pre-merge` | `incomplete-guard` | ✅ matching quotes stripped as a pair only, so a value starting with a quote and not ending in one is left alone rather than half-stripped |
| 219 | 2026-09-14 | PR #106 / IS #64 | `overcorrection` | **The r1 fix for a destructive scoping bug introduced a different destructive scoping bug.** The fixture prefix was `__itest__`, and `_` is a SINGLE-CHARACTER WILDCARD in SQL LIKE — so `__itest__%` is not a prefix match. Verified against the local DB: it matched `XXitestYYnot-a-fixture` and `A_itest_B real truck`, arbitrary trucks nobody's test created, and `resetTables()` would have deleted them with their posts and locations. Second time in one PR, and again nothing went red | code review r2 | `pre-merge` | `overcorrection` | ✅ prefix contains no LIKE metacharacters (`itest-fixture-`), enforced by a module-load throw so a suite cannot start with a wider predicate than intended. Escaping was verified to work too and rejected — nothing left to remember beats something to remember |
| 220 | 2026-09-14 | PR #106 / IS #64 | `code-only` | **The r1 guard test could not catch the r2 defect**, because I named its bystander "Seed-like Truck" — a friendly stand-in for the seed data, containing no `itest`, so the wildcard pattern never matched it. A guard written for the failure I had in mind rather than for what the predicate ALLOWS. Fourth test in this project named for a property it could not exercise | code review r2 | `pre-merge` | `incomplete-guard` | ✅ three adversarial bystanders: the seed stand-in, a LIKE-wildcard near-miss, and an unanchored near-miss. Both mutants now die — reintroducing wildcards throws at module load, a leading `%` fails a test |
| 221 | 2026-09-14 | PR #106 / IS #64 | `stale-doc` | `setup.ts` and `vitest.config.ts` both still justified the local-only guard as protecting against "unfiltered deletes", which stopped being true when r1 added prefix scoping. Corrected in the helper and left in two mirrors — **third occurrence of this shape** (#171, #178, #206) | code review r2 | `pre-merge` | `stale-doc` | ✅ both corrected, and to a stronger reason that does not decay: the suite deletes rows at all, its predicate has been wrong twice, and neither failure produced a red test |
| 222 | 2026-09-14 | PR #106 / IS #64 | `code-only` | `readFileSync(".env.local")` resolves against `process.cwd()`, so invoking vitest from a subdirectory produced "Integration tests need .env.local … run `npx supabase start`" — an error naming the wrong problem and sending the reader to restart a database already running | code review r2 | `pre-merge` | `incomplete-guard` | ✅ resolved from `import.meta.url`; the message names the absolute path it actually looked for |
| 223 | 2026-09-14 | PR #106 / IS #64 | `imprecise-claim` | **I announced a fix that had not happened.** r2's node `.replace()` for the stale "unfiltered deletes" justification matched NEITHER file. I then ran `grep -c`, got 1 in each, and read that as "the corrective comment quoting the old claim" — it was the ORIGINAL sentence, untouched. The false conclusion went into the commit message AND the PR body as completed work. Same misreading as #191 (a fetch count read as the cache failing), now with a claim of correction attached | code review r3 | `pre-merge` | `imprecise-claim` | ✅ both corrected with exact-text edits rather than scripted replace, and verified by a grep returning **0 across the whole repo** rather than by a count I interpreted |
| 224 | 2026-09-14 | PR #106 / IS #64 | `overcorrection` | **Third scoping predicate wider than intended, in the same twenty lines.** The r2 guard checked SQL LIKE's two wildcards (`%`, `_`) — but this prefix never reaches SQL directly: supabase-js appends it verbatim to a PostgREST query, and **PostgREST rewrites `*` into `%`**. Verified: `.like("name", "*anything*")` matched `ZZZanythingZZZ`. A `*` in the prefix passed the module-load throw and would have silently widened a destructive delete | code review r3 | `pre-merge` | `overcorrection` | ✅ guard widened to `%`, `_` and `*`, and renamed to say it is about the whole PATH the string travels rather than the language at the end of it. Mutant throws at module load |
| 225 | 2026-09-14 | PR #106 / IS #64 | `incomplete-guard` | Two supabase-js calls ignored their `{ error }`: the bystander cleanup in `helpers.test.ts` (those trucks carry NO fixture prefix, so `resetTables()` can never collect them — a silent failure leaves rows in the dev DB permanently) and the `locations` insert in the FK-ordering test (which would make that test VACUOUS the moment a migration adds a NOT NULL column) | code review r3 | `pre-merge` | `incomplete-guard` | ✅ both checked and rethrown |
| 226 | 2026-09-14 | PR #106 / IS #64 | `incomplete-guard` | The `.env` line regex captured everything after `=`, so an inline `#` comment rode into the value — and Next.js's dotenv stops at `#`, so such a file works for `next dev` and fails only here. Same failure SHAPE as the quoting bug r1 fixed: an opaque 401 with nothing pointing at the cause. I fixed one member of the dotenv-syntax class and not the other | code review r3 | `pre-merge` | `incomplete-guard` | ✅ value stops at an unquoted `#`; quoted values keep theirs, so the quote alternative is matched first. Verified with a real inline comment in `.env.local` |
| 227 | 2026-09-14 | PR #106 / IS #64 | `code-only` | `expect(stored.starts_at).not.toBe(LUNCH_START)` pinned PostgREST's timestamptz TEXT rendering — a third party's formatting, not ours. It can only ever fail when nothing is wrong (a version emitting `…Z` would go red while behaving identically), in a suite gated on three consecutive green runs | code review r3 | `pre-merge` | `incomplete-guard` | ✅ assertion removed, the measured difference recorded in the comment instead. The instant comparison — the claim the code actually depends on — stays |

---

## What the data already says

One session's worth. Early, but several patterns are already visible.

> **Do not hand-maintain counts in this section.** They drifted within minutes of
> entries #11–12 being added — "6 of 12" and "three entries" were both already wrong,
> which is entry #10's `manual-drift` reappearing inside the file that tracks it.
> Recompute before quoting a number:
>
> ```bash
> # tally any column: 4=Where 5=Artifact 7=Caught-by 8=Escaped 9=Cause 10=Fix
> tally () { grep -E "^\| [0-9]+ \|" .claude/process-log.md \
>   | awk -F'|' -v c="$1" '{gsub(/^ +| +$|`/,"",$c); print $c}' \
>   | sort | uniq -c | sort -rn; }
>
> tally 9    # which causes dominate
> tally 5    # which dev-process artifact keeps failing
> tally 7    # which gate is actually catching things
> tally 8    # how far things escape before being caught
> tally 4    # which PR generated the most misses
> ```
>
> If a column is added or reordered, these indices shift — update this block in the
> same edit.
>
> Prefer qualitative wording ("most", "the largest group") in prose, and keep exact
> figures in the commands above where they cannot go stale.

**`next build` is a load-bearing gate that was not in the loop.** Entry #1 passed
`tsc`, eslint and 71 tests. Nothing but a full build could catch it. Verification
now runs build; without that, a Phase 7 `proxy.ts` change would have hit it again.

**The largest cause group is `incomplete-guard`, and it clusters on one function.** #2, #3, #4
and #6 are four separate failure modes of one small piece of numeric/string input
handling, each found only after the previous fix. The lesson is not "be more
careful" — it is that when guarding parsed input, the failure modes should be
*enumerated up front* (empty, non-numeric, overflow, underflow, storage-range,
ambiguous-encoding), not discovered one review at a time.

**One entry is an overcorrection, and it is the most expensive one.** #7 was a fix
for #6 that broke a rule written in the same PR. Its lesson generalises: reaching
for input validation when a structural invariant already covers the case adds cost
without adding safety. Structural invariants do not reject valid input; validation
does.

**`unverified-assumption` ties for largest, and every instance was cheap to check.**
#5 (a confident migration comment), #9 (assuming GitHub parses `Closes … in #45`),
#11 (this file's own gitignore advice) and #12 (assuming the dev docs *should* be
tracked) each took minutes to verify or one question to ask, and each would have
shipped wrong. The pattern is not carelessness — it is stating a
mechanism confidently *without* running it. #11 is the useful one to remember: the
first two attempts to test it were themselves flawed (a missing trailing newline
corrupted the pattern; then a stderr warning was misread as success), so the answer
only emerged on the third attempt. Verifying is not free, but it is cheaper than
the alternative in every case here.

**One PR produced the largest share of all misses.** `tally 4` puts PR #54 well
ahead of everything else. That PR started as a small contract change and accreted a
replay guard, a signature redaction, a migration and a security fix across four
review rounds. The correlation worth watching is scope growth against miss count —
if the next big PR repeats it, the lesson is to split rather than to review harder.

**Most misses implicate a dev-process artifact, not just code.** `tally 5` shows
`code-only` is a minority: the rest point at `CLAUDE.md`, `README`, `process`, this
log itself, or several docs at once. `CLAUDE.md` appears twice for opposite reasons
— once **wrong** (#1) and once **correct but not consulted** (#7). Those need
different fixes: the first is a maintenance problem, the second a workflow one.
This split is the main thing the file was built to expose, and it showed up in the
first session.

**Not every miss is a defect — #12 is a process miss.** Repeatedly proposing a fix
for something that was a deliberate choice costs attention and erodes trust in the
suggestions that do matter. The fix is structural: record decisions with their
rationale where the next session will read them, so a settled question stays
settled. That is a second, distinct use for this file alongside defect tracking.

**Review rounds caught most of them.** That is a healthy review process and an unhealthy
reliance on it — most of these could in principle have been caught earlier and more
cheaply. Rounds 1–3 found latent issues *exposed* by a change; round 4 found a
defect *introduced* by a fix, which is the signal that a change has stopped
converging.

---

## Detail entries

Only for misses whose story does not fit a table row.

### #1 — `proxy.ts` runtime export broke the build (2026-08-09)

**What:** `CLAUDE.md` required `export const runtime = 'nodejs'` in `src/proxy.ts`.
Next.js 16 rejects route segment config in the Proxy file and fails `next build`.

**Why it got through:** The rule was written for an earlier Next version and was
never revalidated. `tsc`, eslint and the full test suite all pass with the export
in place — the failure surfaces *only* in a production build, which was not part of
the verification loop.

**Process fixes:** rule rewritten in `CLAUDE.md` to forbid the export, with the
build-error text so it is recognisable; `npm run build` added to the standard
verification loop; issue #50's L3 closed as **invalid** with the reasoning recorded
on the issue so it cannot be re-suggested.

**Generalised lesson:** a project rule that no automated gate enforces will
eventually go stale silently. Rules about build-time behaviour need a build in the
loop, or they are folklore.

### #5 — Migration `0004` was destructive on failure (2026-08-09)

**What:** The migration stripped Mailgun signatures (irreversible) and *then*
created a unique index. On a database with duplicate tokens the UPDATE committed and
the index failed, leaving signatures gone, no index, and the migration unrecorded —
blocking every later migration.

**Why it got through:** an unverified assumption stated confidently in a comment —
"duplicate tokens would themselves be evidence of a past replay." False: before
dedup existed, an ordinary Mailgun retry inside the freshness window stored the same
tuple twice, entirely legitimately.

Reordering alone did **not** fix it, which is the interesting part: psql autocommit
continues past a failed statement, so the irreversible UPDATE still ran after the
guard raised. Only collapsing the whole migration into a single `DO` block — one
statement, therefore atomic under any runner — actually held.

**Process fixes:** in migrations, do fallible operations *before* irreversible ones,
and make the whole migration atomic rather than relying on the runner's transaction
behaviour. Both verified empirically in both directions before landing.

**Generalised lesson:** a confident comment is not evidence. The claim that made
this safe-looking was never tested, and testing it took two minutes.

### #7 — Overcorrection: the 10-digit timestamp pin (2026-08-09)

**What:** To close the HMAC boundary re-split (#6), the email validator was changed
to require exactly 10 digits. That rejected validly-signed payloads with `400` and
no `posts` row — reintroducing the permanent data loss issue #53 existed to remove,
and breaking a rule added to `CLAUDE.md` *in the same PR*.

**Why it got through:** the security reasoning was sound in isolation and never
checked against the constraint it violated. It was also unnecessary: the replay
index keys on `timestamp || token`, which is byte-identical across every re-split,
so all 41 variants already collapsed to one row — and only the original split can
fall inside the freshness window.

**Process fixes:** `CLAUDE.md` now states the defence is structural and warns
explicitly against "fixing" it with input validation. Verified empirically twice,
in both directions, before reverting.

**Generalised lesson:** before adding a rejection path to an ingestion lane, check
it against "never lose incoming data" — that rule exists precisely because
rejection paths look locally reasonable. And prefer a structural invariant over a
validation rule when both would work: invariants cost nothing when input is valid.

### #14 — Stated an intent, then let the plan absorb it (2026-08-22)

**What:** Found the #13 drift while reading for the Phase 3 milestone and said
"I'll fix it and log it once we're through the plan." The plan was finished and
handed over; the fix and the log row were not written. Instead the drift was
recorded *inside the plan* as Phase 3 work — which looks like progress and is
actually deferral. Caught only because Oliwer asked directly whether I had done it.

**Why it got through:** no gate. A stated intent held only in conversation has
nothing enforcing it — it is not a TODO, not an issue, not a test. Worse, writing
it into the plan produced the *feeling* of having handled it while pushing a
two-minute edit into a multi-week phase. The plan's own "Rationale" section
documented the drift accurately, which made the omission harder to notice, not
easier.

**Process fix:** when a fix is small enough to do immediately, do it immediately
rather than scheduling it — deferring cost more than the fix. Where something
genuinely must wait, it goes in an issue or the log with a reference, never in
conversation alone. Note this is the second `n/a`/`process` row (with #12) where
the miss was behavioural rather than technical.

**Generalised lesson:** "I'll do X after Y" is not a commitment mechanism. Either
do X now, or write it somewhere that outlives the conversation. Recording it in a
document that describes *future* work is the worst of both — it reads as done and
behaves as deferred.

### #15 — The plan was written from the docs, not from the code (2026-08-22)

**What:** The Phase 3 plan specified step 9 as "call `services/locations.ts` after
`persistPost`". That is not implementable: `persistPost` returns `void` and swallows
23505, so the parse path would have had no post id (breaking every
`parsing_status` transition and `locations.post_id`) and no way to tell a real insert
from a swallowed replay — meaning **a replayed Mailgun email inside the freshness
window would have been parsed into a live pin**, defeating migration 0004 at the
`locations` level while leaving the corpus guard intact and looking fine.

Separately, the plan never mentioned mapping `posts.source` (6 platform values) to
`locations.source` (3 lane values, CHECK-constrained), nor where the
`source_confidence` constants live. Those constants currently exist only in
`fake-data.ts`, which is fixture data.

**Why it got through:** the plan was authored by reading `project-context.md` and
`CLAUDE.md` and never opening the service it extends. Both gaps were **already
documented in the Phase 2 code** — `ingestion.ts:41-43` says in as many words that
the lane "is recorded on the location row in Phase 3", and `persistPost`'s signature
is one line. The docs describe the design; only the code describes the seams.

**Process fix:** a plan that extends existing code must read that code's public
surface — signatures, return types and the comments that defer work forward — before
its steps are written. Deferral comments in code are plan input, not commentary.

**Generalised lesson:** `project-context.md` is a design document, not an API
reference. Planning against it alone produces steps that are coherent on paper and
unimplementable in fact. Note this is the mirror image of #1 and #13: those were
cases of the docs being *wrong*, this is a case of the docs being *right but
insufficient*.

### #16 — An argument used against one option, ignored for the chosen one (2026-08-22)

**What:** Open decision #7 rejected automatic cron-retry partly because "automatic
replay risks resurrecting stale pins — a post from three days ago must not create a
location today". The recommended option, a re-parse script, has that hazard in
exactly the same way: `parseCaption` resolves `idag` against `parsedAt`, so replaying
an old post with today's date mints a fresh pin from a stale caption.

**Why it got through:** the hazard was identified while looking for reasons to reject
an option, then not re-applied to the option being recommended. Asymmetric scrutiny —
alternatives were stress-tested, the preference was not.

**Process fix:** every objection raised against a rejected option gets re-checked
against the recommended one before the recommendation is written. The fix here
(`parsedAt` derives from `posted_at`, on both the live and replay paths) is small; the
decision survives, but on narrower grounds than were claimed for it.

**Generalised lesson:** an argument strong enough to kill an option is strong enough
to deserve a check against the survivor. Related to #7's overcorrection in kind:
reasoning that is sound in isolation and never tested against the rest of the design.

### #17 — Incremental decisions left the document contradicting itself (2026-08-22)

**What:** Resolving seven open decisions one at a time updated the section being
decided and left every earlier section untouched. By the end the same file said the
backfill was deferred because the rows were "dev-only" (superseded), warned that
Nominatim blocking would make geocoding "unusable in production" (contradicted by
decision #2's finding about Vercel's shared egress IPs), claimed `address.ts` needed
the dictionary (it does not), and described `parseCaption` as composing "steps 0–5"
after a seventh step had been added.

**Why it got through:** each decision was recorded where it was made. Nothing re-read
the whole document afterwards, so the drift was invisible from inside the edit loop —
every individual change was correct.

**Process fix:** after a run of incremental decisions, re-read the artefact end to end
before calling it done. That is what the review round did here, which is the argument
for keeping the review round.

**Generalised lesson:** this is the third `manual-drift` entry (#10 README, #13
project-context, this one) and the pattern is now clear enough to name: **documents
drift against themselves whenever they are edited section-wise rather than read
whole.** All three were caught by a deliberate read-through, none by a gate. If a
fourth appears, the fix is a checklist step, not more care.

### #18 — A documented rule that is correct in prose and wrong in SQL (2026-08-22)

**What:** The override predicate in `project-context.md` reads
`existing.starts_at < incoming.ends_at AND existing.ends_at > incoming.starts_at`.
It is the textbook interval-overlap test and looks unimpeachable — but `ends_at` is
deliberately nullable, and SQL three-valued logic drops any row where it is NULL. A
location posted without an end time ("Vi står vid Järntorget idag" — an ordinary
caption scoring 0.6) would therefore never be found as overlapping, never be
overridden, and would accumulate duplicate pins that even a manual post could not
displace.

**Why it got through:** the rule and the nullability decision live in the same
document, roughly a hundred lines apart, and were written at different times. Each is
correct alone. Nothing forced them to be read together — and the predicate is
*visually* correct, which is the dangerous kind of wrong.

**Process fix:** compare `expires_at` (NOT NULL, always computed, and by construction
the effective end) rather than `ends_at`. Fix the rule at source in
`project-context.md`, not only in the plan, or the next reader reimplements it.

**Generalised lesson:** a nullable column turns every comparison into a third
outcome that the prose version of the rule does not have. When a doc states a
predicate, the reviewable question is not "is this the right logic" but "what does
this do when each operand is NULL". Note also that no unit test with a mocked DB
could ever catch this — it lives in the database's evaluation semantics, which is a
direct argument for the integration-test layer this phase introduces.

### #21 — The fix for the drift entry introduced drift (2026-08-22)

**What:** Round 1 corrected #17 (document contradicting itself) and, in doing so,
added `sources.ts` under a heading reading "New — impure layers" while describing it
as "**Pure.**", and appended two rows to a table without updating the "four places"
count three lines above it. The second is manual-drift inside the table written to
track manual-drift.

**Why it got through:** the fixes were applied section-wise — exactly the behaviour
#17 identified — and the round ended with targeted greps for the *known* stale
phrases rather than a read-through. Verifying the things you already know about does
not find the things you introduced.

**Process fix:** after applying review fixes, re-read the changed sections in full
rather than grepping for the strings you set out to change. A grep confirms the edit
landed; it cannot see what the edit broke.

**Generalised lesson:** first `overcorrection` since #7, and the same shape at much
lower stakes — a change that is locally correct and unchecked against its
surroundings. Both were caught by a subsequent review round rather than by any gate,
which is the argument for the round existing. It is also the argument for stopping:
two rounds found the plan's contradictions with the code and with the database
respectively, and the third source (existing tests) yielded nothing. Further review
would now cost more than building would.

### #22 — The same drift recurred one round after being logged (2026-08-22)

**What:** Round 2 corrected a "four places" count sitting above a six-row table
(#21). Round 2 then added a seventh row and left the corrected count reading "six".
Same defect, same table, one round apart — the second time inside the entry written
to stop it.

**Why it got through:** #21's fix was to *correct the number*. That treats the
symptom. A hand-maintained count beside a table that grows is a defect generator: it
is wrong by default and only accidentally right, and every future edit re-arms it.
Correcting it restores the trap.

**Process fix — structural, not another correction.** The count is deleted. The
table is the count. An audit of the whole plan for the same shape found one more
live instance: an acceptance criterion pinning "existing 88 tests stay green", which
would be false the moment this phase adds a test — restated as a property ("every
test that passed before this phase still passes"). The other numeric phrases in the
document (`five branches` of the override matrix, `three parts`, `~15–20 spots`)
describe fixed external facts or adjacent lists and cannot drift.

**Generalised lesson:** this is the fourth `manual-drift` (#10 README, #13
project-context, #17 plan, this) and the first where the *previous fix for the same
thing* failed. The pattern across all four is identical: **prose that mirrors
structured content drifts from it.** The durable fix is never to write the mirror.
Note #10 still reads "❌ still manual" — the README has the same disease untreated,
and this is the evidence that correcting instances does not work.

### #23 — Third consecutive round where fixes introduced new defects (2026-08-22)

**What:** Round 2's fixes added `geo.ts` and scheduled it at step 6, while step 1's
dictionary bounding-box test consumes it — an inverted dependency, stated out loud
in the step text ("step 1's dictionary test also consumes it") without the
contradiction registering. Round 2 also bolted an index reshape onto
`0005_parsing_status_duplicate.sql`, leaving the filename describing half its
contents and recreating in miniature the two-concerns-one-migration shape that
caused #5. Split into 0006.

**Why it got through:** same mechanism as #21 — fixes applied section-wise, verified
by confirming the intended edit rather than by re-reading the surroundings.

**What this says about the review rounds, which is the useful part:** round 1 found
the plan's contradictions with the *code*, round 2 with the *database*, round 3 found
**nothing about the design at all** — all three findings were defects the previous
round's own fixes introduced. The substance converged after round 2; only the
bookkeeping kept churning, and it churned because of hand-maintained mirrors (#22).

**Generalised lesson:** when a review round stops finding problems with the work and
starts only finding problems with the last round's edits, the work is done and the
review is now the largest source of new defects. That is the stopping signal. Ship
it, and let the build surface what remains — a failing test costs seconds where a
review round costs an hour.

### #25 — Removing a dependency edge without checking what rode on it (2026-08-22)

**What:** The confidence issue was blocked by four parser issues, including `extractDate`.
Review found that spurious — the confidence matrix keys on location, time and negation,
and the resolved date is not a factor in any of its six rows. Correct on its own terms.
But the parser-orchestrator issue reached `extractDate` **only through that edge**.
Removing it left the orchestrator schedulable before `extractDate` existed, and its
Contract section still asserted the transitive chain held.

**Why it got through:** the edge was evaluated for whether it was *justified*, not for
what *depended on it*. A dependency graph has two questions per edge and only one was
asked. Caught while applying the fix, before creation, by re-deriving the waves.

**Process fix:** when removing an edge from a dependency graph, re-run reachability
rather than reasoning locally — a topological sort takes seconds and answers both
questions at once. That is now part of the issue-breakdown step.

**Generalised lesson:** fourth consecutive round where a fix introduced a defect
(#7, #21, #23, this). The first three were section-wise editing of prose. This one is
a different mechanism — a locally-correct graph edit with a non-local consequence —
which is worth distinguishing, because "re-read the surroundings" would not have caught
it. Structural artifacts need structural verification, not more careful reading.

### #26 — A type assigned to its consumer instead of its first need (2026-08-22)

**What:** `NewLocation` was slated for the locations-service issue while the db-locations
issue's `insertLocation(location: NewLocation)` needed it — and the service issue is
*blocked by* db-locations. The type would not have existed when the code referencing it
was written, four waves earlier.

**Why it got through:** the plan's Files table lists `types.ts` under the service issue's
modifications, and the breakdown inherited that grouping without asking which issue
*first* needs each type. The plan was right that the service touches `types.ts`; it was
never asked whether something earlier touches it sooner.

**Process fix:** every shared type belongs to the earliest issue that needs it. Verified
mechanically after the fix — each of `NewLocation`, `ParseResult` and `DictionaryEntry`
now has exactly one defining issue, and each is defined at or before first use.

**Generalised lesson:** blocked-by is about *work* order, but types create their own
order that runs the opposite way — consumers depend on definitions, and the definition
must sit at the earliest consumer, not the most obvious owner. Worth checking on any
breakdown where a shared file appears in more than one issue.

### #28–30 — All three review findings were in the test file, not the code (2026-08-23)

**What:** PR #74's production module (`isInGothenburg`, four comparisons) came out of
review unchanged. Every finding was in `geo.test.ts`, and all three had the same
shape: **the test asserted less than its own comment claimed it did.** A comment said
the bbox assertions caught transposition (they cannot); a regex named "imports nothing
at all" missed the two forms that matter most; a module header promised "no HTTP" with
nothing checking it.

**Why it got through:** the gates all ran and all passed. `tsc`, lint, build and 29
green tests say nothing about whether a test's *claim* matches its *assertion* —
nothing in the loop compares those two, and a passing test looks identical either way.
The bar for writing them was "does this pass", which they did, rather than "would this
fail if the property broke", which two of them would not.

**Process fix:** for any test asserting a *property* rather than a value — purity,
absence, invariance — break the property deliberately and confirm the test fails.
That was done for #29 and #30 before pushing (a dynamic import and a `fetch` injected
into `geo.ts`; both new gates caught them, the old regex caught neither). It costs
about a minute and is the only thing that distinguishes a real gate from a decorative
one.

**Generalised lesson:** the more confident a test's comment, the less it gets
re-examined — an assertion that *says* it guards something is treated as if it does.
This is the `imprecise-claim` cause the log already tracks for docs (#1, #7, #24),
appearing for the first time in test code, where it is worse: a stale doc misleads a
reader, but a decorative test also **suppresses** the suspicion that would have caught
the thing. Worth watching as the parser lands — Phase 3 leans heavily on exactly this
kind of property test (no `new Date()`, no DB, no `fetch` across every parser file).

### #31–34 — Round 2 on the same small PR: the r1 fix was itself an overcorrection (2026-08-23)

**What:** a second review of PR #74 — 50 lines of production code — found four more
things, one of them (#32) a defect *introduced by the round-1 fix*. The r1 comment
stripper, added to stop the purity guard tripping on geo.ts's own prose, was
string-literal-unaware: a `/*` inside a string swallows to the next `*/`, taking a
real `import { supabaseAdmin }` with it. The guard went green while guarding nothing.

**Why it got through:** r1's mutation test proved the guard caught a dynamic import
and a `fetch`. It did not test the *stripper* — only the matcher. Having verified the
part I had just been criticised about, I treated the helper I wrote alongside it as
support code rather than as new surface needing its own adversarial case. The
mutation test was aimed at the finding, not at the change.

**Process fix:** mutation-test the whole changed guard, including helpers introduced
to support it. The question is "what input makes this guard pass when it should
fail", asked of every part of it — not "does the reported hole close".

**Generalised lesson, and the one worth acting on:** #23 already recorded three
consecutive rounds where fixes introduced defects, and #25 a fourth. This is the
fifth, and the first inside test-infrastructure code. The pattern is stable enough to
predict: **the fix for a review finding is the least-reviewed code in any PR**, because
it arrives after the scrutiny that produced it and carries the authority of "this is
the correction". Two rounds on a 50-line module is not a sign the module was bad — it
is a sign that one round is not a gate. Treat a review fix as new code, at full
suspicion, and expect a second round on anything where the fix was non-trivial.

**Also worth noting for Phase 3:** #31 was a real behavioural defect, not a comment —
and it was invisible to `tsc` precisely because the unsound call happens in a
*consumer that does not exist yet* (#63, geocoding). The type signature says `number`;
`res.json()` says `any`; nothing in this PR could have caught it. Modules written
ahead of their consumers need their runtime guards chosen against the consumer's real
input shape, not against their own signature.

### #35–39 — The back-and-forth, diagnosed: fixing instances instead of the mechanism (2026-08-23)

**The shape, across three rounds of one 50-line PR:**

| Round | Findings | Caused by the previous round's fix |
|---|---|---|
| r1 | 3 | — |
| r2 | 4 | 1 (#32) |
| r3 | 4 | 2 (#35, #37) |

Every single one of those regressions was in the **same five-line helper**: the
purity guard's import matcher. Three rounds, three different holes, three fixes,
each closing exactly the hole reported and opening or leaving another:

```
r1  /^\s*import\s/m        → missed `import{x}from"y"`, `await import(…)`
r2  \bimport\b + stripper  → stripper ate a real import between `/*` in a
                             string and the next `*/`
r3  line-anchored filter   → dropped `/* c */ import { … }` code and all,
                             and never covered `export {x} from`
```

**Why it circled.** Each round I asked *"how do I close this hole"* and never
*"why does this thing keep having holes"*. The answer to the second question was
available at r1 and would have ended it there: **matching a language grammar with
regexes does not converge** — there is always one more syntactic form, and each
patch adds surface for the next one. The fix that finally worked was not a better
regex; it was deleting the regex and calling `ts.preProcessFile`, the scanner the
compiler already uses to answer that exact question. TypeScript was a devDependency
the entire time.

**The diagnostic, stated so it is checkable:** *when the same artifact produces a
finding in two consecutive review rounds, stop fixing it and replace the approach.*
Two rounds is not bad luck; it is evidence the mechanism is wrong. This is cheap to
apply because the condition is mechanical — same file, same function, two rounds.

**What the rounds actually cost, and the proportionality lesson.** Across all three
rounds the production predicate produced exactly **one** real behavioural defect
(#31, the missing `Number.isFinite`) — and that one was invisible to every gate
because the unsound call lives in a consumer that does not exist yet. Everything
else, eleven findings, was in the verification apparatus and its comments. A 50-line
module accumulated 248 lines, most of it guard, and the guard was the only thing
that kept breaking. Worth asking on the next module whether the apparatus is earning
its keep, rather than assuming more of it is safer — apparatus is code, it regresses
like code, and it is reviewed less because it looks like diligence.

**#39 is the same failure one level up.** The r3 mutation harness detected failure by
counting `×` characters, so a suite that died at module load — no tests run — read as
"MISSED" and I nearly reported two holes that did not exist. The verification of the
verification had a hole of its own, caught only because the result was surprising
enough to re-check. Surprise is not a gate. Prefer exit codes to output scraping, and
when a mutation "escapes", confirm the harness before believing it.

**Standing correction to the r2 lesson.** Row #31–34's entry said to treat a review
fix as new code at full suspicion. True but insufficient — it still frames the unit
of work as the fix. The unit is the **mechanism**: a fix that leaves the same
mechanism in place has not reduced the chance of a next round, however carefully it
is reviewed.

### #40–43 — The right instinct, the wrong API: when "use the real tool" is not enough (2026-08-23)

**What:** PR #74 round 3 concluded that hand-written matchers cannot win against a
grammar and replaced the regex with `ts.preProcessFile`. That conclusion was
correct. The *implementation* of it was not: `preProcessFile` answers "which files
must I resolve", not "does this module import anything", so anything it cannot
resolve to a filename — `export * as ns from`, `await import(someVar)`,
`require(someVar)` — it omits silently. Four rounds, four holes, same artifact.

**Why it got through:** the r3 commit message claimed the guard now "inherits
TypeScript's definition of an import". That was asserted, never checked. What was
verified was a list of forms I thought of, and every one of them happened to be
statically resolvable — so the probe agreed with the claim while testing none of
the cases that would have falsified it. A test suite built from the author's own
imagination confirms the author's own blind spots.

**Process fix:** when adopting a library or API to replace hand-rolled logic, read
what it is *for* before claiming what it *does*. `preProcessFile` is documented as a
pre-processor for module resolution; that sentence was available and would have
predicted the exact failure. Adjacent-purpose APIs are the dangerous ones — they
work on every case you think of, because you think of the cases they were built for.

**Generalised lesson, and a sharpening of #35–39's rule.** That entry said: when the
same artifact produces findings in two consecutive rounds, replace the approach. Round
3 *did* replace the approach and still produced round 4 — so the rule needs a second
half. **Replacing the approach only ends it if the replacement is verified against the
cases the old approach could not express.** The forms that beat `preProcessFile` were
precisely the ones a regex could never have been asked about, so nothing in the
existing fixture set covered them, and the new mechanism inherited the old mechanism's
test blind spot. A replacement tested only by the tests that motivated it is not yet
verified — it is re-confirmed.

**What ended it (predicting, not hoping).** `createSourceFile` is exhaustive *by
construction*, not by enumeration: every import form is one of four node kinds, so the
question "is there another syntactic form" has a structural answer rather than an
empirical one. That is the difference between this fix and the previous three — the
earlier ones could only ever be defended by listing cases. Two false-positive classes
also vanished without being fixed (comments and strings are not call nodes), which is
the signature of a mechanism operating at the right level.

**Also:** #43 is worth its own note. A decoy fixture labelled "a template literal
mentioning fetch" contained no `fetch(` and so exercised nothing — the fetch and clock
checks had *zero* false-positive coverage while appearing to have some. A fixture that
does not engage the code under test is worse than a missing one, because it occupies
the slot where the real test would go. Check that negative tests fail when the guard
is inverted, not merely that they pass.

### #44–48 — The circle broke where the mechanism was structural, and continued where it was not (2026-08-23)

**The result worth recording.** This round split cleanly along a line drawn in the
previous entry. The IMPORT half — rebuilt on node kinds, a closed set in the grammar —
produced **zero** findings, after producing one in each of the four rounds before it.
The GLOBALS half, which was never rebuilt and remained name matching in an AST costume,
produced five. Same file, same round, same author, opposite outcomes.

That is the clearest evidence yet for the rule #40–43 proposed: a mechanism whose
completeness is *structural* stops generating findings; one whose completeness is
*enumerated* keeps generating them until the enumeration is exhausted, and it never is.
The fix was not "be more careful" — the same care was applied to both halves in the
same commit.

**Why the globals half was not rebuilt, stated honestly:** because the AST fix made it
*look* rebuilt. Moving `fetch`/`Date` from regex to identifier matching changed the
implementation but not the epistemics — it was still a list of names I thought of,
wearing the credibility of the parser sitting next to it. Row 47 is the same over-claim
in the header: "exhaustive by construction" was written about the whole file when it
was only ever true of one half.

**#44 is an overcorrection of the classic shape**, and worth naming: the exclusion that
stopped `config.Date` from firing was correct in isolation, and it silently disabled
detection for `globalThis.Date` — a fix for a false positive opening a false negative.
That direction is the dangerous one, and it is the third time in this PR sequence a
narrowing has cost coverage. When adding an exclusion to a guard, enumerate what else
matches the exclusion, not just the case that motivated it.

**#46 is a different and more interesting failure: a guard that forces its own
disabling.** `new Date(parsedAt)` is deterministic and is exactly what the six parser
modules must do, but it was flagged, and the only escape hatch also permitted
`Date.now()`. Nobody would have reported this as a bug — the first parser module would
simply have passed `forbidClock: false` and moved on, and clock detection would have
been off across the parser with a plausible-looking reason in the diff. **A guard whose
correct usage requires disabling it is worse than no guard, because it leaves the
appearance of coverage.** Worth checking for directly: for each rule, what does the
first legitimate consumer have to do to comply, and can they comply at all?

**Decision, recorded so it is not re-litigated:** the globals half stays name-based and
biased to false positives. Symbol resolution would need a `Program` and lib resolution
per file to distinguish a shadowed `fetch` from the global. That is real cost for a
case that cannot occur in the modules this covers, and the failure mode is loud. The
limit is now pinned by a test rather than left to be rediscovered.

### #49–50 — Third round on the same half, and the fix that finally matched the import half (2026-08-23)

**The pattern, now unambiguous.** Across PR #76's three rounds the import half — rebuilt
on node kinds in r1 — produced findings in **zero** of them. The globals half produced
findings in **all three**: r1 name-matching holes, r2 namespace bypasses, r3 alias
bypasses. Every globals fix so far had the same shape: *exclude a category, then re-add
the specific shapes that matter.* r2 excluded property accesses and re-added three call
shapes; r3's findings were all in the gap between "three call shapes" and "every
position a value can occupy".

**Why that shape keeps failing.** Enumerating the positions a value can appear in is
open-ended — call, new, alias, `.call`, `.bind`, destructure, element access, argument,
and whatever gets added to the language next. Enumerating the *deterministic exceptions*
is not: `new Date(x)`, `Date.parse`, `Date.UTC` is the whole non-clock surface of the
Date API, and that API is closed. Same information, opposite direction, and only one of
the two directions terminates.

**The fix, and how it was confirmed structural rather than lucky.** `denotedGlobal()`
resolves an expression to the global it denotes and the default flips to deny. The
confirmation was not that the reported cases passed — it is that **`Date["now"]()` and
`const { now } = Date` are now caught, and neither was reported by review nor
enumerated anywhere.** A fix that only closes what was reported is a patch; a fix that
closes things nobody mentioned is operating on the mechanism. That test — *does the fix
catch cases outside its own motivating set* — is the cheapest available signal for
telling the two apart, and it should be asked of every "structural" claim, including
the two earlier ones in this sequence that turned out to be patches.

**Cost of the whole sequence, recorded for the phase-boundary read.** One 50-line
production module (`geo.ts`, one real defect, row 31) plus its test guard consumed six
review rounds and twenty-three log rows. Twenty-two of those rows are the guard, not
the module. The guard is now shared and will cover eight parser files, so the
investment amortises — but the honest lesson is that **verification apparatus deserves
the same design scrutiny as production code and rarely gets it**, because it reads as
diligence and reviews as boilerplate. #56 is the test: it should inherit this guard in
about five lines and produce zero findings about purity checking.

### #51–54 — The claim was the defect: "closed set" asserted in prose, four times (2026-08-23)

**The finding that matters is #51**, because it landed on the half that had gone quiet.
The import walk produced zero findings in rounds 1–3 and I read that as confirmation
the set was closed. Round 4 found `ImportType`. The silence had been evidence of
nothing — three rounds of reviewers happening not to try a type-position import.

**Why the "structural" claim was itself unverified.** Rows #40–43 concluded that a
mechanism is trustworthy when its completeness is structural rather than enumerated,
and that entry was right. What it missed is that **I never checked whether my
enumeration matched the structure I was appealing to.** "Every import is one of four
node kinds" is a claim ABOUT the grammar, and the grammar was sitting in
`ts.SyntaxKind`, enumerable at runtime, the entire time. I asserted a closed set from
memory while the actual closed set was one `Object.keys` away.

**The correction, and it generalises past this file:** a structural claim must be
*executable*, or it is just a confident enumeration. The guard now has a test that
walks `ts.SyntaxKind`, and every import-related kind must be either handled or listed
as carrying no specifier — with a second test failing if a listed kind stops existing,
so the list cannot drift in either direction. A TypeScript upgrade adding a form now
breaks a test. That is the difference between "I believe this is complete" and "this
is complete unless something tells us otherwise".

**The signal that the globals fix was real, twice running.** In r3 and again in r4 the
mechanism caught forms nobody reported — `Date["now"]()` and destructuring in r3;
`new (Date)()`, `(Date)["now"]()` and `(fetch as never).bind()` in r4. That test —
*does the fix catch cases outside its own motivating set* — has now correctly predicted
mechanism-level fixes twice, and correctly failed to fire for the three patches before
them. It is the cheapest discriminator found in this whole sequence and belongs in the
review loop, not just in this log.

**Closing accounting for the sequence.** Seven review rounds across two PRs, 27 log
rows, for one 50-line production module carrying one real defect. The guard is now
shared and will cover eight parser files. Whether that was worth it is answered by
#56, not by argument: it should inherit the guard in a few lines and produce zero
purity findings. If it does not, the amortisation case fails and the honest conclusion
will be that the apparatus outgrew what it protects — which is worth writing down in
advance, so it is a prediction rather than a rationalisation afterwards.

### #55 — A rule that stated the format and then contradicted it (2026-08-23)

**What:** the `Where` column rule read *"`PR #<n> / IS #<n>` … the PR number needs no
prefix"*. The first clause is the format; the second was meant as "no **`IS`** prefix"
and reads as "no prefix". I followed the second and wrote 27 rows as `74 / IS #55`.

**Why it got through:** the correct format was on the same line as the sentence that
contradicted it, and the sentence was more specific — so it read as the clarification
rather than the error. Nothing checked the rows against the twenty-seven existing ones
directly above them, which all say `PR #52` and would have settled it in one glance.

**Process fix, and it is cheap:** when a written rule and the existing data disagree,
the data wins — it is what the convention actually is. Before following a format rule,
look at the last few rows and copy their shape. That is faster than parsing the prose
and it is self-correcting.

**Why this one is worth a row despite being cosmetic.** The `Where` column is the
*durability hedge*: this file is gitignored and lives on one machine, and those
references are the only link to the diff and the review discussion that survive losing
it. A malformed reference is not a formatting nit — it is the one column whose whole
job is to still make sense to someone who no longer has this file's context.

**Also worth noting:** this is the first miss in the last 28 rows caught by the user
rather than by review or by a gate — every one of #28–54 came from a code review that
was, by construction, looking at code. The log's own formatting is not in any review's
scope. Worth remembering at phase boundaries, when this file gets read rather than
appended to.

### #56–59 — The purity guard's prediction held; the module's own logic is where the misses were (2026-08-29)

**The prediction from #51–54 was written down in advance and can now be scored: it
held.** #56 inherited the shared guard in about thirty lines, re-implemented nothing,
and produced **zero** findings about purity checking. Seven review rounds of apparatus
work paid for itself on the first consumer. The one purity finding (#59) was about the
*glob* in this issue's own new file, not about the shared mechanism — and it was the
same silent-pass class the file's own comment already cited, one directory down, which
is a nice demonstration that knowing about a failure mode does not automatically mean
applying it everywhere it applies.

**Where the findings actually were: Unicode.** All four remaining findings were
`normalizeCaption` mishandling text, and #56 is the one worth remembering. NFD input
made `detectNegation` return false for a genuine cancellation — the failure is
**invisible in either module's own tests**, because each is correct in isolation and
only the composition is wrong. Both modules had thorough unit tests; neither had a
test that ran one into the other, so the bug lived exactly in the gap between two
green suites.

**Process fix:** when module B's contract says "expects the output of module A", test
the composition, not just both units. The pipeline this phase is building is six such
handoffs (`normalize → negation → location → address → date → time`), and every one
of them has a gap of this shape available.

**Generalised lesson.** The last three PRs' findings were concentrated in verification
apparatus; this one's were concentrated in domain logic, and the difference is
instructive. The apparatus findings all came from *enumerating* something open-ended.
These came from **not knowing the input domain** — that Swedish text has two encodings,
that Instagram tags run together, that emoji are used as separators. No amount of
structural rigour substitutes for knowing what the data actually looks like, and this
phase has explicitly **zero real caption data** (plan #4). Worth carrying into #57 and
#58: date and time formats are input-domain problems of the same kind, and the honest
position is that our fixtures are guesses until Phase 8.

### #60–63 — Domain ignorance, not structural weakness — and the one enumeration that is safe (2026-08-29)

**The prediction in #56–59 was right and worth acting on.** That entry said the
remaining risk in this phase was *not knowing the input domain*, unlike the previous
three PRs where it was open-ended enumeration. Round 2 confirmed it: every finding was
about how Swedish captions actually read, and none was about mechanism. No amount of
parser rigour would have surfaced "Glöm inte att vi står på Heden!" — only knowing that
Swedish marketing copy negates an imperative does.

**The mistake underneath #60 is worth naming precisely.** Round 1's vocabulary was
built by *excluding* dangerous words — `stänger`, `ingen`, `tyvärr` — and each
exclusion was correct. But the two words that survived, `inte` and `ej`, were the least
precise in the language: general negation particles that attach to whatever follows.
The whole exercise of pruning the list was performed while the biggest problem sat
inside it, untouched, because it was in the issue's acceptance criteria and therefore
never questioned. **A spec-mandated element is still an element that can be wrong**; it
was read as a fixed point rather than as an input to check.

**The fix is a kind that this log has been sceptical of, and the distinction matters.**
It relies on two enumerations — operating verbs and open states — after four PRs of
evidence that enumerations do not converge. What makes it defensible is the FAILURE
DIRECTION: a verb we did not think of means a cancellation is *missed*, costing a stale
pin that `expires_at` clears in hours. It can never cause a false deletion. The purity
guard's enumerations failed the other way — a missed import form meant an impure module
passing silently — which is why they had to be replaced with something structural.
**The lesson is not "enumerations are bad", it is "enumerate only where the gaps fail
safe"**, and that is now stated in the source next to the lists so the next reader does
not have to re-derive it.

**#62 is the second overcorrection in two rounds on this file** (r1's dot fix broke
hashtags), which fits the pattern #35–39 recorded: a review fix is the least-reviewed
code in a PR. It also has the same shape as #44 — a change made to fix one false
positive silently opening a false negative. That is now three occurrences of that exact
shape across three PRs, and it is specific enough to check for directly: **when
widening a pattern to accept a new case, ask what else the widening now accepts.**

**#63 restates a lesson this log keeps re-learning in new places**: the comment was not
merely inaccurate, it was load-bearing. "Tag text says nothing about location" is what
made stripping tags look free, so the cost was never weighed. A false premise in a
comment does not just misinform — it forecloses the decision it describes.

### DECISION — Stop reviewing PR #77; the negation vocabulary is provisional (2026-08-29)

Recorded so it is not re-litigated, and so the reasoning survives the PR.

**The question asked:** after two review rounds and ten findings on ~150 lines, is
PR #77 circling the way PR #74 and #76 did?

**Assessment: no, and the discriminator from #51–54 is what settles it.** That rule —
*does the fix catch cases outside its own motivating set?* — was designed exactly for
this question. The review reported six false-positive captions; the particle/marker
split also fixes an unbounded class nobody mentioned (any particle not adjacent to an
operating verb: "Glöm inte vår nya meny", "Vi tar ej Swish"). Mechanism, not patch.
Supporting evidence: the findings MOVED rather than repeated — r1 was Unicode and tag
mechanics, r2 was negation semantics, and neither recurred — and the shared purity
guard produced zero mechanism findings across both rounds, which is the #75
amortisation case continuing to hold.

**One genuine circle signal, and it is the third instance:** r1's dot fix caused
r2's #62. Widening a pattern to fix a false positive, thereby opening a false
negative, has now happened in #44, #50 and #62 — three PRs running. Specific enough to
check directly, and now the standing question to ask of any pattern widening.

**THE STOPPING CONDITION HERE IS DIFFERENT FROM #76'S, and this is the part worth
keeping.** #76 stopped because it converged — each round's findings were narrower than
the last. #77 stops for another reason: **it has reached the limit of what review
without data can establish.** Another round would likely surface more Swedish
phrasings, and another after that more still — not because the mechanism is wrong, but
because we have **zero real captions** (plan #4) and every fixture is a guess about how
Gothenburg food trucks write. Review cannot close that gap; Phase 8 onboarding can.
Iterating further would spend rounds generating more guesses and would read like
diligence while producing none.

**Decision:** merge #77. Treat `OPERATING_VERBS`, `OPEN_STATES` and the marker list as
**explicitly provisional** — the first artefacts to revisit when real captions arrive,
ahead of the location dictionary. The residual risk is bounded by design, not by hope:
a missed cancellation is a stale pin that `expires_at` clears within hours, and a
negation still passes through the override matrix (#1, #6) so no low-confidence lane
can cancel a higher-confidence location.

**Generalised lesson — two distinct reasons to stop reviewing, and they need different
responses.** *Converged* means the mechanism is right and further rounds find less;
stop and merge. *Data-limited* means the mechanism is right but the inputs are guesses;
stop, merge, and mark what is provisional so it gets revisited when the data exists —
because further rounds cannot distinguish a good guess from a bad one. Confusing the
second for the first produces exactly the false confidence this log exists to catch:
a green suite full of fixtures nobody has checked against reality.

### #64–68 — A change made for one consumer, evaluated against only that consumer (2026-08-29)

**#68 is the entry worth keeping.** #78 preserved hashtag text so `extractLocation`,
`extractDate` and `extractTime` could see it. Every line of reasoning — the issue, the
PR body, the code comments — weighed those three. **`detectNegation` reads the same
string and was never mentioned**, and it is the one consumer whose false positives
DELETE data. Segmentation gives a marker inside a tag clean word boundaries, so
`"Heden 11-14 idag! #StängtPåSöndag"` now removes today's pin over a note about Sunday.

**What makes it instructive rather than just a miss:** the rows #56–59 entry, written
in this same PR sequence, already said *"when module B's contract says it expects
module A's output, test the composition"*. That lesson was about a bug BETWEEN two
modules. This is the same shape one level up — a change to a shared input, evaluated
against some of its readers and not others — and the earlier phrasing did not generalise
far enough to catch it. Sharpened: **when changing what a shared value contains,
enumerate every consumer of that value, not the ones the change was made for.** For
`normalizeCaption` that list is now four and will be seven by #67.

**The mitigating fact, which is also a warning.** The prose form
`"…idag, stängt på söndag"` already fails identically on `dev` — verified — so #78
widened an existing hole rather than digging a new one. That distinction is worth
drawing carefully, because it cuts both ways: it means the PR is not the culprit, and
it means a defect of this severity had been sitting unnoticed since #56 with a green
suite over it. Nobody wrote that test because the negation tests were about vocabulary,
not about scope. **Issue #80 filed rather than fixed in place** — the fix needs
`extractDate`, and narrowing it in step 0 would mean teaching the normalizer the
negation vocabulary and inverting the layering.

**#65 is a small win worth noting for contrast.** The first fix for #64 — always emit a
trailing space — split `"#11.30-13.00"` into `"11 .30-13.00"`. It was caught by probing
the change before committing, not by the suite, which had no fixture for a dotted time
inside a tag. That is the fifth overcorrection in this sequence, but the first caught
BEFORE it reached a review, and the thing that caught it was running the change against
a spread of real-shaped inputs rather than only the case being fixed. Cheap, and it
generalises: after any fix, re-run the neighbouring cases, not just the failing one.

### #69–70 — A stale date carried across a resumed session, then over-corrected (2026-08-29)

**What happened, in two parts.** This session spans two days: PR #74, PR #76 and issue
#75 on 2026-08-23; PR #77, #78, #79 and #80 on 2026-08-29 after it resumed. Rows 56–68,
written on the second day, were dated 2026-08-23 — the previous day's date, carried
forward rather than read. Then the correction rewrote **all 41** session rows to
2026-08-29, which corrupted the 28 that had been right all along.

**The second error is the more interesting one, and it has a familiar shape.** The
correction was applied to a pattern (`| 2026-08-23 |`) rather than to the rows that were
actually wrong, on the assumption that a session is a day. Nothing was checked before
the blanket edit — the same class as #69 itself, one step later. This is the sixth
overcorrection in the sequence, and the third where **a fix was applied more broadly
than the defect it was fixing**.

**What settled it was external evidence, and it was one command away the whole time.**
`gh pr view --json createdAt` and `git log --date=short` give the true date of every
row's referenced work. That is the same lesson as #51 (asserting a closed set from
memory while `ts.SyntaxKind` was one call away) and #69 (inferring the date from the
neighbouring row): **a value that can be looked up should never be derived from
context.** Three instances now, in three registers — a grammar, a calendar, and a
session boundary.

**Process fix, specific and cheap:** the `Where` column already names a PR or issue for
almost every row. That reference IS the date, authoritatively. When a row's date is in
doubt, read it off GitHub rather than off the row above. And when correcting data in
bulk, correct the rows that are wrong, not every row matching the wrong value.

**Third user-caught miss this session, all three in the log's own metadata** — the
format rule (#55), the date (#69), and this correction (#70). Nothing reviews this file:
code review looks at code, and it is gitignored. That is now a documented blind spot
rather than three coincidences, and it argues for a quick self-check at phase
boundaries — the `Read it at phase boundaries` instruction at the top of this file is
the natural place for it.

### #71–75 — Converging on mechanics, circling on the one thing that was documented instead of fixed (2026-08-29)

**The question this round was asked to answer: is PR #79 circling? The answer splits
cleanly by dimension, and the split is the useful part.**

**Segmentation mechanics — CONVERGING.** r1 found three (mention-after-tag, underscore,
entrance letter); r2 found one (acronym-then-word), narrower and in the same family the
earlier fixes established. Each fix also caught cases nobody reported — the acronym rule
handles `#GBGLunch` and any acronym-word pair, not just the reported `#GBGJärntorget`.
By the #51–54 discriminator that is mechanism work, and the trend is downward.

**The normalize↔negation interaction — CIRCLING, and the cause is my response, not the
mechanism.** r1 found a negation false positive caused by preserving tag text. I
documented it and filed #80. r2 found a DIFFERENT manifestation of the same
interaction, which #80 does not cover. **Documenting a defect does not reduce the
chance of the next round finding it again; it only records that it was seen.** Two
rounds, two findings, zero fixes — that is the definition of going around rather than
forward, and no amount of careful prose in the comment changes it.

**What was actually wrong with the r1 response.** The finding was treated as a property
of *this PR* ("we widened something") and therefore as something to disclose. It is a
property of `negation.ts`, which fires on invitations and menu negations in plain prose
on `dev` — verified. Filing #81 against the real owner is the action that ends it;
#80 was filed against a different defect and could never have closed this one.
**Corollary worth carrying: when a finding is deflected as "pre-existing", that is a
reason to file it against its true owner, not a reason to stop.**

**Two misses caught by probing rather than by review or the suite (#72, #73), and both
were confident claims.** `\p` inside a template literal collapses to `p`, so a
lookbehind silently matched nothing; and "the fixpoint will reach the second `#` later"
was reasoned rather than run — the replacement leaves a letter in front of it, so the
string sits at a *wrong* fixpoint. Both were caught by the same habit: after each fix,
re-run a spread of neighbouring inputs rather than only the case being fixed. That habit
has now caught four defects before commit in this sequence (#65, #72, #73, and the
trailing-space regression), which makes it the highest-yield practice found here.

**Net:** forward on mechanics, and the circling thread now has an owner. The merge
question is no longer "is the code right" but "is widening a known deletion bug
acceptable while #81 is open" — a scoping decision, not a code one.

### #76–80 — Fail-safe is a direction, not a defence (2026-08-29)

**The framing that produced four of these five findings.** #81's fix chose an allowlist
over a denylist because the allowlist's gaps *fail safe*, and that reasoning is sound —
#76 is the one place it broke, and it broke precisely where a construction slipped past
the allowlist in the deleting direction. But having established "gaps here are safe", I
stopped looking for gaps. Four recall families were missing — V2 inversion, leading
dashes and bullets, quantifiers, dash and ellipsis clause ends — and V2 inversion is the
**most idiomatic way a Swedish caption phrases a cancellation**, so the guard shipped
missing the common case while passing every test.

**The lesson, stated so it is checkable:** *fail-safe describes what happens when the
rule is wrong; it says nothing about how often it is wrong.* A guard that never deletes
data but also never fires is perfectly safe and perfectly useless. Both directions need
their own fixtures, and after this the negation suite has them — 82 tests, roughly half
asserting it stays quiet and half asserting it still fires.

**#76 is worth its own note, because the earlier guard was luck.** "Vi stänger inte
förrän 15" was already excluded — but only as a side effect of `stänger` having been
kept out of OPERATING_VERBS for an unrelated reason (it is a closing TIME, not a
cancellation). The copula form of the same construction had no such accident behind it.
**A case that passes for a reason unrelated to why it should pass is untested, whatever
the suite says**, and that is invisible from the green result. Worth asking of any rule
that "already handles" something: is it handled, or is it lucky?

**#80 is the meta-finding and the one to carry forward.** The PR's comments asserted the
allowlists covered the grammar. What had actually been reasoned about was their failure
*direction*. Those are different claims, and the second was written as though it implied
the first — the same shape as #51 ("closed set" asserted from memory) and #63 ("tag text
says nothing about location"). Three instances now of a comment that is not merely
inaccurate but load-bearing: it foreclosed the search that would have found #77–79.

### #81–86 — The circling had one cause, and it was the shape of the guard (2026-08-29)

**The question was whether PR #82 is going around. It was — and this round found the
reason, which the previous three rounds had not.**

Every guard added to this module had been TOKEN-ADJACENT: a lookahead at one fixed
offset, answering "what is the next word". Each one was then defeated by the same
construction with a word inserted:

```
r1 guard   (?!\s+förrän)  after the state   →  beaten by "öppet IDAG förrän 13"
r1 rule    no guard on the verb rule        →  "öppnar inte idag förrän 13"
r0 rule    temporal must follow immediately →  beaten by "inte alls idag", "inte hela veckan"
```

That is not four defects. It is one defect appearing four times, and every previous
round fixed the instance. The clause-level version — a particle, then anything short
of a sentence terminator, then `förrän` — closes all word orders at once and needs no
list of what may sit between. **The test for whether a guard is the right shape is
whether an inserted word can walk around it**, and it is cheap to ask of any lookahead
before writing it.

**#84 is the strongest evidence the new shape is right, because nobody reported it.**
Writing a test for the new suppressor exposed that BOTH suppressors ran over the whole
caption, so one suppressed sentence silenced every other — `"Ej öppet idag. Vi ses inte
förrän imorgon"` returned false. That flaw predates this PR and had survived four review
rounds. Splitting evaluation per sentence fixed it and sharpened `^`/`$` in every rule
for free, which is the signature of operating at the right level rather than patching.

**#83 is the round's overcorrection, and it followed the pattern this log has now
recorded four times** (#44, #50, #62, #83): a fix for a false positive opening a
false negative. The r1 trailing constraint bought one restriction case and cost an
entire ordinary family. Worth noting what would have caught it — asking *what does this
constraint reject that I did not intend*, which is the same question as the walk-around
test, pointed the other way.

**Net on the circling question.** Rounds r0–r1 were going around: each fixed the
reported strings, and the underlying guard shape kept producing new strings. This round
changed the shape, and the evidence that it worked is that it closed two reported
findings plus one nobody reported plus a pre-existing flaw older than the PR. The
remaining risk in this module is vocabulary — which is data-limited, per the #77
decision entry, and does not improve with more rounds.

### #87–90 — The right fix, applied one notch too widely (2026-08-29)

**r2 changed the guard SHAPE and that was correct. r3 shows it was applied one notch
too widely, and the cost landed on a suppressor that had nothing to do with the
problem being solved.**

Splitting evaluation per sentence was needed for the delayed-opening veto. It was
applied to `NEGATED_MARKER` at the same time, because "per sentence" was adopted as a
setting for the function rather than as a property of each rule. But a double negative
DENIES A CLAIM, and the claim is routinely in an earlier sentence — so the split
reintroduced the module's own listed example, in the deleting direction. **The
question "what is this rule's natural scope" has a different answer per rule, and a
uniform answer will be wrong for some of them.**

**Two of the three r3 regressions are the same over-broad instinct in miniature:** the
veto also silenced `MARKER`, which a delayed opening cannot masquerade as, and its span
crossed commas into unrelated clauses. Each was a case of the guard reaching further
than the construction it models. That is now four separate scoping errors in two
rounds — offset, sentence, rule set, comma span — which is worth naming as its own
recurring failure rather than four incidents: **when adding a guard, state what SPAN
and which RULES it governs, and check both against a caption where the construction
appears next to an unrelated one.**

**The counting.** r0→r3 on this issue: 5, 6, 4 findings, with 2 regressions in r2 and 3
in r3. That is not converging on the findings count. But the KIND has changed — r0/r1
were about which word to match, r2/r3 about how far a rule reaches — and the r3 fixes
closed two pre-existing gaps (#89, #90) that predate the branch. The shape work is
done; what is left is vocabulary and span calibration, and span is now covered by the
rule above.

**Worth stating plainly for the phase-boundary read: `negation.ts` has consumed four
review rounds and 16 log rows for ~200 lines.** It is the highest-cost artefact in the
phase by a wide margin, and the reason is structural rather than accidental — it is the
only module whose false positives DELETE data, so every gap is worth a round, and it
models a natural language with zero real examples to check against. Both conditions
persist. The right expectation for #67 and beyond is that this file keeps needing
attention, and the right response is #80's date scoping plus real captions in Phase 8,
not more rounds now.

### DECISION — A prescribed dependency is a hypothesis, and the allowlist is where it gets tested (2026-08-30)

**#91 is the first row where a handoff comment was wrong, and the reason is worth
separating from the outcome.** That comment was otherwise the most valuable artefact
in the phase — it was right about the purity guard covering new files automatically,
right about `#78` widening what date words reach an extractor, right about the
weekday inflections, and right that the failure direction here is not `negation.ts`'s.
Nine claims, one wrong. The lesson is not to trust handoffs less.

**The lesson is that `date-fns-tz` was written down at PLANNING time, when nobody had
yet asked what the conversion converts.** "Timezone handling via `date-fns-tz`" is a
correct rule for this project — at the seam where a date and a time become an instant,
which is `#58` and `#67`. It was carried onto `#57` by proximity, because `#57` is
about dates, and a date sounds like a thing with a timezone. It is not: a calendar
date has the same weekday and the same successor in every timezone on earth. The
issue's own non-goals said so — *"does not convert to UTC instants; that happens once
time is known"* — one section above the line prescribing the library.

**What makes this a process row rather than a judgment call: the prescription would
have made the module WORSE, not merely heavier.** Anchoring a date to Stockholm
midnight to do arithmetic on it means `+24h` lands on 01:00 the next day on
2026-03-29 and 23:00 the *same* day on 2026-10-25 — a silent wrong date twice a year,
in a module whose entire job is returning the right one. The dependency does not
protect against that class; it is the only way to be exposed to it. UTC has no
offset and no DST, so the arithmetic is exact and the edge cases do not exist.

**The allowlist did its job, and this is the first evidence of it.** `#75` built
deny-by-default so that "a new dependency has to be argued for in the test, where the
decision is visible". The argument got made — and its conclusion was *no*. That is
the mechanism working, not failing: an allowlist that only ever ratifies what the
plan predicted is a formality. The line now carries the reasoning for a package that
is **absent**, which is the more useful thing for it to record, and it names `#58`
and `#67` as where the entry should genuinely appear.

**Generalising, since this is the third row about a rule applied one layer off**
(#7 consulted-but-not, #64–68 one-consumer, #87–90 one-notch-too-wide): *a rule
inherited from a plan names a LAYER as well as a technique, and the layer is the part
that gets dropped when the rule is copied onto an issue.* Before adopting a
prescribed dependency, ask what it would do here — not whether it is the right tool
for the project.

### DECISION — `date.ts` owns the weekday vocabulary; `negation.ts` imports it (2026-08-30)

`WEEKDAYS` and the `(?:en|ar|arna)?` inflection suffixes were written in
`negation.ts`, because a cancellation names a day. `extractDate` needs the identical
seven stems and the identical endings, and `#57` explicitly left the choice open:
share the list, or keep a second copy.

**Shared, with `date.ts` as the owner.** Two hand-maintained lists of Swedish
weekdays are `manual-drift` waiting to happen, and this log already carries that
cause four times. The direction is the part worth recording so it is not re-argued: a
date module owning a weekday table is the natural layering, whereas a date extractor
importing from a negation detector inverts it. So the constant moved rather than
being imported backwards, and `negation.ts` re-exports it so its consumers never
needed to know it left.

**The suffixes moved too, and that was the less obvious half.** They were a regex
literal in `negation.ts` and a list in `date.ts` would have drifted the same way the
stems would — process-log #86 is the row where listing stems without endings made
`"på söndag"` match while `"på söndagen"` missed. Stems and endings are one piece of
knowledge about what a Swedish weekday looks like; splitting them across two files is
how one gets updated alone.

**What was deliberately NOT shared:** the `(?<![\p{L}\p{N}])` / `(?![\p{L}\p{N}])`
boundary idiom, which both modules need and both now define. A third exported
constant to carry a two-token regex costs more coupling than the duplication does.
The hedge is that `date.ts` asserts the *behaviour* directly — `"söndagsöppet"` must
not match — so a wrong copy fails loudly in tests rather than silently matching
inside a Swedish compound, which is the failure `\b` produces and the reason the
idiom exists.

**Also settled, so `#58` does not re-litigate it:** `TEMPORAL_WORDS` stays in
`negation.ts` and is *not* shared. It looked like the same case and is not — it is a
list of what a cancellation can attach itself to, which includes words `extractDate`
deliberately does not resolve (`helgen`, `veckan`, `ikväll`). Sharing it would have
coupled two modules through a list neither uses the same way.

### #92–95 — The review was right four times and right for the wrong reason once (2026-08-30)

**Two of the five findings were defects, and both are the same shape: a stated
invariant with nothing enforcing it.** The module says "always resolves forward,
never into the past" and "matching is case-insensitive" — and in each case the
enforcement was narrower than the sentence. Omitting `s` enforced the forward rule
for `i fredags` only; `toLowerCase` handled casing for the alphabet anyone would
think to test. *A guard that covers the examples the comment lists is not the same as
a guard that covers the claim the comment makes*, and the comment is the thing that
gets read later and believed.

**#93 is the more interesting of the two, because the cast was load-bearing in the
wrong direction.** `as (typeof WEEKDAYS)[number]` was written to make `indexOf`
type-check, and its effect was to promise the compiler something the runtime did not
guarantee — so the one tool that could have flagged the unchecked `-1` was told not
to. A cast that exists to silence a type error is a place where a runtime check
probably belongs; that is now the reason it is gone rather than relocated.

**#94 and #95 are both a claim that outran its evidence, in the same session, in two
different artefacts.** The compound test asserted current behaviour and was written
as though it asserted correctness. The PR body checked the trailing-tag caption and
claimed the property for the construction. Neither is a code defect and both would
have misled the next reader — #95 specifically would have misled **#80**, whose whole
job is that comparison, into thinking the case was already handled.

**The finding that was WRONG is worth recording, because taking it at face value
would have caused a regression.** The review proposed adding `s` to the inflections
to reach `-s-` compounds. That cannot work — `AFTER` rejects a following letter, so
every compound stays unmatched — while it *does* make `"i fredags"` match and resolve
a past reference forward, which is #92 reintroduced by hand. Checking it cost one
script. **A review finding names a symptom reliably and a remedy only sometimes;
verifying the remedy against the module is the same discipline as verifying the
symptom**, and this is the first row where skipping it would have shipped a defect
that the review round was convened to prevent.

**On the round's cost.** `date.ts` took one review round to `negation.ts`'s four, and
the calibration note in #57's handoff predicted exactly that: two rounds normal, more
than two means something structural. The difference is not care taken — it is that a
wrong date is a wrong pin while a wrong negation is a deletion, so this module was
allowed to guess and did not need a guard per guess. The prediction was accurate and
is worth trusting again at #58.

### #96–100 — Yes, this was circling, and the shape of it is worth naming (2026-08-30)

**Every r2 finding is inside the four lines r1 added.** Not one is in the original
module, and the parts r1 touched elsewhere — the `indexOf` fallback, the `negation.ts`
constant move — came back verified clean. So the module converged and the GUARD
churned, which is the same split #87–90 recorded for `negation.ts` and the reason
that entry said the shape work was done while span calibration was not.

**The immediate cause is one gate, and it is the test.** #98 is the load-bearing row:
the r1 test named two properties and asserted neither, so the r1 guard had no check
that could have caught `sista` or the missing boundary. A test that names a claim it
cannot detect is worse than no test — it occupies the slot where the real check would
go and reports green while doing it. This project has now logged that exact shape
three times (row 43, #98, #100), which makes it a class rather than an incident:
**write the mutation you expect the test to fail against, and run it, before believing
the test.**

**#99 and #100 are that same lesson recurring INSIDE the fix for it, one after the
other.** #99: the mutation harness silently no-op'd and reported green, so the
verification of the verification was itself unverified. #100: removing `sista`
invalidated the fixture that proved the boundary bug, in the same commit, so the new
test passed against the defect it was written for. Three layers deep, the failure was
identical every time — *something reported success while engaging nothing.* That is
the single most repeated finding in this file and it is not about Swedish at all.

**On whether to keep going.** The honest count is r1: 5, r2: 3 — not obviously
converging on volume. But the KIND has changed twice, and that is the signal worth
reading: r1 was about what the module does (two real defects, three overstated
claims), r2 is entirely about one guard's vocabulary and span. What remains in
`BACKWARD_MODIFIERS` is three words, each now checked against the "cannot point
forwards" bar, and further rounds on it are guesses about Swedish with zero real
captions — precisely what the #77 decision entry ruled data-limited and closed.

**STOP RULE, recorded so it is not re-argued at #58:** `date.ts` gets no further
review rounds on vocabulary. A finding that names a NEW class (a wrong mechanism, a
guard that cannot be tested, a claim in a comment that the code does not do) is still
worth a round. A finding that adds or removes a Swedish word is a Phase 8 issue
against real captions, not an r3. The distinction is the same one #87–90 drew and
then failed to apply for one more round.

**Calibration against the #57 handoff's prediction, which said two rounds normal and
more than two structural.** Two rounds, ten log rows, one overcorrection. The
prediction held, and the overcorrection landed exactly where that note said the risk
was — not in the date arithmetic, which was verified once and never moved, but in the
natural-language guard bolted onto it.

### #101–103 — The gate that worked, and the document that pointed at the wrong file (2026-08-30)

**#101 is the most expensive kind of miss in this file even though it cost nothing
this time: the instruction document pointed at a stale source and did not mention the
current one.** Every previous `stale-doc` row was a rule that was *wrong*. This is a
rule that was *incomplete* in a way that silently redirected research — `CLAUDE.md`
says "full project reference" of a file that is, by design, up to a whole phase out of
date, and `.claude/plans/` appears nowhere in it. It happened to cost nothing because
plan and context agree on `extractTime`; had they disagreed, the work would have been
built on the older answer with no signal.

**Worth stating plainly: the context is stale ON PURPOSE, and that was never written
down.** Reconciling it is a scheduled task in the plan (IS #73), which means the
staleness is a known, accepted, phase-long condition — and the one document read at
the start of every task described it as the reference. The fix names the plan, states
the precedence, and says *why*, because a precedence rule without its reason is the
kind of thing that gets "simplified" back out.

**#102 and #103 are one incident and they are the strongest evidence yet for the
practice this log has been converging on.** The mutation harness was run out of
habit — six mutants died, one survived — and the survivor turned out to be covering
two separate problems: a fixture that never engaged the guard it named (#102, the
fifth instance of that class after rows 43, 94, 98, 100), and a guard whose necessity
was misunderstood (#103, where deleting the "redundant" check would have shipped a
silent wrong-day window).

**The important detail is that neither was found by review, by types, or by the tests
passing.** All 46 tests passed on the first run; `tsc`, lint and build were clean.
The only thing that distinguished a real guard from a decorative one was deliberately
breaking the code and checking that something complained. **Mutation testing has now
caught something in three consecutive pieces of work (#83 r2, and both halves here),
and in every case it was a test that looked fine and asserted nothing.** It should be
the default for any guard whose failure is silent, not a thing done when suspicious.

**On the "all tests passed first try" signal specifically.** That was treated as
grounds for MORE scrutiny rather than less, and it paid. For a module with DST
handling, a midnight roll and numeric validation, a clean first run is more likely to
mean the tests agree with the implementation's assumptions than that both are right —
the two share an author. Worth keeping as a heuristic: a first-run pass on genuinely
fiddly code is a prompt to mutate, not a result.

### #104–107 — The tests agreed with the implementation, because they share an author (2026-08-30)

**#104 is the highest-impact defect this phase has produced, and it is embarrassingly
ordinary: a full stop.** Not a DST gap, not a Unicode fold, not a case-folding
mismatch — the character that ends a Swedish sentence. The module spent 300 lines
getting the spring-forward hour right and could not read `"Öppet 11-14."`.

**The reason it survived 47 tests is the whole lesson.** Every fixture was written
while thinking about the mechanism under test — ranges, separators, the roll, the
gap — so every caption was a bare time expression or a time embedded in a phrase that
happened to end without punctuation. The tests explored the space the implementation
was designed around, which is the space the implementation already handles. **A test
suite written alongside its implementation inherits that implementation's blind
spots**, and no amount of adding cases within the same frame finds them.

What did find it was reading the module as a consumer would: *what does a real
Instagram caption look like?* Not "what does the range regex accept?"

**#105 is the same failure wearing different clothes.** The comment claimed a range is
"self-identifying" — and the fixtures chosen to demonstrate that (`61-63`, `89-119`)
both had numbers above 23, so they proved the hour check worked and said nothing about
the claim. A price range under 24 was never tried, because the author who believed the
claim was the author who picked the fixtures.

**#106 was invisible from inside this module entirely.** `kind: 'range'` on a marked
start is only wrong once you know the matrix scores `range` at 1.0, which lives in a
document, not in the file. Worth noting as the class: **a defect can be fully local in
code and only visible from a downstream contract.**

**#107 is the practice paying off again, and this time on my own fix.** The
leading-guard change was correct, deliberate, and untested — shipped in the same
commit as its tested sibling, where it looked covered. Mutation found it in seconds.
That is now FOUR consecutive pieces of work (#83 r2, #58's hour check, #58's fixture,
and this) where mutation caught what review, types and a green suite did not.

**Elevating it from practice to rule:** for any guard whose failure is silent — a
regex boundary, a validation branch, a discriminator — write the mutation and run it
before believing the test. "The suite is green" and "the suite would notice" are
different claims, and only the second one matters. Applies to a fix as much as to
original code; #107 is the case where the fix was the thing uncovered.

### #108–111 — One instance is not the class, and the fixture is half the test (2026-08-30)

**#108 is the row that justifies re-running a frame instead of trusting a fix.** r1
fixed `"Öppet 11-14."` and the module looked done — 63 tests, eleven mutants, every
gate green. Re-running the *same investigative frame* that found it (what does a real
caption look like?) rather than the same test suite turned up three more causes of the
identical failure. **A fix verified against the case that produced it tells you the
case is fixed; it says nothing about the class.** The class here had a name —
unrecognised range form plus a still-matching `MARKED_START` equals a confident
truncation — and naming it in the module is what makes the next instance recognisable
rather than novel.

**The guard NOT added is worth as much as the ones that were.** The obvious structural
fix — refuse a marked start when another clock-shaped number sits in the same clause —
would have traded a silent truncation for a silent miss on ordinary captions. That is
the #83 overcorrection shape exactly, and this time it was caught before shipping by
asking what the guard rejects that was not intended. Recorded in the module so it is
not re-proposed as an obvious improvement.

**#110 and #111 are the sixth and seventh instances of the vacuous-fixture class**
(rows 43, 94, 98, 100, 102, now these), and both were caught by mutation rather than
by review. What is new is the MECHANISM of the vacuity, and it is worth distinguishing
from the earlier ones:

  - #110: the fixture was rescued by a DIFFERENT guard in the same module. The
    assertion was right, the caption was right, and one word in it (`sorters`) happened
    to be on an unrelated denylist. Nothing about reading the test reveals that.
  - #111: the fixture was rescued by a more fundamental constraint (`CLOCK` needs a
    digit), so the guard under test was never reached.

**Both are the same underlying trap: in a module with layered guards, a fixture proves
only that SOMETHING rejected it, never that the guard you meant rejected it.** Reading
the test cannot distinguish those; only removing the guard can. That is now the
strongest argument in this file for mutation over inspection, and it generalises past
this project.

**Counting the day on `time.ts`:** r0 shipped with 47 tests and 7 mutants, r1 found 3
defects, r2 found 4 more plus 2 vacuous fixtures. The trend that matters is that r1's
findings were in the ORIGINAL module and r2's were too — none was introduced by a fix,
unlike #83 where every r2 finding came from r1's guard. That is convergence of a
different kind: the module is being understood rather than patched, and the remaining
gaps are named limits rather than unknowns.

### DECISION — `source` records where a coordinate CAME FROM, not how much attention it got (2026-09-06)

Plan decision #4 says script output is `source: 'nominatim'` and "anything a human
adjusts flips to `manual`". Seeding #62 found the ambiguity in "adjusts".

Four pins first resolved somewhere unhelpful — `lindholmen` and `eriksberg` to
district centroids a few hundred metres from the square people mean, `chalmers` to a
node addressed in the wrong part of town, `molndal` to nothing at all. All four were
fixed by narrowing the QUERY in `scripts/seed-dictionary.mjs`, not by retyping the
coordinate in `dictionary.ts`.

**They stayed `nominatim`.** The test is reproducibility, not effort: re-running the
script regenerates those exact coordinates, so nothing about them is hand-placed.
`manual` means a human put the pin somewhere OSM did not, which is the thing a later
reconciliation pass needs to know not to clobber. Marking a query fix as `manual`
would assert that someone checked the kerb — nobody has.

**Consequence, stated so it is not read later as an oversight: `manual` is unused and
every entry is `verified: false`.** That is the accurate state of a dictionary built
with zero real caption data. The temptation is to flip a few to look reviewed; the
whole value of the field is that it stays honest until Phase 8 supplies evidence.

**The generalisation.** Provenance fields answer "where did this come from", never
"how confident are we" — `verified` is the confidence field and it already exists.
Collapsing the two loses the distinction exactly when it matters, which is when
someone re-runs the seeder over a dictionary a human has since corrected.

### #114–118 — The comment that was doing persuasion instead of reporting (2026-09-06)

Five findings on PR #86, none of them logic errors. Four are small. The first is not,
and it is the only one worth generalising.

**The dictionary's `address` column was the string the seeder ASKS FOR, not the one
it gets back.** During review I shortened all sixteen — "Järntorget, Pustervik,
Olivedal, Centrum, Göteborg, …, Sverige" down to "Järntorget, Göteborg" — because the
full OSM strings are long and ugly. That felt like tidying. It was a silent
substitution of a display concern for a stored canonical value, and the plan had
already settled which one the field is: `address_geocoded` holds "the dictionary
entry's `address` on a hit, Nominatim's `display_name` on a fallback". One column,
two branches, and I had made the branches disagree. The visible symptom would have
been two trucks side by side on the map with differently-shaped addresses, and
nothing in this phase would have caught it — #65 and #68 both just pass the string
along.

**The part that is actually about process is the sentence I wrote next to it.** The
module header said "re-running that script reproduces it", and the PR description
said the pins were "still reproducible by re-running the script". Both were false for
16 of 16 entries, and the check is one command and a diff. I did not run it, because
I was not treating the sentence as a claim — I was using it to justify the decision
to keep `source: "nominatim"`, which was a decision I had already made and wanted to
defend. **The comment was doing persuasion, and persuasion does not get verified.**

That is a different failure from #111, which was also an `imprecise-claim`. There the
comment described a mechanism I had misread — an honest wrong belief about my own
regex. Here the belief was never formed: I asserted reproducibility without ever
asking whether it was true, because the sentence's job in the paragraph was
rhetorical. Rows 51–54 recorded "closed set" asserted in prose four times, and the
fix then was to make the claim checkable by test. The same fix does not reach this
one — no test can run the network — so the header now says *how* to check it ("re-run
the script and diff") rather than asserting that someone did.

**The tell, for next time: a claim that appears in BOTH a code comment and a PR
description is load-bearing for a decision, and that is exactly when it is least
likely to have been checked.** Both times I wrote it, I was arguing for the
`nominatim`/`manual` reading, not reporting a fact.

**The other four are ordinary and share nothing except that mutation testing did not
reach them.** #116 and #118 are unexercised surfaces — the seeding script has no
tests at all, and `readonly` is a property of a declaration rather than of a value.
#117 is the same shape as #109: a guard that covered the case I had in mind
(equality) and not the one the consumer will actually produce (containment). Eight
mutants on the previous round all targeted assertions I had already written, which is
the known limit of mutation testing and worth restating — **it proves the tests you
have are load-bearing; it says nothing about the tests you did not think to write.**

### #119–124 — Fixed an over-claiming comment; wrote a new one in the same commit (2026-09-06)

Round 2 on PR #86. Six findings. Two of them are the same miss as round 1, which is
the part that says something.

**#120 is the one to sit with.** Round 1's headline finding (#115) was a comment
asserting more than the code did — "re-running that script reproduces it", false for
16 of 16 entries. In the commit that fixed it I wrote *"`readonly` on both the
interface and `DICTIONARY` itself… making it a compile error"*, having marked exactly
two of seven fields `readonly`. `DICTIONARY[0].lat = 0` compiled clean.

So the class was named, logged, and reproduced inside the same commit. Not a
regression of the old instance — a fresh one, in the fix. The distinction from
`overcorrection` matters: nothing was over-applied, I simply wrote the summary
sentence before finishing the change and never re-read it against the result.

**What made both possible is that a comment has no gate.** `tsc`, lint, tests and
build all passed on a file whose header was false. Rows 51–54 concluded that a claim
should be made checkable by a test; #115 concluded that a claim doing rhetorical work
does not get checked. #120 adds the sharpest version: **the comment was written from
the intention and the code from the keyboard, and only the code was reviewed against
reality.** The practical rule is narrow enough to follow — *after finishing a change,
re-read the comment you wrote for it as if it were a claim someone else made.* It
would have caught both.

**#119 is the most valuable finding of either round, and it is not a comment problem.**
Allowlisting `@/lib/types` in #62 made it the first allowlisted module living outside
the directory `purity.test.ts` globs — so the guard checked the import and nothing
checked the target. `Date.now()` in `types.ts` left the parser suite green at 6/6.
The plan's criterion is "no parser file… calls new Date() — verified by test, not by
inspection", and that had quietly degraded to a claim about one hop, at the exact
moment the allowlist grew its first outward edge.

Worth noting *when* this became possible: the allowlist's two existing entries were
`@/lib/parser/date` (inside the glob, therefore covered) and `date-fns-tz` (a package,
out of scope by construction). `@/lib/types` was the first entry that was neither, and
the guard's design had no opinion about that case because the case had not existed.
**A guard's coverage claim is scoped by the shape of its inputs at the time it was
written, and adding a genuinely new shape silently narrows it.** That generalises past
this file.

**#121 is the r1 fix being incomplete rather than wrong** — I enumerated the failure
I had seen (`--only` with nothing after it) instead of inverting the default, so
`--only=heden`, a bare `heden` and `--only ""` still ran all sixteen. Rows 35–39
recorded this exact shape: fixing instances instead of the mechanism. The rewrite now
recognises everything and rejects anything else.

**#124 is small but instructive about verification hygiene.** The PR body said 130
tests; the file registers 116. The 130 was real — it came from the *mutated* run,
where five injected entries add thirty per-entry tests. I read a number off a terminal
that was deliberately in a broken state and carried it into a claim. Mutation testing
leaves the tree in a lying state on purpose; **numbers read during it are not
reportable facts.**

### #125 — Handover notes are reliable about the past and wrong about the future (2026-09-06)

Second instance, and the pair is now a pattern worth acting on.

- **Row 112** — `purity.test.ts` predicted #67 "composes the two and should need
  nothing new". #67 returns `ParseResult`, which lives in `types.ts`, so it needed an
  allowlist entry. Wrong.
- **Row 125** — #59's handover predicted `sources.ts` "needs nothing at all", so
  `FORBID_ALL_IMPORTS`. It is typed against two unions in `types.ts`, so it needs an
  import. Wrong.

**Both predictions were about a module's IMPORTS, both were made before the module
existed, and both were stated as settled fact rather than as expectation.** #125 is
the sharper case because the contradiction was already inside the same document: the
handover's item 1 said "needs nothing at all" while the issue's own Functions section
required typing against `@/lib/types`. Nobody had to look anything up to catch it —
only to read both halves against each other.

**What holds and what does not.** The rest of both notes was accurate and genuinely
saved time: which types already exist and where (#59 item 2), that `extractTime` now
returns three kinds rather than two (item 3), the import-direction precedents from
#57/#58 (item 4), and the `Record`-over-`switch` argument (item 5). Every one of
those describes something that had already happened. **The failures are exactly the
sentences that describe something that had not.**

That is not an argument against writing handovers — they are the most useful artifact
in this workflow. It is an argument about mood. A dependency claim about unwritten
code is a hypothesis, and the log already settled how those are treated: *"DECISION —
A prescribed dependency is a hypothesis, and the allowlist is where it gets tested"*
(2026-08-30). That decision was about the allowlist; it generalises to the handover.
**Write predictions as predictions — "expect it to need nothing; confirm when you get
there" — so the next session verifies instead of complying.**

The practical cost of not doing so is small but real and recurring: both times the
prediction was confident enough that following it would have produced a WORSE module.
`FORBID_ALL_IMPORTS` here would have forced hand-copying two unions into `sources.ts`
— the exact drift the module exists to prevent, and the thing item 4 of the same note
argued against three paragraphs later.

### #126 — Eight mutants, and every one of them aimed at a test I had already written (2026-09-06)

PR #88's first round ran eight mutants and killed all eight. The review then found a
gap none of them could have reached, and the reason is the same sentence I wrote at
the end of #86 and did not act on:

> mutation testing proves the tests you HAVE are load-bearing; it says nothing about
> the tests you did not think to write.

That was recorded as a closing observation. It should have been a next step, because
the gap it predicts is exactly the one that turned up one PR later.

**The specific shape is worth keeping.** The exhaustiveness machinery was anchored to
`ALL_PLATFORMS`, a list that existed to be iterated. The `it.each` expectation table
was a SECOND literal list of the same six values, and the `Record` under test a third.
Only the first was checked against the union. So the failure required no carelessness
at all — a developer adding a seventh platform would be walked through the union, the
`Record` and `ALL_PLATFORMS` by successive compile errors, and would land in a state
where every gate is green and the new platform is mapped to the wrong lane.

**`bluesky` → `manual` compiled clean and the suite stayed green at 15/15.** The
consequence is not cosmetic: `manual` scores 1.0, which the override matrix treats as
unbeatable, so a social post would have overridden a genuine dashboard entry.

**The fix was to delete lists, not to add a check.** Three parallel lists meant three
things to keep in sync and one place the compiler was looking. Making the EXPECTATION
table the exhaustive one and projecting the iteration lists from it leaves a single
literal, still independent of the module under test — so non-vacuity survives while
the drift surface disappears. Rows 35–39 and #121 both concluded that fixing the
mechanism beats fixing instances; this is the same lesson applied to test data rather
than to a guard.

**The generalisable rule, and it is cheap enough to actually follow: when a test file
contains two literal lists of the same union, only one of them is being checked.**
That is a grep-able condition, unlike "think of the test you didn't write".

### DECISION — Gates stay manual until deploy; CI/CD arrives as its own piece of work (2026-09-06)

Raised after PR #88's review observed that the type-level exhaustiveness guards fire
only under `tsc`, never under `vitest`, and that the repo has no `.github/workflows`.

**Decision (user, 2026-09-06): keep running checks, guards and tests by hand for now.**
CI/CD comes when it is time to deploy, and it comes as a real piece of work — GitHub
Actions workflows, the four gates, SAST, branch protection — not as a workflow file
bolted on mid-phase to close one observation.

**Why this is the right call and not a deferral of hygiene.** A workflow added now
would run the same four commands already being run before every commit, so it buys
nothing today; its value is entirely in *enforcement against contributors who are not
running them*, and there are none yet. Introducing it at deploy time also means
designing it once, alongside branch protection and secrets, rather than growing it
by accretion.

**What this means for how work is verified in the meantime — the part worth keeping:**

- Every PR runs `npx tsc --noEmit`, `npm run lint`, `npm run test:run` and
  `npm run build` before commit. That IS the gate. Not running one is not a shortcut,
  it is skipping the only enforcement that exists.
- **`tsc` is not optional and cannot be inferred from a green test run.** Vitest
  strips types with esbuild and never checks them, so every type-level guarantee in
  the codebase is invisible to it: the `AssertCovered` exhaustiveness machinery
  (#59), `readonly DictionaryEntry` (#62), and every `Record` keyed on a union.
- **A DROP in test count is not a failure and nothing reports it.** Deleting a row
  from an `it.each` table takes the suite from 15 to 14 and stays green. Manual
  running does not catch this either — it is the vacuity class again, one level up,
  and until CI exists the only defence is noticing the number.

**Do not re-propose CI before deploy.** It has been asked and answered.

---

### DECISION — How `extractLocation` decides, and what it deliberately does not catch (2026-09-12)

PR #89 / IS #65. Four rules, each pinned by a test so that reversing one means
deleting the assertion that says why. Recorded here because each is the kind of
question that reads as arbitrary a month later and gets "simplified".

**1. Leftmost-longest.** The issue asked for "longest match wins, or first" as if
those were two answers to one question. They are answers to two different questions:

- *Overlapping aliases at the same position* — "Eriksbergstorget" contains
  "Eriksberg". Longest is right; first-listed would depend on typing order.
- *Two disjoint places in one caption* — "Lunch på Heden idag, imorgon Järntorget".
  **Leftmost** is right, and longest would answer Järntorget and pin the truck at
  tomorrow's spot.

Both are satisfied by the lexer rule: leftmost position, longest alternative there.
Implemented as one alternation sorted longest-first, because JS alternation is
leftmost-first-alternative — the sort *is* the rule, in one pass, with no candidate
list to rank. The parser has no notion of a second location; one caption resolves to
one place. The leftmost rule is what makes the part we keep the right part.

**2. A trailing genitive `s` and nothing else.** "vid Nordstans entré" is ordinary
Swedish and a strict word boundary misses it — and a miss here is not a coarser pin,
it is *no* pin, because `extractAddressCandidate` finds no street suffix in
"Nordstans" either.

`normalize.ts` names this module as the place a glued lowercase tag
(`#järntorgetidag`) could be recovered, by matching aliases as substrings rather than
on boundaries. **Rejected**, and the rejection is the decision worth keeping:

- The failure modes are not symmetric. A missed place is a visible, self-correcting
  non-pin. A wrong place is a confident pin to the wrong side of the city with
  nothing signalling it — the same asymmetry that shapes `negation.ts` one step
  earlier.
- The permissive rule has no bound on what it swallows. "Heden" is five letters and
  sits inside "sedan hedenhös", an ordinary idiom. That cannot be fixed by editing
  the dictionary, because the dictionary is not what is wrong.
- We have zero real caption data until Phase 8 — the same argument that caps the
  dictionary at sixteen entries (#4). Widening a matcher on guesses about how
  captions get written is what that decision already declined to do for the data.

Revisit when real captions show whether glued tags occur. Not before.

**3. A house number is dropped when a range follows it.** "Kungsgatan 11-14" is a
street and a *time window*. `extractTime` reads those same digits as 11:00–14:00, so
taking the number lets one pair of digits mean two things in one parse, and pins a
doorway chosen by accident. A genuine house range ("61-63") is lost to this: a truck
writing its opening hours is ordinary, a truck writing a building range is not.

**4. A two-word street name needs its first word on a closed modifier list.** Open to
any preceding word, "vid vägen" and "på torget" become addresses, and casing cannot
separate them because captions are routinely all-lowercase. The list covers what
creates the ambiguity worth resolving — the ordinals and compass directions that
distinguish four different Långgatan from each other. Known cost, pinned by a test:
"Danska Vägen" is a real street and is missed entirely.

**The shape all four share.** Every one resolves toward "no pin" rather than toward
"a pin we are not sure about". That is not caution for its own sake — it is the same
direction `negation.ts` argues for at length, and the reason is the same: one failure
is visible and recoverable, the other is invisible and sends people somewhere wrong.
A fifth rule proposed later should be checked against that before it is checked
against coverage.

---

### #129–131 — Three guards, and each one had been argued instead of tried (2026-09-12)

PR #89 / IS #65, one review round, three findings. They look unrelated — a regex
escape, a Swedish morphology problem, a stale character class — and they are the
same mistake three times. In each case the code carried a comment that *argued* the
guard was sufficient, and in each case a single execution would have refuted it.

**#129.** The comment: "escaping everything in the ECMAScript punctuator set rather
than the subset that is special today: the cost is a redundant backslash." Confident,
reasonable-sounding, and false — under the `u` flag `\-` is a SyntaxError. One
`new RegExp(escapeRegex("a-b"), "iu")` in a test would have said so. The module had
no test file at all, because it was extracted as a "pure move" and a pure move feels
like it inherits its old coverage. It does not: `negation.ts` never called
`escapeRegex`, which was NEW code written during the move and reviewed as if it were
not.

**#130.** The comment: requiring two letters before the suffix "is what keeps the
bare common nouns out". True and irrelevant — it keeps out the *bare* ones, which is
not the class that matters. Swedish builds nouns by the same compounding as street
names, so the guard covered the two-word case and none of the productive one. What
makes this the worst of the three is that the tests agreed with it: every null-case
row I wrote tested a *bare* noun, because I was testing the rule I had in mind rather
than the inputs the module would see. Row 104–107 already named this — "the tests
agreed with the implementation, because they share an author" — and it happened again
in the same shape.

**#131.** The comment: "THE RANGE GUARD IS THE POINT... `extractTime` reads those same
digits". Correct about the hazard, wrong about the defence, and wrong *on the day it
was written*: `time.ts` was sitting in the same directory with the real separator list
in it, and I typed a new one from memory. Not drift over time — drift at birth.

**What the three have in common, and what to do about it.** Every one is a guard whose
sufficiency was established by reasoning in a comment. The reasoning was good enough
to pass its own review, which is exactly the problem: a guard's comment is a
hypothesis, and this repo already knows that (row 125: "a prescribed dependency is a
hypothesis, and the allowlist is where it gets tested"). The generalisation:

> **A guard that is defended by an argument and not by an execution is untested, no
> matter how many tests the file has.** The test that matters is the one that runs the
> guard against the thing it claims to exclude — not against the thing it obviously
> excludes.

Two concrete practices came out of this round and are worth keeping:

1. **A shared constant gets imported, not retyped, even when retyping is three
   characters.** #131 is the second instance of this class (the weekday table was the
   first) and the first where the copies disagreed immediately. When two modules
   contest the same input — here, the digits after a street name — the guard and the
   thing it guards against must be the same object.

2. **A test for a contested input runs BOTH consumers.** `address.test.ts` now asserts
   `extractTime` claims the digits *and* `extractAddressCandidate` does not, plus the
   converse so "reject everything" cannot pass. A suite that checks only one side
   stays green while the two disagree, which is precisely what happened.

**And one thing that went right, recorded so it is not mistaken for luck.** Every
finding was reproduced against the shipped code before anything was changed —
`\-` throwing, the nine noun compounds, the two separators — so all three fixes were
aimed at confirmed behaviour rather than at a plausible report. That is cheap and it
is the step that stops a review round turning into an overcorrection, which this log
lists as the most expensive category.

---

### #132–135 — Circling, correctly diagnosed at the second round instead of the fourth (2026-09-12)

PR #89 / IS #65, r2. **Every finding was inside the lines r1 added.** `location.ts`,
`boundary.ts` and the `time.ts` export edge all came back clean. That is the same
split #87–90 and #96–100 recorded: the module converges, the guard churns. The
difference this time is that it was named at r2 and answered by changing the
mechanism, rather than by a third and fourth round of conditions.

**The thing worth keeping is the diagnosis, not the fix.** Two of the four rows are
the r0 finding recurring, and the reason they recurred is structural:

> Swedish street names and Swedish common nouns are built identically — a stem plus a
> definite suffix. **No morphological rule separates them.** Every "one more
> condition" is therefore a heuristic, and each round finds the next hole.

Once that is stated, the question stops being "which condition next" and becomes
"what is this module allowed to claim". The answer — one condition, a house number,
plus an explicitly asserted residual — is smaller than what r1 shipped. **The fix
deleted a rule.** That is the shape a real exit from a circle has, and it is worth
contrasting with #87–90, where three rounds each added scope to a guard.

**#133 is the sharpest lesson in this PR and it is not about Swedish.** r1's rule was
"a shared constant gets imported, not retyped" — written into this log at #131. r1
then imported `RANGE_SEPARATOR` and reassembled the guard locally, omitting
`REPEATED_MARKER`, and reproduced the identical bug one level in. So:

> **Importing the pieces of a construction is not sharing the construction.** If two
> modules must agree about a compound thing, export the compound thing. A consumer
> that has to reassemble parts will eventually reassemble them differently, and the
> failure looks exactly like the one the sharing was meant to prevent.

`CLOCK_JOINER` is the corrective: one string, used verbatim by the pattern it was
extracted from, with no assembly left at the call site. The test for it runs BOTH
extractors over the same caption, which is what makes the agreement checkable rather
than assumed.

**#134 is the vacuity class again, for the third time in this PR** (129, 134, and the
r1 comment behind 130). The table asserted nine common nouns were rejected — and every
row used the un-numbered form, so it agreed with the implementation instead of testing
it. Row 104–107 already named this ("the tests agreed with the implementation, because
they share an author") and it has now happened in three consecutive PRs. The practical
form of the rule, stated small enough to actually follow:

> **When a guard has a parameter, write a test row for the parameter's other value.**
> Nine nouns tested un-numbered is one test, not nine. The numbered form was one
> character away and would have caught it in r1.

**#135 — a PR body is a document and goes stale like one.** The description still
claimed "street alone still geocodes" after the commit that made it false, in the same
push. The module comment and the test were both correct. Worth noting because the PR
body is what a reviewer reads FIRST, so a stale one costs more per word than a stale
comment. Added to the pre-merge habit: re-read the description after the last commit,
not after the first.

**Is it converging?** r1: 3, r2: 3 — flat on volume, which by itself says nothing. The
kind is the signal:

- r1 found three *different* classes (an invalid escape, an over-broad matcher, a
  drifted constant).
- r2 found one class twice (the matcher), plus r1's own sharing fix applied one level
  too shallow.
- r1's fixes ADDED rules. r2's fixes DELETE two (a corroborator, a dead alternation)
  and NARROW an export surface from two constants to one composition.

**STOP RULE for `address.ts`, recorded so it is not re-argued at #68 or #71:** this
module gets no further review rounds on which Swedish word or shape to accept. A
finding that names a new MECHANISM — a guard that cannot be tested, a claim the code
does not make good on, a contested input with no shared definition — is still worth a
round. A finding that proposes a fourth corroborator is Phase 8 work against real
captions. Same distinction #96–100 drew for `date.ts`, applied one round earlier.

**And the direction that should absorb the coverage instead.** Every cost this module
now carries — a street with no number, a two-word name off the modifier list, a named
point — has the same remedy: put the place in `dictionary.ts`, where a human looks at
the coordinate before it becomes a pin. That is worth stating as a design principle
rather than a workaround: **coverage added to the dictionary is reviewed; coverage
added to the pattern is guessed.** Phase 8's real captions should grow the first, and
that is also the honest answer to "the dictionary only has sixteen entries".

---

### #136–140 — The round I said was unnecessary found two defects I had just written (2026-09-12)

PR #89 / IS #65, r3. **The most important row here is #136, and it is not a code
defect.** After r2 I wrote a stop rule, a circling diagnosis and a recommendation to
merge. The user asked "not worth another review?" — r3 then found three findings, two
of them introduced by r2.

**The reasoning error, stated so it is not repeated.** The stop rule says which KIND of
finding justifies a round: a new mechanism yes, a fourth Swedish word no. I read it as
also answering *whether r2's own changes needed reviewing*. Those are different
questions, and conflating them is especially wrong at the moment a round has just made
its largest change — r2 restructured the regex, changed a predicate's signature,
deleted an alternation and edited `time.ts`, which was already merged and reviewed.

> **A stop rule bounds what you will change next. It never certifies what you just
> changed.** The round that feels most finished is the one carrying the most unreviewed
> code, because confidence is what ended it.

The empirical record in this PR said so plainly and I did not read it: r0's additions
produced r1's findings, r1's produced r2's, r2's produced r3's. Three for three. The
prior on "my newest changes are clean" was zero.

**#137 is the sharpest one, because the false claim was mine and it was of the form
this log keeps recording.** r2 deleted the genitive `s?` arguing nothing could reach
it. Four inputs reach it. The claim "this branch is unreachable" quantifies over every
possible input, and no amount of reading a pattern establishes it — the check is two
patterns and a diff, and it took four lines. Worth generalising past regexes:

> **A deletion justified by "nothing reaches this" is a claim needing evidence, exactly
> like a guard justified by "nothing gets past this".** This project has now logged the
> second kind five times; it turns out the first kind is the same error with the sign
> flipped, and it is more dangerous because deleted code leaves nothing to review.

**#138 is the one that should change how simplifications are made.** r2's flattening of
two regex branches into one optional stem read as a tidy-up, and it silently carried a
behaviour change that reintroduced the exact class r2's own commit message claimed to
have closed. The tests did not catch it because all nine relevant rows used the
un-numbered form — the vacuity class for the fourth time in this PR (#129, #134, #138,
and the r1 comment behind #130).

> **A simplification is a behaviour change until checked against the case the removed
> structure was carrying.** Ask what the structure was for, then test that. Here the
> answer was one sentence — the bare-suffix branch exists for "Södra Vägen" — and it
> would have taken one assertion.

**#139 is where the discipline finally paid.** The third round in a row found
`address.ts` predicting one more piece of `time.ts`'s decision and missing the next.
The available move was to import `TRAILING_UNIT` too. **That was declined**, because it
is the same move that failed in r0 and r1, and the recurrence is the evidence that
prediction is the wrong mechanism rather than that the prediction was incomplete. It is
documented as current behaviour with a test, and the architectural fix — resolve the
overlap in `parseCaption`, which holds both results — is filed as IS #90. This is the
one finding in the round where NOT fixing it is the forward move.

**#140 — comments went stale inside the fix for the round that logged comments going
stale (#135).** Two of them, caught only because I re-read the diff before committing.
That re-read is now part of the commit step rather than the PR step, since one commit
is the shortest interval over which this has been observed to happen.

**Is it converging?** r1: 3, r2: 3, r3: 3 (+2 process). Flat on count for three rounds,
which would normally say no. The kind says otherwise:

- r1: three different classes, fixes ADD rules.
- r2: one class twice plus a too-shallow fix, fixes DELETE rules.
- r3: two regressions from r2's own edits, plus one finding deliberately NOT fixed.
  Fixes restore a distinction and revert a deletion — no new conditions at all.

The module's actual rule has been stable since r2: a street name plus a house number.
Every round since has been about whether the CODE says that, not about what the rule
should be. That is the real convergence signal, and it is the one I should have cited
after r2 instead of a stop rule.

**What would actually end this PR.** Not another round of the same kind — a round that
finds nothing in the newest diff. r3's changes are small (one predicate, one restored
character, comments) and every one is pinned by an assertion written before the fix.
That is the first time in this PR that has been true, and it is the condition worth
using instead of confidence.

---

### #141–143 — The test that separates converging from circling, found at r4 (2026-09-12)

PR #89 / IS #65, r4, scoped to r3's diff alone. Three findings, all inside it. Two are
r3 fixing the wrong thing. But this round is where the pattern finally became legible,
and the lesson is a single sentence:

> **A fix that REMOVES a form the rule cannot keep safe has never been refuted here. A
> fix that ADDS a condition to keep that form has been refuted every single time.**

Held against the whole PR:

| Round | Move | Refuted by |
|---|---|---|
| r0 | added `\p{L}{2,}` to exclude bare nouns | r1 — compounds |
| r1 | added "number OR modifier" | r2 — modifiers are adjectives |
| r2 | **removed** the modifier corroborator | never |
| r3 | added "a bare suffix needs a modifier" | r4 — numbered adjective phrases |
| r3 | **restored** the genitive `s?` | r4 — genitive counting phrases |
| r4 | **removed** the bare-suffix form and the genitive | — |

Four rounds, and every added condition died within one round while every removal
survived. That is not a coincidence about Swedish: a condition that keeps an unsafe
form has to distinguish two things the language does not distinguish, so it can only
ever be a partial cover, and the uncovered part shows up as the same class in a shape
the tests did not enumerate. **Removal has no uncovered part.**

**#142 is the most transferable row in this file.** r3 restored the genitive `s?` for
one reason: r2 had deleted it on a claim that turned out false. That is a real defect
in r2 — and it says nothing about whether the deletion was correct. r3 treated
"the argument was bad" as "the conclusion was wrong" and shipped a regression against
the very version it was correcting.

> **Refuting a justification is not refuting a conclusion.** When a prior decision's
> stated reason turns out to be wrong, the decision goes back on the table — it does
> not flip. Re-derive it, and if it survives, keep it and fix only the reason.

**#143 is the vacuity class for the fifth time in this PR**, and the first time the
mutation was run BEFORE believing the test. r3 wrote a test to demonstrate a
`TRAILING_UNIT` cost using captions that never reach `TRAILING_UNIT`; it passed with
that filter deleted. r4's replacement rows were checked by neutering the filter and
confirming three of them fail. Cost: about ninety seconds. Rows 43, 98, 100, 129, 134,
138 and 143 are now the same finding seven times over, which makes this the single most
repeated defect in the project's history and the one gate worth automating first when
CI arrives:

> **Write the mutation the test should fail against, run it, and only then believe the
> test.** Stated in #96–100 as a rule; the reason it keeps recurring is that it reads
> as optional diligence rather than as part of writing the test. It is not optional —
> an unmutated test is an unverified claim, exactly like an unexecuted guard.

**On whether to keep going.** r4's fixes are three deletions and one test table. The
deletions cannot readmit a class — that is what deleting a form means — and the test
table was verified by mutation rather than by reading. For the first time the round's
own output has a property that makes a further round's findings unlikely rather than
merely unexpected: **there is no new conditional logic in it.** That is a stronger
stopping condition than the count, the "kind has changed" argument, or the confidence
I offered after r2, all of which were wrong.

**Cost of this issue so far:** four review rounds, 17 log rows, for two extractors of
~340 lines. Comparable to `negation.ts` (#87–90's note: four rounds, 16 rows, ~200
lines) and for the same underlying reason — a module modelling a natural language with
zero real examples to check against. The difference worth carrying forward is that
`negation.ts`'s rounds were about vocabulary and this one's were about FORM, and form
is the part that can be settled without data. The vocabulary questions here
(`STREET_SUFFIXES`, `STREET_MODIFIERS`, and the "gågatan 5" residual) are correctly
deferred to Phase 8, and IS #90 carries the one architectural item.

---

### DECISION — `scoreConfidence` takes exact unions, and the penalty is a table (2026-09-12)

PR #91 / IS #66. Two decisions that will look like over-engineering to a reader who
does not know what they cost, so both are recorded with the evidence.

**1. The input is two unions, not four booleans (#145).** The issue specified
`hasLocation` + `locationFromFallback` and `hasExplicitTimeRange` + `hasLunchtid`.
Each pair is mutually exclusive, so half of each pair's state space is meaningless —
and the time pair cannot express `TimeKind`'s third value at all. This is the second
time a Phase 3 handover has specified a shape the code had already outgrown (#125 was
the first, #127 the second), and the pattern is the same each time: **the issue was
written before the module it consumes, and the module moved.**

The general form, worth applying at #67, #68 and #70 rather than rediscovering:

> **A handover's CONTRACT is a snapshot; the module it names is the source of truth.**
> Read the module first, then the issue, and when they disagree the issue is stale
> unless it gives a reason it is not.

What makes this one more than a preference is that `time.ts` had already written down
what `#66` should do — "the intended mapping is `range` 1.0, `lunchtid` 0.85, and
`start` no higher than `lunchtid`" — in the same commit that widened the type. The
instruction was in the code, and only in the code.

**2. The fallback penalty is a lookup table and must stay one (#146).** It is −0.15
three times in decimal. It is not in IEEE 754: `0.6 - 0.15` is `0.44999999999999996`,
and the display threshold is `>= 0.45` with plan #3 placing that exact row on the
line. Computing it hides every location-only fallback pin, with no error and no
visible cause.

This is the rare case where the *clean* implementation is the wrong one, so a comment
saying "do not simplify this" is not enough on its own — there is a test asserting the
three subtractions, including the one that fails. Anyone who tries the tidy version
gets a red suite with the reason in the test name.

**3. What the mutation testing actually bought, stated because it is the first time it
was run BEFORE believing the tests rather than after a review found them empty.**

Three mutants, and only the third was informative:

| Mutant | Killed by |
|---|---|
| neuter the negation short-circuit | 12 tests |
| delete one row from the test matrix | the exhaustiveness assertion |
| score `start` above `lunchtid`, **consistently** in code and every literal assertion | nothing — until the ordering tests were added |

The third is the lesson. Every value-pinning test in the suite passed while the matrix
said something it does not mean, because a consistent edit updates the implementation
and its expectations together. **A table of literals is tested by a table of literals
only in the direction the author already agreed with.** The tests that caught it assert
relationships — more information scores higher, dictionary beats fallback, `start`
never outranks `lunchtid` — and those are the ones carrying the meaning.

Applies directly to #68's override matrix, which is five branches of exactly this
shape: assert the ORDERING (manual beats webhook beats email; equal confidence
discards) alongside the specific rows, or a consistent edit will pass the suite while
inverting the priority rules.

---

### #147–150 — I mutated the values and never the unions (2026-09-12)

PR #91 / IS #66, r1. Four findings, and the interesting part is not the defects — it
is that this was the first issue where mutation testing was run BEFORE review, and it
still missed two of them.

**What the pre-review mutation testing bought.** Three mutants: neutering the negation
short-circuit (killed by 12 tests), deleting a matrix row (killed by the exhaustiveness
assertion), and scoring `start` above `lunchtid` consistently across code and every
literal assertion (survived everything — and produced the ordering tests, which are
genuinely load-bearing and caught a real gap).

**What it missed, and why.** Every mutant I wrote changed a VALUE. The review's
mutants changed a UNION — a `"cached"` location, an `"allday"` TimeKind — and both left
`tsc` clean with 48/48 green. So:

> **Mutation testing inherits the author's blind spot.** I mutated the axis I had been
> thinking about all afternoon and concluded the suite was sound. The mutants worth
> writing are the ones for the axis you have NOT been thinking about: the type, the
> schema, the column width, the call site you did not write.

A usable prompt for next time, since "think of the mutant you'd miss" is not
actionable: **enumerate the module's inputs by their SOURCE, and mutate one of each.**
Here that would have been a value (done), a union member (missed), and a stored column
type (missed — and it was #149).

**#147 is the same defect as row 126, in a file whose comment cites row 126.** The
comment said `LOCATIONS`/`TIMES` were "projected from the union, not typed out beside
it". They were typed out beside it; `satisfies` is a subset check. Knowing a lesson,
citing it by number, and still shipping it — that is worth recording plainly, because
it says the lesson was held as a slogan rather than as a mechanism. The mechanism
(`AssertCovered`) already existed in `sources.test.ts` and I did not reach for it.

> **When a comment cites a past miss, check that the code does the thing the miss
> taught, not the thing the comment says.** Citing is not applying.

**#148 and #149 are one shape: a guarantee that holds on one axis and is stated for
the module.** #148 — "drift becomes a compile error" was true of `time` (a `Record`)
and false of `location` (a ternary). #149 — the header's IEEE-754 defence covers the
arithmetic *inside* the module and not the float32 narrowing at persistence, which is a
second, independent narrowing of the same constant.

> **A guarantee is scoped to what enforces it.** Write down which axis, which layer,
> which representation — "this cannot drift" and "this is float-safe" are both claims
> about a boundary, and a boundary has sides.

**#149 is the one that would have shipped.** It is invisible to every JS test:
`0.45` is exactly `0.45` in a double and only becomes `0.44999998807907104` after a
Postgres round trip through `float4`. The test that catches it needs real Postgres,
which is #92's acceptance criterion. Filed rather than fixed, because the fix is a
migration and a filter that do not exist yet, and guessing at them here would be
building against an unwritten consumer.

**Count so far for #66:** one review round, four rows, 49 tests for ~130 lines of
implementation. Cheaper than #65 by a wide margin, and the reason is visible: the rule
was settled before the code was written (the plan's decision #3 and the documented
matrix), so no round was spent discovering what the module should do. The rounds on
#65 were about that; the rounds here are about whether the guarantees are real.

---

### #151–153 — Fixing a class where you are looking is not fixing the class (2026-09-12)

PR #91 / IS #66, r2. Three findings, all inside r1's diff, and all three are r1
applying its own lesson incompletely.

**r1's theme was "exhaustiveness was asserted, not enforced."** It rewrote the header
to describe the `satisfies`-is-a-subset-check bug, replaced the parallel lists with
`AssertCovered` anchored to the table, and made both score axes `Record` keys. Then it
left `["dictionary", "fallback"] as const` hardcoded in the two ordering tests **two
blocks below the header that describes the bug** (#153) — and those are the only
enforcement of a constraint `time.ts` states in prose alone.

> **A fix applied to the places you are currently reading is not a fix to the class.**
> After deriving a list, grep the file for the literals it replaced. That check is
> mechanical, takes ten seconds, and would have caught this.

**#151 is the more uncomfortable one, because r1's finding was itself the imprecise
kind it was correcting.** r1 found that the module's IEEE-754 defence covered doubles
and not the float32 narrowing at persistence — correct and valuable. It then wrote, in
a code comment and in a filed issue, that `.gte("confidence", 0.45)` drops the row.
**That is a claim about Postgres, and the evidence was `Math.fround` in Node.** Review
argues the opposite for that path; Docker was unavailable, so that is unrun as well.

The resolution is not to adopt the reviewer's analysis — it is to stop asserting either
one:

> **Evidence has a domain.** A JavaScript experiment supports a claim about JavaScript.
> Extending it to SQL, to a column type, or to a wire format is a new claim needing its
> own evidence. Where that evidence is unavailable, the comment says which half is
> verified and the issue's first job becomes getting the rest.

This also inverts the RISK of #92 in a way worth recording: if PostgREST is in fact
safe, an author acting on the original issue lowers or casts the constant in the one
call that was never broken, while a raw-SQL path stays unguarded. **A confidently wrong
bug report is more expensive than no bug report**, because it directs the fix.

**#152 is the measurement-set error.** The test enumerated `parser_confidence` values to
prove the hazard was one cell wide. The column stores `parser × source`. Not one of the
values it checked is a value the column ever holds — and `sourceConfidence` was imported
twenty lines below for exactly this purpose. Same shape as row 134 (a test crediting a
mechanism it never engaged), now in the other direction: the right mechanism, the wrong
inputs.

> **Before asserting a property of "every stored value", write down what is actually
> stored.** Here it was a product, and the test enumerated a factor.

**Counting.** #66 is at r1: 4, r2: 3. Not converging on volume, and unlike #65 the KIND
has not changed either — r1 and r2 are both "a guarantee that holds narrower than it is
stated". What HAS changed is that r2's fixes are all derivations replacing literals,
which is the same removal-shaped move that ended #65: there is no new conditional logic
and nothing new to be wrong about. The one open thread is #92, and it is open because it
is genuinely undecidable without a database rather than because it is unfinished.

---

### #154–155 — Three rounds, one class, one axis at a time (2026-09-12)

PR #91 / IS #66, r3. Two findings. **#154 is the third consecutive round of the same
defect, and each round fixed it on exactly the half I happened to be reading.**

| Round | Found | Fixed | Left |
|---|---|---|---|
| r1 | `satisfies` is a subset check; ternary dispatch | the `Record`s, the `AssertCovered` on `MATRIX` | the ordering tests, both axes |
| r2 | ordering tests hardcode the LOCATION list | derived `RESOLVED_LOCATIONS` | the TIME literals in the same assertions |
| r3 | ordering tests hardcode the TIME literals | a declared rank on **both** axes | — |

r2's own narrative named this: *"fixing a class where you are looking is not fixing the
class — after deriving a list, grep the file for the literals it replaced."* I wrote
that, and then in the same commit did not grep the file for the literals it replaced.
**A lesson written into the log in the same session it was learned is not yet a
habit.** The gap between knowing and doing is a step, and the step is mechanical.

**What finally closed it is a different KIND of fix, and that is the transferable
part.** r2 derived an iteration list. Derivation makes a new member get *iterated* — it
does not make anyone *think*. A declared RANK, guarded by `AssertCovered`, makes the
new member fail to compile until it is placed, and placing it is precisely the decision
that was being skipped:

> **When a test encodes an ORDER, derive nothing — declare the order and guard the
> declaration.** An order is a claim, and a claim cannot be read off a set of rows. The
> compiler can force the author to state it; nothing can force them to state it
> correctly, but the ordering walk then checks the statement against the scores.

Both halves were mutation-verified, and both matter: not placing the new kind fails the
build, and placing it inconsistently with its score fails two assertions. The walk also
needed an endpoint check, because pairwise `>=` is satisfied by every value being equal
— a rank that permits ties permits all ties.

**#155 is the second time in two rounds I asserted something about the codebase without
grepping it.** r2 corrected "PostgREST drops the row" (a claim about Postgres, evidence
from Node). r3 corrects "nothing queries it yet" (a claim about the repo, evidence from
nowhere) — `useMapLibre.tsx` has filtered on `confidence >= DISPLAY_THRESHOLD` since
Phase 1.

> **Absence claims are the cheapest to check and the easiest to skip.** "Nothing uses
> this", "no caller depends on that", "this branch is unreachable" (#137) — each is one
> grep, and each of the three has now shipped in this project as a stated fact.

It also widened #92 usefully: the hazard has three comparison paths, not two, and the
client-side one is the only one with no query typing in front of it. And 0.45 is written
in two files, so whatever #92 decides has to land as one exported constant or it will be
applied to one of them.

**Counting #66:** r1: 4, r2: 3, r3: 2. Declining, and the kind has narrowed — r3's
findings are both "a claim stated wider than its evidence", where r1 had genuine
structural defects. The remaining open item (#92) is open because it needs a database,
not because it is unfinished.

**A stopping condition, stated before the next round rather than after it.** r3's diff
adds two declared ranks and corrects two comments. It introduces no new conditional
logic and no new literal that could drift, and every claim in it was mutation-verified
before commit. That is the same property that ended #65 at r4. If a fourth round finds
something, the interesting question will not be what it found but whether it is again
"the half I was not looking at" — because that would make the problem my review scope
rather than the code.

---

### #156–159 — I widened a shared thing to serve one caller (2026-09-13)

Four findings in #93's first review round, and #156 is the one that says something the
earlier rows do not.

`index.ts` legitimately imports every extractor — composing them is its job. The
allowlist said no, so I added the five specifiers. That edit is *locally* correct and
*globally* wrong, because the list is applied to all ten modules: the question asked
was "may the composer import `negation.ts`?" and the artifact I edited also answers
"may `normalize.ts`?". I never noticed I was answering the second question, because
the list does not look like it has two questions in it.

> **A permission list shared by N subjects cannot be edited for one of them.** Adding
> an entry grants it to all N. If the answer differs by subject, the list has to be
> selected by subject — and the moment you find yourself widening a shared list to
> unblock a single caller, that is the signal, not a formality.

What makes it worth a row rather than a code fix is the timing. The edge it silently
permitted is the exact one IS #80 forbids in its body, and #80 is the very next issue
to touch these files. The guard would have been absent precisely when it was needed,
and it would have failed open and silent — nothing turns red, the wrong fix just
compiles. Verified both directions rather than argued: the mutant fails on `dev`,
passed on the PR, and fails again now.

**#158 is the second appearance of a different pattern, and it is mine.** The parser
modules leave forwarding notes — `time.ts` says the clause-pairing defect "belongs to
`parseCaption` (#67)", `location.ts` carries its other half. I read those files closely
enough to quote them in comments and still did not act on the one addressed to the
issue I was implementing. The handoff was written; nothing made it checkable.

> **A note that assigns work to a future issue is only as good as the thing that makes
> someone look.** A comment naming an issue number is read by whoever opens that file;
> it is not read by whoever picks up that issue. If the receiving issue does not exist,
> the handoff is a hope. Both of #67's known gaps now have a *pinning test* rather than
> a comment, which is the form that shows up in a diff and has to be updated to be
> passed.

**#157 and #159 are the same failure at two scales:** a comment that argued past its
evidence. #157 asserted a direction of safety while citing the two documents that state
the opposite direction — I paraphrased `negation.ts`'s asymmetry rule and inverted it in
the same paragraph. #159 claimed a format guarantee for a field where only the
nullability guarantee holds. Neither is a code defect; both would have shaped what a
later reader did. That is now six rows in three PRs (#151, #153, #155, #157, #159 and
the r2/r3 pair on #66) where the defect was a claim rather than a line of logic.

**Counting #67:** four findings in r1, and the distribution has shifted. None is a
wiring bug — the composition, the union types and the ordering tests all survived
review, and the mutation work done before opening the PR is why. All four are at the
seams: what a shared artifact permits, what a comment promises, and what a handoff
from another module asked for and did not get. The code was tested; the *claims around*
the code were not, and I have no gate for those beyond review.

---

### #160–163 — Round two found no wiring bug, and that is the finding (2026-09-13)

Three code findings in r2, and the distribution has moved again. r1 was four findings
at the seams. r2 is one real defect (#161), one drifted number (#160) and one inherited
claim (#162). Nothing in the composition itself has been touched by either round —
`parseCaption`'s order, the union types and the mutation-verified ordering tests have
now survived two reviews unchanged.

**#160 is the one that should not have happened, because the rule was already written
down and I had read it.** The phase plan refuses to put a test count beside its own
acceptance criteria, in a parenthetical that explains exactly why: *"No count here on
purpose: a hand-maintained number beside a growing table drifted twice — L8, then again
in round 3. The table is the count."* I then wrote four counts into a mutation table and
invalidated three of them with my own next commit.

> **A count is a claim about a suite; "this mutant is killed" is a claim about the
> mutant.** Only the second survives the suite growing, and only the second is what the
> table was for. The give-away is that the number added nothing — nobody needed to know
> whether a mutant failed three tests or six, only that it failed.

What makes it worth a row rather than a shrug is *where* it happened. The table's entire
purpose is to be re-runnable evidence, and I put an un-re-runnable number inside it. A
reviewer who re-ran the stated evidence got a contradiction, which is the cheapest
possible way to lose trust in the surrounding claims — all of which were correct.

**#161 is the third distinct wrong-pin class in this composition** (#94, #96, plus #80's
cancellation), and the first that *inverts* rather than degrades: the parser returns the
single day the caption explicitly denies. Both halves are individually correct and
defensible — `detectNegation` is right not to fire, `extractDate` is right to take the
only date expression present — which is what makes it invisible to anyone reading either
module. It is only visible in the composed answer.

> **When a composition is the first place two correct answers meet, it is also the first
> place their product can be wrong.** The three gaps found in #67 were all of this shape,
> and none is a defect in any extractor. Composing is not plumbing; it is where a new
> class of defect becomes possible for the first time.

**#162 is an inherited claim, which is a category I had not hit before.** I did not
invent "would cheerfully re-match Järntorget" — I copied it from `address.ts`'s header,
where it has been true-then-false since r4 narrowed the rule and nobody revisited the
prose. Copying it propagated a stale claim into a second file and doubled the cost of
fixing it.

> **Quoting a neighbouring comment is not evidence, and it feels like evidence.** It is
> the same unverified assumption as writing it yourself, with the author's confidence
> attached. Both files are fixed; the general defence is that a claim about behaviour
> should be enumerated, not asserted, wherever it is written — which is what both now do.

**#163 is not about the code at all.** The review run left the checkout on `dev`. Nothing
was lost because the work was committed and pushed, but I was reading r2's findings
against a working tree that no longer held the code under review, and had to verify that
before trusting any of them. Committing before invoking review turned a potential loss
into a thirty-second check.

**A stopping condition, stated before a third round rather than after it.** r1's findings
were four, r2's were three, and the KIND has narrowed the same way #66's did: r1 included
a real guard regression, r2 includes none. Both remaining code findings are "a claim
stated wider than its evidence" (#160, #162) plus one genuine defect that is filed rather
than fixed (#161), because fixing it means editing `date.ts`'s vocabulary with zero real
caption data — the thing this phase has declined to do four times now, each time
correctly. If an r3 finds something, the question worth asking is whether it is a defect
in the code or another claim in a comment. If it is the latter for a third round running,
the problem is that this codebase's comments carry far more asserted behaviour than its
tests do, and the fix is a habit — enumerate, do not assert — rather than another round.

---

### #164–167 — Three rounds, and the question was whether this is circling (2026-09-13)

Asked directly, after r3: are we converging or going in circles? Worth answering with
the project's own test rather than with the finding count, because the count says the
wrong thing here.

**The counts do not converge.** r1: 4. r2: 3. r3: 4. And r3's top finding (#164) is the
most serious of the eleven — a plan violation, in the contract two unwritten issues will
be built on. On count alone this looks like circling.

**It is not, and `address.ts` already wrote down the test that settles it:** *"does the
fix REMOVE a form the rule cannot keep safe, or add a condition that tries to keep it?"*
Every fix across the three rounds has been a removal:

| Round | Fix | Refuted later? |
|---|---|---|
| r1 | removed the widened shared allowlist, restored the narrow one | no |
| r1 | removed an inverted safety claim | no |
| r2 | removed the per-mutant counts | no |
| r2 | removed the overstated `Järntorget` claim | no |
| r3 | removed the blanket bail, kept the one-field suppression it was argued for | — |

Nothing fixed in r1 or r2 came back in a later round. That is the property that
distinguishes converging from circling, and it holds. #66's four rounds had the same
shape and ended.

**So why is r3 the worst round? Because the first two reviewed the code against
itself.** #164 was present in the very first commit and survived two reviews. It is not
findable by reading `index.ts` — the file is internally coherent, the tests agree with
it, and every mutant passed. It is findable only by reading the code against
`phase-3-parser.md`. Nobody did that until r3.

> **A review that only reads the diff can confirm the code does what the author
> intended. It cannot notice the author intended the wrong thing.** Spec conformance is
> a separate pass with a separate input, and eleven findings in, it is the pass that
> found the only defect that would have corrupted a downstream contract.

**#164's specific cause is worth separating from its category.** I argued the
suppression carefully — for `place`, at length, correctly — and then implemented it as
one early return covering three fields. The argument was sound and its scope was never
checked against its implementation.

> **A rule argued for one field must be applied to one field.** An early return is the
> cheapest way to widen a justification without noticing, because it suppresses
> everything after it and looks like a single decision.

And the tie-breaker that should have caught it: IS #67's acceptance criteria say "no
attempt to extract location, date or time", the plan says the opposite, and CLAUDE.md
settles it — **THE PLAN WINS**. I followed the issue. The issues are generated from the
plan and are therefore a *copy*, one generation stale by construction; that is exactly
the relationship CLAUDE.md's rule exists for, and I applied it to `project-context.md`
while not noticing it applies to issues too.

**The remaining three findings are the same category as r2's, for the third round
running** — #165, #166, #167 are all claims stated wider than their evidence, and #167
is a fact that one `node -e` would have settled. This is the thing I said at the end of
r2 would be the signal, and it has arrived:

> **This codebase's comments carry more asserted behaviour than its tests do, and the
> asserted half has no gate.** Eleven findings, and seven are comments rather than code.
> Every one was cheap to check and none was checked. The fix is not another review
> round — it is that a comment stating behaviour should either enumerate the cases (as
> `address.ts` and now `index.ts` do) or not state it.

**Recommendation, stated before r4 rather than after it.** r4 should not be another diff
review; that pass has now produced diminishing code findings twice. If anything, the
remaining risk is that #94, #96 and #80 are three filed gaps in one composition and
nobody has checked they do not overlap or contradict each other. That is a plan-level
question, not a code-level one — and it is the same *kind* of pass that found #164.

---

### #168–169 — The issue was wrong, and my instrument agreed with me (2026-09-13)

IS #61 is a three-line config change, and both misses came from the same place: I was
checking whether the code matched the instruction, not whether either was true.

**#168 is the first `issue`-artifact row in the log.** Every prior `stale-doc` row was
`CLAUDE.md`, `project-context` or `plan`. This one is an issue body, and it was wrong in
the specific way generated issues can be: it names two real vitest options, puts them in
a plausible place, and reads as settled fact. Implemented verbatim it produces a config
that typechecks as a `tsc` error — so the gate *would* have caught it — but the failure
it was preventing had already been introduced, invisibly, and would have surfaced later
as integration flakes blamed on the service.

> **An issue is a copy of the plan, one generation stale by construction, and it can be
> wrong about the world in ways the plan never was.** r3 on #93 established that the
> plan beats the issue when they disagree. #168 is the harder case: the plan says
> `fileParallelism: false` too, so BOTH are wrong, and no document in the project had
> the right answer. The only thing that did was the type definition on disk and a probe
> that ran the thing.

The habit that caught it is worth naming, because it is the one that has now paid off
three times in two issues: **verify the setting does what it claims before writing the
comment that claims it.** I wrote a two-file sequencing probe intending to confirm a
setting I was confident in, and it disagreed. Had I written the comment first — as the
first draft of that file did, complete with a confident "verified rather than trusted"
paragraph — it would have shipped as another #157.

**#169 is worse in kind and cheaper to fix.** I measured an exit code as
`npm run … | tail -6; echo "exit=$?"` and read `tail`'s status. It printed 0, which is
what I expected, so nothing prompted a second look. The real exit was 1: the option had
been ignored from the start.

> **A broken instrument that agrees with you is invisible.** The pipe error and the
> config error were independent, and they cancelled — one silently ignored the option,
> the other silently reported success. Two wrongs reading as confirmation is the failure
> mode that no amount of care about the *claim* catches, because the claim was checked;
> it was the checking that was broken.

Concretely: in a pipeline, `$?` is the last command's status. Exit codes are now taken as
`cmd >/dev/null 2>&1; echo $?`, and that is worth applying to every gate invocation, not
just this one — several earlier rows report gate results read through `| tail`.

**What went right, recorded because the log skews negative.** Both misses were caught
`pre-commit`, by probing rather than by review, and #61 is the first issue this phase
where the verification work found more than the review would have. The plan's M5 rule —
*"green on three consecutive runs, because a single pass does not prove sequencing is
holding"* — was written for #72 and applied here to a config change; all three runs were
checked, and run 3 reordered the files while still nesting them, which is the evidence
that the property under test is non-overlap rather than a fixed order.

---

### #170–171 — Both findings were in the artifact I had just called wrong (2026-09-13)

Two findings on a two-file config change, and the pattern connecting them is not that
the config was hard. It is that I had already identified the plan as unreliable for this
issue (#168, same session, same PR) and then took two more things from it unchecked.

**#170: `src/**/*.test.ts` came from the plan's Files table**, and I copied it while
writing a long comment about scoping directories. The narrowing is invisible in the
string — it reads as "tests in src" and means "tests in src, but only one of the six
extensions vitest recognises". A failing `.tsx` and a failing `.spec.ts` both reported
`917 passed`, exit 0.

> **A glob that scopes a directory should not also decide what counts as a test.** Two
> decisions in one string, one of them unintended, and the unintended one fails silently
> in the direction of green.

The fix is the same shape as the one `test-utils/purity.ts` arrived at after four
attempts: do not enumerate a set someone else owns. Writing `{ts,tsx}` would have
"fixed" the reported case and dropped `.spec.*`, `.mts` and `.cts` — the exact
enumerate-and-miss failure that file paid for repeatedly. Reusing vitest's own pattern
with a directory prefix inherits future extensions instead of missing them.

**#171 is the one I have least excuse for.** I wrote "both documents are wrong" in the
PR body, logged #168 against the issue, and left the plan's two `fileParallelism` lines
sitting there — under a CLAUDE.md rule that makes the plan authoritative and beats
everything else. The next session on #72 would have read the shipped config as drift and
restored the interleaving.

> **Identifying a stale doc and not editing it produces the same outcome as never
> noticing.** The log entry records that I knew; it does not stop anyone acting on the
> stale line. If a row's `Artifact` column names a document, that document should be
> fixed in the same commit, not described in the log as wrong.

That is a rule this log can enforce on itself, and the `Fix landed?` column already has
the shape for it: a `plan` or `project-context` row whose fix is "recorded in the log"
is not a fix.

**Counting #61.** Four misses on a two-file change (#168, #169, #170, #171), which is
the highest density in this log — and every one is *"I trusted a document or an
instrument instead of running the thing"*, not a reasoning error about vitest. The
config itself was right on the first try in every respect I actually tested; everything
I took from the plan or the issue on faith was wrong. Two of the four were caught by
probing before review (#168, #169) and two by review (#170, #171), which is the split
worth watching: probing catches what I thought to question, review catches what I did
not think to.

---

### #172–174 — The fix for a silent skip introduced a silent skip (2026-09-13)

#172 is an `overcorrection`, and only the fourth in 174 rows — the category the log's
own header calls "the most expensive". It earns the label precisely:

- r1 found that `src/**/*.test.ts` silently dropped `.tsx` and `.spec.*` (#170).
- The fix kept `src/**` and changed only the suffix.
- r2 found that `src/**` silently drops every test outside it (#172).

**Same failure, same direction, one axis over, introduced by the fix for the other.** I
wrote three paragraphs in that commit about not enumerating a set someone else owns, and
applied the lesson to extensions while leaving the identical mistake in place on
directories — in the same glob, four characters to the left.

> **When a fix removes one hand-written half of a pattern, check the other half for the
> same defect before shipping.** A glob is two decisions (where, and what); r1 audited
> one of them because that was the one review had named.

The structural fix is what ends the class rather than patching it a second time. The
split now **subtracts**: `unit` is vitest's default reach minus one directory,
`integration` is that directory, and **neither project states a file pattern of its
own**. There is no enumeration left in the file to get wrong on either axis — which is
the same move `test-utils/purity.ts` eventually made, and the same one that ended #89
after four rounds. Both times the converging fix removed the thing that could be wrong;
every round that added a condition got refuted.

**#173 is the sharper version of r1's own lesson.** I argued against enumerating
vitest's extension set, then hand-copied its pattern into a constant — and `vitest/config`
exports `defaultInclude` and `defaultExclude` outright. I had gone into `node_modules` to
read the VALUE and never asked whether it was exported.

> **"Do not enumerate a set someone else owns" has a stronger form: do not copy it
> either.** A copy is correct until the owner changes it, and nothing announces when
> that happens. If you are reading a library's internals to learn a value, check whether
> the library will just give it to you.

**#174 is a blast-radius miss rather than a code one.** I narrowed what `test:run`
covers and never asked what depended on its old coverage. The answer was the project's
entire gate story: four manual gates, no CI, and the test gate silently stopped
including half the suite. That would not have failed anything — it would have made
merges *easier*, which is the worst possible direction for a gate to drift.

> **Changing what a command covers is an interface change.** Anything documented as
> depending on that coverage has to move with it, and "the gate list" is documentation
> in the same way an API is.

**Counting #61 overall: seven misses on a two-file config change**, across two review
rounds and pre-commit probing. Every single one is *"I trusted a document, a copy, or an
instrument instead of running the thing"* — the two unsettable options from the plan and
issue, a piped exit code, a narrowed extension set, a narrowed directory set, a copied
constant, a stale gate list. Not one was a reasoning error about vitest, and the
mechanics have been right every time I actually tested them. That is a legible pattern
and it is mine, not this issue's.

---

### #175–176 — I invented a mechanism to justify a placement (2026-09-13)

Two findings, one underlying fact, and the fact is one I never checked: **vitest's
empty-match check is per-run, not per-project.**

Everything I built on top of that assumption was wrong in the same direction. I put
`--passWithNoTests` on `test:integration` for a real reason (that script alone does
produce an empty run), then wrote a *second* reason for the placement — "keeping it off
the root keeps `unit` loud" — that describes a guarantee vitest does not offer. The
placement was correct. The justification was fiction, and the fiction is what made me
confident enough to copy the flag onto `test:all` without re-deriving anything.

> **A correct decision with an invented rationale is more dangerous than a wrong one.**
> The decision holds, so nothing fails, and the rationale then gets reused for the next
> decision — where it does not hold. #175 is exactly that: the flag was copied to a
> script whose emptiness semantics I had never measured, on the strength of a sentence I
> had made up about a script I had.

The measured behaviour, which is worse than either finding suggests on its own: with the
`unit` glob broken and one integration test present, `npx vitest run` exits **0** and
reports `Test Files 1 passed`. **917 tests disappear and the merge gate is green.** The
flag makes no difference to this. Only `--project unit` alone catches it, because then
the whole run is empty.

**#175 is the second overcorrection in two rounds, and both moved a gate toward easier
merges.** #174: splitting the suite left the documented test gate covering half of it.
#175: the new gate built to fix that arrived pre-muted. Both were introduced *by* the
fix for the previous finding, and neither would ever have gone red — a gate that fails
open produces no symptom at all.

> **When adding or changing a gate, the thing to test is that it FAILS.** Every gate
> check in this issue until r3 confirmed the green path. A gate is defined by its red
> path, and `test:all` had never been observed failing for any reason.

That is now a concrete habit rather than a sentiment: `test:all` was verified to exit 1
on a genuinely empty run before this commit, `test:integration` was verified to exit 1
without its flag, and both numbers are in the config comment.

**#99 was rewritten rather than amended.** It was filed as "integration can pass with
zero tests", tied to `--passWithNoTests`, and blocked on #72. All three were wrong: it
affects both projects, the flag is not the cause, and the unit half is live today — the
larger exposure, since it is 917 tests and this repo has already narrowed that glob by
accident twice (#170, #172). It also cannot be fixed the obvious way: an assertion
inside `unit` does not run when `unit` collects nothing, so the guard is vacant exactly
when needed. It needs an external comparison of collected files against disk.

**Nine misses on #61 now.** The mechanics have still never been wrong. Every single
finding has been a document, a copy, an instrument, or — twice now — a sentence I wrote
to explain something I had not measured.

---

### DECISION — comments keep evidence, not argument; archaeology moves to this log (2026-09-13)

Raised by the user after PR #98 r3: *"are you saying everything works but the comments
are always behind?"* — then *"where does this comment-heavy convention originate?"*

**Both of my framings were wrong, and the second more interestingly than the first.**

I had said the mechanics were never wrong and only the prose lagged. Six of the twenty-one
findings across PR #93 and #98 were code that did not work — the widened purity allowlist
(#156), the dropped cancellation window (#164), the un-held sequencing (#168), the
narrowed extensions (#170), the narrowed directories (#172), the pre-muted gate (#175).
Every one a silent failure in the green direction. Calling that a comment problem made it
sound cosmetic.

I had also called the comment density "this codebase's convention", implying it predated
me. **Measured:**

| Milestone | % comment lines in `src/` |
|---|---|
| Phase 1 end (PR #20), hand-written | 4% |
| Phase 2 end (PR #54) | 22% |
| PR #88 | 38% |
| PR #98 | 43% |

Monotonic, never once down, and no instruction file asks for any of it. I built it and
then attributed it to the repo (#177).

**The mechanism is a ratchet, and it is worth naming because it is still running.** A
review round finds something → the fix records its reasoning in a ⚠ block so the question
"stays resolved" → nothing ever removes one. 108 ⚠ blocks and 42 archaeology references
now. `address.ts` carries r0–r4 of a rule surviving in none of those forms.

**And the prose is not inert.** In three cases the comment came FIRST and the wrong code
followed from it — #176's invented scoping rule then applied to `test:all`; #164's
carefully-argued one-field suppression then applied to three; #172's three paragraphs
against enumeration with the identical mistake left in the same glob.

> **A correct decision with an invented rationale is more dangerous than a wrong one.**
> Nothing fails, so the rationale is never tested — and then it gets reused for the next
> decision, where it does not hold.

**The decision, so this is not re-litigated:** the problem is not volume, it is KIND.

| Comment kind | Record across PR #93 and #98 |
|---|---|
| Names the command or mutation that produced it | never refuted |
| Argues from reasoning | refuted 6 times |

So: **keep evidence, drop argument, move history.** Archaeology belongs in this file,
which exists for it and is where anyone looks for "why did this change". Source keeps
what a reader needs in order not to break the code, with the evidence attached.

Scheduled as IS #73 Part 2, deliberately **not** as a `CLAUDE.md` rule — a density rule
is exactly the thing a later session would ratchet against, and the ratchet is the
problem. Sequenced after #80/#90/#94/#95/#96 so their pinning comments are not culled and
then rewritten.

---

### #178–180 — Am I circling? The round count says maybe; the data says no (2026-09-13)

The user asked directly after r4. Answering with measurements, because "it feels like
we're converging" is the kind of claim this PR has punished nine times.

**Findings per round did not decline: 2, 3, 2, 3.** On count alone this looks like
circling, and the same was true of PR #93 (4, 3, 4).

**The circling test this project already owns** — `address.ts`'s *"does the fix REMOVE a
form the rule cannot keep safe, or add a condition that tries to keep it?"* — passes.
Every fix here removed something, and **no fix has been undone**: extensions have stayed
fixed since r1, directories since r2, the gate since r3.

**But a second measurement is less flattering, and it is the one that actually answers
the question. Which commit introduced each later finding:**

| Commit | Later findings it caused |
|---|---|
| `c998df0` initial | #170 extensions, #171 plan half-corrected |
| `0c4f7d0` r1 fix | #172 directories, #178 CORRECTION block carried a refuted claim |
| `347f505` r2 fix | #175 `test:all` pre-muted, #179 build-output reach restored |
| `ddf8659` r3 fix | **none** |

**2 → 2 → 0.** Three of four rounds found something caused by the previous round's fix.
That is not circling — nothing was undone — but it is not the clean convergence the
"every fix was a removal" framing implies either, and I have twice written that framing
in a way that hid this. A fix that works and spawns two new findings is progress at a
much worse exchange rate than the round count suggests.

**The kind of finding is where the real signal is:**

| Round | Findings |
|---|---|
| r1 | **LIVE functional** · doc |
| r2 | **LIVE functional** · quality · doc |
| r3 | **LIVE functional** · comment |
| r4 | *latent only* · doc · record |

r1–r3 each found code that silently did the wrong thing right now — failing tests not
collected, a gate that could not go red. **r4 found no live functional defect.** #179 is
latent (nothing emits a test file into `.next` today), #178 and #180 are documents I
wrote. That is the stopping condition, and it is a property of the findings rather than
of their number.

> **The convergence signal is not "fewer findings", it is "no finding that changes what
> the code does today".** Rounds can keep producing findings indefinitely while the
> software is correct, because every round also reviews the prose the last round added.

**And that is the cost worth recording.** Four review rounds and nine log entries on a
two-file config change. Two of r4's three findings — #178 and #180 — are *stale records I
created*: a plan correction that carried a refuted sentence, and a PR description never
updated after r1. Neither existed before I started documenting the work. Every round adds
surface area that the next round can find something in, which is the same ratchet
measured in IS #73 Part 2, showing up in the review loop rather than in the comments.

**So: moving forward, and #98 is done.** The config has been correct in every tested
respect since r3; r4 changed one latent reach and two documents. A fifth round would be
reviewing r4's prose.

---

### DECISION — `ParseResult` stays singular in Phase 3 (plan #8, 2026-09-13)

Four review-found parser defects — #80, #90, #94, #96 — turned out to share one cause:
every extractor answers one question about the WHOLE caption and returns a bare value, so
`parseCaption` pairs answers without being able to tell they came from different parts of
it. Verified: no extractor reports a position. `detectNegation` returns a boolean,
`extractDate` a string, `extractTime` instants, `extractLocation` the matched substring
without its index.

**Decided: Tier 1 (detect distant spans, lower the confidence) in Phase 3. Clause
segmentation and plural `ParseResult` deferred to Phase 8.** Full reasoning in the plan as
decision #8.

Two things worth having here rather than only there:

**The scheduling dependency was invisible in the issue graph.** #68 consumes
`ParseResult` and is not listed as blocked by #94 — but if #94 later went plural, #68 and
#69 would be rewritten. The decision is what unblocks #68 to proceed against a singular
contract.

> **An issue that consumes a type is coupled to every open issue that might change that
> type, whether or not the graph says so.** "Blocked by" captures what must exist first;
> it does not capture what must be DECIDED first. This one only surfaced because the
> question was asked directly.

**The refusal is the same one this phase has made four times** — #4's dictionary size,
`address.ts`'s suffix list, `negation.ts`'s vocabulary, #85's number words — and
`address.ts` already records the test: rounds that ADD a condition get refuted, rounds
that REMOVE a form do not. A Swedish clause-boundary rule calibrated against zero real
captions is an added condition.

**And Tier 1's limit is stated rather than glossed:** dropping a bad pin from 1.0 to ~0.6
clears email off the map (× 0.55 = 0.33, below the 0.45 threshold) but leaves webhook
(0.51) and manual (0.6) rendering. One lane of three. Mitigation, not a fix.

---

### #181–184 — I tested the shapes the issue listed (2026-09-13)

Four findings on a one-constant fix, and three of them are the same omission: **the
issue's repro list became my test list.** #96 named five captions. I made all five pass,
mutation-verified the guard four ways, and never asked what ELSE a Swedish caption does
with an exclusion.

What it does: coordinate (`utom lördag och söndag`), take a preposition (`utom på
söndag`), and sit after a line break. All three were live, all three pinned the excluded
day at 1.0, and all three are ordinary phrasing rather than edge cases — `date.ts`'s own
comment calls `"på söndag"` the ordinary shape, and its existing weekday tests use that
phrasing throughout.

> **A repro list is evidence that a bug exists, not a specification of its extent.**
> Passing every caption in the issue proves the issue was real. It proves nothing about
> the rule, and a rule is what I shipped.

**#181 is the sharpest, because I caused it with something I praised.** The skip-ahead
behaviour — a suppressed weekday does not end the search — is genuinely good, and I
documented it as "strictly better than bailing" after verifying the case where it helps.
It is also exactly what pins the second day of a coordinated exclusion: `lördag` is
suppressed, the engine moves on, `söndag` is not. I verified the feature in isolation and
never ran it against the defect it sits three lines away from.

> **Verifying a behaviour in isolation is not verifying it in the module.** The question
> is not "does this work" but "what does this do to everything else here", and the
> second is the one an interaction bug lives in.

**#183 and #184 are the claim category again, now at five rounds running across three
PRs.** #183 is an absence claim ("covers every separator") that one newline would have
refuted. #184 is worse in kind: I wrote the CORRECT reasoning about `lördag` equalling
the fallback into the test comment, and the REFUTED example into the module comment, in
the same commit. The knowledge was in my head and in the diff, and the two artifacts
still disagreed.

> **Consistency between two things I wrote in one sitting is not automatic.** Both were
> right when written; they were written about different things ten minutes apart, and
> nothing compared them. The fix that generalises is what #73 Part 2 already schedules —
> a comment that states behaviour should cite the test that proves it, so the two cannot
> drift without one going red.

**What went right and is worth keeping.** The negative controls were not in the issue and
I added them anyway — `"utom lördag och vi kör söndag"` must still resolve — and they are
what killed the widened-chain mutant. Two of the seven mutants are green on the positive
rows alone, which is the concrete argument for why negative controls are not optional in
this module. That is now written in the test file rather than only here.

---

### #185–189 — A test that passes because two wrong things coincide (2026-09-13)

Five findings, and they split cleanly into two groups that say different things.

**#186 is the one that should worry me most, and it is a category this log already
has.** My coordinated-exclusion rows read:

```
extractDate("Heden 11-14 utom lördag och söndag", SATURDAY)  →  expect SATURDAY
```

`SATURDAY` is 2026-08-22. 2026-08-22 **is** lördag. So the assertion says "the pin lands
on a day the caption excluded" and passes — not because the chain suppressed both days,
but because the fallback happens to coincide with one of them. **It would fail a correct
fix.** Three of five rows plus the composed row had it.

> **An assertion whose expected value coincides with a wrong answer proves nothing, and
> looks exactly like proof.** Row 150 logged the same shape (`it.each` title with two
> `%s` for three args, so the block could not show what it claimed); `address.ts` r3
> logged it again (tests that passed with `TRAILING_UNIT` deleted, because the fixtures
> engaged a different rejection). This is the third instance, and the first where I
> chose the colliding value myself — `lördag` as an example day, never checked against
> the fixture I was asserting.

The general defence, now applied: **when a test asserts a fallback, the expected value
must be distinguishable from every value the code could wrongly produce.** I had already
written exactly this reasoning one commit earlier, for `måndag` vs `lördag` in the
skip-ahead test — and did not apply it twenty lines further down.

**#188 and #189 are one miss: the block flipped, the prose did not get swept.** `#96`'s
known-gap tests were rewritten from pinning the defect to pinning the fix, and three
places that described the old behaviour were left — `index.ts`'s worked example (still
"→ 2026-08-23, 1.0" and "which is why #96 lands there", future tense), and the `SUMMER`
comment in `index.test.ts`.

> **Flipping a test is a content change to every comment that cites it.** Grep for the
> issue number and the old expected value before committing the flip; both would have
> found all three sites in seconds.

#189 stings extra: that same comment was corrected in PR #93 r3 for calling a Saturday a
Friday, and it exists *specifically* to stop this file contradicting itself about SUMMER.
It has now been wrong twice, in two different ways, and both times about something
computable.

**#185 and #187 are honest residue rather than errors of process** — a fix that closes
the named case and leaves adjacent shapes, both now filed as #102 with the counter-
examples inline. Worth noting only that #187's negative controls *confirmed the claim I
made* rather than probing its edge: I tested "prose stops the chain" and never asked what
a second clause opening on a weekday does.

**Counting #96: nine findings over two rounds on one regex constant.** r1 was "the
issue's repro list was not the rule". r2 is "my own fixture was not neutral, and the
prose citing my tests went stale when they flipped". Neither round found the guard's
logic wrong — the two-category split, the inner boundary and the weekday bound have all
survived review unchanged.

---

### DECISION — "no usable date" is two questions, not one (plan #9, 2026-09-14)

Asked before #68 is written, because it determines a `ParseResult` field #68 consumes —
the same reason decision #8 was taken. Full reasoning in the plan as decision #9.

**#95 and #102 look like one question and are not.** #95 is a violated INPUT contract (a
caller passed garbage `parsedAt`); #102 is a caption the parser read correctly and that
names no usable day. Treating them as one would have widened `extractDate` to
`string | null` to solve a problem that belongs at the boundary.

> **"What do we return when X fails" is not one question when the Xs fail for different
> reasons.** The cause decides the layer. A violated input contract is caught where the
> input is made; a caption the parser cannot resolve is the parser's to express.

**The fact that unlocked it:** #68 already has to implement "write no location row, set
`parsing_status`, leave `last_known_*` untouched" **three times over** — geocode null, a
`skipped` post, and #69's negation path. So #95 costs no new machinery at all; it is a
fourth caller of an exit that exists regardless. I had been treating the exit as
something #95 would introduce.

> **Before designing a new failure path, check whether the consumer already has one.**
> Three existing callers is not an edge case, it is the shape of the module.

**And the deferral is cheap for a reason worth stating rather than assuming.** Phase 8 is
already reshaping `ParseResult` if #94 goes Tier 2 or 3 (decision #8). Adding a "no
usable date" state during a reshape that is happening anyway is nearly free; adding it
today costs a branch in #68 with no live producer — which this project has punished
before as an unreachable-branch claim. #102's part 2 is segmentation and was already
Phase 8, so splitting one issue across two phases to save one branch is the worse trade.

**The falsifiable part, stated because deferrals are where optimism hides.** If Phase 8
captions show "excludes the posting day" is common, the cost is one branch in #68 plus
tests — bounded. That asymmetry is exactly why deferring is safe here and was NOT safe
for decision #8, where the alternative was rewriting #68, #69, the override matrix and
dedup.

**The requirement it places on #68 is the actionable half:** the "produce no location"
exit must be ONE NAMED PATH, not three inline early-returns. Inlined, #102 lands as a
rewrite; named, it lands as one more caller. That is now written into #68.

**Also settled by elimination:** the span cluster (#90, #80, #94 Tier 1, #101) does NOT
block #68. Every one changes a VALUE `parseCaption` returns — a candidate string, a date,
a confidence — and none changes `ParseResult`'s shape. Verified against each issue. That
was not obvious when they were filed separately, and it is the reason the full
consolidation pass is not urgent: only the shape question was.

---

### #190–192 — Three found by running it, none by reading it (2026-09-14)

All three were caught **pre-commit**, and the pattern across them is worth naming: each
came from executing the thing rather than from reasoning about it, and in two cases the
code was right while my *description* of it was wrong.

**#190 is the one I would not have found any other way.** The throttle is module-level
state; the test file imported the module once; every test appended a 1100 ms link to a
shared gate. The file took 13.3 s against a 2 s suite, and the last test failed with
*"expected 1 call, got 0"* because it was still queued. My comment had explicitly
claimed the gate was empty at the start of each test.

> **Module-level state is per-PROCESS, and a test file is one process.** Anything a
> module remembers between calls, a test file inherits between tests. The tell is a
> suite that got slower, and I would have read that as "these tests do more" if the
> last one had not also failed.

The fix — `vi.resetModules()` with a dynamic import per test — went from 13.3 s to
68 ms. The interesting part is that the SLOWNESS was the real signal and the failure was
incidental; had the throttle been 50 ms instead of 1100 ms, everything would have passed
and the file would just have been quietly wrong.

**#191 is the broken-instrument category again (#169), in a new costume.** I counted
`fetch` calls to prove no network request on a cache hit, got 1, and briefly read it as
the cache not working. It was PostgREST — the database read is itself an HTTP request.
Two different networks, one counter.

> **"No network call" is not a claim until you say WHOSE network.** #63's acceptance
> criteria say "zero network calls" and I copied that wording into the module; the claim
> that actually matters is about a third-party service under a usage policy. The unit
> test can assert the strong version only because the db layer is mocked out, which is
> the one context where `fetch` has a single possible caller.

**#192 is a gap the type system anticipated and nobody did.** `geocode()` returns
`displayName: string | null` — #63 specified that — so the nullable shape was expected.
What was not expected is that null arrives for a reason unrelated to the caption:
`geocoding_cache` has no column for it, so the value survives exactly one request.
Filed as #103.

**What this says about the approach.** #96 took two review rounds to find four defects
of this kind; #63 found three before the first commit, by writing a live verification
the issue asked for and then not trusting its first result. The difference is not care —
it is that the verification RAN. Every one of these was invisible to reading.

---

### #193–198 — Four guards that covered the easy half, and a hazard I invented (2026-09-14)

Six findings. Five are code, which is a different distribution from the last three PRs
where the majority were prose — and the reason is that this module talks to a third
party and a database, so there are more ways for it to be wrong than there are claims to
make about it.

**#193, #195, #196 are one pattern: I guarded a class at its most obvious member.**

| I handled | I missed |
|---|---|
| `NOMINATIM_BASE_URL` empty | `NOMINATIM_BASE_URL` malformed — `new URL` throws |
| the base URL's host | the base URL's PATH — `"/search"` discards a prefix |
| "no such address" | "we are being blocked" — 429/403, silent |

Each guard was written against the case I had in mind while writing it, and each left a
neighbour that fails **silently and permanently**. The path-prefix one is the sharpest:
it is invisible against the public instance, so nothing would ever have surfaced it
until someone pointed a self-hosted Nominatim at it and watched every geocode fail with
no log.

> **When a guard rejects one bad input, ask what the SECOND-worst version of that input
> looks like.** Empty string and malformed string are the same class; host and path are
> the same class; "found nothing" and "was refused" are not, and collapsing them is how
> a degraded path goes dark.

**#197 is the one worth sitting with, because review raised it as a NON-finding.** I had
claimed Nominatim requires `west,north,east,south` and that our declaration order was a
transposition hazard — in a module comment, a test NAME, and the PR body. The docs say
the opposite in one sentence: *"Any two corner points of the box are accepted as long as
they make a proper box."* Both orders are correct. There was no hazard.

The code worked, so nothing would ever have failed. What I had shipped was a test named
after a danger that does not exist, which is worse than no test: it teaches the next
reader a false rule about an external API and invites them to "fix" the order back.

> **An invented hazard is more durable than an invented fact, because nothing can refute
> it.** A false claim about our own code gets contradicted by the code; a false claim
> about a third party's API just sits there being plausible. The check took one fetch of
> the docs — and I had written the claim three times without doing it.

I also verified it the other way afterwards: the live run sent `11.6,57.5,12.2,57.85` —
the order I had called wrong — and Nominatim returned a correct in-box result.

**#198 is the same failure as #191 two days running: I described the defence I intended
rather than the one I had.** I wrote "plus a test that a case variant hits" while adding
the cache-key fold, and no such test exists or can exist here — `geocoding.test.ts`
mocks the db layer out entirely. Verified live instead, and the comment now SAYS it is a
manual verification and weaker than a test, with the obligation recorded on #72.

> **"Plus a test that…" is a claim about a file, and files are greppable.** Every time I
> have written that phrase without the test in the same commit, it has been wrong.

**Counting #63: three found pre-commit by running it, five more in r1.** The pre-commit
three were all "the code does something my description does not"; the r1 five were all
"the code handles one input and not its neighbour". Those are different failure modes
and they were caught by different things — execution found the first kind, a reader
found the second.

---

### #199–202 — The same class, a third time, in the file that documents it (2026-09-14)

r1 on this PR found three instances of "guarded a class at its most obvious member" and
I wrote that lesson into the log. r2 found three more **in the same file**, and one of
them was created BY r1's fix.

| Round | Guarded | Missed |
|---|---|---|
| r1 | base URL empty | base URL malformed |
| r1 | base URL host | base URL path |
| r1 | "no such address" | "we are refused" |
| **r2** | **cache WRITE** | **cache READ** — created by r1's fix |
| r2 | a missing base URL returning null | …silently, the shape r1 had just argued against |
| r2 | concurrent callers on DIFFERENT addresses | concurrent callers on the SAME address |

**#199 is the overcorrection and the one that stings.** r1 wrapped the write with a
comment explaining that the cache is an optimisation. The read, four lines up, stayed
unguarded — so the general principle was stated and applied to one of its two call
sites. The test block is named *"the cache is an optimisation, not a dependency"* and
exercised only the write.

> **A `describe` block's name is a claim, and claims are the thing this project keeps
> shipping unverified.** The name asserted a property of the cache; the body tested one
> operation. Nothing in vitest checks that a block covers what it says it covers, so the
> name read as coverage to me and to r1's review both.

**#201 is the sharpest evidence that the lesson had not landed.** In the SAME COMMIT
where I wrote, about the path prefix, *"would 404 every request and geocode nothing,
permanently, with nothing in the logs saying why"*, a missing base URL twenty lines above
returned null with no log. I wrote the principle and the counter-example into one file
and did not apply the first to the second.

> **Writing down a lesson is not applying it.** Three times in two rounds the
> counter-example was in the same file, sometimes in the same commit. What generalises is
> not "remember the lesson" but a mechanical sweep: when a guard is added, grep the
> module for the other call sites of the same operation.

**#200 is a test that could not see its own subject.** I had a test named "queues
UNBOUNDEDLY — the Nth concurrent caller waits N intervals", using addresses A, B and C.
The herd only forms when the addresses are the SAME, so the test exercised the queue and
was structurally blind to the defect the queue creates.

**#202 is filed rather than built, deliberately.** A backoff is new policy; decision #2
rules out retry and says nothing about backoff. Implementing the second while shipping
the first is how an unreviewed rule enters a codebase, and this project has a plan
document precisely so that policy is argued before it is code.

**Counting #63 so far: three pre-commit, six in r1, four in r2.** The r2 set is where
convergence should have shown and did not — it is the same class as r1, at the same
density, in the same file. The honest read is not "the reviews are working" but "I am
producing this class faster than I am learning it", and the mechanical sweep above is
the only response that does not depend on me remembering.

---

### #203–206 — The sweep worked; the thing it does not cover is what r3 found (2026-09-14)

r2 ended with a commitment: *"when a guard is added, grep the module for the other call
sites of that operation."* I ran it before r3 — every `await` in `geocoding.ts` checked
against its guard — and it came up **clean**. Then r3 found four things, and none of them
were an unguarded await.

That is worth stating precisely, because the sweep is not useless and is also not
sufficient:

| The sweep finds | r3 found |
|---|---|
| a call site with no guard | a guard that CATCHES but tells nobody (#203) |
| | a comment asserting a fix is impossible (#204) |
| | an invariant that holds only under an untested condition (#205) |
| | a copy of a deleted claim in another file (#206) |

**#203 is the fourth instance of "guarded the easy half" in this PR, and the third
created by the previous round's fix.** r1 moved `new URL` inside a try so it could not
throw — and that try ends in a bare `catch` returning null, so the malformed case became
silent instead of loud. The guard was added and the OUTCOME was not examined.

> **A sweep for unguarded calls does not catch an over-broad catch.** "Is every await
> guarded" and "does every guard produce a distinguishable outcome" are different
> questions, and the second is the one three of this PR's ten findings sit in.

**#204 and the viewbox claim are one pattern I should name as its own thing: I invent
limitations.** Twice in one PR I wrote that something could not be done — Nominatim
requires a coordinate order (it does not), a malformed URL cannot be distinguished from a
network error (`URL.canParse` does exactly that) — and both were one lookup away from
being checked. An invented limitation is worse than an invented fact because it
*discourages the fix*: #204 shipped a test whose comment told the next reader not to
bother.

> **"Cannot be done without X" is a claim about an API's surface, and an API's surface is
> documented.** I have now made that claim twice about two different APIs in one file,
> and both were wrong.

**#205 is the third test in this PR that could not see its own subject** (after the
different-addresses herd test and the write-only cache block). All three were named for
the property they failed to exercise. The fix that ended it was structural rather than
another test: deduplicating BEFORE the throttle removes the timing dependency entirely,
so there is no longer a condition to be blind to.

**Counting #63: three pre-commit, six r1, four r2, four r3 — seventeen.** r2 and r3 are
flat at four, and in both rounds half the findings were created by the previous round's
fix. That is not convergence. The honest reading is that this module has more
interacting concerns than anything else in the phase — a third-party API, a permanent
cache, module-level concurrency state, and a config surface — and I was fixing them one
at a time while each fix moved the others. The in-flight map is the first change here
that removed a whole category rather than patching a case, and it is the one r4 should
be judged against.

---

### DECISION — stop predicating, start constructing (2026-09-14)

Four review rounds on one module, and r4 found that r3's fix did not fix the case it was
written for. Oliwer's instruction was explicit: *if still finding problems with old
fixes, time to try a new approach.* This is that approach, recorded so it is not
re-derived.

**The diagnosis. Every fix I made to this module was POSITIONAL:**

| Round | Fix | How it failed |
|---|---|---|
| r1 | check `!baseUrl` before using it | covered the empty string only |
| r1 | move `new URL` inside the try | made the failure silent instead of loud |
| r2 | re-check the cache AFTER the throttle | broke when the leader was slower than the gate |
| r3 | register in-flight BEFORE the throttle | left the cache read outside the dedup |
| r3 | add `URL.canParse` beside `!baseUrl` | `canParse("localhost:8080")` is `true` |

Each adds a predicate or moves a call. Each is correct **for the case that prompted it**,
and each encodes an assumption about what the other positions do — so the next fix
invalidates it. That is why the finding count stayed flat at 4, 4, 3 while the module got
more correct in every individual respect.

> **A positional fix is a claim about the rest of the function.** It is true when written
> and nothing re-checks it, so the next edit silently falsifies it. Counting findings per
> round measures how hard review is looking; what measures progress is whether a fix
> could be falsified by a later edit at all.

**The three replacements, and what makes each structural rather than positional:**

| Was | Now | Why it cannot come back |
|---|---|---|
| judge the base URL with a predicate | BUILD the request URL; failure to build IS the rejection | no validity rule left to keep in step with `new URL` |
| register in-flight at the right point | dedup wraps the WHOLE operation | no ordering left to get wrong |
| check the box after the fetch | `toResult` is the ONLY way a result exists | every path inherits it, including ones not written yet |

This is the same move that ended three other classes in this project, which is the reason
to trust it here: `address.ts` stopped adding conditions and removed forms; `vitest.config`
stopped enumerating extensions and subtracted a directory; `confidence.ts` made drift a
compile error instead of a convention. **Every class that ended, ended by removing the
thing that could be wrong — not by getting it right.**

**Verified, including the two things r2 and r3 each got wrong:**

- three mutants — restore the `canParse` predicate, move registration after the read,
  put the box check back on the fresh path only — each killed
- live, against real Supabase and real Nominatim: three concurrent calls on a cold cache
  produced **one** request and three identical results

**What would falsify this.** If r5 finds a fourth defect created by one of these three
changes, the problem is not the method but this module's fit for it — and the next step
would be narrowing `geocode`'s responsibilities rather than restructuring them again.

---

### #210–213 — The restructure held; the narrowing was of the contract (2026-09-14)

Oliwer's instruction before r5: *if still problems with this new restructure, lets narrow
it.* The condition was not met, and saying so precisely matters more than the fixes.

**r4's three changes produced ZERO findings**, and the review said so explicitly — the
URL construction replaces both broken predicates correctly, `toResult` really is the only
constructor so the box check is unconditional, and the in-flight map registers before any
await so there is no ordering window. The falsification condition recorded in the plan
(*"if r5 finds a fourth defect created by one of these three changes"*) did not fire.

**What r5 found is a class that predates every round: nothing had a deadline.** Only the
Nominatim fetch was bounded. `readCache`'s try/catch covers a REJECTION but not a HANG —
different failures, and I had treated the guard as covering both.

> **A `catch` bounds what a call DOES; only a deadline bounds how long it TAKES.** Four
> rounds of guards on this module and not one of them addressed duration, because every
> finding had been about an outcome.

**So the narrowing is of the CONTRACT, not a module split**, and the distinction is the
useful part. `geocode` documents that `null` covers every failure. That was false: it
could also never settle — a third outcome no caller is written for, and the worst one at
the `after()` boundary, where the post keeps its `'pending'` default and becomes
invisible to any failure sweep. Splitting the module would not have bounded a single
wait; the functions are already small and single-purpose. What needed narrowing was the
BEHAVIOUR SET, from {result, null, never} to {result, null}.

And the implementation kept r4's method rather than reverting to r1–r3's: **one deadline
around the operation, not a timeout per await.** A timeout per call is a claim about the
set of calls, and the set changes — which is exactly how the earlier rounds failed.

**#213 is mine, found by my own mutation run, and it is the third invented consequence
in this PR.** I justified `clearTimeout` by claiming an un-cleared timer "hangs the run",
the mutation produced ZERO failures, and measuring gave 1.74 s against 1.73 s. The line
is still right — a pending 8 s timer holds a finished lambda open — but the reason I gave
was invented.

> **A mutation that kills nothing is evidence about the CLAIM, not just about coverage.**
> I have been reading "no test failed" as "add a test"; here the right reading was
> "check whether the thing you asserted is true". It was not.

**Counting #63: three pre-commit, then 6 / 4 / 4 / 3 / 4 across five rounds.** Flat, and
the flatness is now explicable rather than alarming: r1–r3 were one class (positional
guards), r4 ended that class, and r5 opened a different one (duration) that had been
present and unexamined since the first commit. The three invented consequences are the
thread running through all five, and they are a habit rather than a class — the only one
of my mistakes here that no restructuring can remove.

---

### #214–215 — The rule adopted at the end of #63 paid off immediately (2026-09-14)

Two findings on #64, both **pre-commit**, and the second is the interesting one because
of how it was found.

#63 ended with: *a mutation that kills nothing is evidence about the CLAIM, not only
about coverage.* On #64 I deleted the empty-array guard in `deleteLocations` expecting a
red test, got none, and — instead of reaching for "add a test" — checked the claim. It
was false. `.in("id", [])` returns 204 with no error; my comment (in two files) said it
was a PostgREST syntax error and that the guard was therefore a correctness requirement.

> **The rule works and is cheap.** One probe against the real database, thirty seconds,
> and it converted a confident false statement into an accurate smaller one. That is the
> fourth invented consequence across #63 and #64, and the first caught by a deliberate
> practice rather than by a reviewer.

**#214 is a fact about the stack that the next issue would have tripped on.** Postgres
returns `timestamptz` as `+00:00`; everything upstream produces `.000Z`. Identical
instants, different strings — and #68 compares a stored row's window against a
`ParseResult` in JavaScript, where `===` would silently be false and `<`/`>` would
compare text across two formats.

The test pins it in the shape that keeps it visible: assert the INSTANTS match **and**
assert the STRINGS differ. A test that only normalised and compared would hide the fact
it exists.

> **When a round trip changes a value's representation, assert the difference, not just
> the equivalence.** The equivalence is what the code needs; the difference is what the
> next reader needs.

**What went right, recorded because the log skews negative.** The H4 correction — the
reason this issue exists — is pinned by two rows, and the second is the one that matters:
a location whose `ends_at` sits *before* the incoming window while its `expires_at`
extends *into* it. The NULL-`ends_at` row alone passes against a predicate reading
`ends_at`; only that second row fails it. Mutation-confirmed: swapping the query back to
the documented NULL-blind predicate fails two tests, inclusive bounds fail one, dropping
the truck filter fails one.

---

### #216–218 — A mutation that changes two things tests neither (2026-09-14)

#217 is the one with the most carry-over, because it is about the practice I have been
leaning on hardest.

I mutated `.lt`→`.lte` and `.gt`→`.gte` **together**, saw one test fail, and wrote
"inclusive bounds fail one" in the PR body. Measured atomically afterwards: the
`expires_at` half killed the mutant entirely, and the `starts_at` bound **alone** left
all twelve tests passing. So one of the two bounds was unpinned while the mutation table
said both were covered.

> **A mutant must change exactly one thing, or a surviving gap hides behind a dying
> sibling.** A compound mutation proves only that AT LEAST ONE of its parts is covered,
> and that is the weakest possible reading of the strongest-looking evidence.

That is the second methodological correction to this practice in two issues: #63 ended
with *a mutation that kills nothing is evidence about the CLAIM*, and this adds *a
mutation that changes two things is evidence about neither*. Both are about reading the
result honestly rather than about running more of them.

**#216 is the most costly mistake I have made in this project so far**, and it is worth
separating the defect from its blast radius. The defect is ordinary: a cleanup helper
scoped too widely. The blast radius is not — `npm run test:all` is the documented merge
gate, so the act of VERIFYING a change destroyed the fixtures every documented Phase 2
curl flow depends on, including an inactive truck that exists solely to test rejections.
It happened twice: once during review, once from my own probe run, and neither time did
anything fail. A destructive side effect produces no red.

> **A test fixture helper is production code for the developer's environment.** "Reset
> the database" reads as scoped to the tests and is not; a delete can only be scoped by
> a PREDICATE, and "rows this suite created" has to be made into one — here, a name
> prefix — before it can be honoured.

The guard is now a test rather than a rule: a seed-like truck is inserted, `resetTables()`
runs, and its survival is asserted. Verified in both directions, including that the
destructive version fails it.

**#218 is a small thing with a good lesson attached.** Quoted `.env` values are legal and
`next dev` accepts them. The URL case would have failed legibly while the KEY case failed
as an opaque 401 — so the bug that explains itself masks the one that does not, and
fixing the loud one first would have left the quiet one in place.

---

### #219–222 — I broke the same thing twice, in the fix for breaking it (2026-09-14)

r1 found that `resetTables()` destroyed the dev seed data. r2 found that the FIX
destroyed arbitrary other rows. Same helper, same class, same absence of any red test,
one round apart.

| Round | Predicate | What it actually matched |
|---|---|---|
| r1 | delete everything | `seed.sql`'s three fixed-UUID trucks, including the inactive one |
| r2 | `LIKE '__itest__%'` | `XXitestYYnot-a-fixture`, `A_itest_B real truck` — `_` is a wildcard |

> **A "prefix" expressed in a pattern language is not a prefix until you check the
> language.** I reached for `LIKE` because it reads as `startsWith`, and `_` silently
> made it `.`-in-a-regex. The fix that ends the class is not escaping — which works, and
> which I verified — but choosing a marker with no metacharacters in it, so there is
> nothing to escape and nothing to remember.

**#220 is why I did not catch it myself, and it is the sharper lesson.** I wrote a guard
test for r1's finding and gave its bystander a *friendly* name — "Seed-like Truck" — a
stand-in for the thing I was protecting. It contains no `itest`, so it could never be
matched by a wildcard bug. The guard tested the failure I had in mind rather than the
failures the predicate permits.

> **A guard's fixtures should be chosen to be caught by the ways the rule can be WRONG,
> not by the way it is meant to work.** Three bystanders now: the seed stand-in, a
> LIKE-wildcard near-miss, and an unanchored near-miss. That is the fourth test in this
> project named for a property it could not exercise, and the first where the blind spot
> was in my choice of fixture rather than my choice of assertion.

**#221 is the third occurrence of "corrected in one place, left in its mirror"** (#171,
#178, #206). The pattern is stable enough now to name a rule: after correcting a
justification, grep the repo for its distinctive phrase before committing. "Unfiltered
deletes" appeared in three files; I fixed one.

The replacement reason is also better in a way worth copying: the old one ("the helper
is unscoped") decays as soon as the helper improves, while the new one ("this suite
deletes rows, its predicate has been wrong twice, and neither failure went red") stays
true regardless. **A justification that depends on a current defect expires when the
defect is fixed.**

**Counting #64: two pre-commit, three in r1, four in r2** — and both r1 and r2 found the
same destructive-scoping class in the same twenty lines. The module under test,
`db/locations.ts`, has now passed two reviews without a finding. Every defect in this
issue has been in the scaffolding I wrote to test it, which is worth noticing: the test
infrastructure got none of the design attention the production code did, and it is the
part that can delete data.

---

### #223–227 — Three rounds, one helper, three wrong delete predicates (2026-09-14)

`src/lib/db/locations.ts` — the module this issue is FOR — has now passed three reviews
with zero findings. All fourteen findings across #64 are in the scaffolding I wrote to
test it.

**The same twenty lines have had three different wrong delete predicates:**

| Round | Predicate | Matched |
|---|---|---|
| r1 | delete everything | `seed.sql`'s three fixed-UUID trucks |
| r2 | `LIKE '__itest__%'` | any name containing "itest" — `_` is a wildcard |
| r3 | guard checking `%` and `_` | let `*` through — **PostgREST rewrites `*` to `%`** |

Each fix was correct about the thing it was told about and wrong about the neighbouring
member of the same class. r3's is the sharpest: I widened a guard to cover SQL LIKE's
wildcards, having never asked whether SQL LIKE was the only language the string passes
through. It is not — it travels supabase-js → PostgREST → SQL, and the middle layer has
its own rewrite.

> **A validation guard must cover the whole PATH a value travels, not the language at
> the end of it.** "Which characters are special here?" is the wrong question when
> "here" is three layers deep.

**#223 is the one I would most want back.** r2's scripted `.replace()` silently matched
nothing in either file. I then ran `grep -c "unfiltered deletes"`, saw `1` in each, and
concluded that was my new corrective comment quoting the old claim — it was the original
sentence, untouched. The fix went into the commit message and the PR body as done.

That is #191's misreading exactly — a measurement interpreted to match the expected
answer rather than read — but escalated, because this time the misreading became a
public claim of completed work. And it is the fourth "corrected in one place, left in
its mirror" (#171, #178, #206, #221).

> **A scripted edit that reports nothing is not the same as a scripted edit that
> changed something.** `.replace()` returns the original string on no match and says
> nothing about it. Every edit in this round was made with exact-text tooling that FAILS
> on no match, and verified afterwards by a grep for the phrase across the whole repo —
> `0`, not "1 which I can explain".

**#226 is the class-completion failure again.** r1 fixed quoted `.env` values; the same
dotenv syntax also has inline `#` comments, and I fixed one member and not the other.
Both produce the identical opaque 401.

**What this says about where the attention went.** Fourteen findings, none in the
production module. The scaffolding got written fast, on the assumption that test code is
low-stakes — and it is the part that issues DELETE statements against a database a human
inspects by hand. The rule that would have saved three rounds is not subtle:

> **Code that deletes data deserves more design attention than code that reads it,
> regardless of which directory it lives in.**

---

### PHASE-3 MID-POINT REVIEW — counted, not remembered (2026-09-14)

Prompted by being asked whether an observation I made in conversation had actually been
written down. It had not, and two of the numbers in it were wrong — recorded here
properly, with the corrections, because an uncounted pattern is an anecdote.

**Review rounds per PR, counted from commits:**

| PR | Issue | Rounds | Logged findings |
|---|---|---|---|
| #93 | #67 parseCaption | 3 | 11 |
| #98 | #61 vitest split | 4 | 10 |
| #100 | #96 excluded weekday | 2 | 9 |
| #104 | #63 geocoding | 5 | 21 |
| #106 | #64 db/locations | 3 | 12 |

⚠ I said in conversation "the last three took 5, 3 and 3 rounds". It was **5, 2, 3**.
And I said "the production modules came through clean" — true of `db/locations.ts`
(three rounds, zero findings) and **false** of `geocoding.ts`, which had real module
defects through r5. The narrow claim is worth keeping; the broad one was not checked.

**Cause distribution across all 72 findings logged this session:**

| Cause | Count |
|---|---|
| `incomplete-guard` | 26 |
| `imprecise-claim` | 17 |
| `stale-doc` | 8 |
| `overcorrection` | 8 |
| `unverified-assumption` | 5 |
| `manual-drift` | 3 |
| other | 5 |

**What the two leaders actually mean, since they are a third of everything each:**

`incomplete-guard` is not "I forgot a guard" — nearly every instance is a guard that
existed and covered the case I had in mind while missing its neighbour: empty string but
not malformed, host but not path, write but not read, `%`/`_` but not `*`, rejection but
not hang. **The defect is the SET, never the mechanism.**

`overcorrection` at 8 is the number that should worry me most, because the log's own
header calls it the most expensive category. Seven of the eight were a fix creating the
next round's finding. The three that stopped recurring were the ones that removed the
thing that could be wrong rather than handling one more case — `address.ts` deleting
forms, `vitest.config` subtracting a directory, `geocoding.ts` constructing instead of
predicating.

**The actionable conclusion for #68, which is what the conversation was leading to.**
The override matrix is five branches of silent data-correctness logic: a wrong decision
deletes or replaces a truck's pin and nothing fails. That is `incomplete-guard` — my
single largest cause — in the shape where it costs the most, and it is exactly the shape
that has NOT been my problem so far, because the last three issues had their risk in the
surrounding material.

So the effort should go somewhere different from #63 and #64:

> **Derive the matrix's cases from the spec and make exhaustiveness a compile error, not
> a test I remembered to write.** `confidence.ts` already did this successfully in this
> phase — a `Record` keyed on both axes, so a new variant fails the build rather than
> falling through a default. Five override branches want the same treatment.

Stated as a prediction so it can be checked: if #68 takes more than two review rounds
and the findings are again in comments and fixtures rather than in the matrix, the
problem is my attention budget rather than the code's difficulty.

### DECISION — Drop the ingestion lanes and the parser; admin-populated launch (2026-10-10)

Recorded so it is not re-litigated, and so the reasoning survives until the replan
lands. Settled in conversation with the user; no PR yet. Supersedes the Phase 3 plan's
remaining steps (9–11) and most of `project-context.md`.

**Product model.** The admin follows every truck's Instagram (post + Story
notifications) and enters locations by hand. Recurring schedules pre-fill a morning
**checklist**; nothing reaches the map until admin confirms it (admin-set auto pins
would show trucks that are not there). Owners may later **claim** a listing; owner
entries beat admin entries; if an owner goes quiet for X days admin resumes, with a
heads-up. Takedown on request. Public facts only — no copied photos/logos before claim.

**Why drop the lanes.** ~70% of `src/` and nearly all remaining Phase 3 risk; the
parser cannot see image posts or Stories; parsed pins are lower trust, and a wrong pin
costs users more than a missing one; Make.com per-truck setup is itself onboarding
friction; the user always expected to phase the lanes out. Make.com cannot watch
other people's accounts, so a single central webhook was ruled out. Meta Business
Discovery (posts only, no Stories) is the official option if automation is ever
wanted. Lane code is **shelved on an archive branch**, not deleted.

**Stack after the change:** Next.js · Supabase (Postgres + Auth only) · MapLibre/PMTiles
(→ R2 before launch) · date-fns-tz · Vercel. Removed: Mailgun, Make.com, Upstash,
Nominatim + `geocoding_cache` (pins come from map tap / saved spot / GPS), Vercel Cron,
Supabase Realtime.

**No cron (row 258).** It was never needed for correctness: reads already filter
`expires_at > now()`, and a client timer is required anyway to show a pin APPEARING at
`starts_at`, which a delete sweep can never do. Location history is **kept** (schedule
suggestions, proof-of-value to trucks); a cancellation is an UPDATE of `expires_at`.

**No Realtime.** Free plan refuses connection #201 (`too_many_connections`); Pro is
500 + $10/1,000. The data changes a few times a day, so it belongs with
fetch-and-refresh maps, not push maps. Replacement: one `GET /api/live`, CDN-cached
~30 s and invalidated on write; clients poll every 60 s + on focus, pause when hidden,
patch only changed markers, and run a 30 s expiry timer with a server-time offset.
Supabase load is flat at any traffic level. The browser no longer reads the DB, so
anon SELECT on `locations` is revoked — otherwise kept history would expose every
truck's full movement history via PostgREST.

**Supabase still the right choice** without Realtime: Postgres + Auth are what is used,
both already built; plain SQL migrations keep lock-in low. Manage instead: no backups
on Free (pg_dump or Pro at launch), pause after 7 idle days.

**Data model:** drop the confidence columns → `source` (admin/owner) + `updated_at`;
one overlap rule (overlap replaces, owner wins); drop `posts`, replay index 0004,
`is_negation`; `dictionary.ts` → a `spots` table. Defer the owner dashboard until a
truck asks to claim. Shrinks: `proxy.ts` → session check only; Phase 7 → security
headers; purity guard goes; integration tests shrink. `project-context.md` is to be
**rewritten**, not reconciled (supersedes IS #73's approach). Vercel Hobby is
non-commercial only — Pro when the app earns money.

**Addendum — simplification pass (same day).** A review of the transition doc for
over-engineering, applied in full by the user's call:
- overlaps are **rejected** by a DB exclusion constraint (`23P01` → 409), not
  auto-replaced;
- `ends_at` is NOT NULL and `expires_at` is gone;
- the checklist comes from history (no `schedules` table);
- known spots are a code constant plus recent places (no `spots` table);
- ~~ISR `revalidate = 60`~~ → an ordinary route with `Cache-Control: public, s-maxage=60, stale-while-revalidate=60`, with **no** save-triggered purge (ISR reversed the same day, row 264);
- dropped: the R2 publish-on-write contingency, the server-time offset, grey markers
  and `last_known_*`;
- ~~R2 tiles deferred~~ → **tiles on R2 at launch**, plus Vercel Pro + Spend Management before any marketing push (reversed by the security review, row 265);
- migrations squashed;
- Supabase Pro at launch for backups (the "scheduled pg_dump" contradicted "no cron");
- claim-model details deferred to the Owners phase.

Rationale: one admin writer and ~30 trucks. Every removed piece was solving a problem
(races, NULL end times, cache purging, clock skew) that this shape either cannot have
or tolerates at a 1–2 minute delay. Full table in `.claude/transition.md` §0. **Do
not re-add without a concrete problem.**
| 228 | 2026-09-20 | PR #107 / IS #68 | `IS #68` | The issue's Verification step — "POST a caption to `/api/ingest` via curl and confirm a `locations` row appears" — is unreachable inside the issue that states it. The route calls only `persistPost`; wiring the parser in is #70, and #68's own Non-goals say "No changes to `ingestion.ts`". The issue contradicts itself, and following it would have produced either a false negative ("the service is broken") or a scope creep into #70 | writing the verification step | `pre-commit` | `stale-doc` | ➖ verified the step's INTENT instead (that the built row satisfies the live schema) with a throwaway integration test, since deleted. Worth a rule: an issue's verification must be reachable from its own non-goals |
| 229 | 2026-09-20 | PR #107 / IS #68 | `phase-3-parser.md` decision #5 | Decision #5 writes the inferred expiry as `min(posted_at + 8h, midnight of starts_at's day)`, and #5(a) separately argues the cap must key on `starts_at`'s day "or an imorgon location expires before its own starts_at". The two halves disagree: for a future-dated caption with NO time ("Vi står vid Järntorget imorgon"), `posted_at + 8h` is the SMALLER term, so the cap never applies and the row still expires tonight — the exact defect #5(a) exists to prevent, reached through the other term. #5(a) fixed one term and left the reasoning unapplied to its neighbour | writing `computeExpiresAt` | `pre-commit` | `incomplete-guard` | ✅ implemented as `starts_at + 8h` (identical wherever `starts_at` is `posted_at`, i.e. every same-day caption) with a named test, plus a property test asserting `expires_at > starts_at` across five shapes — the form that catches a change to EITHER term, not just the one that prompted this. Confirmed with the user 2026-09-20 and written into the plan as a ⚠ CORRECTION block under decision #5. `project-context.md` still repeats the old phrasing; on #73's table |
| 230 | 2026-09-20 | PR #107 / IS #68 | `code-only` | The unit suite mocks the entire db layer, so a green `test:run` proved nothing about whether the row the service BUILDS is one the database ACCEPTS — NOT NULL on six columns, `locations_source_check`, float4 confidences. Nothing in the four gates covers that gap for a service whose whole output is one insert, and `test:all` does not either until #72 exists | noticing the curl step was unreachable | `pre-commit` | `missing-gate` | ➖ covered ad hoc this time; the durable fix is #72. Flagged there: the H4 regression (an `ends_at = NULL` row being overridden) is only checkable against real SQL |
| 231 | 2026-09-20 | PR #107 / IS #68 | `code-only` | A replace is an insert and a delete issued as two separate PostgREST calls with no transaction spanning them — PostgREST runs each request in its own, and supabase-js has no transaction API. Running inside `after()`, a failure between them is invisible: no error reaches a client and neither Mailgun nor Make.com retries. PR #107 chose insert-then-delete because the two partial failures are unequal (delete-first loses the pin outright and unboundedly; insert-first leaves two pins, self-healing within hours via the next winning post or `expires_at`) — but that is choosing which way to fail, not a fix | user asked why the ordering was chosen | `pre-merge` | `missing-gate` | ➖ **SETTLED: the current order stands for #107; the proper fix is scheduled as IS #108** (atomic replace via an `.rpc()` Postgres function, kept dumb so the override matrix stays in tested TypeScript). Do not re-litigate the ordering in review — it is a known-suboptimal choice with a filed replacement |
| 232 | 2026-09-20 | PR #107 / IS #68 | `code-only` | `findOverlapping` runs BEFORE and OUTSIDE the write, so the override decision is made on a read that can go stale: two concurrent posts for one truck both see the same existing row, both decide to replace, both write, and two overlapping pins result — with every individual operation behaving correctly. Reachable by the ordinary crosspost (one Make.com fan-out to Instagram + Facebook is two posts within milliseconds), and #70's caption+60s dedup narrows it without closing it, being a read-then-write race itself | reasoning through whether a transaction fixed everything | `pre-merge` | `incomplete-guard` | ➖ **SETTLED: filed as IS #109** (GiST exclusion constraint making two overlapping live rows per truck unrepresentable). ⚠ **Recorded because I nearly conflated this with #231 and a transaction does NOT fix it** — both racing transactions are already perfectly atomic. Atomicity is about one transaction's own statements; this is isolation. The distinction is why they are two issues, and #109 closes it with an invariant rather than a lock, which is the "remove the thing that can be wrong" move the three non-recurring fixes this phase all shared |
| 233 | 2026-09-20 | PR #107 / IS #68 | `code-only` | `expires_at` could land BEFORE `starts_at` for the THIRD time in one phase. The boundary was `${date}T23:59:59` while `starts_at` carries milliseconds (webhook `posted_at` is `new Date().toISOString()`, used verbatim by a same-day no-time caption), so a caption posted at 23:59:59.500 local got `expires_at` 500 ms EARLIER — a row born expired, invisible for its whole life | code review r1 | `pre-merge` | `incomplete-guard` | ✅ boundary is now the next day's midnight, which REMOVES the hole instead of narrowing it — every instant in the day is strictly less than it at any precision. Computed via `addCalendarDays` + `fromZonedTime`, never +24 h (a Swedish day is 23 or 25 h twice a year) |
| 234 | 2026-09-20 | PR #107 / IS #68 | `locations.test.ts` | **The property test written specifically to catch #233's class did not catch it, because all five of its fixtures had `.000` milliseconds.** I chose the inputs from the cases I had in mind — the same failure the property test was meant to make impossible, one level up. A property test whose inputs all share the shape the property is most fragile against proves less than it appears to, and it is MORE dangerous than no test because it is read as coverage | code review r1 | `pre-merge` | `incomplete-guard` | ✅ now 13 shapes: sub-second instants either side of the old boundary, both DST transition days, both window kinds, and a failure message naming which shape broke. **Rule worth keeping: when a property test exists to protect an invariant, at least one fixture must be adversarial to the invariant's own arithmetic, not merely to the feature** |
| 235 | 2026-09-20 | PR #107 / IS #68 | `code-only` | A future-dated caption with no time ("Vi står vid Järntorget imorgon") started at 00:00 and expired at 08:00 local — live only overnight, gone before anyone looked for lunch. I noticed this while designing, wrote "short but not wrong" in my own reasoning, and moved on. It is not short, it is the precise complement of the hours that matter | code review r1 | `pre-merge` | `unverified-assumption` | ✅ such a caption now gets the whole day it names; the 8 h guess is a statement about the POST and is meaningless anchored to a midnight nobody announced. ⚠ The test named "…and stays visible" asserted only `expires_at > starts_at`, which the 00:00–08:00 window satisfied — a test whose NAME made the claim its assertion did not |
| 236 | 2026-09-20 | PR #107 / IS #68 | `locations.ts` | The insert-before-delete comment claimed a duplicate pair is "resolved by the next post through this same matrix". False, and the matrix twelve lines above is what falsifies it: a duplicate pair sits on the lane that wrote it (normally `webhook`), and `OVERRIDE.webhook.webhook` is `discard`, so the truck's own later posts cannot clear it — only a `manual` post or `expires_at` does. I wrote the justification and the table that refutes it in the same file, in the same sitting | code review r1 | `pre-merge` | `imprecise-claim` | ✅ corrected in the code, the PR body and process-log #231. The choice still stands (bounded-and-visible beats unbounded-and-silent), but bounded at midnight rather than at the next post |
| 237 | 2026-09-20 | → IS #110 | `phase-3-parser.md` decision #6 | Decision #6 reasons that "a cancellation is not a competing claim; it is the same source retracting its own earlier statement", and applies that to negations (`>=`) and to `manual` vs `manual` ("a correction, not a competing claim") — but not to the third member of the same set, a truck RELOCATING. So an 11:00 "Järntorget" (8 h inferred window) makes a 15:00 "Heden" on the same lane get discarded, and the map shows the wrong place for four hours, silently, with the post marked `'parsed'` | code review r1 | `pre-merge` | `incomplete-guard` | ➖ filed as IS #110 with four weighed options. Not patched in #107: it is CLAUDE.md's documented rule and the plan considered the `>` explicitly, so changing it unilaterally would be exactly the re-litigation CLAUDE.md forbids. ⚠ Same shape as #229 — a decision record applying a correct argument to some members of a set and not its neighbours. That is now TWICE in one plan |
| 238 | 2026-09-20 | PR #107 / IS #68 | `code-only` | `updateLastKnownPosition` fires for a future-dated insert, so "Järntorget imorgon" posted on Saturday moves the grey-marker fallback to Järntorget on SATURDAY — and if the truck spent the week at Lindholmen the grey pin moves off Lindholmen on the strength of a sentence about tomorrow | code review r1 | `pre-merge` | `imprecise-claim` | ➖ **SETTLED with the user 2026-09-20: keep the behaviour, comment it.** The grey marker is already the "we do not know" state and on Saturday both candidates are guesses — one stale, one about a different day; the strict reading ("where the truck most recently ACTUALLY was") needs `starts_at <= now()` in the service, making it clock-dependent for precision the marker does not claim. Recorded at the call site so the next reader sees a weighed trade, not a missed check |
| 239 | 2026-09-20 | → IS #73 | `project-context.md` + `phase-3-parser.md` | **The active-location query is defined TWICE and the two disagree.** `project-context.md:470-474` ("used everywhere a 'current' location is needed") says `is_negation = false AND expires_at > now()`; `:624`'s `useMapFilter` "active now" says `starts_at <= now() AND expires_at > now()`. The plan carries the FIRST at decision #1 (`:345`, `:506`), so under "the plan wins" the term-missing version is currently authoritative — and implemented that way a future-dated row renders as a LIVE pin today: "Järntorget imorgon" posted Saturday pins the truck at Järntorget on Saturday, at 0.51, clearing the 0.45 threshold | checking an unrelated `last_known_*` question | `pre-merge` | `stale-doc` | ➖ recorded on IS #73 with the correction (:624 is right — its three-mode filter design anticipates unstarted rows, so :473 is simply missing a term). ⚠ **Found only by following a low-stakes question I nearly dropped as "defensible either way".** The cheap question was the thread; the expensive defect was three lines away. Also flagged for Phase 4's read route as an acceptance criterion |
| 240 | 2026-09-20 | PR #107 / IS #68 | `phase-3-parser.md` H4 + `IS #110` | **H4's fix INVERTED a working behaviour, and neither the plan nor I noticed.** Before it, an hourless 11:00 post had `ends_at = NULL`, so the NULL-blind predicate never matched it and a 15:00 "now at Lindholmen" simply inserted — the truck moved and the map followed. H4 made the row matchable, so the matrix is now consulted and `OVERRIDE.webhook.webhook = discard` drops the move. What worked by accident now fails by rule | code review r2 | `pre-merge` | `incomplete-guard` | ➖ recorded on IS #110, whose severity rises from "latent design gap" to "newly reachable regression". H4 remains right — the blindness it removed made low-confidence pins permanently unreplaceable. ⚠ **The lesson is about corrections, not about H4:** a fix that makes the system SEE more hands new inputs to every rule downstream, and those rules were written against the narrower input set. H4 was reviewed for what it fixed, never for what it newly exposed |
| 241 | 2026-09-20 | PR #107 / IS #68 | `locations.ts` OVERRIDE | The matrix compares `source_confidence` ONLY — never `parser_confidence`, therefore never `confidence`, the product the map filters on at 0.45. Measured: an hourless "Lindholmen imorgon" (0.6 × 0.85 = **0.51**) replaces a precise emailed "Järntorget 11-14" (1.0 × 0.55 = **0.55**). Lower combined confidence wins on lane alone, so the system replaces precise information with vague information and its own display score disagrees | code review r2 | `pre-merge` | `incomplete-guard` | ➖ filed as IS #111 with four weighed options. Not patched: it is CLAUDE.md's rule verbatim. ⚠ **My r1 whole-day fix is what made this case reachable** — verified by measuring the overlap span before and after (8h → 24h; the email lunch matched `false` → `true`). NOT an `overcorrection`: the wide window is the honest reading of "sometime tomorrow", and the narrow one was hiding a genuine conflict by leaving two contradictory pins live |
| 242 | 2026-09-20 | PR #107 / IS #68 | `locations.ts` | The override decision is per-row; the deletion is not. A row matched on ANY overlap is removed WHOLE, so an existing manual Heden 11:00–20:00 met by a manual "Järntorget 19-21" posted at 15:00 shares one hour and loses nine — the truck's live pin vanishes at 15:00, four hours before the replacement starts, and nothing fills the gap | code review r2 | `pre-merge` | `unverified-assumption` | ➖ filed as IS #112. The model assumed a superseding location is roughly COEXTENSIVE with what it supersedes — true of every case it was designed around (crosspost, re-post, manual correction of the same slot) and false whenever two windows merely touch. I never wrote that assumption down, which is why it was never checked |
| 243 | 2026-09-20 | n/a | `review practice` | Round 2 found three findings in code that round 1 had already reviewed and that four gates pass. All three are the same shape — the override model meeting conflicts it previously could not see — and none is a defect a test could have caught, because the tests assert the documented rule and the documented rule is what is incomplete | reflection after r2 | `pre-merge` | `missing-gate` | ➖ **Recorded as a practice note.** Two rounds of review on one module produced 9 findings, 2 of them live defects that the whole gate suite passed. The gates verify the code does what the rules say; nothing verifies the rules are complete. For the phase's remaining issues (#69 especially, which shares this module), assume the second review round is load-bearing rather than a formality |
| 244 | 2026-09-20 | PR #113 / IS #69 | `phase-3-parser.md` decision #7 | **Decision #7's replay-safety claim is false for cancellations, and #6 is what falsified it.** #7 says "replaying an old post must not override a newer location" and that "the priority matrix already covers this" — true of the insert path (`OVERRIDE.webhook.webhook = discard`) and INVERTED here (`CANCELLATION.webhook.webhook = cancel`). So #71 replaying an 08:00 "Inställt idag" deletes the 12:00 pin the truck posted afterwards. #7 was written before #6's table existed, and nothing re-checked it when that table landed | code review r1 | `pre-merge` | `stale-doc` | ✅ `cancellableIds` now applies TWO rules — authority (which lanes may retract) and recency (`created_at <= posted_at`). Fails toward not cancelling, per `negation.ts`'s asymmetry. ⚠ **Same shape as #229 and #237: a decision record whose reasoning was correct when written and was not revisited when a later decision changed its premise. Third time in one plan** |
| 245 | 2026-09-20 | PR #113 / IS #69 | `→ IS #80` | A two-clause caption cancels the pin it announces — verified: `"Inställt lunch idag, men vi står kvar vid Heden 17-20"` yields `isNegation: true` with `time` 17:00–20:00, so the cancellation window deletes the Heden 17-20 pin the same caption creates. **This diff is what made it destructive**: while the negation branch was #68's bare return the mis-scoped window was inert, so #80/#94 were filed as wrong-PIN issues, and for this path they are wrong-DELETE — unbounded by `expires_at` and undiscounted by `confidence`, which is the whole asymmetry `negation.ts` reasons about for DETECTION and nobody reasoned about for the WINDOW | code review r1 | `pre-merge` | `incomplete-guard` | ➖ recorded on IS #80 with the severity change and at `cancellationWindow`. Not fixable in the service — nothing in a `ParseResult` says which clause a field came from, so a guard here would be a second place to get Swedish clause boundaries wrong |
| 246 | 2026-09-20 | PR #113 / IS #69 | `locations.test.ts` | **A test named for the rule it checks could not fail on a production change.** "the cancellation table differs from the override table on exactly the diagonal" compares the TEST FILE's own `EXPECTED` fixture against `sourceConfidence` and never reads production `CANCELLATION`, which is not exported — flipping the production diagonal leaves it green. The same shape is in #68's two override siblings in this file, already merged | code review r1 | `pre-merge` | `imprecise-claim` | ✅ all three renamed/annotated to state the CHAIN they are one link of (nine parameterized cells tie production to `EXPECTED`; these tie `EXPECTED` to the decision). ⚠ **Second instance this phase of a test whose NAME claims more than its assertion** — #235's "…and stays visible" was the first. Both were read as coverage they did not provide |
| 247 | 2026-09-20 | PR #113 / IS #69 | `locations.test.ts` | `makeLocation`'s `created_at` was `09:00:01`, one second AFTER the default post's `posted_at` — the shape of a row created BY that post, not one that already existed. Harmless until #244's guard read the column, at which point every cancellation matrix test went red for a fixture reason. The fixture had encoded a scenario that cannot occur: `findOverlapping` returns rows that predate the post being processed | writing #244's guard | `pre-commit` | `unverified-assumption` | ✅ moved to 07:00 with the reason recorded on the fixture. Worth noting the failure was LOUD and immediate — a fixture that lies is cheap when a new guard reads the field, and expensive when nothing ever does |
| 248 | 2026-09-20 | n/a | `review practice` | Both guards in this PR were mutation-checked before claiming they work — flipping the cancellation diagonal kills exactly 2 tests, removing the recency filter kills exactly 2. Adopted after #234, where a property test written specifically to catch a defect class passed while that defect was live | during PR #113 | `pre-merge` | `missing-gate` | ➖ **Practice worth keeping: for a guard whose failure is silent, run the mutant before claiming the test covers it.** Costs one `sed` and one test run. It is the only cheap way to tell a load-bearing test from one that merely passes, and this module has now produced two tests that merely passed |
| 249 | 2026-09-20 | PR #113 / IS #69 | `locations.ts` | **OVERCORRECTION, and the worst kind: my r1 fix for #244 INVERTED the defect it was added for.** The recency guard compared a row's `created_at` against the cancelling post's `posted_at`. Under a #71 replay every re-inserted location carries `created_at = now`, later than every replayed cancellation's `posted_at` — so NO cancellation could cancel and replaying a day RESURRECTED every pin it had cancelled. It also introduced a live-path regression that did not exist before it: email `posted_at` is the signed Mailgun timestamp, frozen across retries, so two retried emails can invert delivery order against their timestamps and a genuine cancellation was silently dropped. Both verified by probe, not reasoned about | code review r2 | `pre-merge` | `overcorrection` | ✅ reverted; correct fix filed as IS #114 (needs the ORIGINATING post's `posted_at` via `locations.post_id` — a db-layer change with a nullable-column decision attached). ⚠ **Both failure modes recorded above `cancellableIds` so a third attempt does not repeat them, and the test block now pins the hazard as a #114 baseline while saying plainly it is not a guard** |
| 250 | 2026-09-20 | PR #113 / IS #69 | `review practice` | **I reached for a guard when the right move was a filed issue, and the log's own header says why that is expensive.** #249's guard was written and shipped inside one review round, against a path (#71) that does not exist yet, using two operands whose semantics I had not checked — `created_at` is our clock, `posted_at` on the email lane is Mailgun's. The r1 tests passed AND were mutation-checked, which is exactly why the mutation check did not save me: it proves a test is load-bearing, never that the rule under test is the right rule | reflection after r2 | `pre-merge` | `overcorrection` | ➖ **Rule worth keeping: mutation-checking answers "does this test guard this code", never "is this code correct". For a guard on a path that cannot yet be exercised end to end, the honest output is an ISSUE, not an implementation.** The three fixes that stopped recurring this phase all REMOVED the thing that could be wrong; this one added a comparison |
| 251 | 2026-09-20 | PR #113 / IS #69 | `locations.ts` | `STATUS_ON_NO_LOCATION`'s comment still said "three distinct answers across six reasons" after the cancellation became its own `WriteOutcome` and `NoLocationReason` dropped to five — while the module header eleven lines above WAS updated to "five callers" in the same commit | code review r2 | `pre-merge` | `manual-drift` | ✅ corrected. A hand-maintained count next to the thing it counts, updated in one place and not its neighbour — the same shape as L8 and the plan's drifted table count, which is why the plan stopped writing counts beside growing tables at all |
| 252 | 2026-09-20 | PR #113 / IS #69 | `locations.ts` + `IS #114` | **I scoped a live defect as a future one.** The comment and #114 both said the missing recency rule lands "once #71 exists". It is live on the EMAIL lane today: `posted_at` there is Mailgun's signed timestamp, frozen across retries, and the first retry lands at 10 min — inside the ±15 min freshness window, so it is parsed. A retried "Inställt idag" therefore deletes a pin the truck stated AFTER writing the cancellation | code review r3 | `pre-merge` | `imprecise-claim` | ✅ comment corrected, #114 raised to a live-path defect with the scenario and a new acceptance criterion. ⚠ **The frozen email timestamp is BOTH why this gap is live AND why r1's guard was wrong to compare against it** — I had just finished analysing that exact property for #249 and did not carry it one step further to ask what ELSE it implied. Same fact, two consequences, one noticed |
| 253 | 2026-09-20 | PR #113 / IS #69 | `locations.ts` | My own comment claimed "'Inställt 11-14 idag' cancels the lunch and must leave the dinner alone" unconditionally. True only where the dinner is a SEPARATE row — against one `Heden 11:00–20:00` row the same caption overlaps three hours and the whole row is deleted, so the truck vanishes 14:00–20:00 having cancelled nothing of the sort. A comment asserting a property the code next to it does not have | code review r3 | `pre-merge` | `imprecise-claim` | ✅ condition stated; behaviour is IS #112, which also gained the midnight case (a full-day cancellation for TOMORROW deletes a pin that starts TONIGHT, whole — a live pin removed with no mis-detection anywhere) |
| 254 | 2026-09-20 | n/a | `review practice` | **Three rounds on one PR: r1 found 3 real defects, r2 found my r1 FIX was wrong and reverted it, r3 found no new defects — only two of my own claims mis-scoped.** The trend across rounds is the useful signal: defects → my fix → my claims. r3 producing zero behaviour changes is the stopping condition, and it only became available because r2 was run after a round that had changed code | reflection after r3 | `pre-merge` | `missing-gate` | ➖ **Rule: a review round that changes code earns another round; one that changes only comments does not.** r2 existed because r1 changed code, and r2 is what caught #249 — the single most expensive defect in this PR, which four green gates and a mutation check had both passed. Applies directly to #114 and #112, which will both change this module |
| 255 | 2026-09-20 | PR #115 / IS #60 | `0006_locations_overlap_index.sql` | **A comment pointed the reader at the H4 defect the migration exists to move away from.** It said the index column order "matches the argument order of `findOverlapping`". It does not: `startsAt` (2nd arg) bounds `expires_at` and `effectiveEnd` (3rd arg) bounds `starts_at`. The crossing IS the overlap test — `[a,b)` meets `[c,d)` iff `a < d AND b > c` — so pairing start-with-start reads as an obvious cleanup and silently tests something that is not overlap | code review r1 | `pre-merge` | `imprecise-claim` | ✅ corrected, and the crossing written out with its reason. ⚠ **The index is indifferent to the error; a reader acting on it is not.** Worth noting the shape: the comment was wrong in the one file whose entire purpose is that this predicate was got wrong once already |
| 256 | 2026-09-20 | PR #115 / IS #60 | `0005_parsing_status_duplicate.sql` | The file recorded the atomicity verification as done "on a scratch table with the same shape" and omitted that it was then repeated on `posts` itself. The PR description had it right; the FILE — which is the surviving evidence for H5's acceptance criterion once the PR is out of sight — understated the work | code review r1 | `pre-merge` | `imprecise-claim` | ✅ both runs recorded, with the real-table one marked as the criterion. **Durability rule worth keeping: when evidence exists in both a PR body and a committed file, the file is the one that has to be complete.** The PR body is the perishable copy |
| 257 | 2026-09-20 | n/a | `review practice` | Applied #254's rule for the first time: PR #113 r3 changed only comments, so no r4 was run, and PR #115's single round changed only comments, so none is queued. Both rounds on #115 and #113-r3 found REAL problems — the rule is about what a round EARNS, not about whether comment-only rounds are valuable | after PR #115 r1 | `pre-merge` | `missing-gate` | ➖ Holding: **a round that changes code earns another; one that changes only comments does not.** Four of the last five review rounds across #107/#113/#115 found something, and the two that found live defects (#107 r1, #113 r2) both followed a round that had changed code |
| 258 | 2026-10-10 | n/a | `project-context` | Tech stack, Expiry Logic and the committed `vercel.json` all say "Vercel Cron every 30 min" (`*/30 * * * *`) on the Vercel free tier. Vercel Hobby only allows cron jobs that run once a day, and a more frequent expression **fails at deploy** (official docs, Jan 2026). Never checked against plan limits; it would first have surfaced at the Phase 5 first deploy. Display correctness doesn't depend on it (reads filter `expires_at > now()`), but the context says pins vanish via Realtime DELETEs from that sweep, so open clients would show expired pins for up to ~24h | user-requested context review | `crossed-phase` | `unverified-assumption` | ❌ open — decide the scheduler (pg_cron candidate) during the lane-removal replan |
| 259 | 2026-10-10 | n/a | `transition.md` | Self-review of the transition doc found four design claims I had made confidently in the same conversation that were wrong. (1) "`s-maxage` header + Next tag invalidation" mixes two caches; the tag purge may never clear the CDN copy. (2) The server-time offset taken from a cached body is off by up to ~90 s. (3) "Cancel = `expires_at = now()`" inverts the range for a future pin and would make the proposed `tstzrange` exclusion constraint throw. (4) "Shrink `proxy.ts`, drop its layers": it is a no-op stub, the layers never existed (never read the file). Also missing: the live-read upper bound, cache-bust abuse, README (the public doc), R2 CORS, Supabase test-only SMTP, GDPR retention, and that a fresh session won't find the doc | user-requested review | `pre-commit` | `unverified-assumption` | ✅ fixed in `transition.md`; (4) is the recurring "describe a file without reading it" pattern |
| 260 | 2026-10-10 | n/a | `transition.md` | Verifying my caching advice against the Vercel and Next 16.4 docs falsified two claims. (1) "Make the cache ignore query parameters": Vercel cache keys include the full URL and **are not configurable**; queries are ignored only for static files. (2) "Vercel ignores query strings for ISR output": not documented. The ISR-cache read before function invocation probably saves the DB, but that is unverified, so it is now a preview-deploy test. Also corrected the opposite direction: row 259's fix said a header cache and Next's tag invalidation were "two different caches". Vercel documents that Next 16 `revalidateTag`/`revalidatePath` purge the CDN cache, so that was overstated. The fix for an unverified claim was itself partly unverified (an overcorrection risk, caught before any code) | user ("verify claims") | `pre-commit` | `unverified-assumption` | ✅ `transition.md` §7 rewritten from the docs, with an explicit test for the remaining unknown |
| 261 | 2026-10-10 | n/a | `transition.md` | Consistency review after the simplification rewrite. (1) §0 justified dropping save-triggered regeneration with "the admin screen reads the DB directly". That contradicts the doc's own rule "the browser never reads the DB" and the RLS section (admin goes through API routes); I wrote it to make the trade-off sound free. (2) Missing: an ISR GET route is pre-rendered during `next build`, so the Supabase query runs at build time. That affects the local `npm run build` gate (DB must be up), preview deploys (env vars), and error handling (returning `[]` on error would cache an empty map). Nobody mentioned build time in three rounds of ISR discussion. Plus two wording drifts (`dictionary.ts` named after it was moved; "Phase 4" ambiguous between old and new roadmaps) | user-requested review | `pre-commit` | `unverified-assumption` | ✅ fixed in `transition.md` §0/§4/§7/§11/§12/§13; build behaviour left as an explicit Phase 5 check |
| 262 | 2026-10-10 | n/a | `transition.md` | Full read-through (the previous round only grepped for stale terms and missed these). (1) The doc said "verified against Next 16.4" but the project pins `next` 16.2.6. (2) It never said `/api/live` must read with service_role, though its own RLS removes anon SELECT; the obvious anon-client implementation would return an empty map. (3) Phase 5 needs a preview deploy, but no phase created a hosted Supabase project, and a preview build can't reach local Docker. (4) "Today the browser reads `locations`" was false: the map still uses `fake-data.ts`; only the 0001 grant exists. (5) `seed.sql` (writes `last_known_*`) and `TruckPopup.tsx` (confidence labels) were missing from the rework list. Plus a stale row reference and "live entries" wording that didn't match the constraint (which covers all non-cancelled rows) | user-requested review | `pre-commit` | `unverified-assumption` | ✅ fixed in `transition.md`. Lesson: a grep for known-stale terms only finds what you already suspect; consistency needs a full read |
| 263 | 2026-10-10 | n/a | `transition.md` | Fourth review round, two security/correctness gaps, both confirmed in the repo. (1) The admin model never said "session ≠ admin". `config.toml` has `enable_signup = true`, so anyone can get a magic-link session, and the doc only asked for a "session check". Now: disable sign-ups, and check `is_admin` in the proxy *and* every admin route. (2) The popup's "Uppdaterad 08:12" reads `updated_at`, which is only `default now()` with no trigger, so edits never change it. Both came from describing *intent* ("admin-only login", "updated_at") without checking the existing config/schema that implements it | user-requested review | `pre-commit` | `unverified-assumption` | ✅ fixed in `transition.md` §10/§11/§13 |
| 264 | 2026-10-10 | n/a | `transition.md` | **The mechanism outlived its reason.** The read path went Realtime → polling a `Cache-Control`-cached route → publish-on-write → ISR regenerated on save → ISR `revalidate = 60`. ISR was chosen *for* save-triggered regeneration. The simplification pass removed that, and I kept ISR without re-asking why. What remained was only ISR's costs: build-time pre-rendering (the DB is needed during `next build`, locally and on previews; build-time error behaviour unknown) and the fragile "never read the request" rule. A plain `Cache-Control: s-maxage=60` header gives the same shared copy and DB load without either. Caught only when the user asked "are we sure we arrived at the correct solution?" after four review rounds that each checked *consistency*, not *fitness*. Rule: when a simplification removes a feature, re-check every choice that feature justified | user ("are we sure…") | `pre-commit` | `unverified-assumption` | ✅ `transition.md` §0/§7/§12/§13/§14 switched to the header design; ISR recorded as rejected with reasons |
| 265 | 2026-10-10 | n/a | `transition.md` | **"Vercel's free limits cover launch traffic" was never checked, and it was false enough to matter.** It justified deferring R2 in the simplification pass. The security review verified Hobby's limits: 1M CDN requests/month, shared by page, polls **and map tiles** (~60–80 requests per visit, estimated), with **over-limit = unavailable for up to 30 days**, no overage option. That's ~400–550 visits/day, and a single viral day takes the site down for a month. Same review: my own first-draft mitigations were partly wrong. A per-IP rate limit would block real users behind mobile CGNAT/office IPs and doesn't stop a patient attacker; the in-code 400 for query strings still runs the function. Both dropped after the user asked "are they reasonable, worth it, needed?". Decided: tiles on R2 at launch; Vercel Pro + Spend Management before any marketing push / ~50% of a limit / commercial | security review (user-requested) | `pre-commit` | `unverified-assumption` | ✅ `transition.md` §0/§1/§5/§7/§9/§12/§13/§15/§16 |
| 266 | 2026-10-11 | n/a | `phase-4-housekeeping.md` | Review of my own first draft of the Phase 4 plan, same day. (1) I targeted "latest" (Next 16.4.0, MapLibre 6.x/6.13.0, vitest "4.1.11 or 5.x") without checking release dates: 16.4.0 and 6.13.0 were **5 days old** with no patches, while 16.3.8 already fixes every Next advisory (npm DB: vulnerable ≤16.3.7). (2) vitest 5.0.3 **doesn't resolve** with our `@types/node@^20` (ERESOLVE), and npm 10.9.2 **crashes** resolving vitest 4.1.11's optional peers. Only found by resolving the target set into a throwaway lockfile, not by reading advisories. (3) Plan AC "0 critical and 0 high" was unmeetable: the `braces` chain (GHSA-vfj7-8cjw-p6xm) has no fixed release and flags every `eslint-config-next`. (4) The removal grep AC would have failed on 15 kept files. (5) Found a pre-existing false claim in the public `README.md` ("`public/gothenburg.pmtiles` is committed for dev"; it is gitignored and untracked), wrong since Phase 1 | user ("make sure versions are what we need and stable") | `pre-commit` | `unverified-assumption` | ✅ plan targets settled patch releases verified by a resolved+audited lockfile; npm 11 prerequisite; ACs made checkable |
| 267 | 2026-10-11 | n/a | `phase-4-housekeeping.md` | Second plan review. (1) **A decision outlived its reason, again (cf. row 264):** "#99 lands with the vitest upgrade" was justified by the guard depending on the config. Once the owner chose option (a) (`--project` runs, which work on vitest 3.2.7), that reason vanished, and the plan still left the biggest deletion unguarded. #99 is now step 3, before the teardown. (2) "nothing changes for Vercel" after the npm 11 switch was unverified; it is now a Phase 6 check. (3) Out-of-scope put hosted Supabase and the first deploy in "Phase 7/8"; under the new numbering they're Phase 6. (4) Four kept modules (`http/handler`, `geo`, `validators/uuid`, `db/trucks`) lose every caller after the teardown, and the plan didn't say whether that was deliberate | user ("review plan again") | `pre-commit` | `unverified-assumption` | ✅ plan reordered and annotated. Rule from row 264 restated: when a choice changes, re-check every decision it justified |
| 268 | 2026-10-11 | PR #130 / IS #99 | `code-only` | `/code-review` of my #99 PR found 7 real issues (1 more accepted as a trade-off). (1) **Moved the silent-skip class instead of closing it:** `test:all` named `unit` and `integration` explicitly, so a future third project would never run while the gate stayed green. That's the exact failure #99 exists to stop, just relocated into the script. (2) Overclaimed: the title and comments said "zero tests", but the mechanism catches zero test *files*; all-skipped files still pass. (3) `&&` hid integration results whenever unit failed. (4) A present-tense comment still said `test:all` "reports success while running zero unit tests", directly above my "resolved" note. (5) I deliberately left the matching CLAUDE.md warning stale for later (#126), though CLAUDE.md is read every session. (6) The `--passWithNoTests` justification ("until #72 writes the first file") was stale. (7) The unit half duplicated `test:run` | `/code-review` (user-requested) | `pre-merge` | `incomplete-guard` | ✅ `scripts/test-all.mjs` runs every listed project, always runs both, reuses `test:run`; ⚠ at `projects:` and in CLAUDE.md to add new projects to the runner; comments made accurate; CLAUDE.md fixed in this PR. Parallel runs declined (shared results-cache race) |
| 269 | 2026-10-11 | PR #130 / IS #99 | `docs` | `/code-review` round 2 on my own round-1 fixes found 8 more. Three were **code defects in the fix**: (a) `RUNS` was a hand-kept project list guarded only by a "⚠ remember" comment, against `vitest.config.ts`'s own rule "structural rather than remembered"; (b) spawn errors and signals were all reported as "killed", with the cause dropped; (c) `npm run test:all -- <filter>` was silently ignored, so a narrowed request could report a full green. And **I fixed a stale doc and missed two copies of the same claim**: the Phase 4 plan, which "wins" per CLAUDE.md, still prescribed the `&&` one-liner, and `transition.md` still carried the "green `test:all` doesn't prove both projects ran" warning that row 268 says was fixed. Also an overclaiming success message, a duplicated integration command, and a stale CLAUDE.md table cell. Lesson: when correcting a claim, grep *every* doc for it (plan, transition, context, CLAUDE.md), not just the one in front of me | `/code-review` round 2 (user-requested) | `pre-merge` | `incomplete-guard` | ✅ runner cross-checks `vitest list --filesOnly --json` against `RUNS`, prints real spawn errors, refuses arguments, reuses `test:integration` (which drops `--passWithNoTests`, owner-approved); plan, transition and CLAUDE.md updated in this PR |
