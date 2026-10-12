# Phase 1 — Foundation

> **History (marked in Phase 4, #144).** Phase 1 is done, and its fake-data map still
> runs. Parts of this plan describe the old three-lane design (confidence-coloured and
> grey markers, Realtime, ingest routes) that Phase 4 dropped. The current design is in
> `.claude/context/project-context.md`.

## Goal
The map renders in the browser at `/map` with fake hardcoded truck markers.

---

## Out of Scope
- Real data from Supabase
- Authentication and sessions
- Supabase Realtime
- API routes (ingest, email, locations, cron)
- Hooks (`useLocations`, `useSelectedTruck`, `useMapFilter`)
- `proxy.ts` middleware
- Rate limiting (Upstash Redis)
- Parser (Swedish NLP)
- Dashboard and admin pages

---

## Files

### New
| File | Description |
|---|---|
| `src/lib/types.ts` | Shared TypeScript types: `Truck`, `Location`, `MarkerState` |
| `src/lib/fake-data.ts` | Hardcoded fake trucks and locations for Phase 1 dev |
| `src/app/map/page.tsx` | Map page — server component, renders `<MapClient />` |
| `src/components/Map/MapView.tsx` | Full-screen map container div, exposes ref for MapLibre |
| `src/components/Map/MapClient.tsx` | `'use client'` — initialises MapLibre + PMTiles, renders markers |
| `src/components/Map/TruckPopup.tsx` | Popup rendered on marker click — name, cuisine, hours, confidence, Instagram |

### Modified
| File | Change |
|---|---|
| `src/app/page.tsx` | Add `redirect('/map')` |
| `src/app/layout.tsx` | Import MapLibre global CSS |
| `package.json` | Add `maplibre-gl` and `pmtiles` dependencies |
| `.env.local` | Add `NEXT_PUBLIC_PMTILES_URL` |

---

## Steps

1. **Install dependencies** (`package.json`)
   Install `maplibre-gl` and `pmtiles`. Nothing else can run without these.

2. **Define types** (`src/lib/types.ts`)
   Write `Truck`, `Location`, and `MarkerState` types. Must exist before any file references them — TypeScript blocks everything else if types are missing.

3. **Create fake data** (`src/lib/fake-data.ts`)
   Write `FAKE_TRUCKS` and `FAKE_LOCATIONS` arrays using real Gothenburg coordinates. Include varied confidence values to cover green, yellow, and grey marker states.

4. **Configure env** (`.env.local`)
   Add `NEXT_PUBLIC_PMTILES_URL`. Without it the map loads but tiles never render — harder to debug if discovered late.

5. **Update `layout.tsx`**
   Import MapLibre global CSS. If skipped the map container collapses to zero height — painful to debug late.

6. **Update `page.tsx`**
   Add `redirect('/map')`. Simple, no dependencies.

7. **Create `MapView.tsx`**
   Render the full-screen container div. Must exist before `MapClient` can attach MapLibre to it.

8. **Create `TruckPopup.tsx`**
   Build the popup component before `MapClient` so it is importable when needed.

9. **Create `MapClient.tsx`**
   Implement `initMap()` and `addMarker()`. Depends on everything above. This is the core of Phase 1.

10. **Create `map/page.tsx`**
    Compose `<MapClient />` into a page. Last step — verify in browser.

---

## Rationale

**MapLibre GL JS + Protomaps PMTiles over Google Maps / Mapbox**
Google Maps is expensive at scale. Mapbox has a capped free tier and requires an API key. MapLibre is open source and free forever. PMTiles on Cloudflare R2 has zero egress fees and 10 GB free storage. No vendor lock-in, no API key, no cost ceiling.

**HTML markers via MapLibre Marker API over image-based markers**
HTML elements are pure CSS circles — no broken image paths, dynamically coloured based on confidence with a simple class swap, no asset pipeline needed. Matches the rule in `CLAUDE.md`: markers are HTML elements, no image files.

**`MapClient.tsx` as `'use client'`, `map/page.tsx` stays server component**
MapLibre requires browser APIs (WebGL, DOM) and cannot run server-side. Isolating `'use client'` to `MapClient` keeps the page a server component — correct Next.js App Router pattern.

**Fake data in `src/lib/fake-data.ts`, not inline in the component**
Mirrors the exact shape of real DB data. In Phase 4 the swap is clean — replace the fake-data import with a hook call, nothing else changes.

**`MarkerState` as a merged Truck + Location type**
The map needs both truck metadata (name, cuisine) and location data (lat/lng, confidence) to render a marker. Establishing the merged type now mirrors what `useLocations.ts` will produce in Phase 4.

**No hooks in Phase 1**
Hooks (`useState`/`useEffect`) belong in Phase 4 when real data arrives. With hardcoded data there is no state to manage — introducing hooks now is premature abstraction and violates the rule in `CLAUDE.md`.

**Fake data covers all three confidence states**
Green (>= 0.9), yellow (0.45–0.89), and grey (no active location) must all be verified before real data arrives. Fake data explicitly includes all three.

---

## Acceptance Criteria

- `npm run dev` starts with no errors
- Navigating to `/` redirects to `/map`
- The map renders at `/map` centred on Gothenburg `[11.9746, 57.7089]` at zoom 13 with real map tiles visible — not a blank canvas
- At least 3 fake truck markers are visible on the map
- At least one green marker (confidence >= 0.9), one yellow (0.45–0.89), and one grey (no active location) are visible
- Clicking a marker opens a popup showing: truck name, cuisine, hours, confidence as human language (not a number), Instagram link
- Clicking outside the popup closes it
- No marker uses an image file — all are HTML elements styled with CSS via MapLibre Marker API
- The map does not fully re-render when a marker is clicked — no flash or reload
- TypeScript compiles with no errors (`tsc --noEmit`)
- No errors or warnings in the browser console related to MapLibre or PMTiles
- `NEXT_PUBLIC_PMTILES_URL` is the only env var required — app does not crash if Supabase vars are absent

---

## Open Decisions

- **PMTiles file** — which Protomaps extract to use, what zoom levels, how to upload to Cloudflare R2. Must be resolved before the map can show tiles.
- **MapLibre map style** — pre-built Protomaps community style vs. minimal custom style. Affects map appearance. Decided at implementation time.
- **Popup rendering approach** — MapLibre's own `Popup` class vs. a React component absolutely positioned over the map. Decided when writing `MapClient.tsx`.
- **Map container height** — full viewport (`100vh`) vs. accounting for a future nav bar. Decided when writing `MapView.tsx`.
- **Fake truck coordinates** — real Gothenburg street coordinates looked up when writing `fake-data.ts`.
- **Confidence label copy in Swedish** — exact strings for human-language confidence display (e.g. "Postades idag av trucken" for green). Decided when writing `TruckPopup.tsx`.
