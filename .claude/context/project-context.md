# Foodtruck Map Gothenburg — Project Context

> **This document has been wrong before.** When a rule here turns out to be stale,
> incorrect, or is followed and causes a defect, fix it *and* append a row to
> `.claude/process-log.md` — see the "Process Log" section in `CLAUDE.md` for the
> triggers. That file is how we find out which parts of this one keep failing;
> `project-context` and `CLAUDE.md` are both already named in it.

## What We're Building
A live map showing where Gothenburg food trucks are right now.
Hungry people open the map and see active trucks with location and hours.
Trucks share their location via automated integrations or manual posting.
No login required for consumers. Truck owners have accounts.

---

## The Problem
Food trucks in Gothenburg announce location via Instagram and Facebook.
There is no centralised live map since Streetkäk died in 2017.
The problem is real, the gap is confirmed, nobody has solved it since.

---

## Tech Stack

```
Frontend          Next.js 16 (App Router), TypeScript, Tailwind CSS
Map               MapLibre GL JS + Protomaps PMTiles + Cloudflare R2
Geocoding         Nominatim (free, 1 req/sec, cached in DB forever)
Database          Supabase Postgres
Realtime          Supabase Realtime (WebSocket broadcasts)
Auth              Supabase Auth (magic links for truck owners)
Rate limiting     Upstash Redis (@upstash/ratelimit, sliding window)
Automation        Make.com — each truck owner sets up their own free account
Email ingest      Mailgun inbound (free tier: 1 route, 100 emails/day, fallback lane only)
Timezone          date-fns-tz (all times stored UTC, parsed as Europe/Stockholm)
Deployment        Vercel (free tier)
Scheduling        Vercel Cron (cleanup every 30 min)
Styling           Tailwind CSS
Package manager   npm
```

### Tile provider note
MapLibre GL JS renders the map via WebGL — smooth, vector-based, open source, free forever.
Protomaps PMTiles is a single .pmtiles file containing all OSM map tile data — open source, free forever.
Cloudflare R2 is the planned production host for the .pmtiles file — zero egress fees, 10 GB free storage, no card needed.
**Currently the file is served locally** — `public/gothenburg.pmtiles` is committed for dev (`NEXT_PUBLIC_PMTILES_URL=/gothenburg.pmtiles`); the move to R2 comes later.
No API key required. No vendor lock-in. No cost at any scale.

### Make.com per-truck model
Each truck owner creates their own free Make.com account (1,000 ops/month each).
They connect their Instagram/Facebook/TikTok and point the webhook at POST /api/ingest.
This distributes the free tier limit — no shared ceiling across all trucks.
Onboarding guide required (Phase 8).

---

## Three Data Ingestion Lanes

### EMAIL LANE
- Entry: inbound email to {truck_id}@in.yourapp.se
- Sources: truck emails directly
- Endpoint: POST /api/email (Mailgun inbound webhook)
- Processing: parser runs on email body
- Source confidence: 0.55

Verification:
Mailgun signs every inbound webhook with HMAC-SHA256 using a timestamp + token + signing key.
Verify before processing:
```typescript
const value = payload.timestamp + payload.token
const hash = crypto.createHmac('sha256', MAILGUN_WEBHOOK_SIGNING_KEY).update(value).digest('hex')
if (hash !== payload.signature) return 400
```

Replay window — **±15 minutes** (`REPLAY_WINDOW_SECONDS` in `src/lib/services/ingestion.ts`):
a valid signature proves the payload was signed with our key, but a captured
`(timestamp, token, signature)` tuple stays valid forever without a freshness check.
Checked in the service (not the validator, which must stay pure) and only AFTER the
signature verifies, so the rule applies to genuinely Mailgun-signed payloads.

**A stale timestamp is NOT a rejection.** The two checks answer different questions:

| Case | Response | `posts` row |
|---|---|---|
| Invalid signature | 400 | none — we don't know who sent it |
| Valid signature, stale | **200** | stored, `parsing_status = 'skipped'` |
| Valid signature, fresh | 200 | stored, `parsing_status = 'pending'` |

Freshness governs whether we **act** on a post, not whether we **keep** it. A stale
payload was relayed by Mailgun — just old — so it belongs in the permanent corpus while being
barred from creating or overriding a live location. A non-numeric timestamp lands in
the same branch (`isFreshTimestamp` fails closed) and is likewise retained.

⚠ **Phase 3 dependency:** the parser MUST exclude `parsing_status = 'skipped'` rows
when writing `locations`, or stale posts become locations anyway and this is moot.

**Replay protection (migration 0004).** Accepting stale payloads means a replay
would otherwise append rows to a corpus that is never purged. Two guards:

1. `posts_email_token_unique` — unique index on
   `(raw_json->>'timestamp') || (raw_json->>'token')` where `source = 'email'`.
   Mailgun's token is single-use, so a replay collides on insert with 23505,
   which `persistPost` already swallows (and now logs). The replay no-ops.

   The key is the **concatenation**, not the token alone. Mailgun signs
   `timestamp + token` with no delimiter, so the boundary is ambiguous: the same
   signed string re-splits at any interior index, every split verifies under the
   SAME signature, and each yields a different token — 41 working variants were
   demonstrated for a 10-digit timestamp and a 32-char token. Keying on the
   concatenation makes the index invariant under re-splitting.

   The validator deliberately does NOT constrain the timestamp format. An earlier
   revision pinned it to exactly 10 digits to make the split unique on the way in;
   that rejected validly-signed payloads with no `posts` row, reintroducing the
   permanent data loss #53 removed, and bought nothing — the concatenation key
   already collapses every variant. Keep validation loose and let the index work.
   A malformed timestamp is therefore stored as 'skipped', never rejected.
2. `redactSignature()` strips `signature` before the row is persisted. A stored
   signature would make every row a ready-to-replay request — reachable through a
   leaked service-role key, a DB backup or the ML export, none of which HTTPS
   covers. The migration also redacts signatures already stored.

`token` and `timestamp` are retained on purpose: replay needs all three fields and
the signature cannot be recomputed without the key, so those two are inert alone.
The token is additionally what the unique index keys on — strip it and the guard
silently stops working.

The Phase 7 Upstash token cache complements this, it does not replace it: a cache
TTL is a finite protection window and the free tier evicts under memory pressure,
whereas the index never expires. Note also that the planned per-IP rate limit is a
weak control for this endpoint — all legitimate traffic arrives from Mailgun's IP
pool, so it throttles genuine mail while an attacker keeps their own bucket.

Why 15 min specifically — three constraints meet here:
1. It is Mailgun's own documented tolerance, and they explicitly warn against being
   more aggressive because delivery delays outside their control are normal.
2. Mailgun retries a failed POST at 10, 20, 35, 65, 125, 245 and 485 min (cumulative).
   `/api/email` returns 200 before the DB write, so the only 5xx paths are a missing
   signing key or Supabase being unreachable during the truck lookup. A window under
   10 min would make even the **first retry** unparseable. 15 min keeps it actionable.
   Note that exceeding the window costs the *location*, never the *post* — so this
   value is no longer load-bearing for "never lose incoming data".
3. The window is **not** the primary replay defence. Mailgun's recommended control is
   caching the single-use `token` and rejecting repeats — deferred to Phase 7 with
   Upstash Redis. The window is defence in depth on top of the HMAC.

Do not tighten this below 10 min. Token-level dedup already exists as the
`posts_email_token_unique` index (migration 0004) — see the replay-protection note
above — so tightening the window buys nothing and only risks discarding retries.

Truck identification from email:
Mailgun sends all inbound emails to a single webhook regardless of the recipient address.
The `truck_id` is extracted from the `recipient` field of the Mailgun payload:
```
payload.recipient → "{truck_id}@in.yourapp.se" → parse UUID before the @
```
The extracted `truck_id` is then validated against `trucks` (`is_active = true`) before processing.
Reject with 400 if the address format is invalid or the truck is not found.

Relevant Mailgun payload fields:
- `payload.recipient`  → full To address (used for truck_id extraction)
- `payload.body-plain` → plain text email body (passed to parser)
- `payload.timestamp`  → Unix timestamp (used in signature verification)
- `payload.token`      → random token (used in signature verification)
- `payload.signature`  → HMAC-SHA256 signature to verify

### DASHBOARD LANE
- Entry: authenticated POST from truck owner session
- Sources: truck posts location directly via UI
- Endpoint: POST /api/locations (requires valid Supabase session)
- Processing: no parser — structured input { address, starts_at, ends_at }
- Source confidence: 1.0 — always overrides other lanes

### WEBHOOK LANE
- Entry: POST with verified X-Make-Secret header
- Sources: Make.com (per-truck free account) routes Instagram/Facebook/TikTok post to webhook
- Endpoint: POST /api/ingest
- Processing: parser runs on caption field
- Source confidence: 0.85

Payload schema (sent by Make.com):
```json
{
  "truck_id": "uuid",
  "caption": "text of the post",
  "instagram_post_id": "optional — string, omit if not from Instagram",
  "source_platform": "instagram | facebook | tiktok"
}
```
`truck_id` is how the ingest endpoint identifies which truck is posting.
Each truck owner copies their own `truck_id` (visible in /dashboard) into their Make.com scenario.

Security: the ingest endpoint must validate that the `truck_id` from the payload exists in the `trucks` table and `is_active = true` before processing. The shared `X-Make-Secret` only proves the request came from Make.com — it does not prove the `truck_id` is legitimate. A bad actor who knows the secret could POST as any truck. Reject with 400 if the truck is not found or inactive.

### Priority Order
Dashboard > Webhook > Email
Manual post always wins — no exceptions.

---

## Confidence Scoring

Two-axis model:
- parser_confidence: how well we extracted location/time from text (0.0–1.0)
- source_confidence: how much we trust the source (see above)
- confidence: parser_confidence × source_confidence

Display threshold: combined >= 0.45

Map states:
- 🟢 confidence >= 0.9 — "Posted by truck today" (manual post)
- 🟡 confidence 0.45–0.89 — "Based on this morning's post" (parsed)
- ⚫ no data today — "No update today" (honest absence, never hidden)

Never show raw confidence percentages to users — always human language.

---

## Parser Pipeline (Swedish NLP)

Every caption from email and webhook lanes runs through:
0. normalizeCaption()  → strip emojis, hashtags (#gbg), @ mentions, and collapse whitespace
1. detectNegation()    → bail early if truck is closed (inte, inställt, ej, stängt, etc.)
2. extractLocation()   → match against Gothenburg location dictionary
3. extractDate()       → resolve Swedish date expressions (idag, imorgon, måndag, tisdag…)
4. extractTime()       → extract time ranges (11-14, 11.30-13.00, lunchtid)
5. scoreConfidence()   → 0.0 to 1.0 based on what was extracted
6. geocode()           → address string → lat/lng via Nominatim (cached in DB)

Location dictionary lives in: src/lib/parser/dictionary.ts
Add new Gothenburg locations here as real captions reveal gaps.

### normalizeCaption()
Runs before all other steps. Strips:
- Emojis (Unicode ranges)
- Hashtags (`#word`)
- @ mentions (`@word`)
- Excess whitespace and newlines → single spaces

### extractDate() rules
Always resolves to the nearest **future** occurrence — never a past date.
- `idag` → `parsedAt` (today)
- `imorgon` → `parsedAt + 1 day`
- Named weekday (måndag, tisdag…) → nearest future occurrence of that day
  - If today is the same weekday → still today
  - Otherwise → next upcoming occurrence (1–6 days ahead)
- No date found → assume `parsedAt` (today)

### extractTime() — lunchtid definition
`lunchtid` maps to `11:00–14:00 Europe/Stockholm`.
Stored as `starts_at = 11:00`, `ends_at = 14:00` in UTC.

### scoreConfidence() scoring matrix

| Extracted | parser_confidence |
|---|---|
| location + explicit time range | 1.0 |
| location + lunchtid | 0.85 |
| location only (no time) | 0.6 |
| time only (no location) | 0.2 |
| negation detected | 0.0 |
| nothing extracted | 0.0 |

### Timezone rule
All parser functions receive `parsedAt: string` (today's date in Stockholm, "yyyy-MM-dd").
Never use `new Date()` inside the parser — keeps functions pure and testable.

```typescript
import { fromZonedTime, toZonedTime, format } from 'date-fns-tz'
const TZ = 'Europe/Stockholm'

// Call site (service layer, not parser):
const parsedAt = format(toZonedTime(new Date(), TZ), 'yyyy-MM-dd', { timeZone: TZ })

// Inside time parser:
const starts_at = fromZonedTime(`${parsedAt}T11:00:00`, TZ)  // → UTC
```

---

## Expiry Logic

```
If ends_at extracted from caption → expires at ends_at
If no ends_at → expires at posted_at + 8 hours
Hard cap: never show past midnight
```

Vercel Cron runs every 30 min and removes expired locations from DB.
Supabase Realtime broadcasts deletions → pins disappear from map.

Cancellation: if truck posts "inställt" → detectNegation() fires →
location stored with is_negation: true → pin removed immediately.

Client-side cancellation handling:
Supabase Realtime fires an INSERT event when a negation location is stored.
The client must check `is_negation` on every INSERT event — if true, remove the
existing marker for that truck_id rather than adding a new one. This is
counter-intuitive: a Realtime INSERT triggers a marker removal, not an addition.

---

## Map Behaviour

- Centred on Gothenburg: [11.9746, 57.7089], zoom 13  -- MapLibre takes [lng, lat]
- Markers use custom HTML elements added via MapLibre Marker API (CSS circles) — no image files, no broken paths
- Three marker colours: #22c55e (green), #eab308 (yellow), #6b7280 (grey)
- Clicking marker shows: name, cuisine, hours, confidence label, Instagram link
- Map never fully re-renders — only affected markers update on realtime events
- On Supabase Realtime reconnect: re-fetch all active locations from DB
  (replaces stale client state entirely)

### Data model for markers

`useLocations.ts` fetches two things on mount:
1. All trucks where `is_active = true` (from `trucks` table)
2. All active locations for today (from `locations` table, using active location query)

These are merged client-side to produce one entry per truck:
- Truck has active location → show green or yellow marker at that location
- Truck has no active location today → show grey marker at a fixed default position

Grey marker default position: `last_known_latitude` / `last_known_longitude` columns on the `trucks` table (denormalized for performance — avoids an N+1 query per truck on page load). Updated by `src/lib/services/ingestion.ts` on every successful location insert. If NULL (truck has never posted), no grey marker is shown.

Geocoding failure rules (enforced in `src/lib/services/ingestion.ts`):
- If geocoding returns no result → do not insert a `locations` row, set `parsing_status = 'failed'` on the `posts` row
- Never update `last_known_latitude` / `last_known_longitude` on a failed geocode — only update on a successful location insert
- A failed geocode must never null out an existing last known position

Realtime events patch the merged state — only the affected truck's marker updates.
On reconnect, both queries re-run to replace stale client state entirely.

---

## Override / Priority Logic

A truck can have multiple locations per day as long as their time windows don't overlap (e.g. lunch 11–14 and dinner 18–21 can coexist).

Before inserting any new location, `src/lib/services/ingestion.ts` must:

1. Query locations for same `truck_id` where the time window overlaps with the incoming one:
   `existing.starts_at < incoming.ends_at AND existing.ends_at > incoming.starts_at`
2. If none → insert freely
3. If an overlapping location is found:

| Incoming source | Existing source | Action |
|---|---|---|
| manual (1.0) | anything | delete existing, insert new |
| webhook (0.85) | email (0.55) | delete existing, insert new |
| webhook (0.85) | webhook (0.85) | discard incoming |
| email (0.55) | webhook (0.85) | discard incoming |
| email (0.55) | manual (1.0) | discard incoming |

Rule: `if new.source_confidence > existing.source_confidence → replace, else discard`.
Exception: `source = 'manual'` always replaces regardless of existing confidence.

---

## Deduplication

Before parsing any post check:
1. Same instagram_post_id already in posts table → discard
2. Same truck_id + same caption text within 60 seconds → discard (crosspost)

This makes Make.com + Cron safe to run simultaneously.

---

## Database Schema

```sql
trucks
  id                    uuid primary key
  name                  text not null
  instagram_handle      text unique
  cuisine_type          text
  description           text
  is_active             boolean not null default true          -- NOT NULL: 0003
  last_known_latitude   float8   -- nullable; denormalized, set on location insert
  last_known_longitude  float8   -- nullable; denormalized, set on location insert
  created_at            timestamptz not null default now()     -- NOT NULL: 0003

geocoding_cache
  address_raw     text primary key
  latitude        float8 not null
  longitude       float8 not null
  cached_at       timestamptz not null default now()           -- NOT NULL: 0003

posts
  id              uuid primary key default gen_random_uuid()
  truck_id        uuid not null references trucks
  instagram_post_id text  -- no inline unique — see partial index below
  caption         text
  source          text not null  -- CHECK: instagram | facebook | tiktok | email | manual | webhook
  posted_at       timestamptz not null  -- webhook → ingest time; email → Mailgun timestamp
  raw_json        jsonb not null  -- never lose raw data
  parsing_status  text not null default 'pending'  -- CHECK: pending | parsed | failed | skipped
  created_at      timestamptz not null default now()           -- NOT NULL: 0003
  -- Corpus integrity: source/posted_at/raw_json/parsing_status are NOT NULL and the
  -- two enums are CHECK-constrained so a service bug can never persist a malformed row.

locations
  id              uuid primary key
  truck_id        uuid references trucks not null
  post_id         uuid references posts nullable
  latitude        float8 not null
  longitude       float8 not null
  address_raw     text                    -- nullable
  address_geocoded text                   -- nullable
  starts_at       timestamptz not null
  ends_at         timestamptz             -- NULLABLE BY DESIGN: "no ends_at
                                          -- extracted" is meaningful — the expiry
                                          -- rule falls back to posted_at + 8h
  source          text not null           -- CHECK: manual | webhook | email
                                          -- (3-value LANE — NOT posts.source's 6)
  confidence      float4 not null
  parser_confidence float4 not null
  source_confidence float4 not null
  is_negation     boolean not null default false
  expires_at      timestamptz not null    -- always computed; cron filters on it
  created_at      timestamptz not null default now()
  updated_at      timestamptz not null default now()

  -- ⚠ The NOT NULLs and the CHECK above were added by migration 0002, not 0001.
  -- Every one of these columns must be SET on insert or the write fails loudly.
  -- Only post_id, address_raw, address_geocoded and ends_at may be null.

users (truck owners + admins — consumers are anonymous)
  id              uuid references auth.users
  truck_id        uuid references trucks nullable  -- null for admin users
  is_admin        boolean default false
  created_at      timestamptz
```

Indexes:
```sql
-- Partial unique: allows multiple NULLs, blocks duplicate real IDs
CREATE UNIQUE INDEX posts_instagram_post_id_unique
  ON posts(instagram_post_id) WHERE instagram_post_id IS NOT NULL;

-- Override logic: find overlapping locations for a truck (supports multiple slots per day)
CREATE INDEX locations_truck_starts ON locations(truck_id, starts_at, ends_at);

-- Cron cleanup: find all expired locations
CREATE INDEX locations_expires ON locations(expires_at);

-- Caption deduplication: recent posts per truck
CREATE INDEX posts_truck_created ON posts(truck_id, created_at);

-- Email replay guard (migration 0004). Mailgun's token is single-use, so a
-- replayed payload collides here and raises 23505 — which persistPost already
-- swallows as a benign discard. Partial: only the email lane carries a token.
--
-- The key is the CONCATENATION `timestamp || token`, not the token alone. That
-- is exactly the string Mailgun signs, so it is invariant under the HMAC
-- boundary re-split — see the EMAIL LANE section for why that matters.
CREATE UNIQUE INDEX posts_email_token_unique
  ON posts(((raw_json ->> 'timestamp') || (raw_json ->> 'token')))
  WHERE source = 'email';
```

Note on `posts.raw_json` for the email lane: the Mailgun `signature` is stripped
before the row is written (`redactSignature`), and migration 0004 redacts any
already stored. `token` and `timestamp` ARE retained — replay needs all three and
the signature cannot be recomputed without the signing key, so those two are inert
alone. Both are also load-bearing for the index above, which keys on their
concatenation — strip either one and the replay guard silently stops working.

Active location query (used everywhere a "current" location is needed):
```sql
WHERE is_negation = false
  AND expires_at > now()
```

Supabase Realtime enabled on: locations table (INSERT, UPDATE, DELETE)

---

## Row Level Security (RLS)

RLS must be enabled on all tables. Policies:

```
trucks
  SELECT  → anon, authenticated    (everyone can read active trucks)
  INSERT  → service_role only      (admin creates trucks via supabaseAdmin)
  UPDATE  → service_role only
  DELETE  → service_role only

locations
  SELECT  → anon, authenticated    (everyone can read active locations)
  INSERT  → service_role only      (all writes go through API routes using supabaseAdmin)
  UPDATE  → service_role only
  DELETE  → service_role only

posts
  SELECT  → service_role only      (raw post data is internal)
  INSERT  → service_role only
  UPDATE  → service_role only
  DELETE  → service_role only

geocoding_cache
  SELECT  → service_role only
  INSERT  → service_role only
  UPDATE  → service_role only

users
  SELECT  → authenticated (own row only: auth.uid() = id)
  UPDATE  → none for now    (no owner-editable column; see note below)
  INSERT  → service_role only      (admin creates user records on invite)
```

**No owner self-UPDATE on `users`.** The table has no owner-editable column
(`id`/`created_at` immutable, `truck_id` admin-assigned on invite, `is_admin`
admin-only). Granting `authenticated` an unrestricted UPDATE over its own row
would let a truck owner self-escalate to `is_admin = true` or reassign
`truck_id` to hijack another truck — both confirmed exploitable via PostgREST.
If a genuinely user-editable profile field is added later, grant a
**column-scoped** UPDATE that never covers `is_admin` or `truck_id`.

**Data API grants.** RLS policies only filter rows — a role still needs a
table-level `GRANT` to reach a table at all, and modern Supabase does not
auto-expose new tables to the API roles (`config.toml` `auto_expose_new_tables`
unset). Every migration must therefore `GRANT` explicitly to match this matrix:
`service_role` full DML on all tables; `anon`/`authenticated` SELECT on `trucks`
and `locations`; `authenticated` SELECT on `users`. Without these, anon reads
and even service_role writes return 401/403.

All writes from API routes use `supabaseAdmin` (service role) — RLS is bypassed server-side by design.
The anon key in the browser can only read trucks and locations — it cannot write anything.

---

## Supabase Clients

Two clients, different permission levels:

```typescript
// Server only — bypasses RLS — used in API routes, services, cron
supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Browser safe — respects RLS — used in components, auth, realtime
supabaseClient = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
```

Never use supabaseAdmin in client components.
Never use NEXT_PUBLIC_ prefix for secret keys.

---

## Architecture Layers

```
app/api/*/route.ts      → thin route handlers (HTTP only, no business logic)
src/lib/services/       → all business logic (no HTTP knowledge)
src/lib/db/             → database access only (no business logic)
src/lib/parser/         → pure functions (no DB, no HTTP, no side effects)
src/lib/validators/     → input validation
src/lib/supabase.ts     → DB clients
src/lib/types.ts        → all shared TypeScript types
```

Rule: route handlers call services. Services call DB layer. Parser is pure.
Services have no knowledge of NextRequest/NextResponse.

### Import convention
Internal modules are imported via the `@/` path alias (mapped to `./src/*` in `tsconfig.json`), never relative paths.
```typescript
import { Truck } from "@/lib/types";   // ✅
import { Truck } from "../lib/types";  // ❌ relative
```
Bare package imports stay as-is (`maplibre-gl/dist/maplibre-gl.css`, `next/navigation`) — the `@/` alias is for `src/` files only.

Use `import type` for anything used only as a type (annotations, generics, `extends`); use plain `import` for runtime values (functions called, classes instantiated). Type-only imports are fully erased from the output and avoid pulling modules into the runtime bundle.
```typescript
import { formatInTimeZone } from "date-fns-tz";  // ✅ runtime value — called
import type { MarkerState } from "@/lib/types";  // ✅ only used as a type annotation
```

---

## Component Structure

Components are pure render — no `useState`/`useEffect` (those live in hooks). Standard shape:
```tsx
import type { MarkerState } from "@/lib/types";

interface TruckPopupProps {
  marker: MarkerState;
  onClose: () => void;
}

export default function TruckPopup({ marker, onClose }: TruckPopupProps) {
  return <div>{/* render only */}</div>;
}
```

Rules:
- `export default function` for components; named exports for types/utilities.
- Props typed with a named `interface ComponentNameProps`, even when it has one field.
- React 19 / Next 16: `ref` is an ordinary prop — never use `forwardRef`.
  ```tsx
  interface MapViewProps { ref: Ref<HTMLDivElement>; }
  export default function MapView({ ref }: MapViewProps) {
    return <div ref={ref} className="absolute inset-0" />;
  }
  ```
- `'use client'` only on the boundary component that owns hooks/effects (e.g. `MapClient`). Presentational children imported by it inherit the client bundle — do not mark them.

---

## Hooks Pattern

All useState and useEffect live in hooks, not components.
Components only describe what to render.

```
hooks/useLocations.ts     → location data + realtime subscription
hooks/useSelectedTruck.ts → which truck popup is open
hooks/useMapFilter.ts     → active now / later today / all

useMapFilter filter definitions:
- "active now"   → locations where starts_at <= now() AND expires_at > now()
- "later today"  → locations where starts_at > now() AND date(starts_at) = today (Stockholm)
- "all"          → all trucks regardless of location status (active + later + grey)
```

---

## proxy.ts (Next.js 16)

In Next.js 16 middleware.ts is renamed to proxy.ts.
Function renamed from middleware to proxy.
Runs on Node.js runtime (not edge — edge not supported in Next.js 16).
Node.js runtime is correct for this app — Supabase auth requires it.
This is automatic: do NOT add `export const runtime = 'nodejs'`. Next 16 rejects
route segment config in the Proxy file and `next build` fails (typecheck, lint and
tests all still pass, so the build is the only thing that catches it).

Layers (executed in this order):
1. Public routes bypass — skip all further checks for these routes:
   /, /map, /login, /api/cron/cleanup, /api/ingest, /api/email
   (/api/ingest and /api/email authenticate via their own secrets, not sessions)

2. Webhook verification — scoped to POST /api/ingest only:
   Check X-Make-Secret header matches MAKE_WEBHOOK_SECRET → reject 401 if missing or wrong

3. Authentication — all remaining routes:
   Check Supabase session → reject 401 if no valid session

4. Rate limiting — mutations only, via Upstash Redis sliding window:
   POST /api/locations → 10 req/min per truck session ID
   POST /api/ingest   → 30 req/min per IP
   POST /api/email    → 10 req/min per IP

All instances share the same Redis key — safe across Vercel serverless cold starts.

---

## Folder Structure

```
foodtruck-map/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── email/route.ts
│   │   │   ├── ingest/route.ts
│   │   │   ├── locations/route.ts
│   │   │   └── cron/cleanup/route.ts
│   │   ├── page.tsx               ← redirects to /map
│   │   ├── map/page.tsx
│   │   ├── dashboard/page.tsx      ← truck owner (has truck_id, posts location)
│   │   ├── admin/page.tsx          ← admin only (is_admin=true, manages trucks)
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── Map/
│   │   │   ├── MapClient.tsx
│   │   │   ├── MapView.tsx
│   │   │   └── TruckPopup.tsx
│   │   └── Dashboard/
│   │       └── LocationForm.tsx
│   ├── hooks/
│   │   ├── useMapLibre.tsx       ← MapLibre + PMTiles init, marker/popup lifecycle (.tsx: renders into popup)
│   │   ├── useLocations.ts
│   │   ├── useSelectedTruck.ts
│   │   └── useMapFilter.ts
│   ├── lib/
│   │   ├── services/
│   │   │   ├── ingestion.ts
│   │   │   ├── locations.ts
│   │   │   └── trucks.ts
│   │   ├── db/
│   │   │   ├── locations.ts
│   │   │   ├── trucks.ts
│   │   │   └── posts.ts
│   │   ├── parser/
│   │   │   ├── negation.ts
│   │   │   ├── location.ts
│   │   │   ├── date.ts
│   │   │   ├── time.ts
│   │   │   ├── confidence.ts
│   │   │   └── dictionary.ts
│   │   ├── validators/
│   │   │   ├── ingest.ts      ← webhook payload (truck_id, caption, source_platform)
│   │   │   ├── locations.ts   ← dashboard POST (address, starts_at, ends_at)
│   │   │   └── email.ts       ← Mailgun inbound payload + HMAC-SHA256 verification
│   │   ├── geocoding.ts
│   │   ├── supabase.ts
│   │   └── types.ts
│   └── proxy.ts
├── supabase/
│   ├── migrations/
│   │   └── 0001_initial_schema.sql   ← trucks, posts, locations, geocoding_cache, users
│   ├── seed.sql                      ← dev-only seed trucks for testing Phase 2+
│   └── config.toml
├── .claude/
│   ├── commands/
│   ├── plans/
│   └── context/
├── .env.local
├── .env.example
├── CLAUDE.md
├── vercel.json
└── package.json
```

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Webhook security
MAKE_WEBHOOK_SECRET=

# Email ingest (Mailgun)
MAILGUN_WEBHOOK_SIGNING_KEY=

# Nominatim
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org

# Map tiles (Protomaps PMTiles hosted on Cloudflare R2 — no API key needed)
NEXT_PUBLIC_PMTILES_URL=

# Rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

## vercel.json

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

---

## Testing Strategy

Framework: **Vitest**

Two layers:

### Unit tests — parser
All parser functions are pure and must have unit tests.
Test files live co-located next to the source file:
```
src/lib/parser/negation.test.ts
src/lib/parser/location.test.ts
src/lib/parser/date.test.ts
src/lib/parser/time.test.ts
src/lib/parser/confidence.test.ts
```

Cover:
- Swedish date expressions (idag, imorgon, named weekdays — future resolution)
- Time extraction (ranges, lunchtid, edge formats)
- Negation detection (inte, inställt, ej, stängt)
- Location matching against dictionary
- Confidence scoring matrix (all combinations)
- `normalizeCaption()` stripping emojis, hashtags, mentions

These tests double as labelled training data for the future ML parser replacement.

### Integration tests — ingestion service
Tests for `src/lib/services/ingestion.ts` run against a real local Supabase instance (`supabase start`).
Test files live in:
```
tests/integration/ingestion.test.ts
```

Cover:
- Override priority logic (all source confidence combinations)
- Time-window overlap detection (two non-overlapping slots coexist, overlapping triggers replace/discard)
- Deduplication (instagram_post_id, caption+60s)
- Geocoding failure — location not inserted, `last_known_lat/lng` not nulled
- `parsing_status` correctly set on posts row

### What is not tested
- API route handlers (thin HTTP wrappers — covered by manual curl testing in Phase 2)
- Map UI and React components (manual verification in browser)
- Realtime subscription behaviour (manual verification in Phase 4)

---

## Build Order (Phase 3 current)

```
Phase 1  Foundation       Map renders with fake hardcoded data (MapLibre + Protomaps PMTiles + Cloudflare R2)
Phase 2  Ingestion        Email + webhook endpoints built, tested with curl (includes X-Make-Secret verification)
                          Requires seed data: run supabase/seed.sql to insert dev trucks before testing
Phase 3  Parser           Swedish NLP parser built, unit tested (date-fns-tz for timezone)
Phase 4  Realtime         Supabase Realtime connected, map updates live from real ingested data
                          ⚠ Split src/lib/supabase.ts: client hooks importing supabaseClient will
                          evaluate the whole module in the browser, where the top-level service-role
                          guard throws (key is undefined client-side). Move supabaseAdmin into a
                          server-only module (add import 'server-only') and keep supabaseClient in a
                          browser-safe module. A single 'server-only' guard on the shared file would
                          also block the legit anon import — the fix is a file split, not just a guard.
                          ⚠ Add locations to the Realtime publication — the 0001 migration does NOT
                          (pg_publication_tables for supabase_realtime is empty). Without
                          `alter publication supabase_realtime add table locations;` the map gets
                          ZERO live updates and fails silently (no error). Add it in a Phase 4 migration.
Phase 5  Auth + Dashboard Truck login, manual posting, admin truck registration — FIRST DEPLOY
Phase 6  Cron + Cleanup   Stale pins expire automatically
Phase 7  Hardening        proxy.ts, Upstash rate limiting, security headers, error handling
                          ⚠ /api/email buffers the whole request body before auth: HMAC verification
                          needs the parsed form fields, so `await request.formData()` runs BEFORE the
                          signature check and fully parses the body into memory — including attachment
                          file parts the route then discards (text fields only in Phase 2). An
                          unauthenticated caller can thus force a full multipart parse pre-auth (memory
                          amplification / DoS vector). Vercel caps serverless request bodies at ~4.5 MB
                          in prod, but add an explicit body-size guard before parsing. The webhook lane
                          is NOT affected — it checks the X-Make-Secret header before reading the body.

                          ⚠ MAILGUN IP ALLOWLIST — restrict POST /api/email to Mailgun's published
                          inbound IP ranges. This is the ONLY effective control for the residual
                          content-forgery vector: Mailgun's HMAC covers `timestamp + token` and NOT
                          `recipient` / `body-plain`, so a valid tuple can carry an arbitrary truck
                          UUID and caption. No amount of signature checking fixes that (attempting it
                          via input validation once reintroduced data loss — see process-log.md
                          2026-08-09 "10-digit timestamp pin"). An allowlist ignores what is signed and
                          simply refuses replays arriving from anywhere but Mailgun.
                          It also fixes the rate-limit shape: a per-IP limit is near-useless here since
                          ALL legitimate traffic comes from Mailgun's pool — it throttles genuine mail
                          while an attacker keeps their own bucket. Allowlist + a GLOBAL limit is the
                          coherent pairing, not per-IP.
                          Currently bounded by: the replay index (one row per captured tuple), the
                          15-min window (older → 'skipped', never parsed), and source_confidence 0.55
                          (a forged post caps at yellow and any manual post overrides it).

                          ⚠ Also here: the pre-DB replay cost. A replayed tuple no longer stores a row
                          but still costs a trucks lookup + failed insert. Short-circuiting before the
                          DB round trip needs the Upstash token cache in front of the query.
Phase 8  Onboarding       Real trucks, Make.com per-truck setup guides, 1-to-1 onboarding
```

Currently in: Phase 3 — parser. Phase 2 (ingestion) is complete and merged:
schema + seed, Supabase clients, shared types, DB layer, validators (+ Vitest),
the ingestion service, and both /api/ingest and /api/email routes — all
curl-verified end-to-end against the local stack.

Two follow-on rounds have also landed since:
- **Phase 2 audit (#45–#51, PR #52)** — Mailgun replay window, ingestion-service
  unit tests, generated `Database` types with the app row types derived from them,
  and migrations 0002/0003 reconciling column nullability with `src/lib/types.ts`.
  Note #50's L3 was closed as INVALID: `export const runtime` in `src/proxy.ts`
  breaks `next build` on Next 16.
- **Email stale-payload handling (#53, PR #54)** — a stale-but-signed payload is
  now stored as `parsing_status = 'skipped'` rather than rejected, plus migration
  0004 (token replay guard + signature redaction).

Next: the Swedish NLP parser (`src/lib/parser/*`), geocoding
(`src/lib/geocoding.ts`), and the first `locations` writes (override/priority +
dedup) hung off `persistPost`.

⚠ Phase 3 must filter `parsing_status = 'skipped'` when writing `locations`.

Phase 5 has two distinct surfaces:
- /admin  → admin user creates/manages truck records, invites truck owners via magic link
- /dashboard → truck owner posts their location for today

---

## API Error Format

All API routes return errors in this shape:

```json
{ "error": "Human-readable message" }
```

Always paired with the appropriate HTTP status code:
- `400` — bad input (missing fields, invalid truck_id, failed validation)
- `401` — not authenticated
- `403` — authenticated but not authorised (e.g. wrong truck_id for session)
- `409` — discarded duplicate (post already exists)
  ⚠ NOT reachable on the webhook/email lanes. Both routes send 200 before `after()`
  runs, so a duplicate `instagram_post_id` surfaces only after the response is
  committed — it resolves as **200 + silent discard**. This is deliberate (webhook
  endpoints must ack immediately). 409 is reserved for a future synchronous caller
  that can still influence its own response. See `persistPost` in
  `src/lib/services/ingestion.ts`.
- `500` — unexpected server error

Never expose stack traces or internal error messages to the client.

---

## Key Business Rules

- Swedish language throughout all user-facing text
- Manual post always overrides any parsed post whose time window overlaps with it
- Never show confidence below 0.45 as a location — show ⚫ instead
- Never show raw confidence percentages — always human language
- Locations expire at ends_at or posted_at + 8 hours, hard cap midnight
- Consumers are always anonymous — no account, no tracking
- One Supabase account per truck — no shared credentials
- Raw post always stored BEFORE parsing — never lose incoming data
- The `posts` table is never purged — it is the training corpus for a future ML model that will replace the dictionary-based Swedish NLP parser. Do not add cleanup logic for `posts`. The Vercel cron cleans `locations` only; this is intentional.
- Return 200 immediately from webhook endpoints — use Next.js `after()` (import from `next/server`) to run parsing and DB writes after the response is sent (Node.js runtime only, stabilized in Next.js 16)