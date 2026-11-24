# Väm (Var är maten) — Gothenburg Food Truck Map

A web map showing where Gothenburg's food trucks are **today**.

Hungry people open the map (no login, no tracking) and see which trucks are out,
where, and until when. At launch every location is entered by hand by one admin, who
follows each truck on Instagram with post and Story notifications on, and updates the
map from a phone-first admin screen. Truck owners get to claim their listing and post
themselves later.

It fills a real gap: Gothenburg has had no central food-truck map since Streetkäk
shut down in 2017.

> **Status: Phase 10 of 11 (launch) done; Phase 11 (full launch) next.** Väm runs in production at
> `vararmaten.vercel.app` as a soft launch: the map is shown only to the admin, and everyone else
> sees a page about it (`/om`) and the privacy note (`/integritet`). Production holds no trucks yet.
> See [Project status](#project-status), and [`RUNBOOK.md`](RUNBOOK.md) for how it is run.

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

This is the design. Phases 5 to 10 built the schema, the public read path (the map, its
polling and cache, the popup's freshness text), the admin screen with its entry flow,
CI/CD, security (the admin's second factor, session limits, security headers) and the
first production deploy, a soft launch with the map shown only to the admin; the full
launch is Phase 11's.

- **The admin enters every location by hand.** A pin comes from a map tap, a known
  Gothenburg spot, a recently used place, or the phone's GPS. Start and end times are
  pre-filled and always required. A morning checklist suggests what each truck did
  on the same weekday recently. Nothing reaches the map until the admin confirms it.
- **Overlaps are refused, not resolved.** A database constraint rejects a second
  entry for the same truck in an overlapping time window, and the admin edits the
  existing one instead. Nothing is replaced or deleted automatically.
- **Nothing is deleted by the app.** Cancelling an entry marks it cancelled, and an ended
  entry simply stops matching the "today" filter. The only real deletes are a takedown on a
  truck's request and the weekly retention run, which deletes entries that ended more than
  52 weeks ago, both manual SQL (`RUNBOOK.md`, "Takedown" and "Backups").
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
| 10 · Launch          | Production deploy, a soft launch: the map shown only to the admin, an about page and a privacy note for everyone else, the runbook | ✅ Done |
| 11 · Full launch     | The map public, a custom domain for the tiles, paid plans | ⬜ Next |

Phases 2 and 3 built automatic ingestion: Make.com webhooks and Mailgun email, run
through a Swedish parser that turned captions into locations. It was dropped for the
admin-populated design above. The code is archived on the `archive/parser-lanes`
branch and tag.

---

Setting it up: [`SETUP.md`](SETUP.md). Running it: [`RUNBOOK.md`](RUNBOOK.md).
