# Transition — from three ingestion lanes to an admin-populated map

> **History. Absorbed into `.claude/context/project-context.md` (Phase 4, #127).**
> Phase 4 carried out the teardown and clean-up: §11's Remove list (except the
> migration squash, which is Phase 5) and its clean-up Rework items (`spots.ts`,
> `@upstash/*`, the proxy matcher); §5's dependency changes; §13's tracker clean-up;
> §14's docs, including row 258's fix column (#128, PR #141). The rest (schema reset, `/api/live`,
> admin, R2, launch) is the target design for Phases 5–8 and **not built**; it is condensed into the context's
> "Target design" part, which is now the reference. The current phase plan wins over
> both. This file is kept, not deleted, because §0's table is what stops removed
> pieces being re-added; read it before adding anything back.
>
> Phase numbers were renumbered in Phase 4 (Phase 4 plan decision #9): **4 Housekeeping →
> 5 Schema reset → 6 Live read path → 7 Admin → 8 Launch.** §13's table and the inline
> references in §7 and §9 use the new numbers; mentions of "the old roadmap" (§11, §13,
> §14) mean the numbering before this file. Phases 1–3 kept their numbers.
> **Facts in the body are as of 2026-10-10** (the status and precedence notes just below,
> versions, "today"): e.g. §7's "the project pins `next` 16.2.6" is 16.3.8 now. The
> context has current values. The removed code is archived on
> `archive/parser-lanes` (commit `b089fd0`, see §15).

**Decided:** 2026-10-10 (conversation between the user and Claude; no PR yet)
**Status:** decided, not started. Nothing in `src/` has changed.
**Purpose:** the input for writing the next phase plan. Read this before
`project-context.md`, which still describes the old design.

> **Precedence while this file is live:** this file > `.claude/plans/phase-3-parser.md`
> > `.claude/context/project-context.md`. The Phase 3 plan and the context both assume
> the parser and the lanes exist. Once the new plan is written, the plan takes over and
> this file becomes history.
>
> ⚠ **Nothing enforces that precedence yet.** `CLAUDE.md` still says the Phase 3 plan
> wins and doesn't mention this file (deliberately: the user chose not to add a
> pointer). A fresh session will treat the parser as current unless it is **told to
> read this file first.** Say so when you start the replan.
>
> `.claude/` is tracked in the (public) repo since IS #116; before that it was
> gitignored and existed only on one machine. The decision was also recorded as a
> process-log DECISION entry ("Drop the ingestion lanes and the parser; admin-populated
> launch", 2026-10-10). Since IS #152 that entry is only on the
> `archive/process-log-details` tag; §1 below and the Phase 4 plan hold the decision.
> The cron finding is row 258, and the review/verification misses from this
> conversation are rows 259–265.
>
> **This file has been through a simplification pass (§0).** If something you expected
> is missing (a `schedules` table, `expires_at`, auto-replace,
> save-triggered regeneration, ISR, …), check §0 before reintroducing it. It was removed on
> purpose.

---

## 0. Simplification pass (agreed 2026-10-10) — read before adding anything back

After the first draft, the whole file was reviewed with one question: *what does a
one-admin, ~30-truck MVP actually need at launch?* These were removed or replaced:

| Was in the draft | Now | Why it's enough |
|---|---|---|
| Automatic **replace-on-overlap** (transaction function, "superseded" marker, owner-beats-admin, careful range handling) | **Reject overlaps; the human edits.** One DB exclusion constraint refuses overlapping non-cancelled entries for the same truck; the UI says *"Överlappar med 11–14 — redigera den istället"*. | One writer (admin), so the races behind #108/#109 can't happen. The constraint makes overlap impossible instead of "handled". |
| Optional `ends_at` **plus** `expires_at`, a default duration, the midnight cap | **`ends_at` NOT NULL; no `expires_at`.** The form pre-fills e.g. 11–14. | The NULL-`ends_at` problem (H4) existed only because the parser couldn't always find an end time. A human always can. |
| A **`schedules`** table feeding the morning checklist | **Checklist derived from history:** *"Förra tisdagen: Truck A, Heden 11–14 ✓ / ✗"*. | Nothing to maintain when routes change. History already *is* the schedule. |
| A **`spots`** table | **The existing `dictionary.ts` data kept as a code constant** (moved to `spots.ts`, §11) + "recent places" from history. Each location stores a text `label`. | No table, no spot-admin screens. A new place is a map tap + label, and then it shows up under recent places. |
| ISR **plus** `revalidatePath` in every write route **plus** an integration test for it, then ISR with `revalidate = 60` alone | **An ordinary route with `Cache-Control: public, s-maxage=60, stale-while-revalidate=60`. No ISR, no save-triggered purge.** (ISR reversed: row 264, §7.) | Saves show within ~1–2 min, close to the delay already accepted from polling. ~1 DB query/min/region. The write-side rule, its test and the layering question disappear. The admin screen reads through its own uncached admin API routes (server-side, never the browser), so admin sees their own edits instantly. |
| **R2 publish-on-write contingency** if the cache-bust test fails | **Dropped.** The test is informational only. | A junk query that misses the cache costs one tiny query; Postgres handles thousands. DDoS mitigation covers real floods. |
| **Server-time offset** from the `Date` header | **Dropped.** | Phone clocks are synced automatically. |
| **R2 before launch** (Cloudflare account, DNS, CORS) | ~~Deferred~~ → **Reinstated: tiles on R2 at launch** (security review, row 265). | The deferral rested on "Vercel's free limits cover launch traffic", which was never checked. Verified: Hobby has 1M CDN requests/month shared by page, polls **and tiles**, and going over means **up to 30 days unavailable**. Tiles are the biggest consumer (§9). |
| **Grey markers** + `trucks.last_known_*` | **Dropped at launch.** Only trucks with an entry today appear. | Fewer columns, and no pin where a truck *isn't*. |
| Claim-model details (X-day takeover, heads-up, owner-beats-admin) as open decisions | **Moved to "later" (Owners phase).** | The owner side is deferred, so these can be decided when it's built. |
| Migrations: squash vs forward | **Squash** into a fresh baseline. | No production DB exists, so a clean schema is free. |
| Backups via "scheduled `pg_dump`" (needs a scheduler, contradicting "no cron") | **Supabase Pro at launch** ($25, daily backups). Manual `supabase db dump` before that if real data exists earlier. | Zero work, and no scheduler needed. |

**Net:** 3 tables (`trucks`, `locations`, `users`) instead of 5. Write path = insert/update
+ one DB constraint. Read path = one cached route + polling. Tiles on Cloudflare R2 (reinstated after the security review; see the R2 row above).

---

## 1. The decision in one paragraph

Remove the email lane (Mailgun), the webhook lane (Make.com) and the Swedish parser.
At launch the admin (you) follows every Gothenburg food truck on Instagram, with post
and Story notifications on, and enters locations by hand in a mobile-first admin
screen. The map is then 100% populated and 100% accurate from day one. Consumers come
because the map is complete, and trucks then have a reason to claim their listing and
post themselves (later). The stack drops cron, Realtime, Upstash, Nominatim, Mailgun and
Make.com, and becomes **Next.js · Supabase (Postgres + Auth) · MapLibre/PMTiles ·
date-fns-tz · Vercel · Cloudflare R2 (tiles only)**. Map tiles move to R2 at launch, and Vercel goes Pro before any
marketing push (§9, the Hobby cliff).

---

## 2. Where the project was at the moment of the decision

- **Phase 1** (map with fake data) and **Phase 2** (email + webhook ingestion): closed.
- **Phase 3** (parser): 19 issues closed, 13 open in the milestone, plus about 10
  unassigned follow-up issues. `dev` was at `11f081a` (merge of PR #115).
- Merged Phase 3 work:
  - the whole pure parser (`src/lib/parser/*`, ~6,700 lines with tests)
  - geocoding with cache and Nominatim
  - `db/locations.ts`
  - the locations service (override + negation paths)
  - migrations 0005/0006
  - the vitest unit/integration split
- **Next planned step was #70** (connect ingestion to the parser). It will not be done.
- **Size estimate:** the lanes were ~70% of the ~14,400 lines in `src/` and ~55–65%
  of the whole MVP's effort. Phases 2 and 3 were entirely the lanes (44 of 74 issues
  in those milestones; most of the 18 unassigned issues, e.g. #45–#53 and #108–#114,
  are lane work too). Most of the remaining Phase 3 risk (#90–#114) was parser or
  lane-conflict edge cases.

---

## 3. Why the lanes go

1. **They were always going to be phased out.** The user's own intent: the lanes
   existed to make onboarding easy, not as the permanent product.
2. **The webhook lane was not low-friction either.** Each truck needed its own
   Make.com account, a professional Instagram account linked to Facebook, and a
   scenario to set up. That is harder for a busy truck owner than tapping a button in
   an app.
3. **The parser cannot see much of what trucks post.** Image-only posts, Stories and
   schedule graphics are invisible to it, so coverage has gaps even when it works.
4. **Parsed pins are less trustworthy** (source confidence 0.55 for email, 0.85 for
   webhook, against 1.0 for the dashboard). **A wrong pin costs more users than a
   missing pin.** Someone who walks to an empty spot doesn't come back.
5. **Parsing natural language never stops needing upkeep:** slang, date and time
   formats, multi-clause captions, dictionary drift, image-only posts.
6. **Cost:** ~70% of the code and nearly all remaining risk, so cutting it brings real
   users months closer.

**The one real argument against, and how it is handled:** dashboard-only means trucks
have to update a second place on top of their Instagram. That is a habit that must be
built, and before there are users trucks get nothing for it. **Answer:** the admin
does the updating at launch. Trucks need zero effort until they *want* control of their
listing.

### Alternatives considered and rejected
| Option | Why rejected |
|---|---|
| One central Make.com account watching all trucks | **Not possible.** Make.com's Instagram trigger only sees accounts you own or manage. |
| Scraping Instagram (RSS.app-style, unofficial APIs) | Breaks Instagram's terms, accounts get banned, breaks without warning. |
| Admin-set recurring schedules that auto-create pins | Shows trucks that aren't there when plans change. Replaced by the confirm checklist (§4). |
| Meta **Business Discovery** API (official) | **Not rejected, deferred.** It reads other business/creator accounts' public **posts** (not Stories) without their consent. It would need a Meta developer app and a scheduler (not Vercel's free cron). Later it could show captions in the admin screen. Bonus: caption plus admin-entered location makes perfectly labelled training data if a parser is ever revisited. |

---

## 4. Product model

### At launch
1. **Admin-populated.** Follow every truck's Instagram from an admin account and turn
   on **post + Story notifications** per truck. Phone pings → open admin screen →
   update. Zero code, and Stories are covered.
2. **Morning checklist, derived from history.** No schedules table. The admin screen
   lists what each truck did on the same weekday recently (*"Förra tisdagen: Truck A,
   Heden 11–14"*). Admin taps ✓ (creates today's entry with the same place and times)
   or ✗ (ignore). **Nothing reaches the map until it is confirmed.**
3. **Fast entry.** Place a pin by map tap, a known spot (the spots constant, §11), a recent
   place (from history), or GPS ("Jag är här nu"). Start and end times are pre-filled
   (e.g. 11–14) and always required. A normal update takes under ~10 seconds.
4. **Overlaps are refused, not resolved.** If a truck already has an entry in that
   time, the save is rejected with *"Överlappar med 11–14 — redigera den istället"*.
   Edit or cancel the existing entry.
5. **Cancel** sets `cancelled_at`. Nothing is deleted.
6. **Takedown on request,** fast and polite. At this scale it's a manual SQL delete
   of the truck and its history, not a feature.
7. **Content rules.**
   - Show only public facts: name, location, hours, Instagram link.
   - **No copied photos or logos** (copyright) until the truck claims or says yes.
   - **Tell every truck they are listed.** It turns potential objectors into early
     adopters.
8. **Be honest about freshness.** The popup shows when it was updated, e.g.
   *"Uppdaterad 08:12"*, and links to the truck's Instagram so users can check.
9. **Only trucks with an entry today appear on the map.** No grey markers.
10. **Demand is the bottleneck, not supply.** "Trucks must be on it to compete" only
    works once there are users. Needs its own plan: local Facebook groups, office areas
    near truck spots, food truck events, stickers on trucks.

### Later (Owners phase) — principles agreed, details decided when built
- Owners can **claim** their listing; admin runs it until then.
- **Owner entries win over admin entries.** With the reject-overlap model this becomes
  "an owner may override an admin entry", designed then.
- If an owner goes quiet for **X days**, admin takes over again, with a heads-up to the
  owner.
- **Hand-off:** once claimed, does admin stop entering or keep entering as a backup?
- Popup text distinguishes *"…av admin"* vs *"…av [truck]"* (the `source` column
  already supports it).
- **Custom SMTP** must be set up first (§15).

---

## 5. Tech stack: before → after

| Item | Before | After | Why |
|---|---|---|---|
| Framework | Next.js 16 App Router, TS, Tailwind v4 | **keep** | — |
| Map | MapLibre GL + Protomaps PMTiles | **keep** | — |
| Tile hosting | `public/gothenburg.pmtiles` (12 MB), R2 "later" | **R2 at launch** (custom domain + CORS); `public/` copy stays for local dev | Tiles are the biggest consumer of Vercel's 1M CDN requests/month, and going over pauses the site for up to 30 days (§9). |
| Database | Supabase Postgres | **keep** | Already built, plain SQL migrations, low lock-in |
| Auth | Supabase Auth (magic links) | **keep** | The most expensive thing to replace |
| Realtime | Supabase Realtime | **remove** | Free plan refuses visitor #201 (§7) |
| Email ingest | Mailgun | **remove** | Lane removed |
| Automation | Make.com per truck | **remove** | Lane removed |
| Rate limiting | Upstash Redis (installed, **never wired**: `proxy.ts` is a stub) | **remove** | Nothing public writes any more; only admin writes. Supabase rate-limits magic-link emails itself. |
| Geocoding | Nominatim + `geocoding_cache` | **remove** | Coordinates come from map tap / known spot / recent place / GPS |
| Scheduling | Vercel Cron every 30 min | **remove** | Never needed, and blocked on the free plan (§6) |
| Timezone | date-fns-tz | **keep** | Display in Europe/Stockholm, store UTC |
| Tests | Vitest unit + integration | **keep, smaller** | — |
| Hosting | Vercel | **keep** | Free plan is non-commercial only (§9) |

**npm packages to drop:** `@upstash/ratelimit`, `@upstash/redis`.
**Keep:** `@supabase/supabase-js`, `date-fns`, `date-fns-tz`, `maplibre-gl`, `pmtiles`,
`protomaps-themes-base`, `next`, `react`, `react-dom`.

**Env vars to drop:** `MAKE_WEBHOOK_SECRET`, `MAILGUN_WEBHOOK_SIGNING_KEY`,
`NOMINATIM_BASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
**Keep:** the three Supabase vars and `NEXT_PUBLIC_PMTILES_URL`. Only the server needs
`SUPABASE_SERVICE_ROLE_KEY`, and the browser needs the anon key only for Auth.

---

## 6. No cron, ever (for the MVP)

**Finding (process-log row 258):** `project-context.md`, the tech stack and the
committed `vercel.json` all say "Vercel Cron every 30 min" (`*/30 * * * *`). **Vercel's
free plan only allows daily cron jobs, and anything more frequent fails at deploy.**
This would first have surfaced at the first deploy.

**Why cron was never needed:**
- **"Keep expired pins off the map":** reads already filter on the end time.
- **"Remove pins from open maps via Realtime DELETE":** only half worked (up to 30 min
  late), and a delete sweep can never make a pin **appear** at `starts_at`. The client
  needs its own timer for "öppet nu" anyway, and that timer covers ending too.
- **"Keep the table small":** `locations` is tiny, and `posts`, which was never purged,
  would have grown far faster.

**Replacement:**
- **Server:** stores facts and never deletes (takedown excepted). Each location has a
  required `starts_at` and `ends_at`. "Ended" is just `ends_at <= now()`, a filter.
- **Client:** a timer in the map hook moves pins to "öppet nu" or removes them.
- **Cancellation** sets `cancelled_at`. Reads filter `cancelled_at IS NULL`. The time
  range is never rewritten, so it can never become invalid.
- **Location history is kept:** about 22k rows a year, nowhere near the 500 MB free
  database. It powers the morning checklist, "recent places", and proof-of-value to
  trucks ("on the map 40 times last month").

**When a scheduler WOULD be needed:** work that must happen with nobody's browser open,
e.g. Business Discovery polling, a morning checklist reminder, or "claimed truck quiet
for X days" alerts. Then use **Supabase pg_cron** (on free; pure SQL, or with `pg_net`
to call a route) or an external service such as cron-job.org. **Never Vercel's free
cron.**

---

## 7. No Realtime: a cached endpoint plus polling

### Why Realtime goes
- Free plan: **200 concurrent connections, and #201 is refused** (`too_many_connections`).
  Pro: 500 included, then $10 per 1,000.
- A successful app means 1,000–10,000 users per city per day, concentrated at lunch.
- **Food truck data changes a few times a day.** Map apps push live only when things
  move by the second (Uber/Bolt cars, one courier for one customer). Directory-style
  maps (Airbnb, Too Good To Go, restaurant maps, transit feeds) fetch and refresh.
  This app belongs with the second group.

### The design: a normal route, cached by Vercel's CDN for 60 s
```
Admin saves ──► POST/PATCH /api/locations ──► Supabase   (nothing else to do)

Visitor's map ──► GET /api/live (every 60 s + when tab regains focus)
                       │
                   Vercel CDN (shared copy, 60 s) ──miss──► function ──► Supabase
                   (Supabase sees ≈ 1 query per minute per region, whatever the traffic)
```

> **Why not ISR** (chosen earlier, reversed the same day, process-log row 264): ISR was
> picked to regenerate the copy on every save. The simplification pass dropped
> save-triggered regeneration, which removed ISR's main advantage and left its costs:
> pre-rendering at **build time** (the DB must be reachable during `next build`,
> locally and on previews), and a fragile "the handler must never read the request"
> rule. A `Cache-Control` header on an ordinary route gives the same shared copy and
> DB load with neither cost. ISR's remaining extras (merged misses, durable cache)
> only matter at traffic far beyond this app.
>
> **Also considered and rejected: no route, the browser reads a Supabase view** that
> exposes only live/upcoming rows (anon SELECT on the view only). It solves privacy
> with less code, but every poll from every visitor hits the DB, it all counts against
> Supabase's 5 GB free egress, and there's no CDN copy to absorb abuse. The cached
> route costs ~20 lines and avoids all three.
>
> **Fitness re-check (2026-10-10, after the user asked twice):** free tier at any
> traffic ✓, no public history ✓, simplest working option ✓, fails safe (errors not
> cached, DDoS mitigation) ✓, fresh within ~1–2 min ✓. Remaining unknowns are
> empirical (Phase 6 preview checks), not design questions.

**Server: `GET /api/live`** (behaviour from the Vercel CDN-cache docs, 2026-10-10;
⚠ the project pins **`next` 16.2.6** while the Next docs read were 16.4, so re-check
against the installed version)

0. **Reads with `supabaseAdmin` (service role), server-side.** Anon has no SELECT on
   `trucks`/`locations` (§10), so the anon client would silently return nothing.
1. **An ordinary route.** GET route handlers are **dynamic by default** since Next 15,
   so nothing runs at build time and there's no route-segment config. The response
   sets:
   ```ts
   return Response.json(data, {
     headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" },
   });
   ```
   - Vercel's CDN keeps **one shared copy per region** for ~60 s, then serves it stale
     while refreshing in the background.
   - Vercel **strips `s-maxage` / `stale-while-revalidate`** before the response
     reaches the browser (when no `CDN-Cache-Control` is set), so the browser doesn't
     cache it and every poll reaches the CDN copy.
2. **Returns** active trucks plus locations with
   `cancelled_at IS NULL AND ends_at > now() AND starts_at < now() + interval '1 day'`.
   Only the fields the map needs, as an **explicit column list, never `*`**, so
   `created_by` and any future column can't leak. A copy is at most ~60–120 s old, so this filter is
   good enough; the client handles the minute-level edges.
3. **Errors are never cached.** Vercel only caches 200/301/302/307/308/404/410
   responses. A DB error goes through `withErrorHandling` → 500 → not stored, and the
   next request tries again. **Never "fix" an error by returning an empty list**: that
   would be a cacheable 200 and wipe the map for up to a minute.
4. **No `Set-Cookie`, no `Vary: Cookie`, no `private`/`no-store`** on this response.
   Any of them makes Vercel refuse to cache it. Don't route it through anything that
   adds cookies.
5. **No write-side work.** Saves don't purge anything. They show up on the map within
   ~1–2 min (≤60 s cache, plus up to 60 s stale-while-revalidate, plus ≤60 s poll; in
   practice usually under 2 min).

**Cache-busting: the verified picture, and why it doesn't matter much**
- Vercel's cache key **includes the full URL, query string included.** Query strings
  are ignored only for *static files*. **Cache keys are not configurable.**
- So `GET /api/live?x=<random>` misses the cache and runs one small indexed query.
  Postgres handles thousands per second. **Bounded cost, not exhaustion.**
- **Floods:** Vercel's automatic DDoS mitigation runs on **all plans**, and blocked
  traffic is **not billed**. Requests served before mitigation kicks in, and traffic
  it doesn't classify as an attack, **are** billed. **Attack Mode** (challenge all
  visitors) is free on all plans as an emergency switch. It's a launch runbook item.

**Security review (2026-10-10): what was kept and what was dropped**
- **Data side: covered.** No input, so no injection. The response doesn't depend on
  the request, so no cache poisoning. Explicit columns, so no leaks. No anon DB
  access.
- **Worst case on the current plans is an outage, not a bill.** Vercel Hobby can't
  bill (over a limit = paused up to 30 days); Supabase Free has no card, and Pro has a
  spending cap on by default. On Vercel Pro, **Spend Management with a pause cap is
  required**, or traffic not classified as DDoS is billed on demand.
- **The real availability risk is the Hobby cliff (§9), from success more than from
  attackers.** Answer: tiles on R2 at launch, Vercel Pro before marketing.
- **Kept (trivial):**
  - explicit columns in `/api/live`;
  - admin routes and the proxy **check for a session cookie before any network or DB
    call**, so cookie-less floods cost nothing but the function run;
  - **Attack Mode** in the launch runbook.
- **Considered and dropped:**
  - ~~Firewall rule denying `/api/live` with a query string (+ a 400 in code)~~. Low
    likelihood, and each junk request costs one tiny query. The rule could **break the
    app** if a cache-buster ever creates a query string, and it lives in the dashboard,
    not the repo. The in-code 400 is pointless: the function still runs. **Add the rule
    only if junk traffic actually shows up** in Vercel's firewall dashboard (2 minutes).
  - ~~Per-IP rate-limit rule~~. Swedish mobile carriers and office networks put many
    real users behind one IP, and tile loading is bursty, so a useful limit would
    block real lunchtime users. It also doesn't stop a patient attacker under the
    limit (10 req/s still burns 1M in ~28 h). Hobby's rate-limit quota behaviour is
    unclear too. Log mode for observation is fine; it isn't protection.
- **No Redis/Upstash needed.** Vercel's free edge features are enough, and mitigated
  traffic is not billed.

**Verification**
- CDN caching only exists on Vercel. Locally (`next dev` or `next start`) every
  request runs the function, which is fine for development.
- **Preview deploy:** request `/api/live` twice and confirm the `x-vercel-cache`
  response header goes `MISS` → `HIT`, and later `STALE`.

**Client (all inside `useLocations`; all state in hooks per the UI rules)**
1. Fetch on load.
2. Poll every 60 s, and fetch again straight away on `visibilitychange` (tab or phone
   wakes). **Pause polling while hidden.**
3. Compare against what's on the map and **update only the markers that changed.**
   Never fully re-render the map (existing rule).
4. A 30 s timer moves pins to "öppet nu" (`starts_at` passed) or removes them
   (`ends_at` passed), and shows only entries for today (Stockholm date).
5. Re-check all markers immediately when the page becomes visible: background tabs
   slow timers down.

### Performance (checked; negligible)
- Per tick: comparing about 30–60 markers takes microseconds. The DOM only changes when
  a boundary is crossed, a few times an hour.
- Per poll: about 10 KB, 2–3 KB compressed, so about 150 KB/hour with the map open.
- Battery: one fetch a minute is negligible, and an open WebSocket isn't free either
  (heartbeats keep the radio awake).
- **Only scaling cost:** each poll is one Vercel request even when served from cache.
  See §9 for the limits. **Map tiles are a bigger request consumer than polling.**

### Security: required
The old design had the browser read `locations` directly with the anon key (the
current 0001 RLS grants anon SELECT; the map itself still uses `fake-data.ts`). **With
history kept, that would let anyone pull every truck's full movement history through
Supabase's public API.** So **`/api/live` is the only public read path**, and anon gets **no
SELECT on `locations` or `trucks`**.

**Cost of the design:** new pins show up ~1–2 min after a save. Irrelevant for lunch.

**If push is ever wanted** (e.g. "truck just arrived" notifications): add a dedicated
service such as Ably or Pusher then. Nothing here blocks it.

---

## 8. Supabase stays

Without Realtime, what's used is **Postgres + Auth**, and both are already built:
migrations, generated types, the db layer, the local Docker stack and the integration
tests.

- **Low lock-in:** plain Postgres and plain SQL migrations. If you outgrow it, only
  Auth needs replacing.
- **Considered alternative:** Neon plus a separate auth library (Auth.js / Better Auth).
  It scales to zero instead of pausing and has some restore history on free, but you'd
  own login, sessions and magic-link email yourself. More work to end up where you
  already are.
- **Downsides to manage:**
  - **No backups on Free.** Decided: **Supabase Pro at launch** (§9).
  - Free projects pause after 7 days with no traffic. Only matters pre-launch; one
    click to unpause.
  - Local dev needs Docker, as it does today.

---

## 9. Pricing (researched 2026-10-10)

### Supabase (official pricing page + Realtime limits docs)
| | Free | Pro ($25/mo, includes $10 compute credit) |
|---|---|---|
| Database | 500 MB per project | 8 GB, then $0.125/GB |
| Egress | 5 GB uncached + 5 GB cached | 250 GB + 250 GB, then $0.09 / $0.03 per GB |
| Auth monthly active users | 50,000 | — |
| File storage | 1 GB | — |
| Realtime connections | 200 (over-limit refused) | 500, then $10/1,000 |
| Realtime messages | 2M/mo, 100/s | 5M, then $2.50/M |
| Edge Function calls | 500k | — |
| Backups | **none** | daily |
| Pausing | after 1 week inactive | no |
| Projects | 2 active | — |
| Over the limit | not documented for Free (third-party: the service stops) | spend cap on by default (official) |

**Unverified:** third-party guides report that existing free projects must add
explicit Postgres `GRANT`s for API access from **2026-10-30**. Not confirmed on
supabase.com. **Already covered:** the project requires an explicit `GRANT` in every
migration anyway.

### Vercel (official docs, verified 2026-10-10)
| | Hobby (free) | Pro |
|---|---|---|
| Commercial use | **not allowed** | allowed |
| Cron | **once per day only**; more frequent fails at deploy; timing imprecise | per-minute |
| CDN requests | **1,000,000 / month** | usage-based |
| Function invocations | 1,000,000 / month | usage-based |
| Fast Data Transfer | 100 GB / month | usage-based |
| Fast Origin Transfer | 10 GB / month | usage-based |
| Active CPU | 4 CPU-hours / month | usage-based |
| **Over a limit** | **no bill, but the feature is unavailable until 30 days have passed** | billed on demand |
| Spend Management (cap / pause) | **not available** | configurable |
| DDoS mitigation, Attack Mode | free, automatic; blocked traffic **not billed** | same |
| Firewall custom rules / IP blocks | up to 3 / up to 3; mitigated traffic **not billed** | up to 40 / 100 |
| Firewall rate-limit rules | 1 per project | 40 |
| Price | $0 | ~$20/mo per team member |

#### ⚠ The Hobby cliff: success, not attackers, is the main availability risk
The 1M CDN requests are shared by **everything**: page, JS chunks, polls, and **map
tiles**. Rough per-visit estimate (mine, not measured; check the usage dashboard on
the preview):

| Setup | Requests per visit | 1M lasts about | One viral day (~14k visits) |
|---|---|---|---|
| Everything on Vercel | 60–80 (tiles 30–60) | 400–550 visits/day | **site down up to 30 days** |
| **Tiles on R2** | 20–25 | ~1,300–1,600 visits/day | probably still over |
| **Vercel Pro + Spend Management** | — | no cliff | capped bill, stays up |

**Decision (2026-10-10, process-log row 265):**
1. **Tiles on R2 at launch.** It's free at this traffic, and it moves the biggest
   request consumer off Vercel. This reverses the earlier deferral, which rested on
   an unverified "free limits cover launch".
2. **Vercel Pro with Spend Management (pause at a set cap) before any marketing
   push, at ~50% of any Hobby limit, or when the app goes commercial, whichever comes
   first.** The launch plan's consumer-acquisition push exists to create spikes, and
   spikes are what hit the cliff. Vercel emails as usage nears a limit.

### Cloudflare R2 (official pricing page): at launch, for map tiles
| | Free each month | Beyond |
|---|---|---|
| Storage (Standard) | 10 GB | $0.015/GB-month |
| Class A (writes/lists) | 1M | $4.50/M |
| **Class B (reads, GetObject)** | **10M** | **$0.36/M** |
| Egress | **free, unlimited** | free |

- Free tier is Standard storage only. **Infrequent Access is the wrong class** (it has
  retrieval fees).
- PMTiles reads each tile with a range request. **Assumption:** one ranged GET counts as
  one Class B read; the official page doesn't say.
- About 30–60 reads per visit (fewer for a quick glance, ~100 for heavy panning).
  **Free covers ~200,000 visits a month, roughly 6,500 a day.**
- Past free: 10k visits/day ≈ $2/mo, 50k/day ≈ $23/mo.
- Real example: Pinball Map on Protomaps + R2 reported about 840k reads a month.
- **Setup (Phase 8):**
  - Use a **custom domain** (e.g. `tiles.<domain>`), not `r2.dev`. `r2.dev` is
    rate-limited and dev-only (from memory; verify). The domain's DNS must be on
    Cloudflare, which is free.
  - Add a **CORS rule** (Protomaps' recommendation: origins = your domain + localhost,
    methods `GET`/`HEAD`, headers `range`/`if-match`, expose `etag`, max age 3000).
    Without it the map loads blank.
  - Point `NEXT_PUBLIC_PMTILES_URL` at the R2 URL. Local dev can keep
    `/gothenburg.pmtiles` from `public/`.
  - A payment method is **probably** needed to activate R2 (unverified).
  - **Skip the Protomaps Worker.** Its own free plan (100k requests/day) runs out at
    ~2,000–3,000 visits a day. MapLibre reads the file straight from R2 without it.

### The money plan (agreed)
Free for as long as possible, then Pro across the board. **Two deliberate exceptions:
Supabase Pro at launch (backups), and Vercel Pro early if the Hobby cliff gets close.**
| Service | Plan | When | ≈ Monthly |
|---|---|---|---|
| Supabase | Pro | **at launch** (daily backups) | $25 |
| R2 | pay as you go | **at launch** (tiles) | $0 at launch traffic, $0–25 later |
| Vercel | Pro + Spend Management | before a marketing push / ~50% of a Hobby limit / commercial, whichever first | ~$20 per member + capped usage |
| **Total once all are on** | | | **~$45–70** |

---

## 10. Data model

### Tables (3)
- **`trucks`:** `id`, `name`, `instagram_handle`, `cuisine_type`, `description`,
  `is_active`, `created_at`. **Drop** `last_known_latitude/longitude`. Claim columns
  come with the Owners phase.
- **`locations`:**
  - `id`, `truck_id`, `latitude`, `longitude`
  - `label` text (e.g. "Heden"; from a known spot, a recent place, or typed)
  - `starts_at` **NOT NULL**, `ends_at` **NOT NULL**, `CHECK (ends_at > starts_at)`
  - `cancelled_at` (nullable)
  - `source` (`'admin'` | `'owner'`, default `'admin'`), for the Owners phase and the
    freshness text
  - `created_by` (user id), `created_at`, `updated_at`
    ⚠ **`updated_at` needs a trigger** (e.g. Supabase's `moddatetime` extension, or a
    small `BEFORE UPDATE` function). Today it is only `default now()`, so it never
    changes on UPDATE, and the popup's *"Uppdaterad 08:12"* reads from it.
  - **Overlap constraint** (needs the `btree_gist` extension):
    ```sql
    EXCLUDE USING gist (
      truck_id WITH =,
      tstzrange(starts_at, ends_at) WITH &&
    ) WHERE (cancelled_at IS NULL)
    ```
    A violation raises SQLSTATE `23P01`. The service maps it to a **409** with the
    Swedish "överlappar" message (the API error format already reserves 409).
  - **Removed vs today:** `confidence`, `parser_confidence`, `source_confidence`,
    `is_negation`, `post_id`, `address_raw`, `address_geocoded`, `expires_at`.
  - Rows are **never deleted**, except a takedown.
- **`users`:** keep as is (`id`, `truck_id` nullable, `is_admin`, `created_at`). The
  RLS rule stays: no owner self-UPDATE (that blocks `is_admin` self-escalation and
  `truck_id` hijack).
- **Dropped entirely:** `posts`, `geocoding_cache`, replay index 0004, the
  `parsing_status` values (0005), the overlap index 0006 (the exclusion constraint's
  GiST index replaces it).

### Why this shape is safe
- **#108** (a replace was two separate calls): there is no replace any more.
- **#109** (two concurrent writes both win): the exclusion constraint makes it
  impossible at the DB level, whatever the app does.
- **#112** (a partial overlap deleted a live pin whole): nothing is ever replaced or
  deleted automatically; the human edits.
- **Invalid ranges:** `ends_at` is required, `CHECK (ends_at > starts_at)`, and
  cancellation never touches the range.

### Migrations
**Squash 0001–0006 into a fresh baseline** (decided; no production DB exists yet).
Keep the lessons:
- an explicit `GRANT` per table, matching the RLS matrix
- RLS on every table
- atomicity earned, not assumed (H5)
- no Realtime publication needed

### RLS
- `locations`, `trucks`: **no anon SELECT** (the public reads through `/api/live`,
  server-side).
- `users`: unchanged (authenticated reads own row; no self-UPDATE).
- All writes, `/api/live`, and the admin screen's reads go through server-side API
  routes using service_role.

---

## 11. Code: keep / remove / rework (file level)

### Remove (archived on the branch, deleted from `dev`)
- `src/app/api/email/route.ts`, `src/app/api/ingest/route.ts`
- `src/lib/parser/*`: everything **except** `dictionary.ts` (moves, see Rework)
- `src/lib/services/ingestion.ts` (+ test)
- `src/lib/validators/email.ts`, `ingest.ts` (+ tests)
- `src/lib/geocoding.ts`, `src/lib/db/geocoding.ts` (+ test)
- `src/lib/db/posts.ts`
- `src/lib/sources.ts` (+ test): the platform → lane → confidence mapping
- `src/lib/test-utils/purity.ts` (+ test), `src/lib/parser/purity.test.ts`. The purity
  guard existed for the parser.
- `scripts/sign-mailgun.mjs`
- `vercel.json`
- `supabase/migrations/0001`–`0006` → replaced by the squashed baseline

### Rework
- **`src/lib/parser/dictionary.ts` → e.g. `src/lib/spots.ts`:** a plain constant of
  known Gothenburg places with coordinates. Strip anything parser-specific (match
  aliases, normalisation) it carries. `scripts/seed-dictionary.mjs` (OSM-sourced) can
  stay as the way to regenerate it, or go.
- **`src/lib/services/locations.ts`** (887 lines + 1,292 test): **rewrite small:**
  validate (inside Gothenburg via `geo.ts`, end after start), insert / update /
  cancel, and map `23P01` → 409. **Mine it for lessons first:** boundary handling and
  the overlap predicate.
- **`src/lib/db/locations.ts`:** adapt the primitives to the new columns. Add the
  history queries ("same weekday recently" for the checklist, "recent places").
- **`src/lib/types.ts`, `src/lib/database.types.ts`:** regenerate after the schema
  change.
- **`src/proxy.ts`:** currently a **no-op stub**. The planned layers were never built.
  Build the auth check for `/admin` and the admin API routes. Remove `/api/ingest` and
  `/api/email` from its `matcher`. Keep the Next 16 rules in its header comment.
- ⚠ **"Logged in" is not "admin".** `supabase/config.toml` has
  `enable_signup = true`, so anyone can request a magic link and get a valid
  session.
  - **Disable public sign-ups** (locally in `config.toml`, and in the hosted
    project's Auth settings). Create the admin user by hand.
  - Check **`users.is_admin`**, not just "has a session": in the proxy **and again in
    every admin route handler/service**. The proxy is a first filter, not the only
    check.
  - **Order of checks:** no session cookie → reject immediately, before any network
    or DB call. Only then verify the session, then `is_admin`. Cookie-less floods then
    cost only the function run.
  - Integration test: a non-admin session gets 401/403 on every write route.
- **`package.json`:** remove `@upstash/*` (installed, imported nowhere).
- **`src/lib/supabase.ts`:** the old roadmap's Phase 4 browser/server split is mostly
  unnecessary, because the browser only needs the anon client for Auth. Re-check when
  building login.
- **`src/hooks/useMapLibre.tsx`, `src/components/Map/*`:** keep. Add a `useLocations`
  hook with polling and the timer (§7). `TruckPopup.tsx` changes: no confidence label;
  freshness text from `updated_at` + Instagram link instead.
- **`supabase/seed.sql`:** rewrite for the new schema (it seeds dev trucks against the
  old columns).
- **`src/lib/fake-data.ts`:** replaced by `/api/live`.
- **`tests/integration/*`:** keep setup and helpers. Rewrite `db-locations.test.ts` for
  the new schema: overlap constraint (incl. cancelled rows don't block), `CHECK`, RLS
  (anon can't read `locations`/`trucks`).

### Keep as is
- `src/lib/http/handler.ts` (`withErrorHandling`) and the route → service → db layering
- `src/lib/geo.ts` (Gothenburg bounding box): validates map taps and GPS
- `src/lib/validators/uuid.ts`
- date-fns-tz usage: store UTC, display Europe/Stockholm
- The four gates: `npx tsc --noEmit`, `npm run lint`, `npm run test:all`,
  `npm run build`. Read exit codes unpiped.

### Archive procedure
1. From `dev` at the commit before any removal, create `archive/parser-lanes` (branch
   **and** a tag, so it can't be lost by a branch cleanup) and push both.
2. Then remove the code on a normal feature branch → PR into `dev`.
3. Write the archive name and commit hash into the new plan and the new context.

---

## 12. Decisions

### Settled in this transition (don't reopen without new information)
- Squash migrations. `ends_at` required, no `expires_at`. `cancelled_at` for
  cancellation. Overlaps rejected by a DB constraint. No grey markers / `last_known_*`.
  No `schedules` or `spots` tables. Public reads of `trucks` and `locations` only via
  `/api/live`. `/api/live` cached by a `Cache-Control: s-maxage=60` header, **not ISR**
  (row 264); no save-triggered purge. **Tiles on R2 at launch; Vercel Pro + Spend Management before a marketing push / ~50% of a Hobby limit / commercial** (row 265). Firewall query-string rule and per-IP rate limit considered and dropped (§7).
  Supabase Pro at launch. Owner side deferred.

### Still open for the new plan
1. **Retention period** for detailed location history (GDPR, §15).
2. **Checklist look-back:** last week's same weekday only, or the last 2–4 weeks?
3. **Default times** pre-filled in the entry form (e.g. 11–14; per truck from
   history?).
4. **App name** (for UI text).

### Deferred to the Owners phase
X-day takeover, heads-up text, owner-overrides-admin mechanics, hand-off rule, custom
SMTP provider.

---

## 13. GitHub: issues and milestones

### Milestone `phase-3` (closed in Phase 4, #120)
Close it with a note pointing to this decision, or rename it to something like
"phase-3 (superseded)" and close. Its closed issues stay as the record of the archived
work.

### Open issues: proposed disposition
| # | Title (short) | Proposal |
|---|---|---|
| 70 | Wire ingestion to the parser | **Close** (won't do) |
| 71 | `scripts/reparse.mjs` | **Close** |
| 72 | Integration test suite | **Close and recreate** in the new milestone (constraint, CHECK, RLS) |
| 73 | Reconcile docs + cull comments | **Close.** Superseded by the context *rewrite* (§14) |
| 80 | Scope a negation to its date | **Close** |
| 85 | Swedish number-word times | **Close** |
| 87 | `seed-dictionary --check` | **Close** |
| 90 | Contested digits in parseCaption | **Close** |
| 92 | float4 cannot represent 0.45 | **Close** (confidence removed) |
| 94 | Two-clause captions | **Close** |
| 95 | `parsedAt` never validated | **Close** |
| 97 | Purity guard can't tell `import type` | **Close** (guard removed) |
| 99 | Vitest project with zero tests passes | **KEEP.** Still true and still dangerous. Move to the new milestone. |
| 101 | Collapsed newline defeats exclusion | **Close** |
| 102 | Excluded fallback still pins | **Close** |
| 103 | `geocoding_cache` display_name | **Close** |
| 105 | Nominatim 429/403 backoff | **Close** |
| 108 | Replace is two un-atomic calls | **Close** (no replace any more; §10) |
| 109 | Concurrent writes both win | **Close** (exclusion constraint; §10) |
| 110 | Webhook vs webhook discards | **Close** (lanes gone) |
| 111 | Override compares source confidence only | **Close** (confidence gone) |
| 112 | Partial overlap deleted whole | **Close** (nothing auto-deleted; §10) |
| 114 | Replayed cancellation deletes the future | **Close** (no replay, no lanes) |

Close each with a one-line comment linking the archive branch and this decision, so
the history is traceable from the issue itself, not only from this file.

### New milestones (renumbered in Phase 4; each phase plan decides the detail)
| Phase | Name | Content |
|---|---|---|
| 4 | **Housekeeping** | Archive branch/tag; close the Phase 3 issues; remove lanes, parser, geocoding, Upstash, `vercel.json`; `dictionary.ts` → `spots.ts`; upgrade Next, MapLibre (+ `@protomaps/basemaps`) and vitest; README, CLAUDE.md and context rewrite; fix #99. No new schema |
| 5 | **Schema reset** | Squashed baseline schema (trucks, locations, users; `btree_gist` + exclusion constraint + CHECK + `updated_at` trigger); RLS + GRANTs; regenerate types; rewrite `seed.sql`, the db layer and the integration tests |
| 6 | **Live read path** | `GET /api/live` as an ordinary route with `Cache-Control: public, s-maxage=60, stale-while-revalidate=60` (§7); `useLocations` polling + timer + marker diffing; popup with freshness text + Instagram link; replace `fake-data.ts`. **Create a hosted Supabase project** (free) for previews: so far only the local Docker DB exists, and a preview build can't reach it. **First preview deploy** here: `x-vercel-cache` MISS → HIT check; **look at the usage dashboard to measure real requests per visit** (checks the §9 cliff estimate). Tiles can stay in `public/` for previews. |
| 7 | **Admin** | Magic-link login (admin only; **public sign-ups disabled**) + `is_admin` check in `proxy.ts` **and** in every admin route; truck CRUD; mobile-first location entry (map tap / known spot / recent place / GPS, pre-filled times); edit; cancel; overlap → 409 message; morning checklist from history |
| 8 | **Launch**: first PRODUCTION deploy | Supabase **Pro** (backups); **tiles on R2** (custom domain on Cloudflare DNS, CORS rule, `NEXT_PUBLIC_PMTILES_URL`; confirm the map loads = range requests work); production env; security headers; privacy note; takedown procedure (manual SQL); tell trucks they're listed; consumer acquisition plan; runbook: Vercel **Attack Mode**; watch Vercel usage (emails near limits). **Gate: upgrade Vercel to Pro + Spend Management (pause cap) before the first marketing push**, or at ~50% of any Hobby limit, or when commercial |
| later | **Owners** | Claim flow; owner dashboard; owner-overrides-admin; X-day takeover + heads-up; custom SMTP |
| trigger | **Vercel Pro + Spend Management** | Before any marketing push, at ~50% of a Hobby limit, or when commercial (§9) |
| later | **Automation (optional)** | Meta Business Discovery → captions in the admin screen; pg_cron or an external scheduler; labelled dataset |

Phase 4 (realtime), Phase 6 (cron) and Phase 7 (hardening) of the old roadmap
disappear or fold into these. Old Phase 8 (Make.com guides) is gone.

---

## 14. Docs to change

### `project-context.md`: **rewrite, don't reconcile**
It has many ⚠ blocks and long sections about Mailgun HMAC, replay, the parser
pipeline, confidence, the override matrix and the Make.com payload. Almost none of it
survives. Rewrite from this file and the new plan:
- **Keep and carry over:** What We're Building / The Problem, map behaviour (centre,
  zoom, HTML markers, never full re-render), RLS principles + explicit GRANTs + the "no
  owner self-UPDATE" rule, Supabase client rules, architecture layers, import
  conventions, component/hooks rules, the `proxy.ts` Next 16 rules (no `runtime`
  export, named `proxy`, `config.matcher`), error format, Swedish UI, timezone rule.
- **Remove:** the email lane, webhook lane, parser pipeline, confidence scoring, the
  override matrix, deduplication, `posts`/`geocoding_cache` schema, the replay index,
  `vercel.json`, the cron expiry text, Realtime, Upstash, the Make.com model, the old roadmap's Phase 7
  Mailgun ⚠ items, grey markers / `last_known_*`.
- **Add:** the product model (§4), the `/api/live` read path (§7), "ended is a filter"
  plus client timers (§6), the data model (§10), pricing and upgrade triggers (§9),
  the archive branch reference.

### `README.md` (**tracked, public on GitHub**)
It still describes all three lanes, Make.com + Mailgun, Upstash, Realtime, the
confidence model, the parser and "A Vercel cron cleans expired locations every 30
min". It's the only one of these docs others can see, so update it in the teardown
PR, not later.

### `CLAUDE.md` (tracked since IS #116)
- **Tech stack block:** drop Upstash, Nominatim. Supabase becomes "Postgres + Auth".
- **Architecture rules:** remove the `src/lib/parser/` line.
- **Delete sections:** "Email lane (Mailgun)", "Parser", "Confidence", "Geocoding",
  "Posts table" (incl. "Vercel cron cleans locations only").
- **Replace "Override logic"** with: "Overlapping non-cancelled entries for a truck are refused
  by the DB exclusion constraint (`23P01` → 409). Never auto-resolve, replace or
  delete."
- **API responses:** the webhook/`after()` lines go. `withErrorHandling` stays.
- **UI rules:** the confidence/grey-marker rules go. Replace with: "Only trucks with an
  entry today appear on the map; the popup always shows when it was updated."
- **Add rules:**
  - "Locations are never deleted (except a takedown). Ended (`ends_at <= now()`) and
    cancelled (`cancelled_at`) are filters."
  - "The browser never reads the DB. Public map data comes only from `/api/live`."
  - "`/api/live` is an ordinary (dynamic) route cached by Vercel's CDN via
    `Cache-Control: public, s-maxage=60, stale-while-revalidate=60`. Never ISR, never
    `Set-Cookie`/`private` on it, and never return `[]` on error."
  - "No Vercel cron. Any scheduler is pg_cron or external."
- **Phase plan pointer:** point at the new plan.

### `.claude/plans/phase-3-parser.md`
Leave it as is, as history. Add a one-line header saying it is superseded by this file
and archived with `archive/parser-lanes`.

### `.claude/process-log.md`
- Row 258 (cron) is **resolved by this decision.** Its fix column was marked resolved in
  #128 (PR #141), after the context rewrite.
- The DECISION entry is written, including the simplification pass.
- Keep logging misses as usual during the teardown. An overcorrection while ripping out
  code is the classic risk here.

### Memory
`route-error-handling-wrapper` stays valid. `gates-are-manual-until-deploy` stays valid.
Nothing to delete.

---

## 15. Things to keep in mind

- **Wrong pin > missing pin.** Every UI choice should protect trust: freshness text,
  Instagram link, nothing on the map until it's confirmed.
- **Your daily workload is the real cost of this model.** It's a daily job with no days
  off. The history checklist + known spots + recent places + pre-filled times are what
  keep it sustainable. Plan for sick days and holidays (the map should say honestly
  when it's stale).
- **Stories vanish after 24 h** and often hold "idag står vi vid…". Notifications
  must be on per truck.
- **Last-minute cancellations** ("inställt pga regn" at 10:45) are where relayed data
  goes wrong. Freshness text + Instagram link are the mitigation.
- **Backups:** Supabase Pro at launch. If real data exists before that, run a manual
  `supabase db dump` now and then.
- **Preview vs production Supabase projects.** From memory (verify): on Pro, compute
  is billed per project and the $10 credit covers about one small project. So a
  preview project kept in the **same** org after the upgrade likely adds ~$10/mo. Keep
  previews in a separate free org, or delete the preview project at launch. Free
  projects also pause after 7 idle days; one click to unpause.
- **Vercel Hobby is non-commercial, and has a hard cliff:** over any limit = unavailable for up to 30 days. Upgrade to Pro + Spend Management before a marketing push, at ~50% of a limit, or the day the app earns money (§9).
- **Anon must not read `locations` or `trucks`,** otherwise every truck's movement
  history is public.
- **Never re-introduce a Vercel cron on Hobby.** It fails at deploy.
- **Check exact Next 16 APIs** when implementing; don't rely on memory.
- **Gates:** `test:all` needs Docker. Since #99 it fails if any vitest project collects
  zero test files; it still cannot see partial drops or all-skipped files, so read the counts.
- **Archive, don't delete.** The parser work stays recoverable on
  `archive/parser-lanes` (branch and annotated tag, commit `b089fd0`). *Corrected in
  Phase 4 (Phase 4 plan decision #2):* this first said the archive would be cut from `11f081a`,
  before IS #116, holding code only. It was cut after PR #117 instead, so it holds the
  code **and** the plans, process log and this file as they were.
- **Admin UI is mobile-first.** The workflow is "phone pings → update on the phone".
  Design and test the admin screens at phone width first.
- **Supabase's built-in email is for testing only** (official docs): it delivers
  **only to your Supabase organization's members**, max **2 emails/hour**. Fine for
  admin-only login. **Before owners log in, configure custom SMTP** (Resend, Brevo,
  Postmark, AWS SES, SendGrid or ZeptoMail), add SPF/DKIM DNS records, and translate
  the magic-link template into Swedish.
- **Clean up external accounts and secrets** that the lanes may have created:
  Mailgun domain/route, Make.com scenarios, Upstash database, and their keys in
  `.env.local`. Rotate or delete; don't leave live credentials for removed features.
- **Privacy / GDPR.**
  - Many trucks are sole traders, so a truck's location history can be **personal
    data**.
  - Keeping history needs a stated purpose and a **retention period** (open decision
    1), e.g. keep detailed rows for N months and aggregate after.
  - A **takedown must also delete that truck's history**, not just hide it.
  - Add a short Swedish privacy note to the site. The consumer side stays clean: no
    accounts, no tracking.
- **Don't re-add what §0 removed** without a concrete problem that needs it.

---

## 16. Sources (from the research on 2026-10-10)

- Supabase pricing (official): https://supabase.com/pricing
- Supabase Realtime limits (official): https://supabase.com/docs/guides/realtime/limits
- Supabase custom SMTP (official): https://supabase.com/docs/guides/auth/auth-smtp
- Next.js route handlers (16.4): https://nextjs.org/docs/app/api-reference/file-conventions/route
- Next.js ISR guide (16.4; ISR considered and rejected, §7): https://nextjs.org/docs/app/guides/incremental-static-regeneration
- Vercel ISR (considered and rejected, §7): https://vercel.com/docs/incremental-static-regeneration
- Vercel CDN cache: https://vercel.com/docs/caching/cdn-cache
- Vercel cache keys and purging: https://vercel.com/docs/caching/cdn-cache/purge
- Vercel DDoS mitigation: https://vercel.com/docs/security/ddos-mitigation
- Vercel Hobby plan limits and over-limit behaviour: https://vercel.com/docs/plans/hobby
- Vercel WAF limits: https://vercel.com/docs/vercel-firewall/vercel-waf
- Vercel WAF rate limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel WAF usage and pricing (mitigated traffic not billed): https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing
- Vercel cron usage and pricing (official): https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel Hobby cron limits explained: https://runhooks.app/blog/vercel-hobby-cron-job-limits-explained/
- Cloudflare R2 pricing (official): https://developers.cloudflare.com/r2/pricing/
- Protomaps cloud storage / CORS: https://docs.protomaps.com/pmtiles/cloud-storage
- Pinball Map, Protomaps on R2: https://blog.pinballmap.com/2024/11/05/protomaps-tile-hosting/
- Protomaps blog: https://protomaps.com/blog/serverless-maps-now-open-source
- Third-party Supabase guides (egress, the Oct-30 grants change):
  https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/ ·
  https://automationatlas.io/answers/supabase-free-tier-limits-2026/
