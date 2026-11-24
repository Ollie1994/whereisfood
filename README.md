# Väm (Var är maten) — Gothenburg Food Truck Map

A phone-first web map of where Gothenburg's food trucks are **today**: who is out, where,
and until when. No login, no tracking.

<p align="center">
  <img src="docs/screenshots/karta.png" width="300" alt="The map at phone width, with a truck's popup open: its place, its hours and when the entry was last updated">
  &nbsp;&nbsp;
  <img src="docs/screenshots/admin.png" width="300" alt="The admin screen at phone width: the morning checklist and the form for a new entry">
</p>

> **Status: Phase 10 of 11 (launch) done; Phase 11 (full launch) next.** Väm runs in production at
> `vararmaten.vercel.app` as a soft launch: the map is shown only to the admin, and everyone else
> sees a page about it (`/om`) and the privacy note (`/integritet`). Production holds no trucks yet.
> See [Project status](#project-status), and [`RUNBOOK.md`](RUNBOOK.md) for how it is run.

## Why it exists

Gothenburg's food trucks announce where they'll be on Instagram and Facebook, one post or
Story at a time. There has been no central map since Streetkäk shut down in 2017.

Väm's answer is deliberately low-tech: **one admin enters every location by hand**, from a
phone, after following each truck with post and Story notifications on. An earlier design
tried to do it automatically, with webhooks and email feeding a Swedish caption parser. It
was dropped: a parser can't see image-only posts, Stories or schedule graphics, and a wrong
pin costs more users than a missing one. Truck owners get to claim their listing and post
themselves later.

## How it works

This is the design. Phases 5 to 10 built the schema, the public read path (the map, its
polling and cache, the popup's freshness text), the admin screen with its entry flow,
CI/CD, security (the admin's second factor, session limits, security headers) and the
first production deploy, a soft launch with the map shown only to the admin; the full
launch is Phase 11's.

- **The admin enters every location by hand.** A pin comes from a map tap, a known
  Gothenburg spot, a recently used place, or the phone's GPS. Start and end times are
  pre-filled and always required. A morning checklist suggests what each truck did on the
  same weekday recently. Nothing reaches the map until the admin confirms it.
- **Honest freshness.** Only trucks with an entry today appear. The popup says when the
  entry was last updated and links to the truck's Instagram, so people can check.
- **Overlaps are refused, not resolved.** A second entry for the same truck in an
  overlapping time window is rejected, and the admin edits the existing one instead.
- **Nothing is deleted by the app.** A cancelled entry is marked cancelled, and an ended one
  stops matching the "today" filter. The only deletes are a takedown on a truck's request
  and a weekly retention run for entries that ended more than 52 weeks ago, both manual SQL.

## How it's built

- **One public read path, and the browser never touches the database.** The map polls
  `GET /api/live` every 60 seconds while the tab is visible. It's an ordinary route that
  Vercel's CDN caches for 60 seconds, so polling costs the database about one query a minute
  per region however many people have the map open. The public API roles get no access to
  the trucks' tables, so no one can pull a truck's location history.
- **The database enforces the rules.** An exclusion constraint refuses overlapping entries.
  Every table has row-level security and explicit grants per table, and the server reaches
  the data through a database layer that finds and changes rows but decides nothing.
- **A locked-down admin.** The one admin signs in with an emailed magic link and then a code
  from an authenticator app. A session is refused 12 hours after its sign-in, logging out on
  one device ends every session, and every admin route checks the session, the role and the
  second factor again on its own. The admin pages get a content security policy with a new
  nonce per request.
- **Strict layering.** Route handlers only speak HTTP, services hold the logic, and only
  the database layer talks to Postgres:

  ```
  app/api/*/route.ts   → HTTP only, no business logic
  src/lib/services/    → all business logic, no HTTP knowledge
  src/lib/db/          → database access only
  src/lib/validators/  → input validation
  ```

- **CI is the gate.** Every pull request runs type-checking and lint, unit tests,
  integration tests against a local Supabase, a production build with a smoke check of the
  served app, `npm audit`, a secret scan and CodeQL. The **schema controls** go further:
  each of 65 SQL files removes or narrows one guard in the schema, and CI checks that the
  tests meant to catch it go red (or, for three, stay green). Branch rulesets require the
  checks, with no bypass, not even for the owner.

## How it's made

Väm is built with [Claude Code](https://claude.com/claude-code), under a process that
treats its own mistakes as data:

- **Plans with numbered decisions.** Each phase has a plan in [`.claude/plans/`](.claude/plans/),
  and every settled question becomes a numbered decision with its reasons, so it isn't
  argued again a session later. [`CLAUDE.md`](CLAUDE.md) holds the working rules that
  outlive a phase.
- **A log of misses.** [`.claude/process-log.md`](.claude/process-log.md) records every time
  the process got something wrong: a gate that let a defect through, a stale rule, a fix
  that broke something else. Each row has a cause from a fixed list, and each phase ends
  with a retrospective that counts them.
- **Review rounds with checks of their own.** Every pull request gets review rounds up to a
  fixed ceiling. Before each round, a sweep looks for every copy of what the last fixes
  changed, and a claims check lists each "every", "only" and "always" the change added, to
  be backed by a command or narrowed.

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

## More

- [`SETUP.md`](SETUP.md): setting it up, locally and on the hosted projects
- [`RUNBOOK.md`](RUNBOOK.md): running it, from the weekly routine to incidents
- [`CLAUDE.md`](CLAUDE.md): the working rules
- [`.claude/context/project-context.md`](.claude/context/project-context.md): the design reference
