# Väm (Var är maten) — Gothenburg Food Truck Map

A web map showing where Gothenburg's food trucks are **today**.

Hungry people open the map (no login, no tracking) and see which trucks are out,
where, and until when. At launch every location is entered by hand by one admin, who
follows each truck on Instagram with post and Story notifications on, and updates the
map from a phone-first admin screen. Truck owners get to claim their listing and post
themselves later.

It fills a real gap: Gothenburg has had no central food-truck map since Streetkäk
shut down in 2017.

> **Status: Phase 9 of 11 (security) done; Phase 10 (launch) next.** The map shows
> today's entries from the database through `GET /api/live`, locally against a local
> Supabase and on protected Vercel previews against a hosted one. One admin logs in with
> an emailed link and a code from an authenticator app, and keeps the map up to date from
> a phone-first admin screen. Every pull request into `dev` or `main` runs the checks in
> GitHub Actions, which must pass before it merges. There is no production deploy yet.
> Phase 4 removed the old design (automatic ingestion from Make.com and email, plus a
> Swedish text parser), and Phase 5 replaced its database schema; see
> [Project status](#project-status).

---

<img width="1354" height="850" alt="image" src="https://github.com/user-attachments/assets/7d91fa96-509e-49a0-b867-821d1f7079b5" />


## Tech stack

| Concern    | Choice |
|------------|--------|
| Framework  | Next.js 16 (App Router), React 19, TypeScript |
| Styling    | Tailwind CSS v4 |
| Map        | MapLibre GL JS 6 + Protomaps PMTiles (a local file in development, Cloudflare R2 for deploys) |
| Database   | Supabase Postgres |
| Auth       | Supabase Auth (the admin only at launch) |
| Time       | Store UTC, display `Europe/Stockholm` through `src/lib/stockholm.ts` (`Intl`) |
| Testing    | Vitest 4 (unit, plus integration tests against a local Supabase) |
| Deployment | Vercel |

Consumers are always anonymous. All user-facing text is in Swedish.

---

## How it's designed to work

This is the design. Phases 5 to 9 built the schema, the public read path (the map, its
polling and cache, the popup's freshness text), the admin screen with its entry flow,
CI/CD, and security (the admin's second factor, session limits, security headers); the
first production deploy is Phase 10's, as a soft launch with the map shown only to the
admin, and the full launch Phase 11's.

- **The admin enters every location by hand.** A pin comes from a map tap, a known
  Gothenburg spot, a recently used place, or the phone's GPS. Start and end times are
  pre-filled and always required. A morning checklist suggests what each truck did
  on the same weekday recently. Nothing reaches the map until the admin confirms it.
- **Overlaps are refused, not resolved.** A database constraint rejects a second
  entry for the same truck in an overlapping time window, and the admin edits the
  existing one instead. Nothing is replaced or deleted automatically.
- **Nothing is deleted.** Cancelling an entry marks it cancelled, and an ended entry
  simply stops matching the "today" filter. The only real delete is a takedown on a
  truck's request.
- **One public read path.** The map polls `GET /api/live` every 60 seconds. It's an
  ordinary route that Vercel's CDN caches for 60 seconds, so normal polling costs the
  database about one query a minute per region, however many people have the map
  open. (A request with a made-up query string skips the cache and costs one small
  query; that's accepted.) The browser never talks to the database, so no one can
  pull a truck's location history.
- **Honest freshness.** Only trucks with an entry today appear. The popup says when
  the entry was last updated and links to the truck's Instagram so people can check.

---

## Architecture

Strict layering. Never mix layers:

```
app/api/*/route.ts   → HTTP only, no business logic
src/lib/services/    → all business logic, no HTTP knowledge
src/lib/db/          → database access only
src/lib/validators/  → input validation
```

Route handlers call services. Services call the DB layer.

The working rules live in [`CLAUDE.md`](CLAUDE.md) and the design reference in
[`.claude/context/project-context.md`](.claude/context/project-context.md).

---

## Project status

| Phase | Scope | Status |
|-------|-------|--------|
| 1 · Foundation       | Map renders (MapLibre + a local PMTiles file) with fake data | ✅ Done |
| 2 · Ingestion        | Email and webhook endpoints, Supabase schema and seed | ✅ Done; endpoints removed in Phase 4, schema replaced in Phase 5 |
| 3 · Parser           | Swedish text parser for social-media captions | Stopped and removed in Phase 4 |
| 4 · Housekeeping     | Remove the old design, upgrade dependencies, rewrite the docs | ✅ Done |
| 5 · Schema reset     | A fresh 3-table schema (`trucks`, `locations`, `users`) | ✅ Done |
| 6 · Live read path   | `/api/live`, polling, map tiles on Cloudflare R2, first preview deploy | ✅ Done |
| 7 · Admin            | Admin login, location entry, truck management, the morning checklist | ✅ Done |
| 8 · CI/CD            | The checks in GitHub Actions, secret scanning, CodeQL, Dependabot, branch protection | ✅ Done |
| 9 · Security         | Admin MFA, session limits, security headers, the 2FA audit; the free plans' alerts and logs read (no usage, spend or 5xx alert can be set on them) | ✅ Done |
| 10 · Launch          | Production deploy, a soft launch: the map shown only to the admin, an about page for everyone else | ⬜ Next |
| 11 · Full launch     | The map public, a custom domain for the tiles, paid plans | ⬜ Not started |

Phases 2 and 3 built automatic ingestion: Make.com webhooks and Mailgun email, run
through a Swedish parser that turned captions into locations. It was dropped for the
admin-populated design above. The code is archived on the `archive/parser-lanes`
branch and tag.

### What works today

- The map renders in the browser, centred on Gothenburg, with Swedish place names:
  from a local tile file in dev, from Cloudflare R2 on a preview.
- One marker per truck with an entry today, filled while it is open and outlined when
  it opens later today, from `GET /api/live` (cached by Vercel's CDN for 60 s, checked
  on a preview, "Preview deploys"). The map polls every 60 s while the tab is visible
  and changes only the markers that changed. A popup shows the truck, its place,
  whether it is open, its hours, when the entry was last updated, and its Instagram
  link. If a poll fails the markers stay and the map says it couldn't update.
- The new design's Supabase schema, in one migration
  ([`supabase/migrations/0001_baseline.sql`](supabase/migrations/0001_baseline.sql)):
  `trucks`, `locations` and `users`. The database refuses overlapping entries for a
  truck, entries are cancelled rather than deleted, and the public API roles (`anon`
  and `authenticated`) get no access to `trucks` or `locations`: only the server-side
  database layer reads them, with the `service_role` key. The dev seed has
  three trucks and four weeks of location history relative to the day it is loaded.
- **The admin screen** (`/admin`, Swedish, phone-first). The admin logs in with an
  emailed link and then a code from an authenticator app (TOTP, set up the first time;
  public sign-ups are off), then sees the morning checklist (what each truck did on this
  weekday recently, to confirm with ✓ or skip with ✗), a form to enter a location by known
  spot, recent place, map tap or GPS, and the list of entries from today for two weeks,
  each with "Stämmer fortfarande", "Ställ in" and "Ändra" until it ends. The app refuses a
  session 12 hours after its sign-in, and logging out on one device logs out the others.
  `/admin/trucks` adds and edits trucks and sets them inactive. Overlapping entries are
  refused with a message naming the other entry's times.
- The admin is checked twice: in `src/proxy.ts`, and again in every admin API route
  (`/api/admin/…`), which only an admin's session that has passed the second factor
  reaches.
- Security headers on every page, with a stricter content security policy on the admin
  pages, and Swedish "page not found" and error pages.
- The database layer (`src/lib/db/`), which the live read path and the admin use.
- Unit tests, and integration tests against a local Supabase for the schema (its
  constraints, grants and row-level security), the database layer, `/api/live`, the
  login routes and every admin route.
- **CI.** On every pull request into `dev` or `main`, GitHub Actions runs the four gates,
  `npm audit`, the schema controls, the process log's check, a secret scan and CodeQL,
  and the branches' rules require them, with no bypass (CodeQL's on `dev` only until Phase
  10; "Scripts"). Dependabot opens pull
  requests for GitHub Actions updates and npm security fixes.

### What does not exist yet

- A production deploy (Phase 10). A push to a branch other than `main` starts a preview
  build, except on `dependabot/` and `probe/` branches; only `dev`'s gets the secret key, so
  another branch's build fails with today's code (see "Preview deploys")

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
- **The `pmtiles` CLI**, to cut the map tiles (next section). It's a single binary
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
command fetches only the tiles inside the box. `--maxzoom=14` matches the file deploys
use (below): it was cut that way and is 11.6 MB (its header says `maxzoom` 14).
Without the flag the file is larger, with more street-level detail.

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
        "https://whereisfood-*-where-is-food.vercel.app"
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
    `whereisfood` in the team whose slug (not its display name) is `where-is-food`.
  - What R2 did with `Origin` headers sent to it (PR #194, 2026-11-02; the rows marked
    *real* are the project's own URLs, from #187 the same day). The match is on the
    whole origin: scheme, hostname and port, anchored at both ends. The `*` matches
    any characters, dots included, or none:

    | Gets `Access-Control-Allow-Origin` | Doesn't |
    |---|---|
    | `https://whereisfood-a0v5zskps-where-is-food.vercel.app` (commit form, *real*) | `https://whereisfood-theta.vercel.app` (the domain Vercel gave production, *real*; a 307 to `vararmaten.vercel.app` since IS #458) |
    | `https://whereisfood-git-phase-6-preview-deploy-where-is-food.vercel.app` (branch form, *real*) | |
    | `https://whereisfood-abc123-where-is-food.vercel.app` (commit form) | `https://whereisfood-where-is-food.vercel.app` (one hyphen, where the pattern has two) |
    | `https://whereisfood-git-phase-6-tiles-r2-where-is-food.vercel.app` (branch form) | `https://whereisfood.vercel.app` |
    | `https://whereisfood--where-is-food.vercel.app` (empty `*`) | `https://evil-where-is-food.vercel.app` |
    | `https://whereisfood-abc123-x-where-is-food.vercel.app` (another team's slug) | `https://a.whereisfood-x-where-is-food.vercel.app` |
    | `https://whereisfood-a.b-where-is-food.vercel.app` | `https://whereisfood-x-where-is-food.vercel.app.evil.com` |
    | | `http://whereisfood-x-where-is-food.vercel.app`, and the same on `:8443` |
    | | `https://example.com` |

  - **Production's short addresses aren't covered.** Vercel's docs give
    `<project>-<scope-slug>.vercel.app` for CLI deploys and say it points to the
    production deployment once there is one. That URL, `whereisfood.vercel.app`,
    production's domain `vararmaten.vercel.app` (Settings → Domains; renamed from the
    `whereisfood-theta.vercel.app` Vercel assigned, which now answers a 307 to it, IS #458)
    and `whereisfood-theta.vercel.app` itself get no header, so each needs its own origin in
    the rule, or a redirect to an address that has one (Phase 10, #459). A production deployment's
    commit-form URL is in the pattern like a preview's.
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
the six-digit code the app shows. Every later login asks for the code only. A QR code left
unused is replaced by a new one the next time the page opens. The factor is deleted with
the user, so after a `npx supabase db reset` the next login enrolls again; delete the
app's old entry then.

**Enroll from a computer if you can**, scanning its screen with the phone. With the phone
alone (the key copied into the app, or a screenshot of the QR scanned there), a browser that
reloads the tab while you are in the app shows a new key, and the entry you just added then
gives wrong codes: add the newest key and delete the old entry, or enroll from a computer.
A limit until #406, which explores phone-friendly enrollment (the owner, 2026-11-17).

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
machine, never in a tracked file (`CLAUDE.md`, Secrets).

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

Later migrations go up with plain `npx supabase db push`. On the first push, CLI
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

**An entry for a marker check.** Before checking a preview's markers, add one on `/admin`,
logged in from `dev`'s alias: fill in the "Ny post" form with an active truck that has no
entry today, a known spot and times that cover now, and press "Spara". It goes through the
API like any admin entry, so an overlap is refused with the form's message. The map shows
it within about 3 minutes, and drops it within about 3 after a cancel (`/api/live`'s cache,
`project-context.md`, "Read path"). Cancel it with "Ställ in" as soon as the check is done,
before it ends: from its end the list shows no "Ställ in" and the route refuses a cancel
(Phase 9 plan #8, IS #380). Until it's cancelled, even after it ends, it refuses the truck's
overlapping entries, drops any of the truck's checklist suggestions that overlap it, and
makes a by-hand insert like IS #254's pass over the truck (#38's rule, above). For up to 4
weeks, it can also take the place of the truck's real suggestions on that weekday
(`getChecklist`). Once it's cancelled, it does none of these: cancelled rows aren't read.
After its end, cancel it in the SQL Editor: find its id with

```sql
select id, starts_at, ends_at from locations
where truck_id = '<truck id>' and cancelled_at is null
order by starts_at desc limit 5;
```

then run
`update locations set cancelled_at = now() where id = '<id>' and cancelled_at is null;`.
Its row stays in the preview's history.

---

## Production

For the owner. Set up on 2026-11-22 (IS #458, whose comments hold each step's record and
result). It names no key, project ref, database URL or email address (`CLAUDE.md`, Secrets).

**The project.** `vam-production-project`, in its own free organization
(`vam-production-organization`), separate from the preview's, in `eu-north-1` (Stockholm).
Made in the dashboard with the Data API on, "Grant API access to new tables automatically"
off and "Enable RLS on new tables automatically" off: the migration grants and turns on RLS
per table. Its database password belongs in the owner's password manager alone (`CLAUDE.md`,
Secrets).

**Schema.** Migrations only, never the seed: production holds real data entered on `/admin`.
The CLI is linked to production only for a push or a check, and linked back to the preview
right after, so a plain `npx supabase db push` can't reach production by mistake. Use
`RUNBOOK.md`'s guarded blocks, with production's ref: "A restore", step 1 (link, dry run,
push, the advisor) and step 7 (link back to the preview), each of which runs its command only
inside `if … grep -qxF '<ref>' supabase/.temp/project-ref; then`.

The first push applied `0001_baseline.sql` and printed the certificate warning "Hosted preview
database" describes; `migration list --linked` showed `0001` on both sides. The CLI needed
no database password for it (it connects through a temporary login role).

**Settings.** Every Supabase row of the "Hosted settings checklist", below, holds on
production too (the owner's screenshots, read on #458), but URL Configuration: Site URL
`https://vararmaten.vercel.app` and one Redirect URL,
`https://vararmaten.vercel.app/auth/callback`. Data API Max rows was read as 1000, equal to
`MAX_ROWS` (`src/lib/db/complete.ts`), and Network restrictions was read again and left open,
for that row's reason. Phase 5 #19's hosted check passed: `sv-SE-x-icu` on
`trucks.name`, both extensions in `extensions`. The Security Advisor
(`--type all --level info`) found no ERROR or WARN, and only INFO: the preview's
`rls_enabled_no_policy` and `unindexed_foreign_keys` findings, and `unused_index` on the three
`locations` indexes, expected while no query has used them.
Unlike the preview, it didn't report `auth_leaked_password_protection`, though "Prevent use of
leaked passwords" reads Off on production too (the owner's screenshot); why, wasn't found. So
on production that warning, which the advisor table below accepts for the preview, had nothing
to settle.

**The host.** `vararmaten.vercel.app` is Production's domain in the Vercel project
`whereisfood` (Settings → Domains), renamed from `whereisfood-theta.vercel.app`, which now
answers a 307 to it. Log in from it: Auth's Redirect URLs admit no other.

**The admin.** Made as "5. Create the admin user" says, in production's dashboard, with an
address used for this login alone, never the public removal contact (the Phase 10 plan's open
decision 6). Its id is in the owner's password manager (`RUNBOOK.md`, "A lost phone"). Its
TOTP factor is enrolled through the deployed app (#463).

**Variables.** Production's keys go only into Vercel's Production environment variables, in
the names "Hosted preview database" lists, and its session pooler URL into the gitignored
`.env.prod-db.local` for the weekly dump ("Backups"). Production gets no variables until
#463 (the Phase 10 plan, #9).

---

## Hosted settings checklist

For the owner: the security settings #390 checked in the Supabase and Vercel dashboards,
and Vercel's deployment retention (IS #417), which live outside the repo, each with its
value on the preview. Phase 10 applies the list to production (Phase 9 plan #10): its
Supabase rows on 2026-11-22 ("Production", above). The
Supabase rows are the preview project's: production's own project has them too, with its own
Site URL and Redirect URLs ("Production", above). The Vercel rows are the `whereisfood` project's
(the `Team →` rows, its team's), which its production deploys share, so the project's
retention row already holds for production; the project's other settings (the Ignored
Build Step, the environment variables' scopes) are in "Preview deploys", below. Each row was
read on 2026-11-18 from the owner's screenshots, except the advisor's table (CLI runs,
below) and two probes (the Enforce SSL and AAL1 rows), with the results recorded on IS #390.
The two retention rows were set by the owner on 2026-11-19 and read from their screenshots
that day, recorded on IS #417. It names settings, never keys or addresses (`CLAUDE.md`,
Secrets).

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
| INFO `unindexed_foreign_keys`: `locations_created_by_fkey`, `users_truck_id_fkey` | Accepted on tables this small; Phase 10 reads it again with production's data |

**Vercel** (project `whereisfood`):

| Setting | Value | Why |
|---|---|---|
| Deployment Protection → Vercel Authentication | On, Standard Protection | Standard Protection leaves the production domain public ("Preview deploys", below) |
| Deployment Protection → Protection Bypass for Automation | One secret, the system variable | "Preview deploys", below; the value stays out of the repo |
| Deployment Protection → Shareable Links; Deployment Protection Exceptions | None; none | A link or an exception would open a deployment without a Vercel login |
| Deployment Protection → OPTIONS Allowlist; Protected Sourcemaps | Off; On | Kept as found |
| Deployment Protection → Password Protection; Trusted IPs | Off; off | Not on Hobby: Password Protection is Pro, Trusted IPs Enterprise |
| Deployment Protection → Trusted Sources | This project: all its tokens reach their own environment, and its `development` tokens reach `preview` | Kept as found |
| Team → Deployment Protection → Default Protection for New Projects; Who Can Change Protection | Vercel Authentication, Standard Protection; neither box ticked | Kept as found |
| Team → Deployment Protection → Access Request Permissions | Anyone | Kept as found |
| Settings → Security → Git Fork Protection | Enabled | "Preview deploys", below |
| Team → Build and Deployment → Deployment Retention Policy | Canceled 1 day; Errored 1 day; Pre-Production 1 week; Production 30 days; "Apply this policy to all existing projects" ticked | Set by the owner, 2026-11-19 (IS #417). A project's own policy replaces the team's (Vercel's Deployment Retention docs), so the next row is the one that holds for `whereisfood` |
| Settings → Build and Deployment → Deployment Retention Policy | The same four values, on the project's page after the team's save | Margin under the team's 10 GB of Deployment Storage on Hobby (3.06 GB on 2026-11-19), over which deploys can be blocked and deployments deleted; Hobby's Alerts and Spend Management aren't offered (IS #389), and the docs' "Usage limit reached" notice covers Fair Use limits, which don't list it. The owner accepted (2026-11-19) that `dev`'s preview isn't shown to be exempt: after a week with no push to `dev` it can be deleted and the preview's login fail, until it is restored or `dev` is pushed. Production stays at 30 days: no Ready production deployment yet, so Phase 10 decides it. What counts, the exceptions, the costs and the recovery: IS #417's comment of 2026-11-19 |
| Settings → General → Vercel Toolbar → Pre-Production Deployments; Production Deployments | Off; Default (the team's: on) | Pre-Production: the CSP refused its script, styles and iframe (`CLAUDE.md`, Security headers; IS #387). Production: on for team members with the Chrome extension or the toolbar menu's opt-in (the team setting's text); Phase 10 decides it with production's CSP |

---

## Preview deploys

For the owner: Vercel project `whereisfood` in the team whose slug is `where-is-food`
(Hobby), imported from this repo. A push to a branch other than `main` builds a
preview, except a `dependabot/` or `probe/` branch, which the Ignored Build Step
cancels. Only `dev`'s build gets the secret key; another branch's build, with today's
code, fails without it (both below). One push built as Production instead (the mislabelled first deployment,
below). Production builds from `main`, which was
created at `dev`'s commit and built nothing; the next push to `main` is Phase 10's.

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
- Not seen: the cancel of a Production build from a branch other than `main`.

**Environment variables**, all four of `.env.example`'s, scoped to **Preview** only
(none in Production or Development), the secret key to `dev`'s previews alone:

| Variable | Vercel type | Scope | Value |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | Preview | the hosted preview project's URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | Preview | its publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Preview, branch `dev` (set 2026-11-13, PR #311: a branch's `vercel.json` can override the Ignored Build Step, above) | its secret key |
| `NEXT_PUBLIC_PMTILES_URL` | Config | Preview | the R2 file's URL |

A variable change applies to the next deployment, not to built ones. The project's
first deployment, from `phase-6/preview-deploy`, was labelled Production although
the production branch was already `main`, so it got no variables and failed with
`Missing env: NEXT_PUBLIC_SUPABASE_URL`; the next push to the branch built as a
Preview (#187's PR). Why Vercel labelled it Production wasn't found.

**Production keeps no variables until Phase 10.** "Standard Protection" is, in Vercel's
API, `prod_deployment_urls_and_all_previews` (its docs, "Vercel Authentication"): the
production domain isn't in it and stays public. That mislabelled branch build failed
instead of serving on `whereisfood-theta.vercel.app` only because Production has no
variables and `src/lib/supabase.ts` throws at import without them. The Ignored Build
Step above is set to cancel such a build by its branch (what has been seen of it: "The
Ignored Build Step's checks"). Phase 10 adds Production's variables after checking that it
is still set and that no `vercel.json` overrides it ("A branch's `vercel.json`", above), and
doesn't promote a branch preview to Production (Phase 6 plan step 10 carries this to
`project-context.md`).

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

---

## Takedown

A truck that asks to be removed is deleted with its whole history by
[`supabase/manual/takedown.sql`](supabase/manual/takedown.sql), by hand: no app code deletes
(`CLAUDE.md`, "db layer"). It is one statement: the truck's locations deleted, each `users`
row pointing at it cleared (the account stays), then the truck, all or nothing. Its header
says why one statement works under the `NO ACTION` foreign keys.

1. In the project's SQL editor (the dashboard's for a hosted project, Studio's at
   `http://127.0.0.1:54323` locally), find the truck, whose id the admin screen doesn't show.
   Names needn't be unique, so read the rest of the row too:
   `select id, name, instagram_handle, created_at from trucks order by name;`.
2. Paste the file there and replace `TRUCK_ID` with the id and `TRUCK_NAME` with the name
   exactly as that row shows it, keeping the quotes (a quote in the name is doubled). Both
   must match one truck, so an id and a name from different trucks change nothing. Two
   trucks with the same name are told apart only by the id: check it against the row's other
   columns. Left unedited, it fails and changes nothing.
3. Run it, and read its one row. `taken down` gives the truck's name and the counts removed.
   Anything else changed nothing: `no truck with this id` (also a truck already taken down,
   so a second run is safe), `the name does not match this id` (the row shows the name the
   id has; a typo, or `TRUCK_NAME` left in), or an error. A foreign-key error (`23503`) names
   the table still pointing at the truck, which the file then needs to handle before it is
   run again.
4. Add a line to **the takedown log**: the truck's id and the date (UTC), nothing else. It is
   a plain text file kept with the weekly dumps on the owner's machine, never in the repo or
   the database, since a restore replaces the database. A restore from a dump re-runs every
   takedown the log holds, whatever its date (Phase 10 plan, step 8), reading each truck's
   name from step 1's query on the restored database. A logged id that query doesn't list was
   taken down before the dump and needs no run (run anyway, it answers `no truck with this
   id`); `the name does not match this id` means it wasn't taken down: fix the name and run it
   again.

An open map drops the truck within about three minutes while its polls succeed and its tab
is visible (a failed poll keeps the last markers, and a hidden tab doesn't poll): `/api/live`
is cached for 60 s and may be served stale for 60 s more (`CLAUDE.md`, "`/api/live`"), and the map polls it every
60 s (`POLL_MS`, `src/hooks/useLocations.ts`). Until the dumps from before the
takedown age out, they still hold the truck's rows: about four weeks, as four are kept
("Backups" below). During an incident hold, held dumps keep them until the hold ends, at
most 8 weeks after it began, as does the evidence export's copy of `trucks`, which holds the
truck's own row, not its places, if it was taken down after the export (`RUNBOOK.md`,
"Exporting evidence"); after a restore into a new project, the old one keeps them
until it is deleted, at most 8 weeks after the restore. The rows go at the latest of these
dates (`RUNBOOK.md`, "A takedown request").

`tests/integration/takedown.test.ts` runs the file on the local stack, as `postgres`. The
preview's SQL editor runs as `postgres` too (IS #454's probe), but hasn't run this file, and
production's role isn't probed yet (#464). An error in either editor changes nothing, as in
step 3.

---

## Backups

Supabase Free has no backups, so until Pro (Phase 11) the backup is a weekly dump of the
`public` schema's data, made by hand (Phase 10 plan, #11). Never the `auth` schema: its
sessions and refresh tokens are credentials. The dumps live on the owner's machine outside
the repo, next to the takedown log ("Takedown", step 4), and **the newest four are kept**
(open decision 5), so a takedown or a retention delete leaves the backups about four weeks
later; while an incident hold keeps older dumps aside, or after a restore into a new project
while the old one is kept, at the latest of these, each at most 8 weeks (`RUNBOOK.md`, "A
takedown request").

**The connection string** is the production project's **Session pooler** one (dashboard →
Connect → Direct → Session pooler → URI, the password filled in, every character of it other
than a letter, a digit or `-._~` percent-encoded), in the gitignored `.env.prod-db.local` as
`PROD_DB_URL=…` (`CLAUDE.md`, "Where secrets live"). The Direct connection uses IPv6
unless the paid IPv4 add-on is on (the dashboard's note), and from the owner's machine it was
refused; the session pooler worked (the preview, IS #455). The Transaction pooler wasn't
tried.

### The weekly dump

With Docker running (the CLI runs `pg_dump` in a container), from the repo, in Git Bash:

```bash
BACKUPS="<backups folder>"
FILE="$BACKUPS/whereisfood-$(date -u +%Y-%m-%d).sql"
PROD_DB_URL=$(grep '^PROD_DB_URL=' .env.prod-db.local | cut -d= -f2- | tr -d "\r\"'")
rm -f "$BACKUPS"/whereisfood-*.sql.part
if [ -z "$PROD_DB_URL" ]; then
  echo "NO URL: no PROD_DB_URL=<url> line read from .env.prod-db.local; no dump made"
elif npx supabase db dump --db-url "$PROD_DB_URL" --data-only --schema public -f "$FILE.part" \
  && tail -n 1 "$FILE.part" | grep -qx 'RESET ALL;' && mv "$FILE.part" "$FILE"; then
  echo "DUMP OK: now run retention.sql"
  ls -1 "$BACKUPS"/whereisfood-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].sql \
    | sort | head -n -4 | xargs -d '\n' -r rm -- \
    || echo "PRUNE FAILED: the dump is good; delete all but the newest four by hand"
else
  rm -f "$FILE.part"
  echo "DUMP FAILED: nothing kept from this run, old dumps untouched; don't run retention.sql"
fi
unset PROD_DB_URL
```

- The line in `.env.prod-db.local` is exactly `PROD_DB_URL=<url>`: no spaces around the `=` and
  no comment after it. The read drops double and single quotes and Windows line endings. With
  no such line (the file missing or misnamed, a byte-order mark before the line), the block
  stops at `NO URL`: given an empty URL, the CLI would try a database on `localhost`.
- A complete dump ends with the CLI's `RESET ALL;`. A failed one exits non-zero and leaves a
  short file without it: an unreachable database left 41 bytes (IS #455). The dump is written
  to `<name>.part`, which the deletion doesn't match. It takes the dated name only after that
  check passes, and a failed run's `.part` is removed. So a failed run never counts as one of
  the four, and never replaces a good dump of the same day. Each run first removes every
  `.part` an interrupted run left, whatever its date.
- The deletion keeps the newest four dated dumps (`whereisfood-YYYY-MM-DD.sql`) and touches
  nothing else in the folder: the takedown log, and any other file, `whereisfood-` or not,
  stay and take no place among the four. If it fails, the new dump is still good.

After `DUMP OK`, run [`supabase/manual/retention.sql`](supabase/manual/retention.sql) in the SQL
editor: the weekly routine runs it after the dump (Phase 10 plan, #10), except while an
incident is being investigated, when the dumps from before it are also moved aside
(`RUNBOOK.md`, "The weekly routine"). After `DUMP FAILED` or
`NO URL`, don't run it: fix the cause and run the block again.

### Restoring

A restore always goes into a **fresh** database, with the migrations applied, **no seed** and
no `auth` users: on the local stack `npx supabase db reset --no-seed`; on a new hosted project
`npx supabase db push` without `--include-seed` (not tried). The seed's trucks have ids no
production dump holds, so a dump would load beside them with no error, mixing them in. Check
first that `select count(*) from trucks` and `select count(*) from auth.users` both answer 0.
A database that still holds data or users, production with some rows lost included, isn't a
target for these steps: emptying a live database by hand is untested, so restore into a fresh
one instead. (Of the checks, the first catches data and the second any user; step 1 also
answers `422 email_exists` when the admin's email is already there, probed.) A restore brings
back what was deleted after its dump, so the takedowns and `retention.sql` run again after
it. The steps, tested once on the local stack (IS #455's record):

1. **The admin, by its old id**, before the data: `users.id` and `locations.created_by`
   reference `auth.users`, and the dump loads with its foreign keys unchecked (`replica`),
   so a new id would leave both pointing at nobody. Studio's "Add user" can't set an id;
   Auth's admin API can (Phase 10 plan, open decision 11). The old id is the `users` row with
   `is_admin` `true` in the dump. With the project's secret key read without echoing (`read -rs
   SECRET_KEY`) and a long random password the admin never needs (`CLAUDE.md`, "Supabase"):

   ```bash
   PASSWORD=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')
   curl -sS -w '\n%{http_code}\n' -X POST "<project URL>/auth/v1/admin/users" \
     -H "apikey: $SECRET_KEY" -H "Content-Type: application/json" \
     -d "{\"id\":\"<old id>\",\"email\":\"<admin email>\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
   unset PASSWORD SECRET_KEY
   ```

   It prints Auth's answer, then the status. `200` means it was made, and
   `select id from auth.users` in the SQL editor shows the old id. A `4xx` gives its reason in
   the answer. For anything else, such as `000`, a dropped connection, check `auth.users`
   before running it again, and `read -rs SECRET_KEY` first: the block has cleared it.
2. **The data:** load the dump with `psql` in one transaction (`-1`), so a load that fails
   partway leaves nothing behind and can be run again. On the local stack:
   `docker exec -i supabase_db_whereisfood psql -U postgres -v ON_ERROR_STOP=1 -1 < <dump file>`.
   Probed: a copy of a dump whose second statement failed, a duplicate `users` key, left its
   first insert behind without `-1` and nothing with it.
3. **Every takedown in the log**, whatever its date, each with its name read from the
   restored database ("Takedown", steps 1 to 4).
4. **`retention.sql`**, once.
5. **Log in and enroll TOTP at once.** The dump holds no `auth` schema, so the admin comes
   back with no factor: the login shows the enroll QR code, and until it is done any `aal1`
   session, a guessed code's included, can fill the free slot (Phase 9 plan #13). Delete the
   authenticator app's old entry.

Limits: moving the live app to a new project after a hosted restore (Vercel's variables, the
hosted settings checklist, the Redirect URLs) isn't covered here or tried; `RUNBOOK.md`'s
restore takes it (#457). Steps 1 and 2 were run only on the local stack (its API URL and
`sb_secret_` key; its `postgres`, which may set `session_replication_role`). On a hosted
project neither the admin API call nor the load has been tried, and a hosted restore needs a
new project in a free slot (two active free projects; pausing another frees one). The secret
key, the admin's password and the database URL are on command lines while the commands run,
which other processes of this user can read; the variables keep them out of the shell's
history only. The CLI also hands the database URL's parts to its `pg_dump` container: its
script exports `PGPASSWORD` there (`--dry-run`), so whoever can reach Docker could read it
while the dump runs (not seen in `docker inspect`).

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
#348"); on `dev` CodeQL too, and on `main` `base (main)`, which makes a pull request
retargeted from `dev` wait for a run against `main`. It doesn't show which run each other
check came from, so a pull request is opened fresh against the branch it merges into, not
retargeted (`CLAUDE.md`, "Testing"). The branch must also be up to date with its base, so
after another pull request merges, update the branch and let the checks run again. What the
checks don't cover (the `/karta` browser check, and when the controls need a hand run among
others) is in `CLAUDE.md`, "Testing". Locally, the fast loop is:

```bash
npx tsc --noEmit
npm run lint
npm run test:run
```

To reproduce a red check, run the failing step's command from `ci.yml`: `integration` is
`npm run test:all` and the security advisor, `build` is `npm run build` and the smoke check
of the served build.
