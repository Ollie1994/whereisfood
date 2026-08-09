# WhereIsFood — Gothenburg Food Truck Map

A live web map showing where Gothenburg's food trucks are **right now**.

Hungry people open the map (no login) and see active trucks with their location,
hours, and cuisine. Trucks broadcast their location three ways: posting manually,
via [Make.com](https://make.com) automations wired to their social posts, or by email.

It fills a real gap — Gothenburg has had no central live food-truck map since
Streetkäk shut down in 2017.

> **Status: Phases 1–2 of 8 complete.**
> The map renders in the browser (still from fake data), and both ingestion
> lanes — webhook (`/api/ingest`) and email (`/api/email`) — are built and
> verified end-to-end against a local Supabase stack, storing raw posts.
> The map is not yet wired to live data (Phase 4). See [Project status](#project-status).

---

<img width="1354" height="850" alt="image" src="https://github.com/user-attachments/assets/7d91fa96-509e-49a0-b867-821d1f7079b5" />


## Tech stack

| Concern        | Choice |
|----------------|--------|
| Framework      | Next.js 16 (App Router), React 19, TypeScript |
| Styling        | Tailwind CSS v4 |
| Map            | MapLibre GL JS + Protomaps PMTiles (local file now, Cloudflare R2 planned) |
| Database       | Supabase Postgres |
| Realtime       | Supabase Realtime (WebSocket broadcasts) |
| Auth           | Supabase Auth (magic links, truck owners only) |
| Geocoding      | Nominatim (cached in DB forever) |
| Rate limiting  | Upstash Redis (sliding window) |
| Time           | date-fns-tz — store UTC, display `Europe/Stockholm` |
| Automation     | Make.com (per-truck free accounts) + Mailgun inbound email |
| Testing        | Vitest |
| Deployment     | Vercel + Vercel Cron |

Consumers are always anonymous — no account, no tracking. All user-facing text is
in Swedish.

---

## How it's designed to work

### Three ingestion lanes

Each lane carries a **source confidence** weighting:

| Lane      | Endpoint          | Source confidence | Notes |
|-----------|-------------------|-------------------|-------|
| Dashboard | `POST /api/locations` | `1.0` — always wins | Authenticated truck owner, structured input, no parser |
| Webhook   | `POST /api/ingest`    | `0.85`             | Make.com routes a social post caption through the parser |
| Email     | `POST /api/email`     | `0.55`             | Mailgun inbound, HMAC-verified, parser runs on the body |

Priority: **Dashboard > Webhook > Email**. A manual post always overrides a parsed
one whose time window overlaps it.

### Confidence & marker colours

Two-axis model: `confidence = parser_confidence × source_confidence`, shown to users
as human language — never raw percentages.

- 🟢 **Green** — fresh manual post ("Posted by truck today")
- 🟡 **Yellow** — parsed from a caption ("Based on this morning's post")
- ⚫ **Grey** — no update today, shown at last known spot (absence is honest, never hidden)

Anything below `0.45` displays as grey rather than a location.

### Swedish NLP parser (pure functions)

Every email/webhook caption runs through a pure, dictionary-based pipeline:
normalize → detect negation (`inställt`, `stängt`) → extract location → extract date
(`idag`, `imorgon`, weekdays, always resolving to the nearest *future* day) → extract
time (`11-14`, `lunchtid`) → score confidence → geocode. No `new Date()` inside the
parser — `parsedAt` is always passed in, keeping it testable.

### Realtime & expiry

Supabase Realtime broadcasts location changes; the map patches only the affected
marker and never fully re-renders. Locations expire at `ends_at`, or `posted_at + 8h`,
capped at midnight. A Vercel cron cleans expired **locations** every 30 min — the
**posts** table is never purged, as it's the training corpus for a future ML parser
that will replace the dictionary.

---

## Architecture

Strict layering — never mix layers:

```
app/api/*/route.ts   → HTTP only, no business logic
src/lib/services/    → all business logic, no HTTP knowledge
src/lib/db/          → database access only
src/lib/parser/      → pure functions, no DB, no HTTP, no side effects
src/lib/validators/  → input validation
```

Route handlers call services. Services call the DB layer. The parser is pure.

Full design reference lives in [`.claude/context/project-context.md`](.claude/context/project-context.md)
and the working rules in [`CLAUDE.md`](CLAUDE.md).

---

## Project status

Build order is 8 phases. **Phases 1–2 are complete; Phases 3–8 are not started.**

| Phase | Scope | Status |
|-------|-------|--------|
| 1 · Foundation      | Map renders (MapLibre + local PMTiles file) with fake data | ✅ Done |
| 2 · Ingestion       | Email + webhook endpoints, Supabase schema + seed | ✅ Done |
| 3 · Parser          | Swedish NLP parser, unit tested | ⬜ Not started |
| 4 · Realtime        | Supabase Realtime, live map updates | ⬜ Not started |
| 5 · Auth + Dashboard| Truck login, manual posting, admin — **first deploy** | ⬜ Not started |
| 6 · Cron + Cleanup  | Stale pins expire automatically | ⬜ Not started |
| 7 · Hardening       | `proxy.ts`, rate limiting, security headers | ⬜ Not started |
| 8 · Onboarding      | Real trucks, Make.com per-truck guides | ⬜ Not started |

### What actually works today

**Phase 1 — map**
- Map renders in the browser — MapLibre + Protomaps PMTiles from a local committed file (`public/gothenburg.pmtiles`; Cloudflare R2 is the planned production host), centred on Gothenburg
- Custom HTML circle markers (green / yellow / grey), colour derived from confidence
- Clickable truck popups rendered via React roots into MapLibre popups
- Client-side merge of trucks + locations into one marker per truck
- Core TypeScript types (`Truck`, `Location`, `MarkerState`); root `/` redirects to `/map`

**Phase 2 — ingestion**
- **Supabase Postgres schema** — `supabase/migrations/0001_initial_schema.sql` (trucks, posts, locations, geocoding_cache, users) with indexes, RLS policies, and Data API grants; `0002`/`0003` tighten column nullability so the schema and the TypeScript types agree; dev `seed.sql` (2 active + 1 inactive truck, fixed UUIDs)
- **Webhook lane** — `POST /api/ingest`, constant-time `X-Make-Secret` check, validates the truck, returns 200 and stores the raw post in `after()`
- **Email lane** — `POST /api/email`, Mailgun `multipart/form-data` + constant-time HMAC-SHA256 verification, truck extracted from the recipient
- **Replay protection** — a correctly signed payload is also rejected (400) unless its timestamp is within **±15 minutes**. See [Replay window](#replay-window) for why that number
- **Typed database access** — both Supabase clients are parameterized with generated `Database` types (`src/lib/database.types.ts`), and `Truck` / `Location` / `Post` are derived from them, so schema drift becomes a compile error
- **Layered backend** — pure validators (`src/lib/validators/`), ingestion service (`src/lib/services/ingestion.ts`), and DB layer (`src/lib/db/`), all writing through `supabaseAdmin`
- **Raw posts stored** as the permanent ML training corpus (never purged)
- **75 Vitest unit tests** across the validators/security boundary and the ingestion service; `scripts/sign-mailgun.mjs` dev helper for signing email-lane requests

#### Replay window

The email lane rejects a correctly signed payload whose timestamp is more than
**15 minutes** from now, in either direction. Without it, a captured
`(timestamp, token, signature)` tuple would stay valid forever.

15 minutes is not arbitrary:

- It is **Mailgun's own documented tolerance**, and they explicitly warn against being
  more aggressive, since delivery delays outside their control are normal.
- Mailgun **retries a failed POST** at 10, 20, 35, 65, 125, 245 and 485 minutes
  (cumulative). `/api/email` returns 200 before the DB write, so the only 5xx paths are
  a missing signing key or Supabase being unreachable during the truck lookup. A window
  under 10 minutes would reject the *first retry* and permanently drop that email,
  breaking the project's "never lose incoming data" rule. 15 minutes covers it.
- The window is **defence in depth, not the primary control**. Mailgun's recommended
  replay defence is caching the single-use `token` and rejecting repeats — that arrives
  in Phase 7 alongside Upstash Redis.

Do not tighten it below 10 minutes before the token cache exists.

### What does NOT exist yet

- **The map still shows fake data** — it reads from [`src/lib/fake-data.ts`](src/lib/fake-data.ts) and is not yet wired to the database (Phase 4 · Realtime)
- **No parser** — ingested captions are stored raw but not yet parsed into locations; the Swedish NLP pipeline (`src/lib/parser/*`), geocoding, and `locations` writes are Phase 3
- **`src/proxy.ts` is a stub** — no auth / rate limiting / security headers yet (Phase 7)
- No auth, no dashboard, no admin, no realtime, no cron

**Immediate next step (Phase 3):** build the Swedish NLP parser (normalize → negation →
location → date → time → confidence → geocode), then write parsed `locations` off the
raw posts with the override/priority and dedup logic.

---

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/map`.

The map needs a PMTiles URL to render tiles. Copy the environment template and fill it in:

```bash
cp .env.example .env.local
```

Required for the map to draw today:

```bash
# Currently a local file — public/gothenburg.pmtiles is committed for dev.
# Cloudflare R2 is the planned production host.
NEXT_PUBLIC_PMTILES_URL=/gothenburg.pmtiles
```

The remaining variables (Supabase, Make.com, Mailgun, Nominatim, Upstash) are consumed
in later phases and not yet needed to run the map:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
MAKE_WEBHOOK_SECRET=
MAILGUN_WEBHOOK_SIGNING_KEY=
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```
