# Setup

How to set up Väm: a local copy for development ("Getting started", "Scripts"), and the hosted
projects it runs on (the tiles on Cloudflare R2, the preview's and production's Supabase
projects, the hosted settings checklist, Vercel's preview deploys). Operating it (the weekly
routine and backups, requests and takedowns, incidents, a marker check, a migration and a
release) is [`RUNBOOK.md`](RUNBOOK.md); the rules for working on the code are
[`CLAUDE.md`](CLAUDE.md).

These sections were in `README.md` until IS #264, when "Takedown" and "Backups" moved to
`RUNBOOK.md`, and the R2 and CORS part of "Get the map tiles" became "Map tiles on R2". The
phase plans and the process log's rows from before it name them in `README.md`.

---

## Getting started

### Prerequisites

- **Node and npm in the ranges `package.json`'s `devEngines` admits.** Install Node
  from that range first: it brings npm 11. npm 10.9 and later check the ranges before
  `install`, `ci`, `run` and `exec` and stop with `EBADDEVENGINES` outside them. If
  `npm -v` is still below 11, run `npm i -g npm@11`: npm 10 is outside the range, npm
  before 10.9 can't check the field at all, and npm 10 crashes resolving vitest's
  optional peer dependencies on an install without the lockfile. Node's range is the
  major deploys build on, `engines.node`, so the gates run on the same major as a deploy.
- **Docker**, for the local Supabase stack. The basemap draws without it; the map's
  markers and the integration tests need it.
- **The `pmtiles` CLI**, to cut the map tiles ("2. Get the map tiles"). It's a single binary
  from [go-pmtiles releases](https://github.com/protomaps/go-pmtiles/releases).
- **Gitleaks 8.30.1**, for the git hooks' secret scan: the version the hooks were checked
  on. On Windows: `winget install --id Gitleaks.Gitleaks -e --version 8.30.1` (winget
  checks the download's hash); elsewhere, the binary from [the v8.30.1
  release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), checked against
  its `gitleaks_8.30.1_checksums.txt`. A shell or editor started before the install
  doesn't see the new `PATH`: start a new one.

### 1. Install

```bash
git clone https://github.com/Ollie1994/whereisfood.git
cd whereisfood
npm install
git config core.hooksPath .githooks
```

`npm install` also copies MapLibre's web worker into `public/maplibre/` (gitignored);
`npm run dev` and `npm run build` repeat the copy.

`core.hooksPath` turns on `.githooks/pre-commit` and `.githooks/commit-msg`, which run
Gitleaks on the staged changes and on the message, and refuse the commit on a find,
while `gitleaks` isn't on the `PATH`, or while a `.gitleaksignore` exists. It is set by
hand in each clone, never by an npm script (`CLAUDE.md`, "Secrets").

### 2. Get the map tiles

The tile file is **not in the repo** (`public/*.pmtiles` is gitignored). Without it
the map draws an empty background.

Cut a Gothenburg extract from one of Protomaps' daily builds of the world map, using
the bounding box in [`src/lib/geo.ts`](src/lib/geo.ts)
(west, south, east, north):

```bash
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles public/gothenburg.pmtiles --bbox=11.6,57.5,12.2,57.85 --maxzoom=14
```

Replace `YYYYMMDD` with a recent build date from
[maps.protomaps.com/builds](https://maps.protomaps.com/builds/), which lists one row
per daily build. Only recent builds are kept, so an old date returns 404. **Don't use
that page's "download" link:** it's the whole planet (about 140 GB). The extract
command fetches only the tiles inside the box. `--maxzoom=14` matches the file deploys use
("Map tiles on R2", below): it was cut that way and is 11.6 MB (its header says `maxzoom` 14).
Without the flag the file is larger, with more street-level detail.

### 3. Environment

Start the local Supabase stack first with `npx supabase start` (needs Docker). On a
fresh database it applies the migrations and `supabase/seed.sql`; `npx supabase db
reset` re-applies both later. A local database created before Phase 5 still records
the old migrations as applied: run `npx supabase db reset` once. Then:

```bash
cp .env.example .env.local
```

| Variable | Needed for | Value |
|---|---|---|
| `NEXT_PUBLIC_PMTILES_URL` | the map | `/gothenburg.pmtiles` (already set in the template) |
| `NEXT_PUBLIC_SUPABASE_URL` | the map's markers (`/api/live`), the admin login, integration tests | `API_URL` from `npx supabase status -o env` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the admin login, integration tests | `ANON_KEY` from the same output |
| `SUPABASE_SERVICE_ROLE_KEY` | the map's markers (`/api/live`), integration tests | `SERVICE_ROLE_KEY` from the same output (server only, never `NEXT_PUBLIC_`) |

Without the stack, the URL or the service-role key, the basemap still draws, but
`/api/live` fails, so the map shows no markers and says it couldn't fetch the
trucks. The seed's one entry for today spans the hour before `npx supabase db reset`
to 12 hours after it, so run a reset first to see a marker.

### 4. Run

```bash
npm run dev
```

Open the URL from the `Local:` line Next prints, usually
[http://localhost:3000](http://localhost:3000). It redirects to `/om`; `/karta` sends
everyone but the admin at `aal2` there too until the full launch.
<!-- SOFT-LAUNCH GATE (Phase 10 plan #5): to "It redirects to `/karta`." at the full launch (the removal list in src/app/karta/page.tsx). -->

If a page reloads itself in a loop under `npm run dev`: `CLAUDE.md`, "Testing" (IS #304).

### 5. Create the admin user

Sign-ups are off (`[auth] enable_signup = false` in `supabase/config.toml`), so the
admin is created by hand, and again after each `npx supabase db reset`:

1. In Studio ([http://127.0.0.1:54323](http://127.0.0.1:54323)), Authentication →
   Users → Add user → Create new user, with your email, a long random password, and "Auto
   Confirm User" on. Store the password nowhere: you never need it (the login is a link, and
   a recovery replaces it with the service role), but the user must have one: on a hosted project,
   "Require current password when updating" asks for it before a password change
   (`CLAUDE.md`, "Supabase").
2. In Studio's SQL Editor:

   ```sql
   insert into users (id, is_admin)
   select id, true from auth.users where email = 'you@example.com'
   returning id, is_admin;
   ```

   It shows the row it added. No row means the email matched no user. Without
   `returning`, the Editor says "Success. No rows returned" in both cases. On a hosted
   project, note the `id` it returns in your password manager: with two admins rows, it is
   how `RUNBOOK.md` ("A lost phone", step 2) tells yours apart.

Then log in at `/admin/login`. The link arrives in Mailpit, the local mail catcher
([http://127.0.0.1:54324](http://127.0.0.1:54324)). Open it in the browser that asked
for it: the login's code verifier is a cookie there.

The link leads to `/admin/mfa`, the second factor (Phase 9 plan step 5). The first time,
it shows a QR code: scan it with an authenticator app on your phone (Google Authenticator,
Microsoft Authenticator or another TOTP app), or type in the key shown under it, then enter
the six-digit code the app shows. Every later login asks for the code only. On a hosted
project, the next link after this first login and enroll can be refused for about an hour
(`RUNBOOK.md`, "A login link that doesn't come"). A QR code left
unused is replaced by a new one the next time the page opens. The factor is deleted with
the user, so after a `npx supabase db reset` the next login enrolls again; delete the
app's old entry then.

**Enroll from a computer if you can**, scanning its screen with the phone. With the phone
alone (the key copied into the app, or a screenshot of the QR scanned there), a browser that
reloads the tab while you are in the app shows a new key, and the entry you just added then
gives wrong codes: add the newest key and delete the old entry, or enroll from a computer.
A limit until #406, which explores phone-friendly enrollment (the owner, 2026-11-17).

---

## Scripts

```bash
npm run dev               # dev server
npm run build             # production build
npm run start             # serve the production build
npm run lint              # eslint
npm test                  # unit tests in watch mode
npm run test:run          # unit tests once (no Docker needed)
npm run test:integration  # integration tests (needs local Supabase)
npm run test:all          # every test project, each in its own run
```

A pull request into `dev` or `main` merges once the checks the branch's ruleset requires are
green (`CLAUDE.md`, "Testing"): `.github/workflows/ci.yml`'s four gates, Supabase's security
advisor, `npm audit`, the process log's check, the schema controls (the full set when a path
`TRIGGERS` in `scripts/controls-trigger.mjs` covers changes or the pull request is into
`main`, `--check` otherwise), Gitleaks, and a check that no commit message, nor the branch
name and title a merge commit joins, puts a closing keyword before an issue reference ("fixes
#348"); CodeQL's checks on both branches (on `main` since IS #461), and on `main` `base
(main)`, which makes a pull request retargeted from `dev` wait for a run against `main`. It
doesn't show which run each other check came from, so a pull request is opened fresh against
the branch it merges into, not retargeted (`CLAUDE.md`, "Testing"). The branch must also be up
to date with its base, so after another pull request merges, update the branch and let the
checks run again. What the checks don't cover (the `/karta` browser check, and when the
controls need a hand run among others) is in `CLAUDE.md`, "Testing". Locally, the fast loop
is:

```bash
npx tsc --noEmit
npm run lint
npm run test:run
```

To reproduce a red check, run the failing step's command from `ci.yml`: `integration` is
`npm run test:all` and the security advisor, `build` is `npm run build` and the smoke check
of the served build.

---

## Map tiles on R2

**Deploys read the tiles from Cloudflare R2**, since a Vercel build has no
`public/*.pmtiles`. Development keeps the local file. The bucket, set up once in the
Cloudflare dashboard (no API token needed):

- **Storage:** an R2 bucket with the Standard storage class. Upload
  `public/gothenburg.pmtiles` under the same name from the bucket's Objects tab. A new
  extract is uploaded the same way, replacing the old one.
- **Public access:** the bucket's *Public Development URL* (`https://pub-<id>.r2.dev`),
  under Settings. Deploys set `NEXT_PUBLIC_PMTILES_URL` to
  `https://pub-<id>.r2.dev/gothenburg.pmtiles`. Cloudflare rate-limits `r2.dev` and
  says it isn't for production, so the full launch moves the tiles to a custom domain
  (Phase 11).
- **CORS policy** (Settings): without it R2's responses carry no
  `Access-Control-Allow-Origin`, so the browser refuses them (the curl check below shows
  the header).

  ```json
  [
    {
      "AllowedOrigins": [
        "http://localhost:3000",
        "https://whereisfood-*-where-is-food.vercel.app",
        "https://vararmaten.vercel.app"
      ],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["range", "if-match"],
      "ExposeHeaders": ["etag"]
    }
  ]
  ```

  - **This is the one description of what the rule admits;** the plan and the issues
    point here. The second origin is written for this project's Vercel preview URLs,
    in the two forms Vercel's "Generated URLs" docs give for Git deployments,
    `<project>-<hash>-<scope-slug>.vercel.app` and
    `<project>-git-<branch>-<scope-slug>.vercel.app`. Here that is the project
    `whereisfood` in the team whose slug (not its display name) is `where-is-food`. The
    third is production's domain (added 2026-11-22, IS #459).
  - What R2 did with `Origin` headers sent to it, against the first two origins only (PR
    #194, 2026-11-02; the rows marked
    *real* are the project's own URLs, from #187 the same day). The match is on the
    whole origin: scheme, hostname and port, anchored at both ends. The `*` matches
    any characters, dots included, or none:

    | Gets `Access-Control-Allow-Origin` | Doesn't |
    |---|---|
    | `https://whereisfood-a0v5zskps-where-is-food.vercel.app` (commit form, *real*) | `https://whereisfood-theta.vercel.app` (the domain Vercel gave production, *real*) |
    | `https://whereisfood-git-phase-6-preview-deploy-where-is-food.vercel.app` (branch form, *real*) | |
    | `https://whereisfood-abc123-where-is-food.vercel.app` (commit form) | `https://whereisfood-where-is-food.vercel.app` (one hyphen, where the pattern has two) |
    | `https://whereisfood-git-phase-6-tiles-r2-where-is-food.vercel.app` (branch form) | `https://whereisfood.vercel.app` |
    | `https://whereisfood--where-is-food.vercel.app` (empty `*`) | `https://evil-where-is-food.vercel.app` |
    | `https://whereisfood-abc123-x-where-is-food.vercel.app` (another team's slug) | `https://a.whereisfood-x-where-is-food.vercel.app` |
    | `https://whereisfood-a.b-where-is-food.vercel.app` | `https://whereisfood-x-where-is-food.vercel.app.evil.com` |
    | | `http://whereisfood-x-where-is-food.vercel.app`, and the same on `:8443` |
    | | `https://example.com` |

  - **Production's addresses** (IS #459, 2026-11-22). An address gets an origin only once it
    is shown to be this project's.
    - `vararmaten.vercel.app`, production's domain (Settings → Domains; renamed from the
      `whereisfood-theta.vercel.app` Vercel assigned, IS #458), has its own origin.
    - `whereisfood-theta.vercel.app` has none: it is set to redirect (307) to
      `vararmaten.vercel.app` (Settings → Domains, IS #458), so no page is meant to load on
      it. Seen once production existed: `307` to `https://vararmaten.vercel.app/` (IS #464,
      2026-11-23).
    - `whereisfood-where-is-food.vercel.app`, the `<project>-<scope-slug>.vercel.app` alias
      Vercel's docs give for CLI deploys, is this project's: Vercel lists it under "Assigned
      Domains" on the production deployment (IS #464, 2026-11-23), Vercel's own record, not
      the page it serves, which anyone could copy. It gets no origin (the owner's call on IS
      #506, replacing round 3 on PR #486's "if it is, an issue of its own gives it an origin"):
      only someone past Vercel's login, today the owner alone, reaches it (without it, it
      answers `302` to `vercel.com/sso-api`), or a request carrying the project's bypass secret
      ("Preview deploys"; with it, `/om` and `/api/live` answered `200` there, `302` without, PR
      #508), and `/karta` shows the map only to the admin at `aal2`. The worst case is `/karta`
      on the alias with no tiles, on an address nobody uses. Any of these brings the question
      back: Vercel Authentication turned off, or set to a mode that leaves production deployment
      URLs public; a Shareable Link or a Deployment Protection Exception (both in the "Hosted
      settings checklist", which points here); or the gate's removal (Phase 11), when `/karta`
      shows the map to anyone who reaches the alias.
      <!-- SOFT-LAUNCH GATE (Phase 10 plan #5): the alias's no-origin call is asked again at the full launch (the removal list in src/app/karta/page.tsx). -->
    - A production deployment's commit-form URL is in the pattern like a preview's, and so is
      its branch form, `whereisfood-git-main-where-is-food.vercel.app` (listed on the
      deployment, IS #464).
    - **`whereisfood.vercel.app` is not this project's** and gets no origin: before any
      production deployment existed it answered `200` with another owner's page, titled
      "今天吃啥呢？".

    Checked in the form of the first `curl` below, with `Range: bytes=0-0`, per `Origin`
    (IS #459, after the rule above was saved): each `206`, with that origin in
    `Access-Control-Allow-Origin` and `etag` exposed for `vararmaten.vercel.app`, `dev`'s
    alias (the pattern) and `localhost:3000`; neither header for
    `whereisfood-where-is-food.vercel.app`, `whereisfood.vercel.app`,
    `whereisfood-theta.vercel.app` and `evil-where-is-food.vercel.app`.
  - **CORS limits which pages can read the tiles, not who downloads them.** A page
    served from any origin the pattern matches can load them, whoever owns it. Any
    request without a browser's CORS check, such as curl, gets the file too (`206`
    for every `Origin` above), costing R2 reads and sharing `r2.dev`'s rate limit. R2
    allows one `*` per origin (its CORS docs, read 2026-10-25), and the hash form
    needs it, so the pattern can't shut out other owners' matching hostnames.
  - Vercel shortens a URL label over 63 characters (its "Generated URLs" docs, without
    saying which part it cuts). A long branch name may then miss the pattern. The
    branch URL `whereisfood-git-<branch>-where-is-food` is at most 63 characters while
    the branch slug is 33 characters or fewer.
  - Here `range` is the only header pmtiles sends (4.5.0, the installed and locked
    version; `package.json` allows `^4.5.0`): `FetchSource.getBytes` adds it to the
    custom headers, and `createBaseMap` (`src/lib/map-setup.ts`) sets none. `if-match`
    is in the rule because `.claude/context/project-context.md`'s R2 note lists it, not
    because the map sends it. After a pmtiles upgrade, check `getBytes` again. A header
    it adds that isn't CORS-safelisted (the Fetch standard's list), and that the rule
    lacks, fails the browser's preflight; to see it with curl, add that header to
    `Access-Control-Request-Headers` in the preflight below.
  - Locally, only `http://localhost:3000` is allowed. `127.0.0.1:3000`, another port
    (a leftover server can push `npm run dev` to `:3001`) or the `Network:` address
    gets no `Access-Control-Allow-Origin`, so the browser refuses the tile responses.

To check the bucket, request the file's first bytes as the map would, and send the
preflight a browser may send first. The plain request checks the origin. The preflight
also checks the method and headers it asks for, here `GET` and `range`, which are what
the map uses; it says nothing about `HEAD` or `if-match`. A plain GET can't show a
wrong `AllowedHeaders`: one with a header the rule lacks still gets
`Access-Control-Allow-Origin`.

```bash
curl -s -o /dev/null -D - -H "Origin: http://localhost:3000" -H "Range: bytes=0-16383" "https://pub-<id>.r2.dev/gothenburg.pmtiles"
curl -s -o /dev/null -D - -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: range" "https://pub-<id>.r2.dev/gothenburg.pmtiles"
```

The first should return `206 Partial Content` with `Access-Control-Allow-Origin`; the
second `204` with `Access-Control-Allow-Headers: range`. To try R2
locally, run `npm run dev` with `NEXT_PUBLIC_PMTILES_URL` set to the R2 URL in the
shell. A shell variable wins over `.env.local`.

---

## Hosted preview database

For the owner: these steps need access to the preview project.

Preview deploys read a hosted Supabase project, not the local stack. It's in its own
free organisation, separate from any later production project, in `eu-north-1`
(Stockholm). It was made in the dashboard with the Data API on and "Automatically
expose new tables" off. In `public`, `anon` and `authenticated` hold one table grant
between them, the migration's `SELECT` on `users` to `authenticated`
(`information_schema.role_table_grants`, #186's PR), as on the local stack. The Data
API's **Max rows** must be at least `MAX_ROWS`; the value read is in
[`src/lib/db/complete.ts`](src/lib/db/complete.ts).

**Keys.** The project uses the newer publishable and secret keys (Project Settings →
API Keys), in the same variable names as the local ones:

| Variable | Hosted value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the project URL, `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key, server only |

They live in Vercel's environment variables and in gitignored files on the owner's
machine, never in a tracked file (`CLAUDE.md`, Secrets). The legacy API keys (`anon` and
`service_role`) are disabled ("Hosted settings checklist", below).

**Auth** (set in #222's PR, 2026-11-07):

| Setting | Value |
|---|---|
| Sign In / Providers → Allow new users to sign up | Off. The Email provider stays on: on the local stack, turning email off (`[auth.email] enable_signup = false`) refused every email login (Phase 7 plan, step 2) |
| URL Configuration → Site URL | `https://whereisfood-git-dev-where-is-food.vercel.app`, `dev`'s branch alias |
| URL Configuration → Redirect URLs | Only `https://whereisfood-git-dev-where-is-food.vercel.app/auth/callback`. No wildcard: an allowed host someone else controls could receive a login code meant for the admin (Phase 7 plan, open decision 4) |

So log in from `dev`'s alias. For a redirect URL that "doesn't match one from the allow
list", Auth uses the Site URL (the dashboard's text for it), and the app's `/` only
redirects to `/om`, so a login started on another preview URL doesn't finish. Checked with
the publishable and secret keys on 2026-11-07: `/auth/v1/settings` gives
`disable_signup: true`, and a link request for an unknown email with
`shouldCreateUser: true` got `422 signup_disabled` and created no auth user.
<!-- SOFT-LAUNCH GATE (Phase 10 plan #5): `/om` to `/karta` at the full launch (the removal list in src/app/karta/page.tsx). -->

**The admin user.** As in "5. Create the admin user", in the project's dashboard
instead of Studio.

**Schema and seed.** With the CLI logged in (`npx supabase login`):

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --include-seed --dry-run   # lists what it would apply
npx supabase db push --include-seed
```

A later migration's push is `RUNBOOK.md`'s "A migration". On the first push, CLI
2.109.1 printed `Warning: failed to cache migrations catalog` (a missing certificate
file) and still applied the migration: `npx supabase migration list --linked` showed
`0001` on both sides.

The first push with `--include-seed` ran the seed, and the CLI recorded its hash. With
`seed.sql` unchanged, a later `--include-seed` dry run listed nothing to seed ("Remote
database is up to date"). With it changed, a push to the local stack
(`npx supabase db push --local --include-seed`) printed `Updating seed hash` and
exited 0 without running the file, which on a seeded database fails on the trucks'
ids (#186's PR). So the hosted seed data is what the first push loaded, and doesn't
move with the date the way the local stack's does after `npx supabase db reset`.

That push ran at 2026-11-02 12:23 Stockholm time. The seed's history is the 28
Stockholm days before that day, and its one live entry, Burgarbilen at Järntorget,
runs from an hour before the push to 12 hours after it. No seed row ends after that
entry, and none is added later. So the longer after the push a check runs, the older
the seed history it finds on the preview, and a check that reads a recent window of
past entries can find no seed rows: that is the seed's age, not a read-path bug. IS #254's
insert (next paragraph) and the "Today's entry" snippet this section carried until IS #259
(its SQL: under "**Today's entry.**" in `git show f62bf9a:README.md`) also wrote rows with
`created_by` null, as the seed does.

Phase 7's walkthrough changed rows by hand once more, on 2026-11-11: IS #254's insert gave
Taco Loco a lunch and a dinner on 2026-11-04 (Phase 7 plan, #38). Its first run wrote
nothing. The insert passes over a truck with a non-cancelled entry on the day it runs or
the day it writes to (#38 has its full rule): Burgarbilen had step 8's entries on
2026-11-11, and Taco Loco had one from 2026-11-04 13:22:59.114694 to 11-05 02:22:59.114694,
Stockholm time, whose window (an hour before to 12 hours after one moment) is the shape
that snippet wrote. The owner cancelled that Taco Loco entry, and the second run wrote the
pair (IS #257).

**An entry for a marker check:** `RUNBOOK.md`, "A marker check on the preview".

---

## Production

For the owner. Set up on 2026-11-22 (IS #458, whose comments hold each step's record and
result). It names no key, project ref, database URL or email address (`CLAUDE.md`, Secrets).

**The project.** `whereisfood-production-project`, in its own free organization
(`whereisfood-production-organization`; both renamed from `vam-…` on 2026-11-22, IS #458's
comment: "whereisfood" for internal names, "vararmaten" for public ones), separate from the
preview's, in `eu-north-1` (Stockholm).
Made in the dashboard with the Data API on, "Grant API access to new tables automatically"
off and "Enable RLS on new tables automatically" off: the migration grants and turns on RLS
per table. Its database password belongs in the owner's password manager and, inside the
session pooler URL, in the gitignored `.env.prod-db.local` ("Variables", below), and in a CLI
link only if one was made with it (`RUNBOOK.md`, "A leaked key"; IS #458's links to production
were made with none given) (`CLAUDE.md`, Secrets): a new password means a new URL there too.

**Schema.** Migrations only, never the seed: production holds real data entered on `/admin`.
The CLI is linked to production only for a push or a check, and linked back to the preview
right after. A failed `link` leaves the CLI where it was, so the relink is checked
(`RUNBOOK.md`, "A restore", step 7's block), and a later migration's push checks the link
before it pushes (`RUNBOOK.md`, "A migration").

The first push applied `0001_baseline.sql` and printed the certificate warning "Hosted preview
database" describes; `migration list --linked` showed `0001` on both sides. The CLI needed
no database password for it (it connects through a temporary login role).

**Settings.** Every Supabase row of the "Hosted settings checklist", below, holds on
production too (the owner's screenshots, read on #458; the Legacy API Keys and JWT Keys
rows', on #460), but URL Configuration: Site URL
`https://vararmaten.vercel.app` and one Redirect URL,
`https://vararmaten.vercel.app/auth/callback`. Data API Max rows was read as 1000, equal to
`MAX_ROWS` (`src/lib/db/complete.ts`), and Network restrictions was read again and left open,
for that row's reason. Phase 5 #19's hosted check passed: `sv-SE-x-icu` on
`trucks.name`, both extensions in `extensions`. The Security Advisor, run `--linked` twice
(RUNBOOK's block, `--type security`, and again with `--type all`, both `--level info
--fail-on error`), found no ERROR or WARN, and only INFO: `rls_enabled_no_policy` on `trucks`
and `locations` (security), and `unindexed_foreign_keys`, as on the preview, and `unused_index`
on the three `locations` indexes, expected while no query has used them (performance, in the
`--type all` run only). Unlike the preview, neither run reported
`auth_leaked_password_protection`, though "Prevent use of leaked passwords" reads Off on
production too (the owner's screenshot); why, wasn't found. A later run the same day, with the
CLI linked the same way, did report it as a WARN, beside the two `rls_enabled_no_policy` INFOs
(IS #460). The checklist's "Prevent use of leaked passwords" row, which holds on production
too, accepts it (Pro only).

**The host.** `vararmaten.vercel.app` is Production's domain in the Vercel project
`whereisfood` (Settings → Domains), renamed from `whereisfood-theta.vercel.app`, which is
set to redirect (307) to it. Log in from it: Auth's Redirect URLs admit no other. R2's CORS rule
admits it ("Map tiles on R2", above). Vercel's Toolbar is off for Production deployments, and
their retention stays 30 days (the "Hosted settings checklist" rows, IS #459).

**The admin.** Made as "5. Create the admin user" says, in production's dashboard, with an
address used for this login alone, never the public removal contact (the Phase 10 plan's open
decision 6). Its id is in the owner's password manager (`RUNBOOK.md`, "A lost phone"). Its
TOTP factor is enrolled through the deployed app (#463).

**Variables.** Production's keys go only into Vercel's Production environment variables, in the
names "Hosted preview database" lists, and its session pooler URL into the gitignored
`.env.prod-db.local` for the weekly dump (`RUNBOOK.md`, "Backups"). Production got its variables in #463, after
the first merge into `main` (the Phase 10 plan, #9). `NEXT_PUBLIC_SUPABASE_URL` is the project URL
alone, `https://<project-ref>.supabase.co`: the Data API page's "API URL" ends in `/rest/v1/`, and
copied whole it made `/api/live` answer 500 on #463's first build. A path in the URL, `http://` for
any host but the local stack's, or whitespace at either end (a trailing space or newline included)
now fails the build (`src/lib/supabase-url.ts`, IS #497).

---

## Hosted settings checklist

For the owner: the security settings #390 checked in the Supabase and Vercel dashboards,
and Vercel's deployment retention (IS #417), which live outside the repo, each with its
value on the preview. The Supabase rows are the preview project's, and so are their dates and
the notes in "Why" (a date a setting was turned on, the preview's admin password): Phase 10
applied them to production's own project on 2026-11-22, with its own Site URL and Redirect URLs
(Phase 9 plan #10; "Production", above, which records production's reading). The Vercel rows are the `whereisfood` project's
(the `Team →` rows, its team's), which its production deploys share, so the project's
retention row already holds for production; the project's other settings (the Ignored
Build Step, the environment variables' scopes) are in "Preview deploys", below. Each row was
read on 2026-11-18 from the owner's screenshots, except the advisor's table (CLI runs,
below) and two probes (the Enforce SSL and AAL1 rows), with the results recorded on IS #390.
The two retention rows were set by the owner on 2026-11-19 and read from their screenshots
that day, recorded on IS #417; the Toolbar's Production value was set and read on 2026-11-22,
and the project's retention row read again that day (IS #459). The Legacy API Keys row is both
Supabase projects', set on 2026-11-22, and the JWT Keys row is production's, set that day (IS
#460). It names settings, never keys
or addresses (`CLAUDE.md`, Secrets).

**Supabase, Authentication:**

| Setting | Value | Why |
|---|---|---|
| Sign In / Providers → Allow new users to sign up | Off | "Auth", above |
| Sign In / Providers → Allow manual linking; Allow anonymous sign-ins | Off; Off | Unused |
| Sign In / Providers → Confirm email | On | Kept as found; locally, `config.toml`'s `enable_confirmations` is false |
| Sign In / Providers → Auth Providers | Email enabled; every other provider disabled, no custom provider | The admin logs in by email alone |
| Email provider → Secure email change | On | Both addresses confirm a change (Phase 9 plan #13) |
| Email provider → Secure password change; Require current password when updating | On; On | `CLAUDE.md`, Supabase. Both rest on the admin having a password: the preview's was set long and random on 2026-11-17 (IS #378) |
| Email provider → Prevent use of leaked passwords | Off | Pro only; the advisor's warning for it is accepted (the advisor's table, below) |
| Email provider → Minimum password length; Password requirements | 6; none | Kept as found (IS #378) |
| Email provider → Email OTP expiration; Email OTP length | 900 s; 10 digits | `CLAUDE.md`, Supabase (IS #386); the same as `config.toml`'s `otp_expiry` and `otp_length` |
| Email provider → Enable magic links and email OTP | On | The login's first factor is the magic link (Phase 9 plan #14). The same switch keeps the emailed code, which Auth accepts though no email shows it (plan #14): the OTP rows above set its odds |
| Emails → Security notifications | Password changed, MFA method added and MFA method removed on; the other four off | `CLAUDE.md`, Supabase (IS #378); the MFA ones, IS #381 |
| Emails → SMTP Settings → Enable custom SMTP | Off | Custom SMTP is planned for the Owners phase (Phase 9 plan #14). Until then every email uses Supabase's default template, which can't be edited without custom SMTP (IS #377), and goes through the built-in sender's budget (Rate Limits: 2 emails an hour), which can be spent so the admin's link doesn't come: accepted until then (`CLAUDE.md`, Supabase; the Phase 10 plan's open decision 6, IS #458; what to do: `RUNBOOK.md`, "A login link that doesn't come") |
| Multi-Factor → TOTP (App Authenticator); Maximum number of per-user MFA factors | Enabled; 1 | IS #381 |
| Multi-Factor → Phone | Disabled | Pro only, and unused |
| Multi-Factor → Limit duration of AAL1 sessions | On | Found on, 2026-11-18, and kept, but not relied on: on the preview, an enrolled admin's `aal1` session still reached the code page at a reload at least 17 minutes after its sign-in (sign-in at 20:12, reload at 20:30, read off a clock in whole minutes; IS #390's probe comment), though the dashboard says such a session "will be terminated unless they verify one of their factors within 15 minutes" |
| Sessions → Access token expiry time | 3600 s | A token's life, which bounds how far a clock skew moves the session time-box (`admin-auth.ts`); the same as `config.toml`'s `jwt_expiry` |
| Sessions → Detect and revoke potentially compromised refresh tokens; Refresh token reuse interval | On; 10 s | Kept as found |
| Sessions → Enforce single session per user; Time-box user sessions; Inactivity timeout | Off; 0; 0 | Pro only. The app's 12-hour box stands in for the time-box until Phase 11 (`CLAUDE.md`, "The session time-box"). Nothing in the app limits how many sessions run at once; a logout ends them all, within the limits `CLAUDE.md`'s "Logout ends every session" names |
| Rate Limits | Emails 2/h, SMS 30/h, token refreshes 150/5 min, token verifications 30/5 min, anonymous sign-ins 30/h, sign-ups and sign-ins 30/5 min, Web3 30/5 min, minimum interval per user 60 s | Kept, IS #386. The dashboard says the 60 s "only applies when Custom SMTP is configured" |
| Rate Limits → Enable IP address forwarding | Off | Kept, IS #386 |
| Attack Protection → CAPTCHA | Off | Decided against in IS #386 |
| URL Configuration → Site URL; Redirect URLs | `dev`'s alias; its `/auth/callback` alone | "Auth", above |
| Audit Logs → Write audit logs to the database | On | Turned on 2026-11-18 (IS #389); the Phase 9 plan's open decision 7 has what the rows hold; `supabase/manual/retention.sql`'s weekly run deletes those older than 30 days (Phase 10 plan, open decision 3) |

**Supabase, the database and services:**

| Setting | Value | Why |
|---|---|---|
| Database → Settings → Enforce SSL on incoming connections | On | Turned on by the owner, 2026-11-18, which restarted the database. It covers Postgres and the poolers; Supabase's HTTP APIs, which the app uses, always enforce SSL (Supabase's docs, SSL Enforcement). After the restart the preview's `/api/live` answered 200 from a fresh read |
| Database → Settings → Connection logging: Log connections; Log disconnections | Off; off | Kept as found |
| Database → Settings → Network restrictions | None: every IP allowed | They cover Postgres and the pooler, not the HTTPS APIs the app uses: they "don't apply to HTTPS APIs such as PostgREST, Storage, and Auth" (Supabase's docs, Network Restrictions). A list of the owner's IPs would lock out the linked CLI whenever that IP changes. Read again for production and kept, for the same reason (the owner, 2026-11-22, IS #458) |
| Project Settings → API Keys → Legacy API Keys (`anon`, `service_role`) | Disabled | Disabled by the owner on the preview and production, 2026-11-22 (IS #460): the app uses the publishable and secret keys ("Keys", above), and the legacy `service_role` key bypasses RLS. They stay valid until disabled (`RUNBOOK.md`, "A leaked key"). Afterwards, on the preview: `/api/live` answered 200 from a fresh read; `/auth/v1/settings` 200 to the publishable key; Auth's `GET /auth/v1/admin/users?per_page=1` 200 to the secret key as `apikey` alone, as RUNBOOK's admin-API blocks send it; and `migration list --linked`, `db push --dry-run --linked` and `db advisors --linked` each exited 0 |
| Project Settings → JWT Keys | Production: an ECC (P-256) signing key in use; the legacy JWT secret (HS256) revoked. The preview: not read | Production's secret was revoked by the owner on 2026-11-22 (IS #460): it could sign tokens Auth accepted, and the legacy API keys it signed were already off. Afterwards production's `/auth/v1/.well-known/jwks.json` listed only the ECC key, `/auth/v1/settings` answered 200 to the publishable key, and a data API read of `trucks` with it got anon's `42501` |
| Integrations → Data API | On; "Automatically expose new tables" off; extra search path `public`, `extensions`; Max rows 1000 | "Hosted preview database", above |
| Realtime → Settings → Enable Realtime service | Off | Turned off by the owner, 2026-11-18: the app doesn't use Realtime, and public channels were open to anyone with the publishable key |
| Database → Extensions → `pg_graphql` | Not installed | GraphQL is unused |
| Storage | No buckets | Unused |

**The hosted Security Advisor.** `npx supabase db advisors --linked --type all --level info
--fail-on error` (CLI 2.109.1; run without `--fail-on` on 2026-11-18, before and after
Enforce SSL went on, the same five each time). It reads whichever project the CLI is linked
to, so check that first, as `RUNBOOK.md`'s blocks do:
`grep -qxF '<preview project ref>' supabase/.temp/project-ref`. Run it `--linked`, not by a
database URL: on the preview, with a scratch table with RLS off and an anon grant in
`public`, `--linked` reported ERROR `rls_disabled_in_public` on it, while runs by the session
pooler's URL, with or without `options=-c pgrst.db_schemas=…`, missed it and didn't report
the Auth lint below.
`--fail-on error` makes an ERROR exit 1: it did with that table and exited 0 without it;
without the flag each of those runs exited 0 (IS #474, the table dropped after). The
findings, re-read `--linked` on 2026-11-20, the same five:

| Finding | Settled |
|---|---|
| WARN `auth_leaked_password_protection` | Accepted: Pro only, and the admin's password is long and random (IS #378) |
| INFO `rls_enabled_no_policy` on `public.trucks` and `public.locations` | By design: anon and authenticated hold no grant on them (`role_table_grants` on the preview, 2026-11-18: only `authenticated`'s `SELECT` on `users`); for anon it is `CLAUDE.md`'s rule (Supabase) |
| INFO `unindexed_foreign_keys`: `locations_created_by_fkey`, `users_truck_id_fkey` | Accepted on tables this small; production's `--type all` run reported it too ("Production", above). Not scheduled to be read again: RUNBOOK's runs are `--type security`, which doesn't report this performance lint |

**Vercel** (project `whereisfood`):

| Setting | Value | Why |
|---|---|---|
| Deployment Protection → Vercel Authentication | On, Standard Protection | Standard Protection leaves the production domain public ("Preview deploys", below). Turning it off, or to a mode that leaves production deployment URLs public, reopens the `whereisfood-where-is-food.vercel.app` alias's CORS call ("Map tiles on R2", IS #506) |
| Deployment Protection → Protection Bypass for Automation | One secret, the system variable | "Preview deploys", below; the value stays out of the repo |
| Deployment Protection → Shareable Links; Deployment Protection Exceptions | None; none | A link or an exception would open a deployment without a Vercel login, and reopens the `whereisfood-where-is-food.vercel.app` alias's CORS call ("Map tiles on R2", IS #506) |
| Deployment Protection → OPTIONS Allowlist; Protected Sourcemaps | Off; On | Kept as found |
| Deployment Protection → Password Protection; Trusted IPs | Off; off | Not on Hobby: Password Protection is Pro, Trusted IPs Enterprise |
| Deployment Protection → Trusted Sources | This project: all its tokens reach their own environment, and its `development` tokens reach `preview` | Kept as found |
| Team → Deployment Protection → Default Protection for New Projects; Who Can Change Protection | Vercel Authentication, Standard Protection; neither box ticked | Kept as found |
| Team → Deployment Protection → Access Request Permissions | Anyone | Kept as found |
| Settings → Security → Git Fork Protection | Enabled | "Preview deploys", below |
| Team → Build and Deployment → Deployment Retention Policy | Canceled 1 day; Errored 1 day; Pre-Production 1 week; Production 30 days; "Apply this policy to all existing projects" ticked | Set by the owner, 2026-11-19 (IS #417). A project's own policy replaces the team's (Vercel's Deployment Retention docs), so the next row is the one that holds for `whereisfood` |
| Settings → Build and Deployment → Deployment Retention Policy | The same four values, on the project's page after the team's save | Margin under the team's 10 GB of Deployment Storage on Hobby (3.06 GB on 2026-11-19), over which deploys can be blocked and deployments deleted; Hobby's Alerts and Spend Management aren't offered (IS #389), and the docs' "Usage limit reached" notice covers Fair Use limits, which don't list it. The owner accepted (2026-11-19) that `dev`'s preview isn't shown to be exempt: after a week with no push to `dev` it can be deleted and the preview's login fail, until it is restored or `dev` is pushed. Production stays at 30 days, the Phase 10 plan's open decision 14 (the owner, 2026-11-22, IS #459): production deploys rarely (the ways the docs plan for: a merge into `main`, and a Redeploy in `RUNBOOK.md`'s "A leaked key" and "A restore"; the Ignored Build Step row in "Preview deploys", below, names promotion and a CLI deploy too, neither planned), and Hobby keeps the last 3 Ready production deployments and the one holding the production alias whatever the policy, so the value deletes almost nothing. What counts, the exceptions, the costs and the recovery: IS #417's comment of 2026-11-19 |
| Settings → General → Vercel Toolbar → Pre-Production Deployments; Production Deployments | Off; Off | Pre-Production: the CSP refused its script, styles and iframe (`CLAUDE.md`, Security headers; IS #387). Production: set Off by the owner on 2026-11-22 (IS #459; the owner's call, round 3 on PR #447), for the same CSP; until then it was Default, the team's setting, on for team members with the Chrome extension or the toolbar menu's opt-in. Vercel applies it from the next deployment (its message on saving, in the owner's screenshot on IS #459); no production deployment existed before the change |

---

## Preview deploys

For the owner: Vercel project `whereisfood` in the team whose slug is `where-is-food`
(Hobby), imported from this repo. A push to a branch other than `main` builds a
preview, except a `dependabot/` or `probe/` branch, which the Ignored Build Step
cancels. Only `dev`'s build gets the secret key; another branch's build, with today's
code, fails without it (both below). One push built as Production instead (the mislabelled first deployment,
below). Production builds from `main`, which was
created at `dev`'s commit and served nothing until IS #463's release (PR #494): its first build,
from the first merge (IS #461), failed without variables, as the Phase 10 plan's #9 expected.

**Project settings** (set in #187, 2026-11-02):

| Setting | Value |
|---|---|
| Production branch (Settings → Environments → Production) | `main`. Vercel accepts only a branch that exists, so `main` was created at `dev`'s commit. The repo's default branch stays `dev` |
| Function region (Settings → Functions) | Stockholm, `arn1`, beside the database. Hobby allows one region |
| Deployment Protection | Vercel Authentication on, "Standard Protection": without a Vercel login, `/map` and `/api/live` answer `302` to `vercel.com/sso-api` (#187's PR). A Protection Bypass for Automation secret lets a script through (below) |
| Git Fork Protection (Settings → Security) | Enabled (read 2026-11-02): a pull request from a fork deploys only after a team member authorizes it. Keep it on: the repo is public, and a build runs a branch's code (its `package.json` scripts, `next.config.ts`, route modules, dependencies) with the Preview variables, the secret key among them. It covers forks only: a branch pushed to this repo builds without approval, but only `dev`'s build gets the secret key ("Environment variables", below), and a `dependabot/` or `probe/` branch is cancelled (next row) |
| Ignored Build Step (Settings → Build and Deployment) | Custom, the command below the table, saved inline in Vercel's settings, never as a script in the repo, which a branch could rewrite (Phase 8 plan #15). A branch's `vercel.json` can still override it ("A branch's `vercel.json`", below). Exit 0 cancels the build, exit 1 continues (Vercel's docs, "Project settings"). It cancels any build of a branch named `dependabot/…` or `probe/…` (Phase 8 plan #15: Dependabot's branches, and the probe PRs' deliberate breaks), and a Production build from any branch but `main` (added after the mislabelled first deployment below). See "The Ignored Build Step's checks" below for what has been seen. It runs when a build starts, so promoting an existing preview to Production doesn't pass through it; a CLI deploy wasn't tried |
| Build command, install command | Next.js's defaults, no override |

The Ignored Build Step's command (set 2026-11-13, IS #284; before it, only the
Production term, set in #187):

```sh
case "$VERCEL_GIT_COMMIT_REF" in dependabot/*|probe/*) exit 0;; esac; if [ "$VERCEL_ENV" = "production" ] && [ "$VERCEL_GIT_COMMIT_REF" != "main" ]; then exit 0; fi; exit 1
```

**A branch's `vercel.json`.** An `ignoreCommand` in it "overrides the Ignored Build Step in
Project Settings" (Vercel's docs, `vercel.json` reference). Probed in PR #311: a throwaway
branch, one commit off `dev` adding only `vercel.json` with `"ignoreCommand": "exit 0"`, got
"Canceled by Ignored Build Step", though the inline command lets that branch build. It wasn't
named `probe/…`, since the inline command would cancel a `probe/` branch whether or not the
override worked; it carried no break, so had the override failed it would have built `dev`'s
code as any preview did then. The other way, `probe/ignorecommand-exit1`, adding only
`vercel.json` with `"ignoreCommand": "exit 1"`, built ("Deployment has completed"), though the
inline command cancels every `probe/` branch: `dev`'s code, no break, with the Preview
variables (the secret key was then scoped to every branch). So an `ignoreCommand` of
`exit 1` on a branch, or on `dev`, which branches inherit, lets a `dependabot/` or `probe/`
branch build. The repo has no `vercel.json`. **What keeps the secret key out of such a
build** is its scope, not the command: since 2026-11-13 it is set for `dev` alone
("Environment variables", below), in Vercel's project settings, not in the repo. A branch
that escapes the cancel still runs its install scripts and build, with the three public
variables only; with today's code its build fails without the key (seen, "The Ignored Build
Step's checks"). A Production build from another branch through an override: not tried (Phase 10,
below).

**The Ignored Build Step's checks** (IS #284's PR has the runs):
- Run locally under Git Bash's `sh` (bash 5.2 in POSIX mode, not the shell Vercel runs):
  Production on `main` → 1, Production on `dev` → 0, a Preview of `dependabot/x` → 0, of
  `probe/x` → 0, of `phase-8/x` → 1; Production on `dependabot/x` and on `probe/x` → 0.
  With each cancel term removed in turn, its case gave 1.
- Seen on Vercel: `probe/ignore-check` and `dependabot/ignore-check`, each one empty
  commit off `dev`, got the commit status "Canceled by Ignored Build Step" (2026-11-13).
  The owner didn't find either in the Deployments list (filters not checked); the
  commit's statuses list it (`gh api --paginate repos/{owner}/{repo}/commits/<sha>/statuses`,
  each status with its time, newest first; the combined `/status` shows only the latest per context, so it
  can show another branch's build of the same commit). Pushed first at `dev`'s own commit,
  the same branches got no new status (that commit's `/statuses` holds only `dev`'s own
  pair, from 2026-11-12), so the check used new commits. Why the first push got none
  wasn't tested: the commit already built, or a push with no new commit.
- Seen on a branch Dependabot made: PR #366's `dependabot/github_actions/actions-2f4c4b3894`
  read "Canceled by Ignored Build Step" in its commit's statuses (2026-11-16, Phase 8 plan
  step 15).
- A preview of any other branch passes the command: IS #284's PR's own preview built, before
  the secret key was scoped to `dev`, and Vercel logs the command before the build (#187's
  PR).
- The secret key's `dev` scope: `phase-8/secret-scope-check`, one empty commit off `dev`,
  passed the command, then failed in `next build` with `Missing env:
  SUPABASE_SERVICE_ROLE_KEY` at `src/lib/supabase.ts:16` (2026-11-13, its build log); its
  install scripts had run. A Redeploy of `dev`'s preview (no build cache) was "Ready" after
  it, and its screenshot showed `/map`'s "Inga foodtrucks idag", which needs `/api/live` to
  have answered (the owner, 2026-11-13).
- Read again before production (IS #459, 2026-11-22): Behavior "Custom", and the field's
  command, copied out by the owner, identical to the one above as a string (172
  characters); `git ls-tree -r --name-only` of `origin/dev` and `origin/main`, filtered by
  `grep -iE '(^|/)(vercel|now)\.|(^|/)\.vercel/'` (any `vercel.…` or legacy `now.…` file, and a
  `.vercel/` folder), lists only `public/vercel.svg`, an image. Which file names Vercel reads
  as project config wasn't looked up, so the check is that wide match, not a list of names.
- Not seen: the cancel of a Production build from a branch other than `main`.

**Environment variables**, all four of `.env.example`'s, scoped to **Preview** (none in Development;
Production's own, each scoped to Production with the secret key typed Secret, are IS #463's record
and "Production", above), the secret key to `dev`'s previews alone:

| Variable | Vercel type | Scope | Value |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | Preview | the hosted preview project's URL alone, `https://<project-ref>.supabase.co` ("Production", "Variables", says why) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | Preview | its publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Preview, branch `dev` (set 2026-11-13, PR #311: a branch's `vercel.json` can override the Ignored Build Step, above) | its secret key |
| `NEXT_PUBLIC_PMTILES_URL` | Config | Preview | the R2 file's URL |

A variable change applies to the next deployment, not to built ones. The project's
first deployment, from `phase-6/preview-deploy`, was labelled Production although
the production branch was already `main`, so it got no variables and failed with
`Missing env: NEXT_PUBLIC_SUPABASE_URL`; the next push to the branch built as a
Preview (#187's PR). Why Vercel labelled it Production wasn't found.

**Production had no variables until Phase 10.** "Standard Protection" is, in Vercel's API,
`prod_deployment_urls_and_all_previews` (its docs, "Vercel Authentication"): the production domain
isn't in it and stays public. That mislabelled branch build failed instead of serving on
`whereisfood-theta.vercel.app` only because Production had no variables then and
`src/lib/supabase.ts` throws at import without them; with Production's variables set, the Ignored
Build Step is set to cancel such a build, though its cancel of a Production build from another
branch hasn't been seen ("The Ignored Build Step's checks"), and a branch's `vercel.json` can
override it. Phase 10 gave Production its variables after checking that it was still set and that no
`vercel.json` overrode it ("A branch's `vercel.json`", above; IS #463), and a branch preview is
never promoted to Production (`project-context.md`, "Pre-deploy automation").

**Checking the CDN cache.** With protection on, a request without a login gets
Vercel's login redirect, not the route. The bypass secret is made under Settings →
Deployment Protection → Protection Bypass for Automation (Vercel generates it; it is
shown again there) and kept in the owner's gitignored `.env.preview.local` as
`PREVIEW_BYPASS_TOKEN`. Load it into the shell's environment, send it as a header and
print only the response headers. A curl with the variable unset sends an empty header
and gets the `302`, with no `x-vercel-cache`:

```bash
curl -s -o /dev/null -D - "https://<preview-host>/api/live" -H "x-vercel-protection-bypass: $PREVIEW_BYPASS_TOKEN"
```

`x-vercel-cache` goes `MISS`, then `HIT` within 60 s, then `STALE` between 60 and 120
s, and the `cache-control` the client sees is only `public` (Vercel strips
`s-maxage` and `stale-while-revalidate`). In #187's check every request carried the
header and they were cached among themselves; whether they share an entry with a
logged-in browser's requests wasn't checked.
