# WhereIsFood — Gothenburg Food Truck Map

A web map showing where Gothenburg's food trucks are **today**.

Hungry people open the map (no login, no tracking) and see which trucks are out,
where, and until when. At launch every location is entered by hand by one admin, who
follows each truck on Instagram with post and Story notifications on, and updates the
map from a phone-first admin screen. Truck owners get to claim their listing and post
themselves later.

It fills a real gap: Gothenburg has had no central food-truck map since Streetkäk
shut down in 2017.

> **Status: Phase 6 of 8 (live read path) in progress.** The map shows today's entries
> from the database through `GET /api/live`, locally against a local Supabase and on
> protected Vercel previews against a hosted one. There is no production deploy and no
> admin screen yet. Phase 4 removed the old design (automatic
> ingestion from Make.com and email, plus a Swedish text parser), and Phase 5 replaced
> its database schema; see [Project status](#project-status).

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
| Time       | date-fns-tz: store UTC, display `Europe/Stockholm` |
| Testing    | Vitest 4 (unit, plus integration tests against a local Supabase) |
| Deployment | Vercel |

Consumers are always anonymous. All user-facing text is in Swedish.

---

## How it's designed to work

Most of this is built in Phases 5–7; it describes the design, not today's code.

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
| 6 · Live read path   | `/api/live`, polling, map tiles on Cloudflare R2, first preview deploy | 🔄 In progress |
| 7 · Admin            | Admin login and location entry | ⬜ Not started |
| 8 · Launch           | A custom domain for the tiles, production deploy | ⬜ Not started |

Phases 2 and 3 built automatic ingestion: Make.com webhooks and Mailgun email, run
through a Swedish parser that turned captions into locations. It was dropped for the
admin-populated design above. The code is archived on the `archive/parser-lanes`
branch and tag.

### What works today

- The map renders in the browser, centred on Gothenburg, with Swedish place names:
  from a local tile file in dev, from Cloudflare R2 on a preview.
- One marker per truck with an entry today, filled while it is open and outlined when
  it opens later today, from `GET /api/live` (cached by Vercel's CDN for 60 s, checked
  on a preview, "Preview deploys"). The map polls every 60 s while the tab is visible and changes only the
  markers that changed. A popup shows the truck, its place, whether it is open, its
  hours, when the entry was last updated, and its Instagram link. If a poll fails the
  markers stay and the map says it couldn't update.
- The new design's Supabase schema, in one migration
  ([`supabase/migrations/0001_baseline.sql`](supabase/migrations/0001_baseline.sql)):
  `trucks`, `locations` and `users`. The database refuses overlapping entries for a
  truck, entries are cancelled rather than deleted, and the public API roles (`anon`
  and `authenticated`) get no access to `trucks` or `locations`: only the server-side
  database layer reads them, with the `service_role` key. The dev seed has
  three trucks and four weeks of location history relative to the day it is loaded.
- The database layer (`src/lib/db/`) the live read path and the admin screen will use.
- Unit tests, and integration tests against a local Supabase for the schema (its
  constraints, grants and row-level security) and the database layer.

### What does not exist yet

- Admin login and location entry (Phase 7); `src/proxy.ts` is a stub
- A production deploy (Phase 8). Previews deploy from every branch but `main` (see
  "Preview deploys")

---

## Getting started

### Prerequisites

- **Node `^20.19.0` or `>=22.12.0`.** Vitest's toolchain needs this; older 20.x and
  22.x releases pass Next's check but fail under vitest.
- **npm 11 or newer** (`npm i -g npm@11`). npm 10, which Node 22 bundles, crashes
  while resolving vitest's optional peer dependencies.
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
  says it isn't for production, so launch moves the tiles to a custom domain (Phase 8).
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
    or a redirect to an address that has one (Phase 8). A production deployment's commit-form URL is in the
    pattern like a preview's.
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
    custom headers, and `useMapLibre` sets none. `if-match` is in the rule because
    `.claude/context/project-context.md`'s R2 note lists it, not because the map sends
    it. After a pmtiles upgrade, check `getBytes` again. A header it adds that isn't
    CORS-safelisted (the Fetch standard's list), and that the rule lacks, fails the
    browser's preflight; to see it with curl, add that header to
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
| `NEXT_PUBLIC_SUPABASE_URL` | the map's markers (`/api/live`), integration tests | `API_URL` from `npx supabase status -o env` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the map's markers (`/api/live`), integration tests | `ANON_KEY` from the same output |
| `SUPABASE_SERVICE_ROLE_KEY` | the map's markers (`/api/live`), integration tests | `SERVICE_ROLE_KEY` from the same output (server only, never `NEXT_PUBLIC_`) |

Without the stack or these three variables the basemap still draws, but `/api/live`
fails, so the map shows no markers and says it couldn't fetch the trucks. The seed's
one entry for today spans the hour before `npx supabase db reset` to 12 hours after
it, so run a reset first to see a marker.

### 4. Run

```bash
npm run dev
```

Open the URL from the `Local:` line Next prints, usually
[http://localhost:3000](http://localhost:3000). It redirects to `/map`.

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
past entries can find none: that is the seed's age, not a read-path bug.

**Today's entry.** Before checking a preview's markers, run this in the project's SQL
Editor. It gives Taco Loco (the seed's fixed id) an entry at the place of its latest
non-cancelled entry, from an hour ago to 12 hours from now:

```sql
insert into locations (truck_id, latitude, longitude, label, starts_at, ends_at)
select truck_id, latitude, longitude, label, now() - interval '1 hour', now() + interval '12 hours'
from locations
where truck_id = '22222222-2222-2222-2222-222222222222' and cancelled_at is null
order by starts_at desc
limit 1
returning label, starts_at, ends_at;
```

If it returns no row, Taco Loco has no non-cancelled entry to copy: it inserted nothing,
with no error. If it fails with `conflicting key value violates exclusion constraint
"locations_no_overlap"`, a non-cancelled Taco Loco entry already overlaps that
window: an earlier run of this snippet, or any other entry. Look before changing
anything.

---

## Preview deploys

For the owner: Vercel project `whereisfood` in the team whose slug is `where-is-food`
(Hobby), imported from this repo. Every push to a branch other than `main` builds a
preview. Production builds from `main`, which Phase 8 is the first to push to.

**Project settings** (set in #187, 2026-11-02):

| Setting | Value |
|---|---|
| Production branch (Settings → Environments → Production) | `main`. Vercel accepts only a branch that exists, so `main` was created at `dev`'s commit. The repo's default branch stays `dev` |
| Function region (Settings → Functions) | Stockholm, `arn1`, beside the database. Hobby allows one region |
| Deployment Protection | Vercel Authentication on, "Standard Protection": without a Vercel login, `/map` and `/api/live` answer `302` to `vercel.com/sso-api` (#187's PR). A Protection Bypass for Automation secret lets a script through (below) |
| Build command, install command | Next.js's defaults, no override |

**Environment variables**, all four of `.env.example`'s, scoped to **Preview** only
(none in Production or Development):

| Variable | Vercel type | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config | the hosted preview project's URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | its publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | its secret key |
| `NEXT_PUBLIC_PMTILES_URL` | Config | the R2 file's URL |

A variable change applies to the next deployment, not to built ones. The project's
first deployment, from `phase-6/preview-deploy`, was labelled Production although
the production branch was already `main`, so it got no variables and failed with
`Missing env: NEXT_PUBLIC_SUPABASE_URL`; the next push to the branch built as a
Preview (#187's PR).

**Checking the CDN cache.** With protection on, a request without a login gets
Vercel's login redirect, not the route. Send the bypass secret as a header, read from
an environment variable, and print only the response headers:

```bash
curl -s -o /dev/null -D - "https://<preview-host>/api/live" -H "x-vercel-protection-bypass: $PREVIEW_BYPASS_TOKEN"
```

`x-vercel-cache` goes `MISS`, then `HIT` within 60 s, then `STALE` between 60 and 120
s, and the `cache-control` the client sees is only `public` (Vercel strips
`s-maxage` and `stale-while-revalidate`). A request with the header was cached like
any other in #187's check.

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

There is no CI. Before opening or merging a pull request, run all four gates and
check each one exits 0:

```bash
npx tsc --noEmit
npm run lint
npm run test:all
npm run build
```
