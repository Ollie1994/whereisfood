# Phase 7 — Admin

**Planned:** 2026-11-05 · **Status:** planned

**Source:** `project-context.md` Part 2 ("Phase map", "Product model", "Admin and auth",
"Open decisions"), Part 3's "Decisions carried forward" (the nine rows marked **between
phases**, taken up by #1–#9), and the `/create-milestone` conversation of 2026-11-05.
Where this plan and `project-context.md` disagree, **this plan wins** until step 15
reconciles the context.

**Purpose of the phase:** the map gets real data. Until now the preview shows only seed
rows; this phase gives one admin, on a phone, the means to keep the map right every day,
and proves it on the preview before Phase 8 opens it to the public.

---

## Goal

On the preview deploy, the admin logs in by magic link on a phone and manages trucks and
each day's locations (fast entry, edit, cancel, the morning checklist), the changes reach
the public map, and nobody else can write anything.

---

## Prerequisites

- Node and npm in the ranges `package.json`'s `devEngines` admits (`CLAUDE.md`,
  "Dependencies").
- Docker running, for local Supabase and `npm run test:all`.
- The hosted preview project awake: Supabase Free pauses after a week idle
  (`project-context.md`, "Pricing"). Read it before step 2's hosted settings.
- The owner's phone logged in to Vercel, or another way past the preview's Deployment
  Protection (`README.md`, "Preview deploys"). Open decision 3.

---

## Out of Scope

| Item | Where it goes |
|---|---|
| "Inställt idag" on the public map (#19) | revisited after real use |
| Production deploy and project, Supabase Pro, the tiles' custom domain, security headers, the Swedish privacy note, the takedown procedure, telling trucks they're listed | Phase 8 |
| CI/CD, SAST, secret scanning, branch protection; the gates stay manual | Phase 8 |
| History retention (#25) and the final app name (#26) | Phase 8 |
| Owner accounts, the claim flow, the owner dashboard, override rules, custom SMTP | Owners phase |
| Instagram or Meta automation, schedulers, checklist reminders | later |
| Deleting a truck or a location from the app. A truck is set inactive, a location is cancelled | never, except the manual takedown |
| Auto-resolving overlaps, a `schedules` or `spots` table | not planned (`transition.md` §0) |
| Fixes for the read path's scaling limits | when their trigger is hit (`project-context.md`, "Scaling limits") |
| Changes to the public map beyond what shows admin entries | — |
| A migration, unless a probe forces one | — |

---

## Files

### Create

| File | What it is |
|---|---|
| `src/lib/supabase-browser.ts` | `supabaseClient`, Auth only, safe in the browser (#27); from step 2, `@supabase/ssr`'s `createBrowserClient` (#12) |
| `src/lib/supabase-session.ts` | The per-request session client, from `@supabase/ssr`, with a read-only cookie adapter and a writing one (#12) |
| `src/lib/http/origin.ts` (+ test) | `requestOrigin()`, `isSameOrigin()`, `isWrite()`, `foreignOriginRefusal()` and `redirectTo()`, shared by `withAdmin`, the proxy, the callback and logout (#16) |
| `src/lib/http/admin.ts` | `withAdmin()`, the one way into an admin route, and `readJson()` |
| `src/lib/services/admin-auth.ts` (+ test) | `requireAdmin()`, `hasSessionCookie()` |
| `src/lib/services/trucks.ts`, `locations.ts`, `checklist.ts` (+ tests) | Admin business logic |
| `src/lib/db/users.ts` | `getUserById()` |
| `src/lib/validators/truck.ts`, `location.ts` (+ tests) | Pure input checks |
| `src/lib/stockholm.ts` (+ test) | Stockholm calendar days, day bounds and wall-clock time to UTC, with `live.ts`'s helpers moved in (#31) |
| `src/app/auth/callback/route.ts` | Finishes the login |
| `src/app/auth/logout/route.ts` (+ test) | Ends the session, outside `/api/admin/` (#28); its test stubs an Auth error, which the local stack can't produce on demand |
| `src/app/api/admin/trucks/route.ts`, `trucks/[id]/route.ts` | List, create, edit |
| `src/app/api/admin/locations/route.ts`, `locations/[id]/route.ts` | List, create, edit |
| `src/app/api/admin/locations/[id]/cancel/route.ts`, `locations/[id]/confirm/route.ts` | Cancel, "Stämmer fortfarande" |
| `src/app/api/admin/checklist/route.ts` | The morning list |
| `src/app/api/admin/places/route.ts` | A truck's recent places |
| `src/app/admin/layout.tsx`, `page.tsx`, `login/page.tsx`, `trucks/page.tsx` | The screens, phone-first |
| `src/components/Admin/*` | `LoginForm`, `LogoutButton`, `TodayList`, `Checklist`, `LocationForm`, `PlacePicker`, `TruckForm` |
| `src/hooks/useLogin.ts`, `useAdminLocations.ts`, `useChecklist.ts`, `useLocationForm.ts`, `usePlacePicker.ts`, `useGeolocation.ts`, `useTrucks.ts` | All state lives here |
| `tests/integration/db-users.test.ts` | The key-set test a new table's reads need |
| `tests/integration/auth-routes.test.ts` | `/auth/callback` and `/auth/logout` against the local stack |
| `tests/integration/admin-auth.test.ts` | 401 and 403 on every admin route, found on disk (#13) |
| `tests/integration/api-admin-trucks.test.ts`, `api-admin-locations.test.ts`, `api-admin-checklist.test.ts` | The routes against the local stack |

### Modify

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | Add `@supabase/ssr` and `server-only` |
| `src/lib/supabase.ts` | Gains `import "server-only"`, loses `supabaseClient` (#27) |
| `vitest.config.ts` | An alias for `server-only`, if a probe shows it is needed |
| `src/proxy.ts`, `src/proxy.test.ts` (new) | The real matcher and checks; the test pins the matcher (#10) |
| `src/lib/live.ts` | `TZ`, `stockholmDay` and `stockholmMidnight` move out, imported from `stockholm.ts` (#31) |
| `supabase/config.toml` | Sign-ups off, redirect URLs |
| `src/lib/db/trucks.ts` | `listAllTrucks`, `insertTruck`, `updateTruck` |
| `src/lib/db/locations.ts` | `getLocationById`, `confirmLocation`, `findTruckLocationsOverlapping`; `listRecentLocationsForTruck`'s limit check moved into `checkLimit`, shared with the last, same rule and message (PR for IS #226, round 1) |
| `src/lib/types.ts` | `NewTruck`, `TruckPatch`, `User` |
| `src/hooks/useMapLibre.tsx` | Only if the pin picker needs its setup shared; then a `/map` browser check |
| `tests/integration/helpers.ts` | A session cookie for route tests (open decision 7) |
| `supabase/seed.sql` | #196's comments, and a local admin user if that proves simplest (open decision 5) |
| `README.md` | Creating the admin user, the hosted auth settings |
| `CLAUDE.md` | The bold plan line; the rules step 1 and step 3 change or add |
| `.claude/process-log.md` | Rows as they happen; the retrospective |

### Untouched, on purpose

- `supabase/migrations/`: `users.is_admin` exists, and no step here adds a column (#18).
- `src/app/api/live/route.ts`, `src/lib/services/live.ts`: admin entries reach the map through
  the existing read path.
- `src/lib/db/locations.ts`'s `findLocationsOverlapping`: reused, as Phase 5 #9 planned.

### Outside the repo (steps, not files)

- On the hosted preview project: sign-ups off, Site URL and redirect URLs, the admin's
  auth user and `users` row. `README.md` records the settings, never a secret.

---

## Functions and types

**HTTP (`src/lib/http/admin.ts`).** `withAdmin(request, handler)`: wraps `withErrorHandling`,
runs `requireAdmin`, answers 401 or 403, refuses a write that fails `isSameOrigin` (#16;
the proxy refuses it first on `/api/admin/*`, before any Auth call, PR #237), and sets
`Cache-Control: no-store` on what it returns (#15). The handler receives the
admin's user id. `readJson(request)`: a body that isn't valid JSON answers 400 with a Swedish
message, and no handler calls `request.json()` itself. `requestOrigin(request)`
(`src/lib/http/origin.ts`): the scheme and host from `x-forwarded-host`, then `Host`, never
`request.url` (#16). Redirects don't use it, since a client can set `x-forwarded-host`: the
callback and logout send a relative `Location` (`redirectTo`), and the proxy one built from
`request.url`, which Next made relative under `next start`; `src/proxy.ts` says when it
doesn't, and that a Vercel deploy wasn't checked (PR #237). `isSameOrigin(request)`:
the `Origin` header equals `requestOrigin`, and a missing or `null` `Origin` is false.

**Services (no HTTP knowledge).**
- `hasSessionCookie(names)`: pure; is there a Supabase auth cookie, chunked ones included?
- `requireAdmin({ cookieNames, getUser })`: `hasSessionCookie` first, with no network or
  DB call; then `getUser()`, which verifies the session; then reads `is_admin` through
  `getUserById`. Returns the id or the reason (`no-session`, `not-admin`, `unavailable`,
  #32). No `users` row is `not-admin`. It takes these two values, not a request, because services have no HTTP knowledge (`CLAUDE.md`,
  "Architecture Rules"); `withAdmin` and the proxy build them from a session client.
- `listTrucks()`, `createTruck(input)`, `editTruck(id, patch)`: "set inactive" is an edit.
  `23505` on the handle is a conflict result.
- `listAdminEntries(now)`: the live entries from the start of today for 14 days, with
  truck names from `listAllTrucks`, so an entry of a truck set inactive keeps its name,
  uncached (#24).
- `createEntry(input, adminId, now)`, `editEntry(id, patch, now)`, `now` for #33's checks:
  `createEntry` takes the truck
  through `getActiveTruckById`, where null gives a 400 with a Swedish message, and sets
  `created_by` and `source` itself (#17). `editEntry` reads the row with `getLocationById` (null gives a 404), merges the patch,
  and checks the merged row's time order and `isInGothenburg`, so a partial patch answers
  400. It writes only the patch, and answers the order CHECK's `23514`, which another tab's edit
  between the read and the write can bring, with the same 400 (PR #243, round 2). `23P01`
  becomes a conflict result naming the existing entry's Stockholm times, found through
  `findTruckLocationsOverlapping`, leaving out the entry being edited: not
  `findLocationsOverlapping`, which reads every truck and throws on a window holding more
  than `max_rows` rows (PR for IS #226, round 1).
- `cancelEntry(id, now)`, `confirmEntry(id, now)`: null for a missing or cancelled entry,
  which the route answers with 404.
- `getChecklist(now)`: #22's rules.
- `getRecentPlaces(truckId, now)`: distinct places from `listRecentLocationsForTruck`.

**db layer.** The rules are `CLAUDE.md`'s ("db layer").
- `getUserById(id)`, with a `USER_COLUMNS` literal, returned uncast: `.maybeSingle()`, null
  for an auth user with no `users` row.
- `listAllTrucks()`, ordered by name, with `assertAllRows`.
- `insertTruck(truck)`, `updateTruck(id, patch)`: a `Record` of keys and `pick`, as
  `locations.ts` does, and a throw on an empty patch.
- `getLocationById(id)`: a live row, or null for a missing or cancelled one.
- `confirmLocation(id, confirmedAt)`: through `updateLiveRow`, so a cancelled row gives
  null. It writes `updated_at`, and the trigger then sets its own `now()` (#18).
- `findTruckLocationsOverlapping(truckId, from, to, limit)`: one truck's live rows in a
  window, with `listRecentLocationsForTruck`'s limit rule, for the overlap message.

**Validators (pure).** `parseNewLocation` (shape, order of the times, `isInGothenburg`),
`parseLocationPatch` (the shape of the keys it holds; `editEntry` checks across fields),
`parseNewTruck`, `parseTruckPatch` (the handle's form, #29). A patch with no known key is
refused here, since the db layer throws on an empty one. `created_by`, `source` and
`cancelled_at` are never read from a body (#17). Every id that reaches the db layer goes
through `isUuid`: on a path, in a query string or in a body.

**`src/lib/stockholm.ts`.** `TZ`, `stockholmDay`, `stockholmMidnight` (moved from `live.ts`,
#31), `stockholmDayBounds(now)`, `wallClockToUtc(day, "11:00")`, and `entryWindow(day, start,
end)`, whose end at or before the start falls on the next day (#30), through `Intl`, not
`date-fns-tz`, whose results depend on the host's zone (`CLAUDE.md`, "Time"; PR #238). They
are right on 23- and 25-hour days, except for a shift inside the repeated autumn hour that
ends before it starts, which `entryWindow` reads as next-day (its stated limit, PR #238).
Both give null for a time the day doesn't have, such as 02:30 on 2026-03-29 (PR for IS
#225). The form and the checklist both call `entryWindow`; the API takes timestamps, so
`parseNewLocation` still refuses an end at or before the start.

**Proxy.** `proxy(request)`: the order of `requireAdmin`, on `/admin/:path*` and
`/api/admin/:path*`, with `/admin/login` let through. A page gets a redirect to the login,
a route gets `{ error }`, and an `unavailable` result gets #32's answer. Its session client's
adapter writes rotated cookies to the request
it forwards with `NextResponse.next({ request })` and to the response, so the route sees
them and so does the browser (#12). `/api/live`, `/map` and `/auth/*` are outside the matcher
(#10, #28).

---

## Steps

Strict order. Each step is one issue and one PR into `dev`, with two exceptions: step 14 is
one per follow-up and may be none, and the checkpoints have an issue and no PR. **Steps 4, 8
and 12 are checkpoints**: done by the owner on a phone, on the preview, and recorded on their
own issue, which blocks the next step. A checkpoint that fails stops the next step until the
failure is understood.

0. **This plan.** The plan file, and `CLAUDE.md`'s bold "Current phase plan" line naming
   it, where between phases it read `none (the last one:
   .claude/plans/phase-6-live-read-path.md)`. Only that line of the header changes.
1. **Split the Supabase clients.** `src/lib/supabase.ts`, `src/lib/supabase-browser.ts`,
   `vitest.config.ts` if needed, and `CLAUDE.md`'s "Supabase" rules. *First because* the
   login screen would otherwise evaluate the service-role module in the browser and throw
   (`project-context.md`, "Admin and auth"). No behaviour changes.
2. **Login.** `@supabase/ssr`, `src/lib/supabase-session.ts`, `supabase-browser.ts` moved to
   `createBrowserClient`, `src/lib/http/origin.ts`, `src/app/admin/login/page.tsx`,
   `LoginForm`, `useLogin`, `src/app/auth/callback/route.ts`, `src/app/auth/logout/route.ts`,
   `src/app/admin/layout.tsx` with `LogoutButton`, so it shows on every admin screen, the
   login included, a minimal `src/app/admin/page.tsx`, for step 4 to land on,
   `tests/integration/helpers.ts`'s session cookie, `auth-routes.test.ts`,
   `supabase/config.toml`, the preview project's settings, and the README's "create the admin
   user". *Every later step needs a real session.* Set `enable_signup = false` under
   `[auth]` **only, never under `[auth.email]`**. On the local stack (2026-11-05, `supabase
   start` with each edit, then the Auth API), `[auth]`'s refuses a new email with
   `signup_disabled` and leaves password sign-in and a link for an existing user working;
   `[auth.email]`'s sets `GOTRUE_EXTERNAL_EMAIL_ENABLED=false` and refuses every email login
   with `email_provider_disabled`. The login sends `shouldCreateUser: false`.
3. **The gate.** `getUserById` and `db-users.test.ts`, `hasSessionCookie`, `requireAdmin`,
   `withAdmin`, `readJson`, `src/proxy.ts` and `src/proxy.test.ts`, `admin-auth.test.ts`,
   `CLAUDE.md`'s `proxy.ts` and API rules,
   and the first admin route behind it: `listAllTrucks`, `listTrucks`, `GET
   /api/admin/trucks`, with `api-admin-trucks.test.ts`, which step 7's form needs and #13's
   test exercises. *No admin route exists before this, so none can ship unprotected.* Logout
   isn't an admin route (#28).
4. **Checkpoint: login on the phone.** Magic link, then logout, on the preview, on the owner's
   phone; logout is the first write `isSameOrigin` sees behind Vercel. `/api/live`, requested
   with the admin's cookie, still reaches `x-vercel-cache: HIT` with no `Set-Cookie`. *The
   biggest unknown is tested before anything is built on it* (open decisions 1–3).
5. **Times and location validators.** `src/lib/stockholm.ts`, with `live.ts`'s helpers moved in
   and `live.test.ts` unchanged and green, `src/lib/validators/location.ts`. *Pure, and step 6
   depends on them.*
6. **The location write path.** `getLocationById`, `confirmLocation`,
   `src/lib/services/locations.ts`, the location routes, `api-admin-locations.test.ts`.
   *Trucks are already in the seed, so locations come before truck writes* (#21).
7. **The admin screen.** The full `src/app/admin/page.tsx`, `TodayList`, `LocationForm`,
   `useAdminLocations`, `useLocationForm`, with known spots only. The form lists active trucks
   when creating, and shows the entry's own truck read-only when editing, since a patch can't
   change it and that truck may be inactive. It shows "slutar imorgon" when the end falls on
   the next day (#30). *The shortest route to a working form.*
8. **Checkpoint: an entry reaches the map.** Enter a location on the phone, see it on the
   preview's public map, press "Stämmer fortfarande" and see the popup follow, cancel it
   and see it leave. Each shows within about 3 minutes, not at once: 60 s of cache, 60 s of
   stale window and a 60 s poll. Then leave a lunch and a dinner for one truck, not cancelled:
   the preview's seed history stops at 2026-11-01 and doesn't move with the date (`README.md`,
   "Hosted preview database"), so these are step 12's history. *The phase's core works here,
   even if everything after it slipped.*
9. **`PlacePicker`.** `usePlacePicker`, `useGeolocation`, `getRecentPlaces`, the places
   route: map tap, recent places, GPS. A `/map` browser check if `useMapLibre.tsx` changes.
10. **Truck management.** `insertTruck`, `updateTruck`, `createTruck`, `editTruck`,
    `src/lib/validators/truck.ts`, the truck write routes, their cases in
    `api-admin-trucks.test.ts`, `src/app/admin/trucks/page.tsx`, `TruckForm`, `useTrucks`.
11. **The morning checklist.** `src/lib/services/checklist.ts`, the checklist route,
    `Checklist`, `useChecklist`, `api-admin-checklist.test.ts`. *Last, because it reuses the
    create path.* #196 rides along: the look-back is settled by then (#22).
12. **Checkpoint: the whole walkthrough.** On the phone, on the preview, on the weekday of step
    8's lunch and dinner, 1 to 4 weeks later: the checklist, an entry by each place method, an overlap, an edit, a cancel, a new truck. Time a normal
    update against ~10 seconds, from opening the screen to the save; the public map follows
    within about 3 minutes, as in step 8. Settle open decision 8.
13. **Phase 7 retrospective**, by the milestone-retrospective procedure in
    `.claude/process-log.md` ("How to use it"). It includes #3's re-run, and judges each
    rule #1–#9 name.
14. **Follow-up issues** the retrospective opens, if any.
15. **Reconcile `project-context.md`** (the end-of-phase task), which also sets `CLAUDE.md`'s
    bold "Current phase plan" line back to none, naming this plan as the last one.

    Steps 13–15 are ordered, blocked and closed as that procedure's part 6 says; this plan
    doesn't restate it. Step 15's content, the stale hits known so far: Part 1's "What runs"
    (the proxy, the admin screens), "Versions" (`server-only` and `@supabase/ssr` added,
    and `next.config.ts`'s `allowedDevOrigins`), "Database"'s db-layer list (`users.ts`,
    `trucks.ts`'s `listAllTrucks`, and `locations.ts`'s `getLocationById`, `confirmLocation`
    and `findTruckLocationsOverlapping`, PR #243), "Modules kept on purpose", "Folder structure",
    "Environment", "Tests and gates", the Roadmap row; Part 2's "Admin and auth", which
    becomes a description of what was built, the "Read path" diagram's `POST/PATCH
    /api/locations`, which is `/api/admin/locations` (#10), the same section's "Saves trigger
    no purge" bullet, whose "~1–2 minutes" can reach about 3 (step 8), and its "1,000 rows, a
    hard wall" bullet, which gains a second reader: the admin list's 14-day window, a stated
    limit in `listAdminEntries`, the owner's call (PR #243, round 2); the "Phase map" (the
    Phase 7 row, and retention and the app name in Phase 8's), "Product model" items 2 and 3
    (#22, #23), and "Open decisions" (#22 and #23 settle two, #25 and #26 move two to
    Phase 8), the "Read path" section's "One time zone" bullet, whose `live.ts`'s `TZ` is now
    `stockholm.ts`'s (PR #238); Part 3's "Status codes" (404, 503, and 409 from `23505` as
    well) and "Hooks"; and the README's status parts. It replaces each **between phases** marker in
    "Decisions carried forward" with the decision here that took it up (#1–#9), and carries
    forward this plan's decisions that outlive the phase.

---

## Rationale

### #1 — What a review fix may add (IS #205)

Takes up the first **between phases** row. The rule is `CLAUDE.md`'s ("Applying a finding",
"Scope"): what a fix may add, and what becomes a stated limit or an issue instead. #3 says
how it is measured.

### #2 — A false or too-broad claim: cut first, reword last (IS #205)

The rule is `CLAUDE.md`'s ("Applying a finding"; the claims check points to it). #3 says
how it is measured.

### #3 — The retrospective re-runs IS #203's classification (IS #205)

The Phase 7 retrospective re-runs #203's classification on the rows written after PR #206
merged, and compares shares of the findings after round 1 with #203's: the scope rule with
fix-added code, the claim order with new imprecision. The owner decides what stays, because
#203's other child PRs move these shares too, so a share alone doesn't show what a rule did.
It also counts the harm side: rounds per PR, findings per round after round 1, and limits or
issues a rule deferred, with whether any later caused a real problem. Several rules landing
close together gives a combined picture, not proof per rule. The criterion is in #203's
research comment; that the retrospective judges the rules is the log's "How to use it",
part 3.

### #4 — The review round ceiling (IS #207)

The rule is `CLAUDE.md`'s ("The round itself"). It should end PRs running past the ceiling
(7 of 17 in #203), with no rise in rows with `Escaped` `merged` (2 in rows 351–441).

### #5 — The final records check, and rounds skipping the records (IS #207)

The rule is `CLAUDE.md`'s ("The final records check"). It should take records findings out
of rounds (54 of the 498 named findings in #203), with no record errors found after merge;
each PR body gives the count of errors the final pass found.

### #6 — A fix changing what the owner approved goes back to the owner (IS #207)

The rule is `CLAUDE.md`'s ("Applying a finding"). It should bring log rows recording such a
change made without asking to zero (rows 438 and 439, on PR #206).

### #7 — The reconciliation brings the README's status parts in line (IS #209)

The rule is the log's "How to use it", part 6. It should bring reconciliation review
findings on them to zero (row 432).

### #8 — Stale hits wait for the reconciliation while a plan is current (IS #209)

The rule is `CLAUDE.md`'s (the sweep's step 3, "Doc changes") and the log's "How to use it",
part 6. PRs other than the reconciliation should edit `project-context.md` or the README's
status parts only where a plan step orders it: unordered edits stay at zero for
`project-context.md`, as in Phase 6, and reach zero for the README. Stale hits should be
named in the plan, not left in PR bodies.

Step 2 orders its README edits, and those are the "create the admin user" and hosted auth
sections, not the status parts.

### #9 — New text points to where a rule lives (IS #211)

The rule is `CLAUDE.md`'s (the sweep's step 3). It should lower restated-copy findings from
36 of the 367 after round 1 in #203, by share, on rows written after PR #212 merged. Copies
of older text still count, so a share alone doesn't show what it did. The criterion is in
#203's research comment.

### #10 — The admin API lives under `/api/admin/*`

Rejected: `/api/locations`, as older docs and the proxy stub show. One prefix gives the
proxy one matcher, and `/api/live` can't be caught by it by accident; a session cookie
written on that response would stop Vercel caching it (`CLAUDE.md`, "`/api/live`").

### #11 — Writes go through API routes, not Server Actions

`CLAUDE.md`'s rule, and it keeps route → service → db testable the same way as `/api/live`.

### #12 — Cookie sessions through `@supabase/ssr`

Rejected: a session in browser storage. The proxy and routes see only cookies, and "no
cookie → reject before any network call" needs one. So the browser client is
`createBrowserClient` too: a plain `createClient` defaults to `flowType: 'implicit'`
(`GoTrueClient.js:24`), and its emailed link would return tokens in the URL fragment, which
`/auth/callback` never sees. The proxy refreshes the session and writes the cookies. Admin
routes only read them, from the `request` passed to `withAdmin`, which a test can also build.
`/auth/callback` and `/auth/logout` are outside the proxy and must set cookies on their own
responses, so they use `supabase-session.ts`'s writing adapter, from step 2.

### #13 — `withAdmin` is the only way in, and the test finds the routes on disk

Rejected: a hand-kept list in the test. `admin-auth.test.ts` globs
`src/app/api/admin/**/route.ts`, imports each and calls every exported method, so a new
route can't be left out by forgetting it. The PR removes `withAdmin` from one route and
records the test going red.

### #14 — `is_admin` is read through the db layer

Rejected: the session client with RLS, which `users_select_own` would allow. The server
reaches data only through the db layer (`CLAUDE.md`, "Supabase").

### #15 — `withAdmin` sets `Cache-Control: no-store`

The owner's call on Claude's proposal, not in the older docs. Admin data must never land in
a shared cache, and the admin sees their own edits at once. The ban on `no-store` is for
`/api/live` only.

### #16 — `withAdmin` refuses a write from a foreign `Origin`

The owner's call on Claude's proposal, not in the older docs. These routes are authenticated
by a cookie, so a forged cross-site request is the classic risk. Rejected: relying on
`SameSite` alone. A write with no `Origin` is refused too; a browser sends one on POST and
PATCH. `requestOrigin` reads the headers because `next dev`'s `request.url` isn't the browser's
host: a POST to `http://127.0.0.1:3917` read `http://localhost:3917` from `request.url` and
`request.nextUrl.origin`, while `Host`, `x-forwarded-host` and `Origin` held `127.0.0.1:3917`
(probed 2026-11-05 with a throwaway route). `config.toml`'s `site_url` is `127.0.0.1`, so a
comparison with `request.url` would refuse every local write. A configured URL wouldn't do
either, because preview URLs change.

### #17 — The server sets `created_by` and `source`

A client can't choose who wrote a row. Validators don't read those keys, and `insertLocation`
takes them from the service.

### #18 — "Stämmer fortfarande" moves `updated_at`, with no migration

The owner's call. The admin checks a truck's Instagram each day, even when it posted its
whole week on Monday, and the popup's "Uppdaterad" should say so. Rejected: a `confirmed_at`
column, worth it only if the two ever need to differ. A write of `updated_at` moves it to the
trigger's `now()`, not the value written (probed 2026-11-05 on a seed row, in a rolled-back
transaction: wrote `2000-01-01`, read back `now()`); step 6's test pins it.

### #19 — "Inställt idag" isn't built

The owner's call. Cancelled rows never reach `/api/live`, so it would need a changed read, a
changed `LiveEntry`, a third marker state, and a change to the UI rule on which trucks
appear. Revisit once real cancellations show how much it matters.

### #20 — ✓ creates an ordinary entry; ✗ writes nothing to the database

✓ goes through `createEntry`, so it has one code path, overlap check included. ✗ hides the
suggestion on that device for that day, in `localStorage`, with reads and writes that
tolerate failure. Rejected: a table of dismissals, the kind of `schedules`-like state
`transition.md` §0 removed. If storage fails, a dismissed suggestion comes back, and nothing
reaches the map from that.

### #21 — Locations before truck management, with three phone checkpoints

Reorders the Phase map, so the core is reached early and the real phone flow is tested while
it's still cheap to change. The form needs the truck list, so that read comes in step 3, and
truck writes wait for step 10. They stay in the phase: the launch needs them.

### #22 — The checklist looks back 4 weeks, at the truck's most recent matching day

The owner's call (product decision 2). For each active truck: the same weekday in the last 4
weeks, one `findLocationsOverlapping` day window per week (Phase 5 #9), and of those the most
recent day it had a live entry starting that day. All of that day's entries are suggested, so
lunch and dinner both show, and a truck that stopped coming drops off after 4 weeks.
Rejected: one suggestion per truck. Times move to today by wall clock through `entryWindow`, so
an end past midnight stays next-day (#30). The day windows come from whole-day arithmetic on
`stockholmDay`, never `now - 7 × 24 h` (#31).

Left out: a suggestion that overlaps an entry the truck already has today, and one already
ended. Today's cancelled entries aren't read, so a truck that cancelled today can be suggested
again; ✗ hides it.

### #23 — The form pre-fills 11–13

The owner's call (product decision 3), which replaces the docs' "e.g. 11–14". Fixed, not per
truck: the checklist and recent places bring their own times. The seed's 11–14 history stays.

### #24 — The form has a date, defaulting to today

A truck can post a whole week on Monday, and those entries are made then. `listAdminEntries`
reads from the start of today for 14 days. **A limit:** an entry further ahead is saved and
reaches the map on its day, but isn't listed until it is inside the 14 days.

### #25 — History retention moves to Phase 8

The owner's call (product decision 1). It belongs with the privacy note, and no real data
exists before then.

### #26 — The final app name moves to Phase 8

The owner's call (product decision 4). Until then the admin screens use **WhereIsFood**, or
**Wif** where it must be short, as a temporary name.

### #27 — `src/lib/supabase.ts` stays where it is, as the server-only module

Rejected: moving all three clients into `src/lib/supabase/`, this plan's first draft. Eight
files import `@/lib/supabase`, among them `rls.test.ts` and `schema.test.ts`, which schema
controls name, so a moved import would call for the full controls run (about 48 minutes,
`CLAUDE.md`, "Testing") for no behaviour change. Keeping the path leaves those files alone.

### #28 — Logout lives beside the callback, not under `/api/admin/`

The owner's call on round 1's proposal (PR #220). Under `/api/admin/` it would need
`withAdmin`, so a non-admin would get 403 and an expired session 401, and neither could clear
their cookies, and it would have to write cookies, which `withAdmin`'s routes don't. `POST
/auth/logout` takes no admin check and calls `isSameOrigin` (#16). It calls
`signOut({ scope: 'local' })`, the owner's call on round 3's proposal: the default, `global`,
would end the phone's session too when the admin logs out on a laptop. It then deletes the
`sb-*` cookies itself, because `_signOut` (`@supabase/auth-js` 2.106.2, `dist/main`) returns
without removing the session on a session error, and on an Auth error other than 401, 403 or
404. `LogoutButton` is a plain form POST, so it needs no state, and the route answers 303 to
`/admin/login`: a form POST navigates to the answer, and `NextResponse.redirect`'s default 307
would re-POST to a page.

### #29 — Instagram handles are stored in one form

The owner's call on round 1's proposal (PR #220). `instagram_handle` is `text unique`, so it
is case-sensitive and nullable, and "no migration" rules out `citext`. `parseNewTruck` and
`parseTruckPatch`, in this order, trim the handle, strip a leading `@`, lower-case it, and turn
an empty result into null. Anything else must match `^[a-z0-9._]{1,30}$` or is refused with
400, so `@ streetfoodgbg` can't be stored with a space, and the popup's Instagram link holds
only those characters. Instagram handles aren't case-sensitive, and `@streetfoodgbg` is the same
account, so without this one account could get two trucks and two markers; an empty string
would make a second truck with no handle fail as a false duplicate. Third-party guides agree on
the character set, the 30-character cap and case-insensitivity (searched 2026-11-05; no Instagram
page found). They also bar a period at either end, which this rule lets through: that can pass a
typo, but it can't refuse a real handle.

### #30 — An end at or before the start means the next day

The owner's call on round 4's proposal (PR #220). Trucks work past midnight, and the map already
shows it ("23:00–02:00 imorgon", `hoursText` in `live.ts`), but one date with 22:00 and 01:00
would be refused, and the checklist couldn't carry such a shift forward. Both go through
`entryWindow`. The form shows "slutar imorgon", so a typo can't pass as a long shift unseen.

### #31 — `stockholm.ts` takes `live.ts`'s day helpers

Two copies of the midnight code could drift, and `live.test.ts`'s 23- and 25-hour day cases exist
to prevent that. Rejected: a second implementation, and `now - 7 × 24 h`, which reads the wrong
weekday across a DST change: 00:30 on a Monday in CEST minus 168 h is 23:30 on the Sunday in CET.

### #32 — An Auth or database failure isn't "logged out"

Treating one as `no-session` would send a logged-in admin to the login, which spends the built-in
email's 2 an hour on nothing, and a throw in the proxy would answer with Next's error page, not
`{ error }` (`CLAUDE.md`, "API responses"): `withErrorHandling` doesn't wrap the proxy. So
`requireAdmin` returns `unavailable` on an Auth failure other than a missing or invalid session,
and on a throw from `getUserById`. An admin route answers 503 `{ error }`, and a page shows a
Swedish error, not the login.

### #33 — An entry that has ended can't be saved or edited (open decision 9)

The owner's call (2026-11-09), on open decision 9's proposal with one addition. `createEntry`
refuses an entry whose end is at or before now; `editEntry` refuses an entry that has ended,
and an edit whose merged end is at or before now. An entry in progress can be edited. Each is
a 400 with a Swedish message, checked in the service, since it reads the clock (`CLAUDE.md`,
"Time"). The addition, refusing an edit of an ended entry, keeps the app from rewriting what
the map already showed. Cancel and "Stämmer fortfarande" keep step 6's rule: 404 only for a
missing or cancelled entry. What the form pre-fills once 11–13 has passed is #227's: saving
that pre-fill unchanged is refused.

---

## Acceptance Criteria

**Login and security**
- [ ] Sign-ups are off locally and on the preview: a login attempt with an unknown email
  creates no auth user.
- [ ] The admin logs in with an emailed link on a phone on the preview, stays logged in
  between visits, and can log out.
- [ ] `src/lib/supabase.ts` imports `server-only`, and no client bundle contains the
  service-role key: a build's `.next/static` searched for the variable's name and for the
  local key's value finds neither.
- [ ] Every `route.ts` under `src/app/api/admin/` answers 401 with no session and 403 for a
  logged-in non-admin, on every exported method, found on disk. Adding a route makes the test
  cover it with no edit to the test.
- [ ] With no session cookie, the proxy and `requireAdmin` reject without any network or DB
  call, shown by a unit test that fails if one is made.
- [ ] `/admin` pages redirect to `/admin/login` without a session, and `/admin/login` stays
  reachable.
- [ ] A write with a foreign or missing `Origin` is refused, on a valid admin session and on
  `/auth/logout`.
- [ ] Logout clears the session cookies for an admin, a non-admin and an expired session, and
  when Auth answers with an error, and lands on `/admin/login` with a 303. It ends only that
  device's session.
- [ ] Admin route responses carry `Cache-Control: no-store`.
- [ ] `created_by` and `source` sent in a request body are ignored; the row holds the admin's
  id and `'admin'`.
- [ ] `/api/live` keeps its `Cache-Control` header, with no `Set-Cookie`, when the request
  carries a session cookie: `src/proxy.test.ts` fails if the matcher catches it, and step 4 reads
  `x-vercel-cache` on the preview.
- [ ] An auth user with no `users` row gets 403.
- [ ] An Auth or database failure gives 503 `{ error }` on an admin route, and a Swedish error,
  not the login, on a page.
- [ ] Writes work on the preview and in a local browser at `127.0.0.1:3000`.

**Entries**
- [ ] Create, edit and cancel work from the phone, and a cancelled entry leaves the public map
  within about 3 minutes.
- [ ] An entry can be made for a later day through the form's date field.
- [ ] An overlapping save returns 409 with "Överlappar med <the real times> — redigera den
  istället", and nothing is changed or replaced.
- [ ] Cancelling never deletes a row, and a second cancel leaves `cancelled_at` as it was.
- [ ] "Stämmer fortfarande" moves `updated_at`, the popup's "Uppdaterad" follows, and no other
  column changes. A cancelled or missing entry gives 404.
- [ ] Coordinates outside the Gothenburg box and an end before the start are refused with 400
  and a Swedish message, on an edit that sends only one of the fields too.
- [ ] A malformed id gives 400, on a path, in a query string or in a body.
- [ ] A body that isn't valid JSON gives 400 with a Swedish message.
- [ ] A shift past midnight can be entered with one date, and the form shows "slutar imorgon".
- [ ] A patch with no known key, on an entry or a truck, gives 400 with a Swedish message.
- [ ] Creating an entry lists active trucks only, and an inactive `truck_id` on create gives 400
  with a Swedish message. Editing shows the entry's own truck read-only, an inactive one too.
- [ ] Times are entered and shown in Stockholm time and stored in UTC, correct across a DST
  change.
- [ ] The form pre-fills 11–13.
- [ ] All four place methods fill the form: known spot, recent place, map tap, GPS.

**Trucks**
- [ ] The admin can add and edit a truck and set it inactive. An inactive truck leaves the map
  and keeps its history.
- [ ] A duplicate Instagram handle gives 409 with a Swedish message, whatever its case, a leading
  `@` or surrounding spaces, and two trucks with no handle are both allowed, a blank field
  included. A handle outside #29's character set gives 400 with a Swedish message.
- [ ] The app has no way to delete a truck or a location.

**Checklist**
- [ ] It lists suggestions by #22's rules, lunch and dinner both, and leaves out one that
  overlaps an entry the truck already has today.
- [ ] ✓ creates today's entry through the normal path, including the overlap check. ✗ writes
  nothing to the database.
- [ ] Nothing from the checklist reaches the map until ✓ is tapped.
- [ ] A shift past midnight is suggested with its end on the next day, and the look-back finds the
  same weekday across a DST change.

**The whole phase**
- [ ] Each checkpoint's result is recorded on its own issue.
- [ ] Step 12's walkthrough passes on the owner's phone on the preview, and a normal update
  takes under ~10 seconds from opening the screen to the save, timed.
- [ ] The admin screens work at phone width, with no sideways scrolling.
- [ ] All user-facing text is in Swedish.
- [ ] `/map` is checked in a real browser after any change to the map code: basemap, markers,
  a popup.
- [ ] The four gates exit 0, read unpiped.
- [ ] #196 is closed.
- [ ] The closing steps of the milestone-retrospective procedure are done.

---

## Open Decisions

1. **Magic link or a 6-digit code (step 4).** A link that opens in another browser than the one
   that asked for it may fail. If it does on the owner's phone, an emailed code avoids it, and
   that is an email template setting. **Settled 2026-11-08 (#224, the owner's call):** keep the
   link, with a hint to open it in the browser that asked for it (#240, PR #242); the 6-digit
   code is recorded in #241 to revisit.
2. **How long a login lasts (step 4).** The admin shouldn't log in every morning, and the
   built-in email is limited to 2 an hour. **Settled 2026-11-08 (#224, the owner's call):** keep
   Supabase's default. A session holds until logout, through a browser restart and the access
   token's expiry, with no time limit set.
3. **Getting a phone past Deployment Protection (step 4).** The emailed link lands on a
   protected preview URL, so the phone needs a Vercel login or another way in. **Settled
   2026-11-08 (#224, the owner's call):** log in to Vercel in the phone's browser, for previews.
4. **Preview redirect URLs (step 2).** Preview URLs change, so Supabase's allow-list needs a
   pattern that fits, and it must not admit anyone else's Vercel deployments.
5. **How a local admin user gets created (step 2).** A seed row or a small script, whichever is
   simplest. A seed change alters the hosted project's seed hash, as #196 describes.
6. **How the proxy reads `is_admin` (step 3).** `server-only` in the proxy needs a probe, and so
   does `vitest`'s handling of it.
7. **A session cookie for route tests (step 2).** `tests/integration/helpers.ts` needs a real
   session in the cookie format `@supabase/ssr` reads. `signedInClient` warns about the sign-in
   rate limit, so once per file.
8. **An "Alla stämmer" button for the whole day (step 12).** Tapping each truck may get tedious.
   The owner's real morning routine decides.
9. **Saving an entry in the past (step 6).** The proposal: refuse an entry that has already
   ended, allow editing one in progress. It also settles what the form shows after 13:00, when
   the 11–13 pre-fill has passed. Clock-dependent, so it lives in the service (`CLAUDE.md`,
   "Time"). **Settled: #33** (the owner's call, 2026-11-09).
10. **The public `<title>` (step 7).** `src/app/layout.tsx` says "Var är maten? | Göteborg". #26's
    temporary name covers the admin screens; whether the public title changes too is the owner's
    call.
