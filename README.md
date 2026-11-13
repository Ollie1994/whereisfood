# WhereIsFood — Gothenburg Food Truck Map

A web map showing where Gothenburg's food trucks are **today**.

Hungry people open the map (no login, no tracking) and see which trucks are out,
where, and until when. At launch every location is entered by hand by one admin, who
follows each truck on Instagram with post and Story notifications on, and updates the
map from a phone-first admin screen. Truck owners get to claim their listing and post
themselves later.

It fills a real gap: Gothenburg has had no central food-truck map since Streetkäk
shut down in 2017.

> **Status: Phase 7 of 10 (admin) done; Phase 8 (CI/CD) next.** The map shows
> today's entries from the database through `GET /api/live`, locally against a local
> Supabase and on protected Vercel previews against a hosted one. One admin logs in with
> an emailed link and keeps the map up to date from a phone-first admin screen. There is
> no production deploy yet. Phase 4 removed the old design (automatic ingestion from
> Make.com and email, plus a Swedish text parser), and Phase 5 replaced its database
> schema; see [Project status](#project-status).

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

This is the design. Phases 5 to 7 built the schema, the public read path (the map, its
polling and cache, the popup's freshness text) and the admin screen with its entry
flow; CI/CD is Phase 8's, security Phase 9's, and the launch Phase 10's.

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
| 8 · CI/CD            | The gates in GitHub Actions, secret scanning, SAST, Dependabot, branch protection | ⬜ Next |
| 9 · Security         | Admin MFA, security headers, monitoring, the 2FA audit | ⬜ Not started |
| 10 · Launch          | A custom domain for the tiles, production deploy | ⬜ Not started |

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
  emailed link (public sign-ups are off), then sees the morning checklist (what each
  truck did on this weekday recently, to confirm with ✓ or skip with ✗), a form to
  enter a location by known spot, recent place, map tap or GPS, and the list of entries
  from today for two weeks, each with "Stämmer fortfarande" and "Ställ in", and
  "Ändra" until it ends.
  `/admin/trucks` adds and edits trucks and sets them inactive. Overlapping entries are
  refused with a message naming the other entry's times.
- The admin is checked twice: in `src/proxy.ts`, and again in every admin API route
  (`/api/admin/…`), which only an admin's session reaches.
- The database layer (`src/lib/db/`), which the live read path and the admin use.
- Unit tests, and integration tests against a local Supabase for the schema (its
  constraints, grants and row-level security), the database layer, `/api/live`, the
  login routes and every admin route.

### What does not exist yet

- CI: every gate is run by hand until Phase 8 builds it
- A production deploy (Phase 10). Pushes to branches other than `main` build previews,
  with one exception so far (see "Preview deploys")

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

### 1. Install

```bash
git clone https://github.com/Ollie1994/whereisfood.git
cd whereisfood
npm install
```

`npm install` also copies MapLibre's web worker into `public/maplibre/` (gitignored);
`npm run dev` and `npm run build` repeat the copy.

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
  says it isn't for production, so launch moves the tiles to a custom domain (Phase 10).
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
    | `https://whereisfood-a0v5zskps-where-is-food.vercel.app` (commit form, *real*) | `https://whereisfood-theta.vercel.app` (the domain Vercel gave production, *real*) |
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
    production deployment once there is one. That URL, `whereisfood.vercel.app` and
    the domain Vercel assigned this project's production, `whereisfood-theta.vercel.app`
    (Settings → Environments), get no header, so each needs its own origin in the rule,
    or a redirect to an address that has one (Phase 10). A production deployment's
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
[http://localhost:3000](http://localhost:3000). It redirects to `/map`.

If a page reloads itself in a loop under `npm run dev`: `CLAUDE.md`, "Testing" (IS #304).

### 5. Create the admin user

Sign-ups are off (`[auth] enable_signup = false` in `supabase/config.toml`), so the
admin is created by hand, and again after each `npx supabase db reset`:

1. In Studio ([http://127.0.0.1:54323](http://127.0.0.1:54323)), Authentication →
   Users → Add user → Create new user, with your email and "Auto Confirm User" on.
   The password is never used: the login is a link.
2. In Studio's SQL Editor:

   ```sql
   insert into users (id, is_admin)
   select id, true from auth.users where email = 'you@example.com'
   returning id, is_admin;
   ```

   It shows the row it added. No row means the email matched no user. Without
   `returning`, the Editor says "Success. No rows returned" in both cases.

Then log in at `/admin/login`. The link arrives in Mailpit, the local mail catcher
([http://127.0.0.1:54324](http://127.0.0.1:54324)). Open it in the browser that asked
for it: the login's code verifier is a cookie there.

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
redirects to `/map`, so a login started on another preview URL doesn't finish. Checked with
the publishable and secret keys on 2026-11-07: `/auth/v1/settings` gives
`disable_signup: true`, and a link request for an unknown email with
`shouldCreateUser: true` got `422 signup_disabled` and created no auth user.

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
`project-context.md`, "Read path"). Cancel it with "Ställ in" as soon as the check is done.
Until it's cancelled, even after it ends, it refuses the truck's overlapping entries, drops
any of the truck's checklist suggestions that overlap it, and makes a by-hand insert like
IS #254's pass over the truck (#38's rule, above). For up to 4 weeks, it can also take the
place of the truck's real suggestions on that weekday (`getChecklist`). Once it's
cancelled, it does none of these: cancelled rows aren't read. `/admin`'s list drops an entry
at the first Stockholm midnight at or after its end (`listAdminEntries`). After that, cancel
it in the SQL Editor: find its id with

```sql
select id, starts_at, ends_at from locations
where truck_id = '<truck id>' and cancelled_at is null
order by starts_at desc limit 5;
```

then run
`update locations set cancelled_at = now() where id = '<id>' and cancelled_at is null;`.
Its row stays in the preview's history.

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

No CI check is required yet: `.github/workflows/ci.yml` runs the four gates, the schema
controls and the process log's check on each pull request, but until Phase 8 makes them
required (`CLAUDE.md`, "Testing"), run all four gates before opening or merging a pull
request and check each one exits 0:

```bash
npx tsc --noEmit
npm run lint
npm run test:all
npm run build
```
