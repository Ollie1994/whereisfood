# Phase 10 — Launch (soft)

**Planned:** 2026-11-20 · **Status:** planned

**Source:** `project-context.md` Part 2 ("Phase map", "Pre-deploy automation", "Pricing and
upgrade triggers", "Principles and risks", "Open decisions"), Part 3's "Decisions carried
forward" (the three rows marked **between phases** for Phase 10: IS #278 (Phase 10), IS #373
(Phase 10) and IS #394, taken up by #1, #2 and #3), the scope draft
`.claude/drafts/phases-8-10-scope.md` ("Phase 10 · Launch", which the IS #278 (Phase 10) row
points to), the Phase 9 plan's open decisions 1, 4 and 7, which hand work to this phase, and
the `/create-milestone` conversation of 2026-11-20. The IS #373 (Phase 11) row is Phase 11's
plan's (`CLAUDE.md`, "Process Log"). Where this plan and `project-context.md` disagree, **this
plan wins** until the reconciliation (step 20).

**Purpose of the phase:** the first production deploy, a soft launch. Real data goes into production
on the free plans, but only the admin sees the map: everyone else lands on a Swedish `/om` (`/about`
until IS #478, #12), until the trucks are back and Phase 11's coverage target holds. Before real
data exists, the legal and operational pieces it needs exist too: a privacy note with a removal
contact and retention periods, a takedown, backups, and a runbook.

---

## Goal

Production runs on the free plans with real data the admin entered by hand, `/karta` shown only to
the admin and `/` leading to a Swedish `/om` (`/map` and `/about` until IS #478, #12), with the
privacy note, removal contact, retention, takedown, weekly backup and runbook in place and every
"Before the production deploy" check done before the first deploy.

Done is the deploy and its checks (step 17). Telling the trucks they're listed runs alongside
and gates nothing (#4).

---

## Prerequisites

- Node and npm in the ranges `package.json`'s `devEngines` admits (`CLAUDE.md`,
  "Dependencies"); Docker running, for local Supabase and the integration tests.
- The owner's phone with the authenticator app and its backups (Phase 9, D3).
- Access to the Supabase, Vercel, Cloudflare and GitHub dashboards, for the settings the CLI
  token can't read or set (recorded on each step's issue, never a secret).
- A free Supabase project slot: two active free projects are allowed, counted across every
  organization where the owner is Owner or Administrator; the preview's is one, production's
  is the second (Pricing, "Supabase Free").

---

## Out of Scope

| Item | Where it goes |
|---|---|
| Removing the gate and restoring the smoke check; the coverage target (N trucks before 11:00, held two weeks) | Phase 11 (IS #373 (Phase 11)); the removal follows #5's list |
| Supabase Pro: backups, session timeouts, a restore test on Pro, leaked-password protection | Phase 11 |
| The custom domain: R2's domain, its CSP entry, HSTS, Vercel's domain, and the domain in Auth's Site and Redirect URLs | Phase 11 (buying the domain early is optional here, #7); production's `vercel.app` URLs are set in step 13 |
| Vercel Pro and Spend Management; the acquisition plan | Phase 11 |
| Custom SMTP (the email-budget lockout's real fix); #241's emailed code | Owners phase (#241: custom SMTP or Pro, whichever comes first) |
| Truck-owner accounts, the claim flow and their threat model | Owners phase |
| #435, #442, #256, #264, #308, #406, #416, #417 | standalone, outside any phase |
| A log drain, paid monitoring, a secrets manager | not planned |
| A scheduled retention job (pg_cron) | not planned (#10); revisit if a week is missed |

---

## Files

**The public pages and the gate:**
- Since IS #478 (#12), `/about` is `/om` and `/map` is `/karta`: `src/app/om/` and `src/app/karta/`,
  the latter moved with its tests. The lines below name the paths as they were built.
- `src/app/map/page.tsx` (+ test): the gate (#5, #6). `requireAdmin`; anything but `check.ok`
  gets `redirect(ABOUT_PATH)`. Its header holds the gate's removal list, the one copy.
- `src/app/page.tsx`: `/` redirects to `/about` (a gate site; Phase 11 points it back at
  `/map`).
- New: `src/app/about/page.tsx`, the Swedish `/about`; `src/app/integritet/page.tsx`, the
  Swedish privacy note (#8).
- `src/lib/` (the module beside `MFA_PATH` in `login.ts`, or a small `paths.ts`): `ABOUT_PATH`,
  `PRIVACY_PATH`.
- `src/components/Admin/AdminNav.tsx`: a "Karta" link to `/map`.
- New: the marker test (a unit test, beside `map/page.tsx`), #5.
- `tests/integration/`: the gate against the local stack.
- `scripts/smoke.mjs` (+ `smoke.test.mjs`): `/` and `/map` expect the redirect to `/about`;
  `/about` and `/integritet` expect 200 with the static CSP. `smoke.test.mjs` uses `/map` as
  its static-CSP page in its header tests; step 3 moves them to `/about`, which stays, so only
  its `/` and `/map` cases are gate sites. Steps 3 and 9 add its cases for `/about` and
  `/integritet`, which its "covers exactly the paths" test requires.
- `src/proxy.ts` (+ test): the `/map` branch **only if** step 1a or 4b rules out Plan A (#6);
  step 5's title edit (below) either way.
- `src/lib/supabase-session.ts`: `readOnlyCookies`' comment, a gate site (#5).
- `src/app/not-found.tsx`: the "Till kartan" link pointed at `/about`, a gate site (#5).

**The app name** (open decision 1): `src/app/layout.tsx`, `src/app/admin/layout.tsx`,
`src/app/admin/error.tsx`, `src/app/admin/not-found.tsx`, `src/app/error.tsx`,
`src/app/map/error.tsx`, `src/app/not-found.tsx`; `src/lib/mfa.ts` (the enroll's `issuer` and
`friendlyName`, the label the authenticator app shows); `src/lib/login.ts` (that label named in
the wrong-code text and in `codeIntro`); `src/proxy.ts` (`unavailablePage`'s `<title>` alone, in
the security-critical file); `src/app/about/page.tsx` (step 3) and `src/app/integritet/page.tsx`
(step 9), whichever exist by then, the other taking the name when it is written; and the tests
that pin their texts. A factor enrolled before the rename keeps the old label, so step 5
precedes production's enroll (step 16).

**Operations (manual SQL, not app code):**
- New: `supabase/manual/takedown.sql`, the one-transaction takedown (Phase 5 plan #7), with
  `tests/integration/takedown.test.ts`.
- New: `supabase/manual/retention.sql`, the weekly retention delete (#10), with its
  integration test.
- `supabase/migrations/0001_baseline.sql`: its comments "only the takedown (Phase 10) removes
  history (#7)" (line 28) and "Rows are never deleted" (line 54, `locations`) go stale with
  #10; step 7's sweep settles both (comments in an applied migration). The rule's live copy
  is `CLAUDE.md`'s.

**Docs:**
- New: `RUNBOOK.md` at the root (#8); its "A private vulnerability" (#13).
- `README.md`: a "Production" section (setup, the hosted-settings checklist as applied,
  Production's variables), backups and restore, the takedown; its two sentences that `/`
  redirects to `/map`, gate sites (#5).
- `SECURITY.md`: #347, a private vulnerability's fix (#13).
- `CLAUDE.md`: the gate's rule (#5, a gate site); "Doc changes" gains the private-vulnerability
  exception, with pointers in "CI is the gate" and "Process Log" (#13); "Locations" and "db
  layer" gain the retention delete beside the takedown (#10); "Where secrets live" gains
  production's database URL in the gitignored `.env.prod-db.local` (#11), a name Next never
  loads; the proxy rule only if #6's branch is needed.
- This plan; `CLAUDE.md`'s bold line; `.claude/process-log.md`; at the reconciliation,
  `project-context.md` and README's status parts.

**Settings, not files:** the production Supabase project; Vercel's Production variables and
Ignored Build Step; R2's CORS rule; `main`'s ruleset (CodeQL's checks); the registrar (the
domain bought at Oderland, IS #452; #7). (The alerts' cover, open decision 7, settled with no
setting: a look in the weekly routine.)

---

## Functions and components

| Name | Layer | What it does |
|---|---|---|
| `MapPage` | page (server component) | The check `withAdmin` makes (`src/lib/http/admin.ts`), from `cookies()`: `createSessionClient(readOnlyCookies(store))`, `requireAdmin({ cookieNames, auth, now })`, with no proxy before it to refresh the session (#6); `redirect(ABOUT_PATH)` for anything but `check.ok`, with no `try` around `redirect()` or `cookies()`; then `<MapClient />` with no props (#5) |
| `Home` | page | `redirect(ABOUT_PATH)` |
| `AboutPage` | page (static), at `/om` (#12) | What this is, for people looking for food, truck owners, and developers and employers (step 5d, IS #483); the intro's "Snart kan du", why the map isn't open yet, and the roadmap (gate sites, #5); a link to `/integritet` (step 9), in `PublicShell`'s footer since IS #483 |
| `PublicShell` | component | The public pages' header (the logo and "Var är maten", linking to `/`), footer (`/integritet`, Instagram, the contact) and warm palette, around `/om`, `/integritet` and the root 404 (IS #483) |
| `ExternalLink` | component | A link to another site, in a new tab with `rel="noopener noreferrer"` and a hidden "(öppnas i en ny flik)" (IS #483) |
| `PrivacyPage` | page (static) | What is stored and why; both retention periods, deleted in the weekly run after each ends, so up to a week later, or up to 8 weeks during a security incident; the dump count, with the incident hold's and an old project's 8-week caps (IS #457); Vercel's and Supabase's logs (IP addresses); Auth's audit log; the removal contact |
| `ABOUT_PATH`, `PRIVACY_PATH` | lib constants | For the code that sends someone to the pages |
| `AdminNav` | component | Gains "Karta", to `/karta` (`/map` until #12), as a plain `<a>`, so it loads `/karta` as a new document under its static CSP. A `next/link` added for a probe to `/admin/login` (no nav there, but the proxy's nonce CSP, as on the admin pages), clicked once in headless Chrome (PR #468, round 2), stayed in that page's document, under its nonce CSP, and the map drew with no CSP violation reported |
| `VamLogo` | component | The temporary logo (IS #481) as an inline SVG badge, sized by `size`, labelled "Väm"; beside "Var är maten" in `PublicShell`'s header (inside its link to `/`, IS #483) and the admin header |
| the marker test | unit test | Every tracked file outside `.claude/` holding the gate's marker is on the removal list in the header of `karta/page.tsx` (`map/page.tsx` until #12), and every listed file holds it (#5) |
| `takedown.sql` | manual SQL | For one truck id and its name (both must match, so an id and a name from different trucks change nothing: round 1 on PR #470), in one transaction: delete its locations, clear each `users` row's `truck_id` (the account stays, round 3 on PR #470), delete the truck; report the counts |
| `retention.sql` | manual SQL | Delete `locations` that ended more than 52 weeks ago, and `auth.audit_log_entries` older than 30 days, in one statement reporting each delete's row count (open decisions 2, 3) |
| the weekly dump | runbook command | `npx supabase db dump --data-only --schema public` against production's session pooler URL, the newest 4 kept (#11, open decision 5) |

**No new db-layer or service function.** The gate reuses `requireAdmin`; the deletes stay
manual SQL, by the db layer's "no function deletes" (Phase 5 plan #10).

---

## Steps

Each step is one issue and one PR into `dev`, except where a step is settings only, recorded
on its issue. Every PR merges through CI's required checks (`CLAUDE.md`, "Testing"). **Step 1
comes first**; step 2's decisions are settled as the steps that need them reach them; steps
3–12 (4b included) may run in any order their own dependencies allow (named in each step);
steps 13–17 (15b included) run in order, after every step before them but step 2, each of
whose decisions blocks only the step that needs it; step 18 runs alongside from step 17 on.

0. **This plan.** The plan file, and `CLAUDE.md`'s bold "Current phase plan" line naming it,
   where between phases it reads `none (the last one: .claude/plans/phase-9-security.md)`.
   Only that line of the header changes.

**A. Inputs**

1. **Probes** (#6), each recorded on the issue with its command and result:
   - **(a) The expired-session probe, locally.** A local, uncommitted `/map` gated as
     `MapPage` will be, with `readOnlyCookies`, and a short `jwt_expiry` (restored after):
     once the access token has expired, a load of `/map` makes `getSession()` refresh, and the
     new tokens can't be written back, so each later load presents the used refresh token
     again. Auth accepts a reused one within `refresh_token_reuse_interval` (10 s in
     `config.toml` and on the preview, README's hosted-settings checklist), so the probe
     records that interval, then loads `/map` several times after expiry, more than 10 s apart
     and across more than one `jwt_expiry`, and, after a `/map` load has refreshed, an admin
     page within the interval and again past it, where the proxy presents the token `/map`
     already used; and reads whether reuse detection ends the session. It decides Plan A or
     the proxy branch (#6). Steps 4 and 5 wait for it. The same probe on `dev`'s preview is
     step 4b, since only `dev`'s preview builds with the secret key (`CLAUDE.md`, "Where an
     issue's browser checks run").
   - **(b)** Supabase's key-rotation docs read, for step 15 (its newer and legacy API keys
     rotate differently).
   - **(c)** What a paused free project answers the admin screen and `/api/live`, from the
     docs, for the runbook (open decision 8).
2. **The owner's decisions** (open decisions 1–8, 12–14), each settled on the issue of the
   step that needs it, or its own issue where it needs research, and struck through here with
   "→ settled" as Phase 9's were.

**B. The app**

3. **`/about`** (`AboutPage`), `ABOUT_PATH` and `PRIVACY_PATH`, and `AdminNav`'s "Karta" link.
   These stay at Phase 11 and ride outside step 4's PR, but for `/about`'s sentence that the
   map opens when the trucks are back, which step 4 marks as a gate site. The link to
   `/integritet` comes with step 9. Smoke expects `/about` 200 with the static CSP, and
   `smoke.test.mjs`'s header tests move from `/map` to `/about`. `src/app/error.tsx`'s
   comment ("the only other page it covers today is `/`") gains `/about`, and step 9 adds
   `/integritet`.
4. **The gate** (#5, #6), **one PR holding only gate sites** outside `.claude/`, where its
   review rounds' log rows ride along (`CLAUDE.md`, "Doc changes"): `MapPage`; `Home`; the
   smoke check's `/` and `/map` expectations (in `smoke.mjs`, and `smoke.test.mjs`'s `/` and
   `/map` cases, which its "covers exactly the paths" test requires beside each expectation);
   the gate's unit and integration tests; the no-props test; the marker test; the removal list
   in `map/page.tsx`'s header; `CLAUDE.md`'s gate rule; the marker on `/about`'s sentence that
   the map opens when the trucks are back; `readOnlyCookies`' comment in
   `src/lib/supabase-session.ts` ("use it behind something that refreshes first: the proxy"),
   rewritten under Plan A with step 1a's evidence, since `MapPage` then uses it with no proxy
   before it (the owner's call, round 3 on PR #447); the root 404's "Till kartan" link
   (`src/app/not-found.tsx`) pointed at `/about` with Swedish text to match (the owner's call,
   round 4 on PR #447); README's sentences that `/` redirects to `/map` (its "4. Run" and
   "Hosted preview database"), each with the marker as an HTML comment. Needs steps 1a and 3.
   If #6's branch is needed, the proxy branch and its tests join this PR as gate sites, the
   branch its own function.
4b. **The gate on `dev`'s preview** (#6), its own issue, blocked by step 4, blocking step 13
   (the owner's call, round 2 on PR #447): step 1a's probe on `dev`'s preview, recorded on
   this issue. If it shows a logout where the local run didn't: the owner's call on
   `CLAUDE.md`'s "never `/map`" proxy rule (open decision 10), then #6's branch in this
   issue's PR, holding only gate sites outside `.claude/`, each with the marker (the branch,
   its `/map` matcher entry, `proxy.test.ts`'s case), `readOnlyCookies`' comment rewritten
   again with the preview's evidence, and the removal list in `map/page.tsx`'s header gaining
   them. The issue also reads the cache on the preview: no `/map` answer shows a `HIT`, and a
   logged-out request right after the admin's gets the redirect (the IS #373 (Phase 10) row
   asks it of `dev`'s preview and production). If the session survives, the issue closes
   with the results and no PR.
5. **The app name** (open decision 1) in the files under "Files". Needs step 4 merged (both
   touch `map/` and the tests).
5b. **Swedish paths** (#12, IS #478): `/about` → `/om` and `/map` → `/karta`, the folders moved
    (`karta/` with its tests), every link, test and doc pointed at the new paths; the old paths
    answer 404, which smoke expects. Before step 13.
5c. **A temporary logo** (IS #481, the owner's choice from a logo canvas): `src/app/icon.svg`,
    `favicon.ico` (for browsers without SVG favicons), `apple-icon.png` and `VamLogo` beside "Var
    är maten" on `/om` and in the admin header.
5d. **`/om` rewritten for the soft launch** (IS #483, the owner's calls on it): for people looking
    for food, truck owners, and developers and employers, in the logo's colours, with "Snart kan
    du" in the intro, a "Just nu" card and a roadmap with no dates (all three gate sites, #5);
    `PublicShell`'s header and footer on `/om`, `/integritet` and the root 404, not `/karta`,
    `/admin` or `error.tsx`. At the full launch its footer gains a link to `/om` (a gate site).

**C. Operations**

6. **`takedown.sql`** and its integration test; **the takedown log** (the owner's call, round 3
   on PR #447): each takedown's truck id and date, kept with the dumps on the owner's machine
   outside the repo, never in the database a restore replaces; README's takedown section.
7. **Retention** (#10): `retention.sql` and its integration test; `CLAUDE.md`'s "Locations"
   and "db layer" rules gain the retention delete beside the takedown. The test runs on the
   local stack only, so the issue also names the role that runs the file on a hosted project
   (the dashboard's SQL editor's) and probes on the preview that it removes rows from
   `auth.audit_log_entries`, an `auth` table: in a transaction rolled back after, a delete
   of one existing row, with its count of deleted rows shown, since a delete that matches no
   row succeeds whether or not row-level security hides the rows. The issue settles a form
   whose output the dashboard's SQL editor shows (a single statement that deletes and returns
   the count, or `psql` with the database URL), since the editor may show only one
   statement's result (not read). `retention.sql` reports each
   delete's row count. Needs open decisions 2 and 3.
8. **Backups** (#11): the weekly dump's command; production's database URL in
   `.env.prod-db.local`, which this step adds to `CLAUDE.md`'s "Where secrets live": the
   connection string (direct or session pooler) that works from the owner's network, its kind
   named on the issue once the command has run against the preview; how a restore recreates
   the admin by its old id (open decision 11); **one restore test on the local stack** from a
   dump, then every takedown the log holds (a re-run on a truck already gone changes nothing,
   step 6, so no date comparison can skip one: the owner's call, round 1 on PR #470) and
   `retention.sql` re-run, and the TOTP enroll
   needed at once (Principles and risks, "Backups"; Phase 9 plan #13); README's backups and
   restore section. Needs steps 6 and 7 and open decision 5.
9. **`/integritet`** (`PrivacyPage`), its wording approved by the owner; `/about`'s link to it;
   smoke expects it 200 with the static CSP. Needs steps 3, 7 and 8
   and open decision 4 (it states the periods, the dump count with the 8-week caps, the
   incident hold's and an old project's after a restore, an incident's evidence export,
   which keeps audit-log IP addresses with the held dumps, and the contact).
10. **`RUNBOOK.md`** (#8): Attack Mode; a takeover (Phase 9 plan #13's recovery order); a lost
    phone (open decision 9 settled here, Phase 9 plan open decision 4); a leaked key; a
    takedown request; a paused project (step 1c, open decision 8); a restore (step 8); the
    weekly routine (the dump, then `retention.sql`, then the alerts' cover from open decision
    7, with the date the first retention row comes due). Needs steps 1c and 6–8 and open
    decisions 7 and 8; open decision 9 is settled on this step's issue.
11. **`SECURITY.md`** (#347): how a reported vulnerability, and once production exists an
    in-house one (the scope draft's Q36), is fixed in a GitHub private security advisory (#13);
    `CLAUDE.md`'s exception to the issue → PR rule; `RUNBOOK.md`'s "A private vulnerability".
12. **#349,** the SonarQube Cloud re-scan: the account with two-factor at creation, each
    finding an issue or a recorded reason. Before step 15.

**D. Production** (in order, after every step above)

13. **The production Supabase project:** migrations applied, with the CLI linked to
    production and checked before the push, which must succeed (`RUNBOOK.md`'s "A restore",
    step 1, is the guarded form); Phase 5 #19's hosted check
    (`sv-SE-x-icu`, both extensions in `extensions`, the Data API's Max rows at least
    `MAX_ROWS`); README's hosted-settings checklist applied, "Write audit logs to the database"
    included; the Security Advisor (`db advisors --linked --type security --level info
    --fail-on error`, the CLI linked to production and checked, and no migration pending, as
    `RUNBOOK.md`'s "A restore", step 1, runs it; never by a database URL, which missed RLS off
    on the preview, IS #474; or the dashboard): no ERROR, each WARN fixed or accepted with a
    reason (leaked-password protection's, on Free), INFO read; then the CLI linked back to the
    preview and checked, as that section's step 7 does, also when the step stops early; Auth's
    Site URL and Redirect URLs set to the one production `vercel.app` host the admin logs in
    from in step 16, named on the issue, and that host's `/auth/callback` alone, as README's
    checklist names `dev`'s alias for the
    preview; the admin user with a long random password (README,
    "5. Create the admin user"), its id noted in the password manager (`RUNBOOK.md`, "A lost
    phone", step 2), its TOTP factor enrolled in step 16, through the deployed
    app; the email-budget lockout as open decision 6 settles it. README's "Production" section
    written.
14. **Vercel and R2:** the Ignored Build Step read as set to cancel a Production build from any
    branch but `main`, and no `vercel.json` `ignoreCommand` and no `vercel.ts` (which may
    override it too, not probed) on `dev` or `main`; R2's CORS rule
    gives an origin only to a production address shown to be this project's that serves pages
    (`vararmaten.vercel.app`, production's domain since IS #458); an address that redirects to
    one with an origin needs none (`whereisfood-theta.vercel.app`, set to redirect (307) to
    it); one not yet shown to be this project's waits for step 17's check (the
    `<project>-<scope-slug>.vercel.app` alias did, until #464 showed it is; it gets none by the
    owner's call on #506, README's "Get the map tiles"); and never `whereisfood.vercel.app`, another owner's
    site (IS #459; README, "Get the map tiles"); the Vercel Toolbar
    off for Production deployments, as for pre-production (the owner's call, round 3 on PR
    #447; README's "Hosted settings checklist"); Production's Deployment Retention Policy, which
    README's checklist left at 30 days for Phase 10 to decide (open decision 14, settled at 30
    days, IS #459), recorded there. **Production gets no variables yet** (#9).
15. **Before the deploy:**
    - the 2FA re-check of every account, each one's recovery mailbox, the registrar's account
      (Oderland, IS #452), the removal-contact mailbox (IS #456) and the admin's login mailbox
      with its recovery address, if it has one yet (IS #458) (`CLAUDE.md`, "Secrets"), recorded
      without an address or secret;
    - every credential that existed before the deploy rotated, replaced or disabled, but
      those open decision 12 keeps, each with its reason; all listed by name;
    - **the first merge `dev` → `main`** (#9): a PR opened fresh against `main`, never
      retargeted (`CLAUDE.md`, "Testing"), running every required check, the controls' full
      set included. With no analysis of `main` to compare with, CodeQL may count old findings
      as new on it: each is read and settled as on `dev` (fixed, an issue, or dismissed with a
      reason), the owner's call, round 5 on PR #447, which Phase 8 plan step 17 handed this
      plan. Its push gives CodeQL its first analysis of `main`; then CodeQL's checks
      (`CodeQL` and both `analyze` jobs) join `main`'s ruleset (Phase 8 plan #11, #14), read
      back by `gh api`. The production build it starts has no variables, so it fails or
      serves nothing (#9).
15b. **`main` back into `dev`** (the owner's call, round 6 on PR #447): a branch cut from
    `dev` merges `origin/main` and goes into `dev` through a PR, so `dev` holds step 15's
    merge commit. Both rulesets require a PR up to date with its base and allow no direct
    push (merge or rebase only), so without it step 16's PR from `dev` into `main` can't
    merge. The same PR adds the sync to `RUNBOOK.md`, for every later `dev` → `main` PR (Phase
    11's).
16. **The deploy:** the Ignored Build Step read again and no `ignoreCommand` or `vercel.ts` on
    `dev` or `main`, just before Production's variables are set, from the new project only,
    since step 15's merge changed `main`; a production build from `main`, started by a push to
    it: a second PR from `dev`, opened fresh, carrying `dev`'s commits since step 15 (if there
    are none, a one-line doc change through its own issue). Never a promoted branch preview,
    which skips the Ignored Build Step (Part 2, "Before the production deploy"), nor a
    Redeploy, whose path through the step hasn't been read; then the admin's magic-link login
    on the phone and the TOTP enroll at `/admin/mfa`, which needs the deployed app (the
    owner's call, round 1 on PR #447).
17. **The production checks**, on the owner's phone and by headers:
    - logged out, `/` and `/karta` land on `/om`; as the admin at `aal2`, reaching `/karta` by
      "Karta", the map shows with
      R2's tiles and no CSP violation in the console;
    - `/api/live` goes MISS → HIT;
    - a logged-out request to `/karta` right after the admin's never gets the map, and no
      `/karta` answer shows a cache `HIT`;
    - step 7's rolled-back DELETE on `auth.audit_log_entries` repeated in production's SQL
      editor, in the form step 7 settled, showing one row deleted, recorded beside the
      preview's, since the two projects' grants may differ; here, after step 16's login has
      written rows (a new project's table may hold none before);
    - the first weekly dump is on the owner's machine;
    - by headers, the production addresses step 14 left unseen (IS #459): `whereisfood-theta.vercel.app`
      answers a 307 to `vararmaten.vercel.app`; and whether `whereisfood-where-is-food.vercel.app`
      is this project's, by Vercel's own record (listed among the production deployment's domains
      in the project's dashboard), not by the page it serves, which anyone could copy. If it is,
      an issue of its own gives it R2's CORS origin. (It is, #464; the owner's call on #506: no
      origin, for the reasons README's "Get the map tiles" gives.)

    **This step is the phase's done.**

**Alongside**

18. **Telling the trucks** they're listed (#4, open decision 13), with a link to `/integritet`,
    from step 17 on. Recorded on its issue as it goes; it blocks neither closing step.

**Closing**

19. **The Phase 10 retrospective** (`.claude/process-log.md`, "How to use it"): its range
    starts at row 793, the row after the Phase 9 retrospective's range (700–792). Blocked by
    every other planned issue but step 18's; its follow-ups block step 20.
20. **The reconciliation of `project-context.md`**, blocked by step 19 and its follow-ups. It
    replaces the IS #278 (Phase 10), IS #373 (Phase 10) and IS #394 markers with #1,
    #2 and #3; rewrites Part 1 for production and the gate, the Roadmap and the Phase map's
    Phase 10 row, "Pre-deploy automation"'s "Before the production deploy" (done), "Open
    decisions" (the retention period, the app name, the removal contact, as settled), the
    "Phase 7 #25, #26" carried-forward row (line 1108), whose name is now Väm (IS #452),
    every `/about` and `/map`, now `/om` and `/karta` (#12, IS #478),
    Q36 in the IS #278 (Phase 10) row (line 1142) and #347's "private until disclosure" in the
    Phase 10 row (line 474) and in "Pre-deploy automation" (line 825), which #13 amends (IS #347),
    the claims that CodeQL's checks aren't required on `main` yet, done in IS #461:
    "`main`'s without CodeQL's until Phase 10" (line 120), the Phase 8 row's "joining
    `main`'s in Phase 10" (line 472), the Phase 10 row's "whether CodeQL gets a base
    analysis of `main` before the first PR into it, and CodeQL's checks added to `main`'s
    ruleset once one exists" (line 474), the SAST item's "On `dev` … are required" and "on
    `main` they join in Phase 10" (lines 801–802), the Phase 8 #11 row's "CodeQL's checks join
    `main`'s ruleset in Phase 10" (line 1118) and the Phase 8 #14 row's "on `dev`" (line
    1120), and README's "CodeQL's on `dev` only until Phase 10" (line 151, a status part),
    the folder tree's `src/app/` (line 304), which gains `icon.svg` and `apple-icon.png`, and its
    `components/`, which gains `VamLogo.tsx` (IS #481), and its `src/lib/` clients' line (line
    336), which gains `supabase-url.ts` (+ test) (IS #497),
    "Principles and risks"' backups item (the dump count, the restore method, the takedown
    log), the takedown's "clear or delete each `users` row" (lines 474 and 1071), which only
    clears them (round 3 on PR #470), "only the takedown removes history" (line 207) and
    "Rows are **never deleted**, except a takedown" (line 503), which the retention delete
    joins, "History is kept" (lines 530 and 673), for 52 weeks now, and the audit log's
    "needs a retention of its own" (line 892), now 30 days (IS #454), Pricing's
    "Supabase Free" item (the paused project, open decision 8), "Two-factor authentication"
    (lines 773–782), whose dated Phase 9 audit stays as written, with IS #460's re-check added
    beside it, naming what it corrects: the audit's "no SMS anywhere", which a Google
    mailbox's phone step made false until #460 removed it; its account list and membership
    sentences, which take #460's two-factor record as the list (the registrar, the
    removal-contact mailbox, production's admin mailbox and organization); and "No domain or
    registrar account exists yet", false since IS #452. Also the carried-forward Phase 6 #4
    row (line 1078), whose "every credential" open decision 12 narrows. It brings README's
    status parts in line; carries forward the decisions that outlive the phase (#5 and #10 at
    least: #5's row names the removal list in `karta/page.tsx`'s header and #5's removal checks, for Phase 11's
    plan; the IS #373 (Phase 11) row's marker stays, and its "removes the gate" points to #5's
    row); and sets `CLAUDE.md`'s bold line to none, naming this plan as the last one.

---

## Rationale

### #1 — Phase 10's scope as the scope draft settles it (IS #278 (Phase 10))

Takes up the IS #278 (Phase 10) **between phases** row: the old launch row minus what IS #373
(Phase 10) moves to Phase 11 (Pro and its timeouts, the custom domain with its CSP entry and
HSTS, Vercel Pro, the acquisition plan); the hosted-settings checklist applied to production,
with its Security Advisor settled before the deploy (no ERROR, each WARN fixed or accepted
with a reason, the owner's threshold, round 3 on PR #281); the alerts the free plans can't
send (Phase 9 plan open decision 7: none can, so open decision 7 here); Phase 5 #19's hosted
check on the production project; Q36, an in-house finding in a private security advisory once
production exists (step 11); Q34, the runbook's incident section (step 10), with the restore
test moved to the local stack (step 8) since Pro's restore is Phase 11's. The detail is the
scope draft's "Phase 10 · Launch".

### #2 — A soft launch (IS #373 (Phase 10))

Takes up the IS #373 (Phase 10) **between phases** row, the owner's calls: production with
`/map` shown only to the admin and `/` leading to a Swedish `/about`; only real data, from the
trucks' own posts, entered by hand, nothing scraped; every removal request honoured; it costs
nothing (Supabase Free, `vercel.app`, `r2.dev`). `/api/live` stays public, so the privacy note,
the removal contact, the retention period, the app's name and telling each truck are due at the
deploy. On Free: the weekly data-only dump (#11), never the `auth` schema; a restore recreates
the admin by its old id (open decision 11); leaked-password protection's advisor warning
accepted with a reason. The proxy is untouched (Plan A) unless the probe says otherwise (#6).
The row's proposed gate is #5's; whether a paused project is acceptable is open decision 8.

### #3 — The email-budget lockout is decided again before production (IS #394)

Takes up the IS #394 **between phases** row for Phase 10: spending the built-in email's
budget so the admin's link doesn't come was accepted for Phase 9 only (Phase 9 plan open
decision 1). It needs the admin's address and grants no access; custom SMTP, the Owners
phase's, is the fix it waits for. The answer is open decision 6, settled before step 13
applies production's settings.

### #4 — Done at the deploy; telling the trucks runs alongside

The owner's call (2026-11-20). Done is step 17. Telling the trucks depends on replies the plan
can't control, so it starts once production holds their data and the privacy note exists, and
blocks neither the retrospective nor the reconciliation. Phase 11's coverage target, not this
phase, measures daily use.

### #5 — The soft-launch gate is temporary, and removable without a hole

The owner's call (2026-11-20): the gate goes at the full launch, and its removal must be easy
and open no hole.

- **It hides `/map`; it protects nothing.** `/map` renders only what `/api/live` already
  publishes; `MapPage` passes nothing from the check to the client (`<MapClient />` keeps no
  props), and admin-only data stays behind `withAdmin` and RLS. A test fails if `MapPage`
  passes `MapClient` a prop. The hole a removal could open is something added behind the gate
  because only the admin sees `/map` (an edit link, unconfirmed entries, the admin's id):
  `CLAUDE.md`'s gate rule forbids it for as long as the gate stands.
- **One place.** The page alone (Plan A, #6): the proxy, the CSPs and `next.config.ts` are
  untouched, so the removal edits no security-critical file. If #6's branch is needed (step 1a
  or 4b), it is its own function in `proxy.ts` with its own tests, so removing it leaves the
  other branches as they are; it also adds `/map` to `config.matcher` (today `/admin/:path*`
  and `/api/admin/:path*` alone, `src/proxy.ts:216`) and changes `proxy.test.ts`'s case that
  `/map` isn't matched (`:83`), and both are gate sites the removal restores.
- **Every site findable.** Each gate site carries the marker comment `SOFT-LAUNCH GATE (Phase
  10 plan #5)`. The sites: `MapPage`, `Home`, the smoke check's `/` and `/map` expectations
  (`smoke.mjs`, and `smoke.test.mjs`'s `/` and `/map` cases), the gate's tests, the no-props
  test, the marker test itself, `CLAUDE.md`'s gate rule, `/about`'s sentence that the map
  opens when the trucks are back, `readOnlyCookies`' comment in `supabase-session.ts` (round 3
  on PR #447), the root 404's link and README's sentences on `/` (round 4), and, if #6's
  branch is needed, the branch, its `/map` matcher entry and `proxy.test.ts`'s "not matched"
  case for `/map`.
- **One copy of the removal list**, in `map/page.tsx`'s header, where a removal starts: each
  site and what it goes back to (`/` → `/map`; smoke's `/` entry, which step 4 adds, expects
  the redirect to `/map`, and its `/map` entry 200 with the static CSP, `smoke.test.mjs`'s `/`
  and `/map` cases with them; `○ /map` in the route table; the gate's tests, the no-props
  test, the marker test and the `CLAUDE.md` rule deleted; `/about`'s sentence rewritten for
  after the full launch; `readOnlyCookies`' comment restored to "behind the proxy"; the 404's
  link back to "Till kartan" and `/map`; README's sentences back to `/` redirecting to `/map`;
  if #6's branch was added, the branch deleted, `/map` out of the matcher and
  `proxy.test.ts`'s case for it restored). This decision and the carried-forward row point to
  it.
- **The marker test** reads that list from the header and fails if a tracked file outside
  `.claude/` holds the marker and isn't listed, or a listed file doesn't hold it. `.claude/`
  is left out because the plans and the log quote the marker as history. Seen red once each
  way, locally, before its PR.
- **Its own PR** (step 4), holding only gate sites outside `.claude/`, and step 4b's if it
  adds the proxy branch, so their diffs are the map of what Phase 11 undoes (the owner's call,
  round 2 on PR #447).
- **The removal's checks**, for Phase 11's plan: `git grep` finds no marker outside
  `.claude/`; the build shows `/map` static again; smoke passes with the restored
  expectations; `/api/live`'s cache headers are unchanged (the gate never touched them); a
  `/map` browser check (`CLAUDE.md`, "Testing").
- **While it stands:** an admin's rendered `/map` is never cached and served to someone else
  (step 17's check).

Weighed: the gate in the proxy, which puts both the gate and its removal in the
security-critical file; no marker test, cheaper but blind to a site added later without the
list (the owner chose the test).

### #6 — The probe decides Plan A or a proxy branch

`/map` is outside the proxy's matcher, so nothing refreshes the session there. `requireAdmin`'s
`getSession()` refreshes an expiring token, but `readOnlyCookies` can't write the new tokens
back, so the browser keeps presenting the used refresh token, which Auth's reuse detection may
answer by ending the session. Step 1a probes it locally before the gate is built, and again
on `dev`'s preview once step 4 merges, the first place a gated `/map` can build with the
secret key (the owner's call, round 1 on PR #447), as step 4b, an issue of its own (round
2). If the session survives, Plan A: the page alone (IS #373 (Phase 10)). If it ends, a
`/map` branch in the proxy, which changes `CLAUDE.md`'s "never `/map`" proxy rule (Phase 7
plan #10, #28; `src/proxy.test.ts` pins it): the owner's call, with the rule's text changed in
the same PR (open decision 10).

### #7 — The domain is optional in Phase 10

The owner's call (2026-11-20). Pricing says a domain can be bought "once the name is settled,
to keep it from being taken", and step 2 settles the name. If it is bought, the registrar
account has two-factor at creation and joins step 15's re-check; nothing in the app uses the
domain until Phase 11.

### #8 — The privacy note is its own page; the runbook is `RUNBOOK.md`

The owner's calls (2026-11-20). `/integritet` is what a removal request links to, and it
outlives the soft launch, where `/about`'s text changes at Phase 11. The runbook is what is
opened in an incident, and #264 will restructure the README.

### #9 — The first merge into `main` comes before Production's variables

The owner's call (2026-11-20). `main` is at PR #195 (Phase 6), whose commit predates
`codeql.yml`, so no CodeQL analysis of `main` exists, and `codeql.yml` has no
`workflow_dispatch` (it runs on PRs and pushes to `dev` and `main`). The first merge's push
gives `main` its analysis, so CodeQL's checks join `main`'s ruleset before the deploy. The
production build that merge starts has no variables, so it fails or serves nothing, holding no
data. The first PR's CodeQL findings, which may count as new against no base, are each read
and settled as on `dev` before the checks join the ruleset (the owner's call, round 5 on PR
#447; Phase 8 plan, #11's limit); weighed: a base analysis uploaded without a push, through
codeql-action's `ref` and `sha` inputs (documented, not probed). Weighed too: deploying with
the first merge, its PR then having no CodeQL base and `main`'s
ruleset getting CodeQL only after the deploy.

### #10 — Retention is manual SQL, run weekly after the dump

The owner's call (2026-11-20). Location history is personal data for a sole trader (where a
person worked, day by day), and GDPR's storage limitation keeps it only as long as its purpose
needs: the checklist's 4-week look-back, and the recent places, which take a truck's last
`RECENT_ENTRIES` (50) entries however old (`src/lib/services/locations.ts`), so a period
shorter than a truck's break leaves it none when it is back (open decision 2). Auth's audit
log, kept for investigating a takeover (Phase 9 plan #13), grows without end on Free's 0.5 GB,
since neither GoTrue nor the app deletes its rows (Phase 9 plan open decision 7).
`retention.sql` deletes
both past their periods (open decisions 2, 3: 52 weeks after a location ends, 30 days for the
audit log, the owner's calls on IS #454), run from the runbook in the same weekly slot as
the dump; the runbook names the date the first row comes due. It keeps the deletes manual SQL,
as the takedown is (Phase 5 plan #7, #10). `CLAUDE.md`'s "Locations are never deleted (except a
takedown)" and the db layer's "the one delete, a takedown" gain retention in step 7's PR.
Weighed: pg_cron, which can't be forgotten but is the project's first scheduler and a job that
deletes; revisit if a week is missed.

### #11 — The weekly dump is a runbook command

The owner's call (2026-11-20). Supabase Free has no backups; the dump is the only one until
Pro's (Phase 11). Weekly bounds the loss to a week, which today's posts and the checklist's
4-week look-back rebuild. Data-only and `public` only, since `auth` holds credentials; on the
owner's machine outside the repo, since the repo is public; the last few only (open decision
5), since the dumps are copies of the history: a takedown or a retention delete reaches the
backups only as old dumps are deleted, which the privacy note states. The command runs with
production's database URL from the gitignored `.env.prod-db.local`, a developer's own copy
(`CLAUDE.md`, "Where secrets live"), named so Next never loads it: Next reads
`.env.$(NODE_ENV).local` ahead of `.env.local`, so a `.env.production.local` would put the URL
in every local `next build` and `next start` (Next's environment-variables guide, "Load Order";
the owner's call, round 5 on PR #447). A restore brings back what was deleted after its dump,
so it re-runs every takedown in the takedown log, then `retention.sql` (the owner's call,
round 3 on PR #447; every one, not those on or after the dump's date, the owner's call, round
1 on PR #470: the log's UTC date against a dump labelled by local date could skip one). Weighed: `scripts/backup.mjs`, which
would name and rotate the files but is new code to test, for one person once a week.

### #12 — The public pages' paths are Swedish

The owner's calls (2026-11-21, IS #478): `/about` becomes `/om` and `/map` becomes `/karta`, as
`/integritet` already was (`CLAUDE.md`, "UI Rules": Swedish throughout), before the production
deploy, while no link to them has been shared. No redirects: the old paths answer 404, which
smoke expects. Public pages only: `/admin/…`, `/api/…` and `/auth/…` stay, since only the admin
sees them and they run through the proxy's, the CSP's and Auth's rules. A rename only, with no
new constant for the map's path. As history, naming the paths as they were built: steps 1a, 3,
4, 4b, 5 and 9, decisions #2, #5, #6 and #8, the Files lines below their note, step 1a's probe
criterion and struck open decisions. The Purpose, the Goal, the functions table, the steps
still to come and the open criteria name the new ones.

### #13 — A private vulnerability is fixed in its advisory and shipped by a public PR

The owner's calls (2026-11-21, IS #347, rounds 1 and 2 on PR #480): a privately reported
vulnerability, before production too, and once production exists one found in-house (Q36), is fixed
in its advisory's private fork with the local gates, by `RUNBOOK.md`'s "A private vulnerability",
and shipped by a public PR with CI: before production always into `dev`, so #9's first merge into
`main` keeps its order; once production exists, into `main` from a branch off it when the vulnerable
code is deployed there, then synced into `dev` with `dev`'s copy checked, so unfinished work on
`dev` doesn't ship with it, and into `dev` when the code is only there (round 3). The advisory's
merge button is never used: GitHub's docs (read 2026-11-21) say it doesn't enforce the branch's
protection rules, and CI can't run in the fork. The fix is public from the push of its branch until
it is deployed, which amends Q36's "until its fix ships". The advisory is published once the fix
ships, or at the time agreed with the reporter if later; the public records follow it. In-house
findings before production stay public (Q36).

---

## Acceptance Criteria

- [ ] Step 1a's result is on its issue (locally) and step 4b's on its own (on `dev`'s
  preview): whether a refresh on `/map` that couldn't be stored ended the session, and Plan
  A or the branch named, with the owner's call recorded if it is the branch. Steps 1b and 1c
  are recorded too.
- [ ] Each open decision below is settled and struck through here with "→ settled".
- [ ] `/om` answers 200 with the static CSP, in Swedish, saying the map opens when the
  trucks are back, linking to `/integritet`; `AdminNav` shows "Karta", a plain `<a>` to `/karta`
  (`/karta` is outside the admin layout and shows no nav: the way back is the browser's, the
  owner's call, round 1 on PR #447).
- [ ] The gate: every answer of `requireAdmin` but `check.ok` (no session, `aal1`, a
  non-admin, a time-boxed session, a first factor that isn't `magiclink`, a failed sign-out,
  Auth unavailable) gets a 307 from `/karta` to `/om`, by a test over each refusal reason
  (unit), and an integration test on the local stack; `/` gets a 307 to `/om`; the admin
  at `aal2` gets the map; the route table shows `ƒ /karta`; smoke expects both redirects, and
  `/about` and `/map` answering 404 (#12).
- [ ] The gate's invariants: a test fails if `MapPage` passes `MapClient` a prop; the marker
  test fails on a marked file not on the removal list and on a listed file without the marker,
  each seen red once locally; step 4's PR holds only listed sites outside `.claude/`;
  `CLAUDE.md` holds the gate rule.
- [ ] The app name in every file under "Files"; `git grep` over `src` for each name the
  chosen one replaces ("WhereIsFood", and "Var är maten?" if the public title changes) finds
  nothing, and the public title matches the name.
- [ ] `takedown.sql`: an integration test seeds two trucks with history and a `users` row
  pointing at one, runs the file, and finds that truck, its locations and the pointer gone and
  the other truck untouched; on an id that doesn't exist it changes nothing and says so.
- [ ] `retention.sql`: an integration test finds locations ended past the period deleted and
  newer ones kept, and audit-log rows past theirs deleted; `CLAUDE.md`'s "Locations" and "db
  layer" name it beside the takedown; the hosted role and its DELETE probe on the preview are
  recorded on step 7's issue.
- [ ] The restore test on the local stack, recorded on its issue: the admin recreated by its
  old id with a long random password, `locations.created_by` resolving, each logged takedown
  and `retention.sql` re-run after it, and a TOTP enroll needed at once.
- [ ] `/integritet` answers 200 with the static CSP and names what is stored and why, both
  retention periods, the dump count, the 8-week incident caps (IS #457), Vercel's and
  Supabase's logs (IP addresses), Auth's audit log and the removal contact; the owner approved
  the wording.
- [ ] `RUNBOOK.md` has a section each for Attack Mode, a takeover, a lost phone, a leaked key,
  a takedown request, a paused project, a restore, the weekly routine and a private
  vulnerability (#13).
- [ ] `SECURITY.md` says how a reported vulnerability, and once production exists an in-house
  one, is fixed privately in an advisory, and `CLAUDE.md` carries #13's exception (#347 closed).
- [ ] #349: each finding has an issue or a recorded reason; the account had two-factor at
  creation.
- [ ] The production project: Phase 5 #19's hosted check passes; each hosted-checklist item is
  recorded as applied; the Security Advisor shows no ERROR, each WARN fixed or accepted with a
  reason, INFO read; Auth's Site URL is the production host named on the issue and its
  Redirect URLs that host's `/auth/callback` alone; the admin has a long random password.
- [ ] Vercel and R2: the Ignored Build Step read as set, no `ignoreCommand` or `vercel.ts` on
  `dev` or `main`; R2's CORS rule covers each production address, by an origin or a
  redirect, but the `<project>-<scope-slug>` alias, which waited for step 17's check (IS #459)
  and has none by the owner's call on #506;
  the toolbar reads Off for Production; Production's Deployment Retention Policy
  reads the value open decision 14 settled, in README's checklist too; Production's variables
  come only from
  the new project.
- [ ] Before the deploy: the Ignored Build Step, `ignoreCommand` and `vercel.ts` read again at
  step 16,
  before the variables, and Production built from a push to `main`, not promoted or
  redeployed; the 2FA re-check
  recorded per account; every earlier credential
  rotated, replaced or disabled, but those open decision 12 keeps with a reason, listed by
  name; the
  first merge into `main` ran every required check, the controls' full set included, its
  CodeQL findings each settled; after it, `git merge-base --is-ancestor origin/main
  origin/dev` succeeds (step 15b); CodeQL's checks in
  `main`'s ruleset, read back by `gh api`.
- [ ] The production checks: logged out on the phone, `/` and `/karta` land on `/om`; as the
  admin, after the TOTP enroll of step 16 and by "Karta", the map shows with R2's tiles and no
  CSP violation;
  `/api/live` goes MISS → HIT; a
  logged-out request to `/karta` after the admin's gets the redirect, and no `/karta` answer shows
  a cache `HIT`; the rolled-back DELETE removed one `auth.audit_log_entries` row in
  production's SQL editor; the first dump is on the owner's machine.
- [ ] The closing steps (19, 20) are done: the retrospective, then the reconciliation.

---

## Open Decisions

1. ~~**The app name** (Phase 7 plan #26): the UI text and the TOTP entry's label (step 5), and
   whether to buy the domain now (#7). Until then the admin screens say WhereIsFood and the
   public title "Var är maten? | Göteborg".~~ → **settled** (the owner, 2026-11-21, IS #452):
   Väm, read as "Var är maten", in every text and the TOTP label; the domain bought now,
   `vararmaten.se` and `varärmaten.se` at Oderland, whose account has authenticator-app 2FA and
   joins step 15's re-check; unused until Phase 11's custom domain.
2. ~~**The retention period for location history** (Phase 7 plan #25; #10), at step 7. Its two
   purposes pull apart: the checklist needs 4 weeks, and the recent places need a truck's last
   entries however old, which a period shorter than a seasonal break deletes. The options: a
   period that outlasts a break (12 months, say), or a short one (8 weeks, say) with the loss
   of a returning truck's recent places stated (the owner's call to leave it open, round 5 on
   PR #447).~~ → **settled** (the owner, 2026-11-20, IS #454): 52 weeks after a location's
   `ends_at`, so a truck back from a seasonal break still has recent places, from its entries
   that ended within the 52 weeks (`retention.sql`'s header).
3. ~~**The retention period for Auth's audit log** (Phase 9 plan open decision 7; #10), kept to
   investigate a takeover. Leaning: 30 days.~~ → **settled** (the owner, 2026-11-20, IS #454,
   approving the leaning): 30 days after a row's `created_at`.
4. ~~**The removal contact** (IS #373 (Phase 10)). Leaning: a dedicated address, not a personal
   one; a new mailbox gets two-factor at creation and joins step 15's re-check.~~ →
   **settled** (the owner, 2026-11-21, IS #456, approving the leaning): `vararmaten@proton.me`,
   a mailbox for this app alone, which joins step 15's re-check; `/integritet` names it, with
   the owner's name as the controller (the owner's call on #456).
5. ~~**How many weekly dumps are kept** (#11), which sets how long a removal takes to leave the
   backups. Leaning: 4.~~ → **settled** (the owner, 2026-11-20, IS #455, approving the leaning):
   the newest 4, so a removal leaves the backups about four weeks on. Amended (the owner,
   2026-11-20, IS #457, round 5 on PR #473): during an incident, the dumps from before it are
   held aside at most 8 weeks, then deleted (`RUNBOOK.md`, "The weekly routine"). And (the
   owner, round 6): `retention.sql` is skipped during an incident only until the takeover's
   audit-log export is saved, at most 8 weeks; after a restore into a new project, the old
   one is deleted at most 8 weeks after the restore (`RUNBOOK.md`, "A restore").
6. ~~**The email-budget lockout** (#3): accepted again, or a mitigation, before step 13.~~ →
   **settled** (the owner, 2026-11-22, IS #458): accepted again, until the Owners phase's custom
   SMTP; custom SMTP now was weighed and not taken (a new account, a secret, DNS, and it raises
   the budget rather than removing it). `RUNBOOK.md`'s "A login link that doesn't come" says
   what to do, ending in moving the admin to a new address by Auth's admin API (probed on the
   local stack, IS #458). The admin's login address is a mailbox used for that login alone,
   never the public removal contact (IS #458).
7. ~~**How the usage, spend and 5xx alerts are covered** on the free plans (Phase 9 plan open
   decision 7): a look at each usage page in the weekly routine; an external free uptime
   monitor on `/api/live` (a new account, with two-factor at creation); or the gap accepted
   with a reason.~~ → **settled** (the owner, 2026-11-20, IS #457): a look at Supabase's and
   Vercel's usage pages and the 5xx logs in the weekly routine, no monitor or new account; a
   5xx between looks goes unalerted, accepted while the admin uses the app daily
   (`RUNBOOK.md`, "The weekly routine").
8. ~~**Whether a paused project is acceptable** (IS #373 (Phase 10)): a quiet week before the
   trucks are back could pause it. Leaning: accepted, with the runbook's section and the weekly
   routine's activity.~~ → **settled** (the owner, 2026-11-20, IS #457, approving the leaning):
   accepted (`RUNBOOK.md`, "A paused project").
9. ~~**The lost-phone route** (Phase 9 plan open decision 4): where the recovery's calls run,
   and whether the login needs an unenroll screen. Phase 9's leaning: the dashboard's SQL
   editor, deleting the factor and the user's `auth.sessions` rows, then a re-enroll at once.~~
   → **settled** (the owner, 2026-11-20, IS #457, approving the leaning): production's SQL
   editor, one statement deleting the factor and the user's `auth.sessions` rows (probed
   locally in a rolled-back transaction), then a re-enroll at once; no unenroll screen
   (`RUNBOOK.md`, "A lost phone").
10. ~~**Plan A or a proxy branch** for the gate, from step 1a and its re-run on `dev`'s preview,
    step 4b (#6); the branch changes
    `CLAUDE.md`'s proxy rule, the owner's call.~~ → **settled**: Plan A, with the proxy rule
    unchanged (IS #448's probe on the local stack; IS #451's re-run on `dev`'s preview, a load
    after the access token's expiry showing `/map`). Built in PR #469.
11. ~~**How a restore recreates the admin by its old id** (step 8): Studio's "Add user" makes a
    new id, and the data dump loads with its foreign keys unchecked (Principles and risks,
    "Backups").~~ → **settled** (the owner, 2026-11-20, IS #455): Auth's admin API,
    `POST /auth/v1/admin/users` with the old `id`, before the dump is loaded; probed on the
    local stack, then used in the restore test (README, "Backups").
12. ~~**Which credentials exist to rotate** (step 15), and whether the preview's keys rotate too
    or only stay out of production ("reuse nothing from the preview setup").~~ → **settled**
    (the owner, 2026-11-22, IS #460, whose comments list each credential by name and what was
    done): on production, the secret key replaced by one named for its consumer, and replaced
    again after the old CLI login was revoked, since that full-access token was live while the
    first replacement existed (round 3 on PR #487); the database password reset; the legacy
    API keys (`anon`, `service_role`) disabled and the legacy JWT secret (HS256) revoked;
    kept, the publishable key (public by design, in every browser), the current signing key
    (ECC, whose private half the dashboard doesn't show, and whose "created at" read the same
    as the HS256 key's, which came with the project; the owner's screenshot) and the admin's
    password (made 2026-11-22, only in the password manager). What that token could have left
    on production was read afterwards (rounds 4 and 5 on PR #487; IS #460's comments):
    `public`'s schema differs from the migrations' only by the 3 default-privilege lines
    `RUNBOOK.md` expects; roles and triggers outside `public` match the preview's, which the
    same token reached, so that is no clean baseline; the admin user shows no change made
    through Auth, though an edit by SQL can't be ruled out from these reads; the advisor
    reports no ERROR. Auth's settings and Vercel weren't read again for it. The Supabase CLI
    login and the GitHub token replaced, and each account's unused live tokens and sessions
    removed; the new CLI login is again a full-access token with no
    expiry (a limit: a scoped one wasn't tried). Cloudflare's Global API Key rolled, and the
    Vercel bypass secret regenerated, since it also passes protection on Production's
    deployment URLs. The preview's other credentials not rotated, since they reach only the
    preview, but its legacy API keys disabled. Account passwords not rotated, by the owner's
    reason that none was in the repo, a shell or an agent session, and two-factor guards each.
13. ~~**How the trucks are told** (step 18): the channel and the Swedish text, with a link to
    `/integritet`.~~ → **settled** (the owner, 2026-11-23, IS #465): an Instagram DM from
    @vararmaten on the day a truck is first entered, signed "/Oliwer, Väm", in the text #465's
    comment records; email (`/integritet`'s contact) stays the fallback and the removal
    address, and a removal asked for by DM is honoured like one by email (#2). The text's "Kartan
    är inte öppen för alla ännu" holds while the soft-launch gate stands (#5) and goes at the
    full launch. Each truck told is recorded on #465 by name and date.
14. ~~**Production's Deployment Retention Policy** (step 14): README's checklist keeps Production
    at 30 days because no Ready production deployment existed (IS #417's comment of
    2026-11-19); the value against Hobby's 10 GB of Deployment Storage (#417).~~ → **settled**
    (the owner, 2026-11-22, IS #459): 30 days, unchanged. Production deploys rarely: the ways
    the docs plan for are a merge into `main` and a Redeploy in `RUNBOOK.md`'s "A leaked key"
    and "A restore" (README's Ignored Build Step row names promotion and a CLI deploy too,
    neither planned); and Hobby keeps the last 3 Ready production deployments and the one
    holding the production alias whatever the policy, so the value deletes almost nothing;
    Deployment Storage read 545 MB of 10 GB that day.
