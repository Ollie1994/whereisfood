# WhereIsFood — Gothenburg Food Truck Map

A web map showing where Gothenburg's food trucks are **today**.

Hungry people open the map (no login, no tracking) and see which trucks are out,
where, and until when. At launch every location is entered by hand by one admin, who
follows each truck on Instagram with post and Story notifications on, and updates the
map from a phone-first admin screen. Truck owners get to claim their listing and post
themselves later.

It fills a real gap: Gothenburg has had no central food-truck map since Streetkäk
shut down in 2017.

> **Status: Phase 4 of 8 (housekeeping).** The map renders in the browser from
> **fake data**; the app doesn't read from or write to the database yet. Phase 4 removed the
> old design (automatic ingestion from Make.com and email, plus a Swedish text
> parser); see [Project status](#project-status).

---

<img width="1354" height="850" alt="image" src="https://github.com/user-attachments/assets/7d91fa96-509e-49a0-b867-821d1f7079b5" />


## Tech stack

| Concern    | Choice |
|------------|--------|
| Framework  | Next.js 16 (App Router), React 19, TypeScript |
| Styling    | Tailwind CSS v4 |
| Map        | MapLibre GL JS 6 + Protomaps PMTiles (a local file in development, Cloudflare R2 at launch) |
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
  ordinary route that Vercel's CDN caches for 60 seconds, so the database sees about
  one query a minute per region whatever the traffic. The browser never talks to the
  database, so no one can pull a truck's location history.
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
| 2 · Ingestion        | Email and webhook endpoints, Supabase schema and seed | ✅ Done; endpoints removed in Phase 4, schema kept until Phase 5 |
| 3 · Parser           | Swedish text parser for social-media captions | Stopped and removed in Phase 4 |
| 4 · Housekeeping     | Remove the old design, upgrade dependencies, rewrite the docs | 🟡 In progress |
| 5 · Schema reset     | A fresh 3-table schema (`trucks`, `locations`, `users`) | ⬜ Not started |
| 6 · Live read path   | `/api/live`, polling, first preview deploy | ⬜ Not started |
| 7 · Admin            | Admin login and location entry | ⬜ Not started |
| 8 · Launch           | Map tiles on Cloudflare R2, production deploy | ⬜ Not started |

Phases 2 and 3 built automatic ingestion: Make.com webhooks and Mailgun email, run
through a Swedish parser that turned captions into locations. It was dropped for the
admin-populated design above. The code is archived on the `archive/parser-lanes`
branch and tag.

### What works today

- The map renders in the browser from a local tile file, centred on Gothenburg, with
  Swedish place names.
- HTML markers and clickable truck popups (React rendered into MapLibre popups),
  from fake data in [`src/lib/fake-data.ts`](src/lib/fake-data.ts). The markers still
  use the old design's colours; Phase 6 replaces them.
- A Supabase schema with migrations, row-level security and a dev seed. It is still
  the old design's schema; Phase 5 replaces it.
- Unit tests, and integration tests for the database layer against a local Supabase.

### What does not exist yet

- `/api/live` and live data on the map (Phase 6)
- Admin login and location entry (Phase 7); `src/proxy.ts` is a stub
- Any deploy (the first preview deploy is Phase 6)

---

## Getting started

### Prerequisites

- **Node `^20.19.0` or `>=22.12.0`.** Vitest's toolchain needs this; older 20.x and
  22.x releases pass Next's check but fail under vitest.
- **npm 11 or newer** (`npm i -g npm@11`). npm 10, which Node 22 bundles, crashes
  while resolving vitest's optional peer dependencies.
- **Docker**, for the local Supabase stack. The map runs without it; the integration
  tests don't.
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
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles public/gothenburg.pmtiles --bbox=11.6,57.5,12.2,57.85
```

Replace `YYYYMMDD` with a recent build date from
[maps.protomaps.com/builds](https://maps.protomaps.com/builds/). Only recent builds
are kept, so an old date returns 404. The extract downloads only the tiles it needs:
about 36 MB, in under a minute. Add `--maxzoom=14` for a smaller file with less
street-level detail.

### 3. Environment

```bash
cp .env.example .env.local
```

| Variable | Needed for | Value |
|---|---|---|
| `NEXT_PUBLIC_PMTILES_URL` | the map | `/gothenburg.pmtiles` (already set in the template) |
| `NEXT_PUBLIC_SUPABASE_URL` | integration tests, later phases | `API_URL` from `npx supabase status -o env` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | integration tests, later phases | `ANON_KEY` from the same output |
| `SUPABASE_SERVICE_ROLE_KEY` | integration tests, later phases | `SERVICE_ROLE_KEY` from the same output (server only, never `NEXT_PUBLIC_`) |

Start the local Supabase stack first with `npx supabase start` (needs Docker). On a
fresh database it applies the migrations and `supabase/seed.sql`; `npx supabase db
reset` re-applies both later.

### 4. Run

```bash
npm run dev
```

Open the URL from the `Local:` line Next prints, usually
[http://localhost:3000](http://localhost:3000). It redirects to `/map`.

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
