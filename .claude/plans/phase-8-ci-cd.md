# Phase 8 — CI/CD

**Planned:** 2026-11-12 · **Status:** in progress

**Source:** `project-context.md` Part 2 ("Phase map", "Pre-deploy automation (planned)"),
Part 3's "Decisions carried forward" (the three rows marked **between phases** whose
marker names no later phase: IS #278 (D1), IS #278 (Phase 8) and IS #279, taken up by
#1–#3), the scope draft `.claude/drafts/phases-8-10-scope.md` ("Phase 8 · CI/CD", which
those rows point to), and the `/create-milestone` conversation of 2026-11-12. The IS #278
(Phase 9) and (Phase 10) rows are their own phases' plans' (`CLAUDE.md`, "Process Log").
Where this plan and `project-context.md` disagree, **this plan wins** until step 17
reconciles the context.

**Purpose of the phase:** until now every gate is a command someone remembers to run.
This phase makes GitHub run them, and the security checks around them, on every PR
(SonarQube Cloud skipped on Dependabot and fork PRs, #2), and makes a red check stop the
merge, before Phase 9's security work and Phase 10's
production deploy go through it (#1).

---

## Goal

Every PR into `dev` or `main` must pass the four gates and the secret scan, CodeQL,
SonarQube Cloud (skipped on Dependabot and fork PRs, where CodeQL covers them, #2), `npm
audit`, the security advisor, the lint rules, the schema controls
and the log check, run by hardened GitHub Actions workflows as required checks under
branch protection, with Dependabot switched on last; done once each required check has
been seen to fail on a probe PR that branch protection then blocked, and a Dependabot PR
has run the checks with no Vercel build (#5).

---

## Prerequisites

- Node and npm in the ranges `package.json`'s `devEngines` admits (`CLAUDE.md`,
  "Dependencies").
- Docker running, for local Supabase, `npm run test:all` and the schema controls.
- The CLI token's reach. It got `403` from
  the secret-scanning, Dependabot-alerts and vulnerability-alerts APIs
  (`project-context.md`, "Pre-deploy automation (planned)", probed 2026-10-24), so a
  setting it can't read is read in the GitHub UI by the owner and recorded in the PR or
  issue.

---

## Out of Scope

| Item | Where it goes |
|---|---|
| TOTP MFA, #241's 6-digit code, session timeouts, the login-abuse and code-guessing probes | Phase 9 |
| Security headers and the CSP. Phase 8 builds the served-app step in `build` (`smoke.mjs`); Phase 9 adds the header assertions to it | Phase 9 |
| Usage, spend and 5xx alerts; the ZAP scan; the `x-forwarded-host` probe; free-text length limits; the `users` policy under `aal1` | Phase 9 |
| The 2FA audit of every account. An account Phase 8 creates (SonarQube Cloud) gets two-factor at creation (`CLAUDE.md`, "Secrets") | Phase 9 |
| Writing the hosted-settings checklist | Phase 9 (applied in Phase 10) |
| The production project and deploy, the custom domain, HSTS, rotating credentials, the production Security Advisor, the Production variables | Phase 10 |
| Deploying from Actions. Vercel keeps deploying (Q27); Phase 8 only extends the Ignored Build Step to cancel `dependabot/*` and `probe/*` (#15) | not planned |
| Dependabot auto-merge, and npm version updates (npm gets security updates only, Actions version updates) | not planned (Q9) |
| Automating the `/map` browser check | stays manual (Q10) |
| Required PR approvals: GitHub doesn't let a PR's author approve it | not planned |
| Self-hosted SonarQube; a secrets manager | not planned; the secrets manager is `project-context.md`'s option to revisit |
| A check's non-blocking findings | their own issues, in Phase 8, 9, 10 or outside (#4) |
| The README rework (#264) | after Phase 8 (Q16) |
| #246, #259, #248, #256 | standalone, outside Phases 8–10 (the IS #278 (D1) row) |
| App code changes beyond what a new check or a blocking finding forces; migrations | — |
| The Owners phase's threat model | Owners phase |

---

## Files

### Create

| File | What it is |
|---|---|
| `.github/workflows/ci.yml` | PR-only (`pull_request` into `dev` and `main`), read-only token. Jobs `typecheck-lint`, `unit`, `integration` (local Supabase, and the security advisor), `build` (`.env.example`'s variables from the local stack, then `next start` and `smoke.mjs`), `secret-scan`, `audit` (three runs, #12), `controls` (`--check` always; the full set when `needsFullControls` says so) and `process-log` |
| `.github/workflows/codeql.yml` | CodeQL, `javascript-typescript` and `actions`, on PRs and on push to `dev` and `main`, with `security-events: write`; its code-scanning result check, not the analyze job, is the required one (#14) |
| `.github/workflows/sonarqube.yml` | SonarQube Cloud, on PRs and on push to `dev` and `main`; skipped by `if:` on Dependabot and fork PRs; installs with `--ignore-scripts`; runs with `sonar.qualitygate.wait=true`, so a failed gate fails the job (#14) |
| `.github/dependabot.yml` | Version updates for `github-actions`, keeping the SHA pins current, with the default `/` branch-name separator (step 15). npm gets security updates only (repository setting) |
| `.githooks/pre-commit` | Gitleaks on the staged changes; the folder is set by hand through `core.hooksPath` (#7). Committed executable with `git update-index --chmod=+x`: `core.filemode` is `false` on the owner's machine (read 2026-11-12), so a plain add stores `100644` and git elsewhere ignores the hook |
| `.gitleaks.toml` (and `.gitleaksignore` if needed) | Gitleaks' config. Each allowlist entry names why it isn't a secret: the local stack's keys and test fixtures (`CLAUDE.md`, "Secrets") |
| `sonar-project.properties` | SonarQube Cloud's project key, sources and exclusions |
| `SECURITY.md` | How to report a vulnerability: GitHub's private reporting |
| `scripts/controls-trigger.mjs` (+ test), or a mode of `controls.mjs` (open decision 4) | `changedPaths` and `needsFullControls` |
| `scripts/controls-trigger-coverage.test.mjs` (name open) | The guard test on the trigger list (#8) |
| `scripts/smoke.mjs` (+ test of its expectations if it has pure parts) | The served-app check the `build` job runs |
| The lint rules' fixture test (path open) | One fixture per new rule, inline in the test, linted through ESLint's API (#9) |

### Modify

| File | Change |
|---|---|
| `eslint.config.mjs` | The rules against DOM HTML sinks and string-built supabase-js filters (Q26), with `.filter` banned outright in `src/lib/db/`. The `src/lib/db/` entry repeats the sink selectors: in flat config a later object's options for a rule replace an earlier one's, they don't merge |
| `vitest.config.ts` | Only if the new script tests sit where the `unit` project doesn't collect them |
| `scripts/controls.mjs` | Its header's "Not a gate (CLAUDE.md, "Testing")" (line 43), which a required `controls` check makes false (step 12); anything else only if CI needs it (open decision 4) |
| `package.json` | Only a script the trigger or smoke step needs; no `prepare` hook (#7) |
| `CLAUDE.md` | The bold plan line (step 0); #12's audit rule (step 6); the Gitleaks hook under "Secrets" (step 7); "Testing" rewritten for CI as the gate, its "Schema controls … not a gate" included (step 12) |
| `README.md` | "Getting started": installing Gitleaks and setting `core.hooksPath` (step 7); "Preview deploys": the Ignored Build Step's new command (step 1, #15). The status parts wait for step 17 (Phase 7 #8) |
| `.claude/process-log.md` | Rows as they happen; the retrospective (step 16) |
| `.claude/context/project-context.md` | Step 17 only |

### Untouched, on purpose

- `src/`: no app code changes, unless a blocking finding forces one (#4).
- `supabase/migrations/`: no schema change.
- `.claude/drafts/phases-8-10-scope.md`: it stays the detail the IS #278 rows point to.

### Outside the repo (steps, not files)

- **GitHub settings:** the default workflow token read-only and unable to approve PRs;
  approval required for first-time contributors' runs; CodeQL default setup off (it
  conflicts with a workflow); private vulnerability reporting; branch protection on `dev`
  and `main`; Dependabot security updates on, last.
- **SonarQube Cloud:** the account (two-factor at creation), organization and project;
  automatic analysis off, since it can't run beside a CI analysis; `SONAR_TOKEN` as an
  Actions secret, never a Dependabot secret (Q3).
- **Vercel:** the Ignored Build Step also cancels `dependabot/*` (Q1) and `probe/*` (#15), from step 1.
- **The owner's machine:** Gitleaks installed for Git Bash; `core.hooksPath` set.
- **Dependabot:** the alerts its auto-triage dismissed, reviewed.

---

## Functions and scripts

No function in `src/`. The scripts, each tested in the `unit` project:

- **`changedPaths()`** lists the PR's changed files from the checkout. A default
  `actions/checkout` fetches depth 1, without the base, and a three-dot diff on a shallow
  clone finds no merge base, so it diffs the PR's merge commit against its first parent
  (`HEAD^1`, with `fetch-depth: 2`) or reads the PR's files through the API (open decision
  4). It **throws** when it can't tell: `HEAD^1` missing, or `git` (or the API) failing.
  An empty list from a diff that succeeded is a PR with no net change (a revert of a
  revert) and means nothing changed. This narrows the scope draft's "an empty list must
  not read as 'nothing changed'", written against a missing base, which the `HEAD^1` check
  rules out (the owner's call, round 2 on PR #283).
- **`needsFullControls(paths, baseRef)`**, pure: true when `baseRef` is `main` (Q30), or
  when a path matches the trigger list: `supabase/migrations/`, `tests/controls/`,
  `scripts/controls.mjs`, the tests the controls' headers name,
  `tests/integration/helpers.ts`, `tests/integration/setup.ts`, `supabase/seed.sql`,
  `supabase/config.toml`, `vitest.config.ts`, `src/lib/db/`, `src/lib/supabase.ts`,
  `package.json` and `package-lock.json`, `.github/workflows/ci.yml` and the trigger script
  itself, and every file those tests import (the scope draft's list, completed by the guard
  below). The two package files stand for the bare package imports the guard doesn't
  follow: a bump of `@supabase/supabase-js`, which the named tests import, or of the
  `supabase` CLI, which sets the local stack, changes what the controls exercise. Accepted
  cost: every dependency PR runs the full controls (~45 s a control) (the owner's call,
  round 2 on PR #283). `ci.yml` and the trigger script are there so a PR that changes how
  the full set is run also runs it; accepted cost: an edit to `ci.yml` runs the full
  controls, most Phase 8 PRs included, which aren't required before step 12 (the owner's
  call, round 3 on PR #283).
- **The trigger list's guard test (#8)** reads each control's `-- run:` line, a vitest
  filter, not a file (`scripts/controls.mjs`'s header), resolves it to files as vitest does
  (`npx vitest list --project integration <filter> --filesOnly`), follows those files'
  imports transitively, relative ones and `@/` ones resolved through `vitest.config.ts`'s
  `alias`, and fails when a file they reach isn't covered by the list. The named tests reach
  `src/` through `@/` (`db-trucks.test.ts` imports `@/lib/db/trucks`, `rls.test.ts` and
  `schema.test.ts` `@/lib/database.types`, read 2026-11-12), so a walk of relative imports
  alone stops at `./helpers`.
- **`smoke.mjs`** requests the app `next start` serves: `/map` → 200, `/api/live` → 200
  with an object whose `entries` is an array (`getLiveMap` returns `{ entries }`,
  `src/lib/services/live.ts`), `/admin/login` → 200, `/admin` → a redirect to `/admin/login`,
  `/api/admin/trucks` → 401 with `{ "error" }`. Any other answer fails the job. Phase 9
  adds its header assertions here.
- **`.githooks/pre-commit`** runs Gitleaks on the staged changes and exits non-zero on a
  find; it runs in the owner's Git Bash on Windows.
- **The lint rules' fixture test (#9)** lints one fixture per rule, a string in the test,
  with `ESLint#lintText` and a virtual `filePath` inside the rule's scope (under
  `src/lib/db/` for the filter rules), and expects that rule's message; a sink fixture with
  a `src/lib/db/` path shows that entry kept the sink selectors. A fixture file
  would have to sit in `src/lib/db/` to meet the db-scoped rules, where `npm run lint`
  lints it and fails; a string with a virtual `filePath` meets the rules and isn't on disk.
  Probed 2026-11-12: `lintText` with `filePath: "src/lib/db/probe.ts"` ran the project's
  rules (`@typescript-eslint/no-unused-vars` fired).

---

## Steps

Strict order where stated. Each step is one issue and one PR into `dev`, with these
exceptions: step 1 is settings, recorded on its issue, with a PR only for README's
"Preview deploys"; step 11 is one issue per blocking finding and may be none; probe PRs
(step 7's `secret-scan` probe, #13, and step 13's) are closed unmerged, and their step's
issue records them. Every probe branch is named `probe/…`, which Vercel cancels from step 1
(#15). **Steps 3–10 depend only on steps 1 and 2** and may run in any order or in parallel
(#10); the order below is cheapest first. **Until step 12, every Phase 8 PR still
runs the four gates by hand** (`CLAUDE.md`, "Testing"), whatever CI shows.

Each step that adds a check runs it reporting, not required, and opens an issue for each
of its findings (#4): a finding that would keep the check red on `dev` is **blocking** and
goes to step 11; any other is placed by #1's line in Phase 8, 9, 10 or outside. A secret
found in history is rotated at once, then recorded in its issue (`CLAUDE.md`, "Secrets").

0. **This plan.** The plan file, and `CLAUDE.md`'s bold "Current phase plan" line naming
   it, where between phases it read `none (the last one: .claude/plans/phase-7-admin.md)`.
   Only that line of the header changes.
1. **Repository and Vercel settings.** The default workflow token read-only, and unable
   to approve PRs; approval for first-time contributors' runs; CodeQL default setup off.
   *First because* every workflow written after it starts under them, so none ever runs
   with a write token by default (Q5). And Vercel's Ignored Build Step also cancels
   `dependabot/*` (Q1) and `probe/*` (#15), inline in Vercel's settings, never a script in
   the repo (a branch could rewrite its own copy); before it's saved, the command is run
   locally on its four cases (Production on `main` continues, Production off `main`
   cancels, a `dependabot/` or `probe/` preview cancels, any other preview continues), and
   after, a pushed `probe/ignore-check` and `dependabot/ignore-check` branch each show
   Vercel's "Canceled"; README's "Preview deploys" updated. *First because* step 7's probe
   is the first branch to carry a deliberate break, and a branch that builds on Vercel
   gets the Preview variables, the secret key among them (`README.md`, "Preview
   deploys").
2. **`ci.yml` with the four gates:** `typecheck-lint`, `unit`, `integration` (a local
   Supabase in the job), `build` with `scripts/smoke.mjs`. Every action pinned by commit
   SHA, minimal `permissions:`, no `pull_request_target` (Q5); a Node `devEngines` admits;
   `.env.example`'s variables from the local stack, which aren't secrets. A job that starts
   the stack writes them to `.env.local` from `npx supabase status -o env`, mapped as
   README's "3. Environment" table does (`API_URL` → `NEXT_PUBLIC_SUPABASE_URL`, …):
   `tests/integration/setup.ts` reads that file only and throws without it (its
   `loadEnvLocal`), whatever the job's `env:` holds. *Every later step's PR runs through
   it*, and the gates catch a broken workflow edit first.
3. **`controls` and `process-log` jobs:** `changedPaths`, `needsFullControls` and their
   tests, the guard test (#8); `bash scripts/process-log.sh check` (Q7, Q8). The full set
   needs a running stack and its `.env.local` (`scripts/controls.mjs` stops when the
   database container isn't running), so when `needsFullControls` is true the job starts
   one, or the full set runs inside `integration` (open decision 3).
4. **Lint rules** in `eslint.config.mjs`, with the fixture test (#9) (Q26).
5. **The security advisor** in the `integration` job: `npx supabase db advisors --local
   --type security --fail-on warn` (Q25), shown red on its own by a probe table with RLS
   off.
6. **The `audit` job's three runs** (Q35, #12), from the checkout's lockfile with no
   install (`npm audit` needs no `node_modules`: with only `package.json` and
   `package-lock.json` in a folder, both runs gave today's results, 2026-11-12), so the job
   runs no install script; each reports after an earlier one fails, the third failing only
   when its report has no count; and #12's rule in `CLAUDE.md`, whose wording goes to the
   owner (Phase 7 #6).
7. **Gitleaks:** `.githooks/pre-commit` (committed executable), `.gitleaks.toml`, the
   `secret-scan` job, the one-off full-history scan, README's setup lines and `CLAUDE.md`'s "Secrets" line (Q4).
   The CI half is shown red on a throwaway probe PR, closed unmerged, with a fake secret
   committed without a local hook (#13); never on step 7's own PR.
8. **`codeql.yml`** (Q3), whose code-scanning result check is the one step 12 requires (#14).
9. **SonarQube Cloud:** the account (two-factor at creation), project and token,
   `sonar-project.properties`, `sonarqube.yml` with the `if:` skip, `--ignore-scripts` and
   `sonar.qualitygate.wait=true` (Q3, Q5, #14), and the custom quality gate open decision 5
   settles. Confirm the free tier for public repositories first.
10. **`SECURITY.md`** and private vulnerability reporting (Q32).
11. **Blocking findings settled.** Each blocking finding from steps 3–9 fixed, or
    dismissed or allowlisted with a reason, in its own issue. *Before step 12 because* a
    required check that's red on `dev` blocks every PR, its own fix's included (#4).
12. **Branch protection** by rulesets (open decision 7) on `dev` and `main`: PR required,
    no force-push, no deletion; on `main`, admins bound, an empty bypass list (Q2, Q30,
    #11). On `dev`, every check from steps 2–9 required by name; on `main`, `ci.yml`'s
    checks, with SAST added in Phase 10 once `main` has a base analysis (#11). For SAST the
    required check is what fails on a finding (#14): CodeQL's code-scanning result check,
    not its analyze job, and SonarQube Cloud's workflow job run with
    `sonar.qualitygate.wait=true`, not SonarQube Cloud's own app check. *Before it*, a
    fresh no-op PR into `dev` shows every check green under the exact name to be required
    (`gh pr checks`): `ci.yml` is PR-only, so `dev`'s head shows only the push runs. *After
    it*, `gh pr checks --required` on that PR lists the same names, and `gh api
    repos/{owner}/{repo}/rulesets` reads the rules back (the CLI token can read rulesets but
    not classic protection: `branches/*/protection` → `403`, probed 2026-11-12). Whether
    rulesets' "require workflows" rule is open to this personal account is read here (#2's
    limit).
    With it, `CLAUDE.md`'s "Testing" drops "There is no CI" and the manual gate list for
    Q10's split: CI is the gate; locally `tsc`, `test:run` and lint are the fast loop; the
    `/map` browser check stays manual. Its "Schema controls: `node scripts/controls.mjs`,
    not a gate" and `scripts/controls.mjs`'s header "Not a gate" change with it: the
    `controls` check is required. *Only now*, because every check exists and is green.
13. **The proof (the phase's checkpoint, #6).** On `dev`, one probe PR with one break per
    required check, split only where a break would cascade, its `secret-scan` break made as
    #13 says; on `main`, one probe PR from a branch off `dev` (a branch off `main` has no
    `ci.yml`), carrying a deliberate break (a type error, so `typecheck-lint` is red), which
    proves the block and the admin rule, not SAST on `main` (#11). **No merge is attempted
    on either probe** (#6): a wrong rule would merge `dev` into `main`, which builds
    Production. Each is closed unmerged and its branch deleted. A check that stays green,
    or a probe that shows a merge or bypass option, stops step 14 until it is understood.
14. **The review of the alerts Dependabot's auto-triage dismissed**, each reopened or kept
    with a reason. *Before step 15*, so the security updates start from a reviewed list.
15. **Dependabot on** (Q9, last): `.github/dependabot.yml` for `github-actions`, with the
    default `/` branch-name separator, so its branches match step 1's `dependabot/*`; npm
    security updates on. *Before switching on*, the Node its npm updater runs is read from
    dependabot-core's npm updater image definition and checked against `devEngines` (open
    decision 9); *after*, the Dependabot tab shows the npm job with no error. The proof: one
    Dependabot PR, from an Actions version update or, if none has come, one triggered with
    "Check for updates" (#5). An npm security PR can't be forced, so the proof may be an
    Actions one, which runs no npm: a stated limit.
16. **The Phase 8 retrospective** (`.claude/process-log.md`, "How to use it"): its range
    starts at the row after the Phase 7 retrospective's range. Blocked by every other
    planned issue; its follow-ups block step 17.
17. **The reconciliation of `project-context.md`**, blocked by step 16 and its follow-ups.
    It rewrites Part 1's "Tests and gates" (its "not a gate" for the controls included),
    "Modules kept on purpose" (the controls' row, "not a gate"), "Folder structure"
    (`.github/`, `.githooks/`) and the Roadmap row; Part 2's "Pre-deploy automation (planned)", whose "To build" and
    "Nothing below exists yet" become a description of what was built, with what stays for
    Phases 9 and 10; the "Phase map" (the Phase 8 row); any `CLAUDE.md` text still saying
    the gates are manual that step 12 didn't reach; and the README's status parts (their
    "What does not exist yet" says previews have "one exception so far", which step 1's
    `dependabot/` and `probe/` cancels made stale, IS #284); Part 2's items that rely on the
    Ignored Build Step (Dependabot's branches, and Phase 10's "check it is still set") gain
    the `vercel.json` `ignoreCommand` override (`README.md`, "Preview deploys", PR #311). It
    replaces the three **between phases** markers this plan took up with #1–#3, leaves the
    IS #278 (Phase 9) and (Phase 10) rows' markers as they are, carries forward this plan's
    decisions that outlive the phase (#4, #7, #8, #9, #11, #12, #13, #14, #15 at least),
    hands Phase 10 #11's limit (how its first PR into `main` treats findings with no base
    analysis of `main`, and adding the SAST checks to `main`'s ruleset once one exists),
    and sets `CLAUDE.md`'s bold line to none, naming this plan as the last one.

---

## Rationale

### #1 — Three phases: CI/CD, then Security, then Launch (IS #278 (D1))

Takes up the IS #278 (D1) **between phases** row. After Phase 7 come **8 · CI/CD → 9 ·
Security → 10 · Launch**, CI/CD first so the security work runs through the gates, SAST and
the secret scan. The line between them: 8 touches the pipeline, 9 the running app and its
accounts (the first 2FA audit included), 10 production. Outside the three: #264 after Phase
8; #246, #259, #248 and #256 standalone. Phase 6 #1 holds: CI/CD is built before the
production deploy. The owner's calls (the scope draft's D1, Q16, Q17).

### #2 — Phase 8's scope as the scope draft settles it (IS #278 (Phase 8))

Takes up the IS #278 (Phase 8) **between phases** row; the detail is the scope draft's
"Phase 8 · CI/CD", which this plan's steps follow. GitHub Actions runs the checks, Vercel
keeps deploying (Q27). Workflows are grouped by trigger and permissions (Q28): `ci.yml` on a
read-only token, `codeql.yml` and `sonarqube.yml` apart, those two also on push so a PR has
a base analysis to compare with. One set for PRs into both branches (Q29); `main` adds the
full controls (Q30). No required check gets a workflow-level `paths:` filter: a check that
never runs never reports, and the PR waits on it (GitHub's docs, as the scope draft cites
them; not probed, no CI exists yet). All the hardening (Q5). Gitleaks pre-commit
and in CI (Q4). SonarQube Cloud and CodeQL (Q3), SonarQube skipped by `if:` on Dependabot
and fork PRs, with no token copy, so CodeQL is what scans those PRs. `npm audit`'s
thresholds (Q35, with #12). The advisor (Q25), the lint rules (Q26), the controls' trigger
(Q7), the log check (Q8). Dependabot last, its branches off Vercel builds (Q1, Q9). Branch
protection on both branches (Q2), `main`'s required checks the production deploy's only gate
(Q6). `SECURITY.md` (Q32). CI as the gate once it exists (Q10). The owner's calls,
2026-11-12.

**A limit:** a `pull_request` run uses the PR's own workflow files, so a PR that edits
`.github/workflows/` can turn a required check into one that passes whatever the code does,
under the same name. With no required approvals, the guard is the owner reading every
`.github/` diff, Dependabot's Actions SHA bumps included; whether rulesets' "require
workflows" rule is open to this personal account is read in step 12, and using it is the
owner's call then (the narrow read-through on PR #283).

### #3 — The between-phases procedure (IS #279)

Takes up the IS #279 **between phases** row. A row's marker may name the later phase whose
plan takes it ("for Phase <N>"); earlier plans don't take it, and their reconciliations don't
replace its marker, though a stale fact in it is fixed like any other hit. A between-phases
row that a later one replaces is removed in the PR that adds the new row. Several rows from
one issue carry a label each. This plan applies it: it takes the three rows whose marker
names no later phase and leaves the Phase 9 and Phase 10 rows. The rule's one copy is `CLAUDE.md`'s
"Process Log"; it outlives the phase.

### #4 — A check's issue adds the check; its findings get their own issues

The issue that adds a check is done when the check runs and reports correctly, not when its
findings are fixed: fixing every finding in it would make "add SAST" unbounded, and a fix
riding in a CI PR gets a CI PR's review. Each finding gets an issue, placed by #1's line in
Phase 8, 9, 10 or outside. **A blocking finding** (one that would keep its check red on
`dev`) is settled in Phase 8, fixed or dismissed or allowlisted with a reason, before the
check becomes required (step 11), because a red required check blocks every PR. Which checks
that can happen to: `npm audit`, the advisor and the lint rules read the whole tree; CodeQL
and SonarQube Cloud are documented to judge a PR on new alerts and new code, so their old
findings needn't block (steps 8 and 9 check it on their first runs); Gitleaks in CI scans
the PR's commits, and the full-history scan is a one-off. A secret found in history is rotated at once (`CLAUDE.md`, "Secrets"). The owner's call,
2026-11-12.

### #5 — Done needs proof that each check can fail

The phase is done once each required check has been seen to fail on a probe PR that branch
protection then blocked, and a Dependabot PR has run the checks with no Vercel build. A check
that can't go red is no gate: before #99, `test:all` exited 0 with 917 tests uncollected
(`CLAUDE.md`, "Testing"). The owner's call, 2026-11-12.

### #6 — Probe PRs: one per branch, one break per required check

On `dev`, one probe PR with one deliberate break per required check, split only where a
break would cascade (a type error that also breaks the build). Most checks are independent
jobs; CodeQL's result check isn't, and is broken by a change that adds an alert, not by
breaking its analyze job (#14). On `main`, one probe PR, to show the block holds for an admin,
from a branch off `dev`, the shape of a real PR into `main` (a branch off `main` holds no
`ci.yml`, so nothing would run), at the cost of the full controls run (~45 s a control, 64
took 48 minutes, 2026-10-23). Phase 8 has no UI, so step 13 is the phase's checkpoint and
there is no other. The owner's call, 2026-11-12.

**No merge is attempted on a probe.** The admin rule is shown by the ruleset read back with
`gh api` (an empty bypass list on `main`), `gh pr view --json mergeStateStatus` reading
`BLOCKED`, and the owner's look at the `main` probe in the UI, signed in as admin: no bypass
or "merge without waiting" option offered. An attempted `gh pr merge --admin` was the first
plan: if a rule were wrong it would merge `dev` into `main`, which builds Production, and a
refusal wouldn't show the rule, since the CLI token lacks administration rights and may be
refused for that alone (the owner's call, the narrow read-through on PR #283).

### #7 — `core.hooksPath` is set by hand

A README line, not a `prepare` script: `prepare` runs on `npm ci` and on a local `npm
install` without package arguments (npm 11.21.0's `docs/content/using-npm/scripts.md`), so
CI's install would run it too, and CI runs the scan itself. A clone that never
sets it is what the CI scan covers (Q4). The owner's call, 2026-11-12.

### #8 — The controls' trigger list is guarded by a test

The scope draft's list "isn't complete: the plan completes it from what each control's named
tests import". A list kept by hand drifts silently, and a drifted list means controls not
running on a PR that changes what they test. So a test resolves each control's `-- run:`
filter to files as vitest does, follows their imports and fails on a file the list doesn't
cover; bare package imports stand in the list as `package.json` and `package-lock.json`
("Functions and scripts"). The owner's call, 2026-11-12, and round 2 on PR #283.

### #9 — Each lint rule has a fixture test

A mistyped `no-restricted-syntax` selector matches nothing and lints clean, so a rule that
never fires passes every gate: `echo 'foo();' | npx eslint --no-config-lookup --stdin
--rule '{"no-restricted-syntax":["error","CallExpresion"]}'` exited 0, and with
`CallExpression` 1 (2026-11-12). A fixture per rule, linted through ESLint's API, shows each
fires and keeps showing it after edits; the probe PR shows it only on the day it ran. The
owner's call, 2026-11-12.

### #10 — Steps 3–10 in any order after step 2

They depend only on the repository settings and the four gates' job (its local Supabase, its
Node). The strict parts are 11 → 12 → 13 (a check is required only once green, and proved
only once required) and 14 → 15 (the dismissed alerts are reviewed before security updates
start). Step 1 keeps probe and Dependabot branches off Vercel before either exists (#15).
Until step 12, Phase 8's own PRs run the four gates by hand.

### #11 — `main` binds admins, and a broken CI waits for a hand-lifted rule

On `main` the rules apply to admins too (Q30), so if CI itself breaks, merging to `main`
waits until that rule is lifted by hand. Accepted: `main`'s next push is Phase 10's (README,
"Preview deploys"), and its required checks are the production deploy's only gate (Q6).

**A limit that follows:** with no push to `main` before Phase 10, the push triggers give
CodeQL and SonarQube Cloud no analysis of `main` to compare a PR into it with (`origin/main`
is PR #195's merge, read 2026-11-12), so on a PR into `main` they may count old findings as
new. Step 13's `main` probe therefore proves the block and the admin rule, not SAST on `main`.
A base analysis without a push is possible: a run elsewhere that checks out `main` and
uploads for it, through codeql-action's `ref` and `sha` inputs and SonarQube Cloud's
`sonar.branch.name` (documented, not probed). Whether Phase 10 does that before its first PR
into `main` is the Phase 10 plan's, which step 17 hands it (the owner's call, round 2 on PR
#283). So `main`'s ruleset requires `ci.yml`'s checks in Phase 8, and the SAST checks join
it in Phase 10, once a base analysis exists: required before then, they could turn Phase
10's first PR into `main` red on old findings and force lifting `main`'s rule at the
production deploy. No PR goes into `main` before Phase 10, so Phase 8 loses nothing by it
(the owner's call, the narrow read-through on PR #283).

### #12 — `npm audit`: block the dangerous, show the rest, record each sighting

Three runs. `npm audit --omit=dev --audit-level=high` fails on high and critical in
production dependencies; a full `npm audit --audit-level=critical` fails on critical anywhere
(Q35). A third, `npm audit --omit=dev` at any level, is made never to fail: `npm audit`
exits 1 whenever it lists anything at or above its level (a plain `npm audit` exited 1 on
2026-11-12), so the step ignores its own exit code and, when the JSON report counts any
vulnerability, emits a `::warning::` annotation, which shows in the PR's checks summary, not
only a log. When the report has no count (an audit error, such as the registry unreachable),
it fails, as runs 1 and 2 do on an error, so "couldn't tell" never passes (2026-11-12:
`npm audit --omit=dev --audit-level=high --registry=http://127.0.0.1:9/` exited 1, and with
`--json` printed a `message` and an `error`, with no vulnerability count). The job installs
nothing: `npm audit` reads the lockfile (step 6's probe). Runs 2 and 3 run when the checkout
succeeded, even after an earlier run failed (`!cancelled()` and the checkout step's outcome;
not `always()`, which also runs after a cancel). This
covers Phase 6 #24's revisit trigger (`minimatch` under `--omit=dev`), which Q35's two runs
leave in a passing job's log. **A PR whose audit run shows the warning gets an issue for that
advisory before it merges**, recording the call: fix, wait for upstream, or accept with a
reason. Rejected: failing that run, since `npm audit` has no allowlist (npm 11.21.0's
`docs/content/commands/npm-audit.md` lists no option to ignore an advisory) and one low
advisory with no fix would block every PR; relying on Dependabot alerts alone, since whether a
dismissed alert reopens when its scope changes isn't probed. From step 15, Dependabot security
updates open PRs for advisories that have a fix. Run on 2026-11-12: `--omit=dev` found 0
vulnerabilities; the full run, 7 moderate (`minimatch`, dev tooling), exit 0 at critical. The
owner's call, 2026-11-12.

### #13 — `secret-scan` is shown red with a fake secret committed without a local hook

Seeing the CI scan red takes a commit holding a flagged value past the pre-commit hook and
GitHub's push protection, the two layers before it. The value is made up: one Gitleaks'
rules flag (its generic API-key rule, a keyword and a random-looking string), never a real
provider's format (`ghp_`, `AKIA`, `sk_live_`), which push protection would block and which
would look like a leak; `gitleaks` is run on it locally first, so a green CI run means the CI
scan missed it. The commit is made with no local hook (GitHub's web editor, or `gh api`
writing the file to the probe branch), which is the case the CI scan exists for, a clone that
never set `core.hooksPath`, with no `--no-verify`. If push protection blocks it, the value
changes; the block is never bypassed (`CLAUDE.md`, "Secrets"). It's done on a throwaway probe
PR, closed unmerged and its branch deleted, never on a PR that merges: once in step 7, when the
check is added, and again in step 13, the only place that shows it stops a merge. Each closed
PR keeps the
commit (`refs/pull/<n>/head`), readable in a public repo; it is no secret, so nothing is
rotated, and a normal clone doesn't fetch `refs/pull/*`, so later scans don't meet it. The
owner's call (round 1 on PR #283).

### #14 — The required SAST check is the one that fails on a finding

CodeQL's analyze job finishes green when it finds something: its verdict on a PR is a
separate code-scanning result check. SonarQube Cloud's scan job fails on a failed quality
gate only with `sonar.qualitygate.wait=true`. So step 12 requires CodeQL's result check and
SonarQube Cloud's workflow job run with `sonar.qualitygate.wait=true`; requiring the jobs as
they are would gate nothing on a finding. Not SonarQube Cloud's own app check: a run skipped
by `if:` (#2) never posts it, so it would block every Dependabot and fork PR. Documented
behaviour, not probed (no CI exists yet); steps 8, 9 and 13 show it. Round 1 on PR #283.

### #15 — Vercel cancels probe and Dependabot branches from step 1

A branch pushed to this repo builds on Vercel with the Preview variables, the secret key
among them (`README.md`, "Preview deploys": Git Fork Protection covers forks only). The probe
branches carry deliberate breaks, a vulnerable dependency whose install scripts Vercel's
install would run among them, so they must never build there, any more than Dependabot's.
Step 1 extends the Ignored Build Step to cancel `dependabot/*` and `probe/*`, before step 7's
probe, the first such branch; every probe branch is named `probe/…`. The command stays
inline in Vercel's settings: a script in the repo would run from each branch's own copy,
which that branch could rewrite. A branch can still replace it with a `vercel.json`
`ignoreCommand`, which Vercel's docs say overrides the project setting (not probed; found by
round 1 on PR #311), so a diff adding `vercel.json` is read before it's pushed (`README.md`,
"Preview deploys"). It is checked before any probe exists, locally on its four
cases and then by a pushed `probe/` and `dependabot/` branch each showing "Canceled", read in
the commit's statuses (step 1 found it there, PR #311), since
only exit 0 cancels and exit 1 continues (`README.md`, "Preview deploys", citing Vercel's docs), so a
command that errors with exit 1 lets the build run (other exit codes not read). Moved from step 14, which put it after step 7's and step 13's probes (the
owner's call, the narrow read-through on PR #283).

---

## Acceptance Criteria

**Repository (step 1)**
- [ ] The default workflow token is read-only and can't approve PRs
  (`gh api repos/{owner}/{repo}/actions/permissions/workflow`, or the UI if the token gets
  `403`), recorded on the issue; first-time contributors' runs need approval; CodeQL default
  setup is off.
- [ ] Vercel's Ignored Build Step, inline in its settings, also cancels `dependabot/*` and
  `probe/*`: run locally on its four cases with the expected exits, and a pushed
  `probe/ignore-check` and `dependabot/ignore-check` branch, each at a new commit, show "Canceled" in Vercel (the commit's statuses, `README.md` "Preview deploys")
  before any probe branch exists; README's "Preview deploys" says so.

**The four gates (step 2)**
- [ ] `ci.yml` runs on PRs into `dev` and `main` with exactly the job names "Files" lists.
- [ ] Every `uses:` in `.github/` is pinned to a 40-character SHA (a grep finds no tag-only
  `uses:`); top-level `permissions:` is read-only; no `pull_request_target` anywhere (grep).
- [ ] The job log shows a Node `devEngines` admits; `test:all`'s per-project file and test
  counts match a local run.
- [ ] `build` uses only local-stack values, with no secret in the workflow; `smoke.mjs`
  passes, and goes red when one expected status is changed (a mutation, shown in the PR).

**Controls and the log (step 3)**
- [ ] `controls --check` runs on every PR; the full set runs when a trigger path changes and
  on every PR into `main`.
- [ ] `changedPaths` throws when `HEAD^1` is missing or `git` fails, and returns `[]` for a
  successful empty diff (unit tests); the guard test fails when a named test gains an
  import outside the list, `@/` ones included (a mutation, shown in the PR).
- [ ] `process-log` runs `bash scripts/process-log.sh check` and goes red on a broken row.

**Lint, advisor, audit (steps 4–6)**
- [ ] Each new rule fires on its fixture (unit test), a sink rule under a `src/lib/db/` path
  too; today's code lints clean; deleting a rule's selector turns its fixture test red.
- [ ] The advisor runs with `--fail-on warn` in `integration`; today's two INFO results pass;
  a probe table with RLS off turns the advisor's step red by itself (a mutation, shown in the
  PR).
- [ ] `audit` runs no install; its first two runs fail at their levels; the third only
  warns, with the job green, fails when its report has no count, and still runs when an
  earlier run has failed; `CLAUDE.md` holds #12's rule in wording the owner approved.

**Secret scan (step 7)**
- [ ] `git ls-files -s .githooks/pre-commit` shows mode `100755`.
- [ ] In the owner's Git Bash, the hook refuses a commit holding a fake key; `secret-scan`
  goes red on a throwaway probe PR, closed unmerged, whose fake key was committed with no
  local hook, as #13 says, and push protection wasn't bypassed.
- [ ] The full-history scan's result is recorded (its count, and how each find was settled);
  each allowlist entry names why it isn't a secret; README has the setup lines.

**SAST and reporting (steps 8–10)**
- [ ] CodeQL (`javascript-typescript`, `actions`) has an analysis of `dev`, and runs on PRs and
  pushes; its code-scanning result check goes red on a probe that adds an alert (#14).
- [ ] SonarQube Cloud: two-factor on at account creation (the owner's confirmation);
  automatic analysis off; an analysis of `dev` exists; `SONAR_TOKEN` is an Actions secret
  only; the job installs with `--ignore-scripts` and runs with `sonar.qualitygate.wait=true`,
  and goes red on a probe that fails the quality gate (#14); the gate is open decision 5's,
  and a PR adding only a code smell, with no coverage report, passes it.
- [ ] `SECURITY.md` points to private reporting, and private reporting is on (UI).

**Settled and required (steps 11–12)**
- [ ] A fresh no-op PR into `dev` shows every check green under its exact name; each
  blocking finding's issue is closed, fixed or dismissed with a reason; each non-blocking
  finding has an issue in its phase.
- [ ] Rulesets on both branches: PR required, no force-push, no deletion; on `dev` every
  check from steps 2–9 required (for SAST, the checks #14 names), on `main` `ci.yml`'s;
  `main`'s bypass list empty; read back with `gh api repos/{owner}/{repo}/rulesets` and
  recorded; `gh pr checks --required` on the no-op PR lists the same names; whether
  "require workflows" is open to this account is recorded.
- [ ] `CLAUDE.md`'s "Testing" no longer says "There is no CI", and states Q10's split;
  neither it nor `scripts/controls.mjs`'s header calls the controls "not a gate".

**The proof (steps 13–15)**
- [ ] On the `dev` probe, every required check is red and `gh pr view --json
  mergeStateStatus` reads `BLOCKED`; on the `main` probe, from a `probe/` branch off `dev`
  with a deliberate break, `mergeStateStatus` reads `BLOCKED` and the owner, signed in as
  admin, sees no bypass or "merge without waiting" option (#6); no merge is attempted on
  either; both are closed unmerged, their branches deleted, and `origin/main` is unchanged.
- [ ] Each alert auto-triage dismissed is reviewed, reopened or kept with a reason.
- [ ] Before Dependabot is on, the Node of its npm updater, read from dependabot-core's npm
  updater image definition, is one `devEngines` admits; after, `dependabot.yml` covers
  `github-actions` with the default separator, npm security updates are on, and the
  Dependabot tab shows the npm job with no error.
- [ ] On one Dependabot PR, on a branch starting `dependabot/`: the checks ran, SonarQube's
  job was skipped and didn't block the merge, CodeQL ran, and Vercel shows the build
  cancelled by the Ignored Build Step (the commit's statuses, `README.md` "Preview deploys").

**Always**
- [ ] Each PR before step 12 ran the four gates by hand, exit codes read unpiped.
- [ ] The closing steps of the milestone-retrospective procedure are done.

---

## Open Decisions

1. **Gitleaks in CI (step 7).** `gitleaks/gitleaks-action`, SHA-pinned (whether it needs a
   license key for this repository is read then), or the release binary downloaded with its
   checksum checked. Also the hook's and the CI scan's exact flags, #13's fake value, and
   how the owner installs it on Windows (winget, scoop or the binary).
2. **Node in CI (step 2).** Whether `actions/setup-node` reads the version from
   `package.json`, or the workflow names `26.x`; the job log shows which.
3. **The local Supabase in CI (step 2).** Which services `supabase start` can leave out while
   Auth stays up for the admin tests; whether `build` starts its own stack for `smoke.mjs`
   (`/api/live` reads the database) or the smoke step runs in `integration`; whether the
   `controls` job starts its own stack for the full set or that set runs in `integration`
   (step 3); how each such job writes `.env.local` (step 2); npm and Docker image caching,
   job timeouts, `concurrency`.
4. **How `changedPaths` lists the files (step 3).** The merge commit against its first
   parent (`fetch-depth: 2`), or the PR's files through the API; and whether it is a script
   of its own or a mode of `controls.mjs`.
5. **SonarQube Cloud (step 9).** Its free tier for public repositories, confirmed; the
   exclusions; the custom gate's exact condition names. **The gate is settled** (the owner's
   calls, rounds 2 and 3 on PR #283): a custom gate on new code with no new vulnerabilities
   and no new bugs (security and reliability rating A) and every new security hotspot
   reviewed. Not "Sonar way": its coverage condition fails a PR with no coverage report, and
   its other new-code conditions (no new issues, duplication) fail one on a single code
   smell, which would make every non-blocking finding blocking (#4) ("Sonar way" as Sonar
   documents it, not read on this account; step 9 reads it). Code smells and
   duplication are reported, not blocking; uploading coverage would be an issue of its own.
   If the free tier doesn't hold, CodeQL alone is the fallback, and that's the owner's call
   then.
6. **The required-check names for CodeQL and SonarQube Cloud (step 12)**: the exact names
   the checks #14 picks report under, which branch protection lists exactly.
7. **Classic branch protection or rulesets (step 12).** **Settled: rulesets** (the owner's
   call, the narrow read-through on PR #283). Either binds admins on `main`, but the CLI
   token can read rulesets and not classic protection (`gh api …/rulesets` answered;
   `branches/dev/protection` and `branches/main/protection` → `403`, probed 2026-11-12), so
   only rulesets can be read back by command.
8. **How the `dev` probe splits (step 13)** where breaks would cascade.
9. **If Dependabot's updater runs a Node below `devEngines` (step 15).** Read before it is
   switched on, from dependabot-core's npm updater image definition; if it does, its npm PRs
   would stop with `EBADDEVENGINES`, and the options are written up for the owner then.
10. **The wording of #12's rule in `CLAUDE.md` (step 6)**, the owner's to approve.
