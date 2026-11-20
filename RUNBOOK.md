# Runbook

What to open in an incident, and the weekly routine (Phase 10 plan, step 10 and #8). The repo
is public, so nothing here is a secret. Each value a step needs lives where `CLAUDE.md`'s
"Where secrets live" says: production's Supabase keys in its dashboard (Project Settings → API
Keys) and in Vercel's environment variables, and its database URL in the gitignored
`.env.prod-db.local`. `<project URL>` and `<admin id>` stand for production's own. A step
that rests on a probe or a doc names it, with its issue.

- [The weekly routine](#the-weekly-routine)
- [Attack Mode](#attack-mode)
- [A takeover of the admin account](#a-takeover-of-the-admin-account)
- [A lost phone](#a-lost-phone)
- [A leaked key](#a-leaked-key)
- [A takedown request](#a-takedown-request)
- [A paused project](#a-paused-project)
- [A restore](#a-restore)

---

## The weekly routine

Once a week, in this order:

1. **The dump:** README, "Backups" → "The weekly dump". Go on only after `DUMP OK`.
2. **`supabase/manual/retention.sql`** in production's SQL editor. Its row counts the
   locations and audit-log rows it deleted (52 weeks and 30 days, Phase 10 plan's open
   decisions 2 and 3). The first audit-log rows come due 30 days after the production
   project's first Auth event (the admin's creation, with "Write audit logs to the database"
   on), and the first locations 52 weeks after the first production location ends. Until
   then it answers `0` for that count, which is expected. **Skip it while a takeover is
   being investigated**: it deletes the audit rows "A takeover", step 5, reads, and no dump
   holds them (the dumps hold `public` only).
3. **The usage look**, which stands in for the alerts neither free plan offers (open decision
   7, IS #457):
   - **Supabase:** the organization's Usage page, each figure against its limit (database size
     against Free's 0.5 GB, egress against 5 GB). Past a quota a Free project "could become
     unresponsive or enter read only mode" (its Billing page, Phase 9 plan open decision 7).
   - **Vercel:** the team's Usage page, the same way. Deployment Storage was the one figure
     over 10% of its limit when Phase 9 read it (#417).
   - **Errors:** Vercel's Logs, filtered to 5xx. Hobby keeps runtime logs 1 hour and
     Observability 12 hours, and Supabase's logs keep 1 day (Phase 9 plan open decision 7),
     so this sees only recent errors. A 5xx between looks goes unalerted: accepted while the
     admin uses the app daily during the soft launch (open decision 7).

The routine is also the project's weekly activity, though it may not be enough to keep a
Free project from pausing ("A paused project", below).

---

## Attack Mode

For a flood of traffic, on Vercel. From Vercel's docs (vercel.com/docs/vercel-firewall/attack-mode,
read 2026-11-20, IS #457):

- **On:** the project → Firewall → the ⋯ menu at the top right → **Enable Attack Mode**, for
  1, 6 or 24 hours. It "turns off automatically when this period ends"; enable it again to
  continue. **Off:** the same menu → **Disable Attack Mode**.
- It is "available for free on all plans", Hobby included, and blocked requests "do not count
  towards your usage limits".
- Visitors "must complete a security challenge before accessing your site". "All traffic
  initiated by web browsers, including API traffic, is supported", so the map's polls of
  `/api/live` and the admin screen's calls go on after the challenge. Search engines and
  webhook providers are let through. "Standalone APIs … and non-recognized automated services
  may not be able to pass challenges and could be blocked." Nothing here calls the app that way.
- Not covered by the page: what Attack Mode does to responses already in the CDN cache. Not
  tried on this project.

---

## A takeover of the admin account

Signs: a factor-enrolled, factor-unenrolled or password-changed email you didn't cause; an
entry in the admin screen you didn't make; Auth audit-log rows you don't recognise (step 5).
What a stolen `aal2` session can do, and why the steps run in this order, is the Phase 9
plan's #13. Its order:

1. **Secure the mailbox.** The login is the emailed link, so whoever holds the mailbox can log
   in. Change its password, check its two-factor and recovery options, and end its other
   sessions.
2. **Replace the password** through Auth's admin API, with the secret key read without echoing
   (`read -rs SECRET_KEY`), as README's restore step 1 does:

   ```bash
   PASSWORD=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')
   curl -sS -w '\n%{http_code}\n' -X PUT "<project URL>/auth/v1/admin/users/<admin id>" \
     -H "apikey: $SECRET_KEY" -H "Content-Type: application/json" -d "{\"password\":\"$PASSWORD\"}"
   unset PASSWORD SECRET_KEY
   ```

   It prints Auth's answer, then the status. `200` means done. A `4xx` gives its reason in the
   answer: a wrong key answered `401`, and an id no user has `404` `user_not_found` (both on
   the local stack, IS #457). For `000`, a dropped connection, run it again. The admin id is `select id from users where is_admin;`. Probed on the local stack
   with a throwaway user (IS #457): `200`, the stored hash changed, the new password signed
   in and the old one was refused. The admin never needs the password, but must have one
   (`CLAUDE.md`, "Supabase"). The key and the password are on `curl`'s command line while it
   runs, where other processes of this user can read them (README, "Restoring", Limits): on a
   machine you suspect, run it from another.
3. **Delete the factor and end every session:** the statement in "A lost phone", step 2. It
   finds the admin by `users.is_admin`, not by email, so a thief who changed the address
   doesn't hide them. Sessions end after the password and the factor, or the thief signs
   straight back in (#13). Deleting the factor alone ends no session (IS #381).
4. **Re-enroll at once:** log in with the link, which shows the enroll QR code. Until then any
   `aal1` session can fill the free factor slot (#13).
5. **See what happened**, in the SQL editor. The audit log keeps 30 days (`retention.sql`),
   so skip the weekly run until this is done, and save the result with the editor's Export:

   ```sql
   select created_at, payload->>'action' as action, ip_address
   from auth.audit_log_entries order by created_at desc limit 100;
   ```

   and the newest entries, for changes you didn't make:
   `select id, truck_id, label, starts_at, ends_at, cancelled_at, updated_at from locations order by updated_at desc limit 50;`.

The swap (unenroll, enroll and a password set by the thief) stays possible as sabotage, a
lockout, not a way in: the app admits only a magic-link sign-in (#13).

---

## A lost phone

The authenticator app holds the admin's one TOTP factor. If its backup restores onto the new
phone, nothing else is needed. Otherwise, in production's SQL editor (open decision 9: the
dashboard, no secret key outside Supabase, no unenroll screen; IS #457):

1. Make sure it is the phone, not a takeover. If anything under "A takeover" looks off, follow
   that instead.
2. Delete the admin's factor and every session they have, in one statement:

   ```sql
   with admin as (
     select id from public.users where is_admin
   ),
   deleted_factors as (
     delete from auth.mfa_factors where user_id in (select id from admin) returning 1
   ),
   deleted_sessions as (
     delete from auth.sessions where user_id in (select id from admin) returning 1
   )
   select
     (select count(*) from admin) as admins,
     (select count(*) from deleted_factors) as factors_deleted,
     (select count(*) from deleted_sessions) as sessions_deleted;
   ```

   Expect `admins` `1` and `factors_deleted` `1`. It finds the admin by `users.is_admin`,
   which no user can change (`CLAUDE.md`, "Supabase": no owner self-UPDATE on `users`), not by
   the email. The factor's challenges and the sessions' refresh tokens and sign-in records go
   with them (`ON DELETE CASCADE`). Probed on the local stack as `postgres`, in a transaction
   rolled back after (IS #457): `1|1|1`, with factors, sessions, refresh tokens and sign-in
   records at `0` inside it.
3. **Log in at once** and enroll the new phone from the QR code. Until then any `aal1`
   session can fill the free slot (Phase 9 plan #13). Delete the old phone's entry if the app
   synced it.

Limits: run only on the local stack, not on a hosted project. #454's probe showed the
preview's SQL editor runs as `postgres` and may delete from an `auth` table
(`auth.audit_log_entries`). These two tables weren't tried there.

---

## A leaked key

A secret that reaches a commit, an issue or a PR is rotated, not just deleted (`CLAUDE.md`,
"Secrets"). By key, from Supabase's docs as #448's 1b read them:

- **Production's secret key** (`sb_secret_…`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel):
  several can exist at once, so in Supabase's Project Settings → API Keys add a new secret
  key, put it in Vercel's Production variable, redeploy Production, check the admin screen
  works, then delete the old key there.
- **The publishable key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`): public by design, in every
  browser. How to revoke one wasn't stated on the pages read.
- **The database password** (in `.env.prod-db.local`): Connect → **Reset database password**,
  then the new one into `.env.prod-db.local`. The app doesn't use it; only the dump does.
- **The legacy JWT secret:** only if the project uses the legacy keys (the preview uses the new
  `sb_` ones, #448's 1b). Rotating it signs every user out and needs both legacy keys rotated
  at once.
- **Anything else** (a GitHub token, a CLI login, the Vercel bypass secret): revoke it where
  it was issued, and make a new one.

Then look for use of the key, knowing how little shows:

- **Auth admin actions** (users made, changed or deleted) are in Auth's audit log: "A
  takeover", step 5.
- **Changes to data** show in the tables' own columns: "A takeover", step 5's `locations`
  query (`updated_at`), and the same for `trucks` (`created_at`).
- **Reads** through the data API with the secret key bypass row-level security and leave
  nothing in any table. Supabase's API logs keep 1 day on Free (Phase 9 plan open decision
  7), so a read older than that can't be ruled out. Treat what the key could read, the
  location history included, as possibly read.

---

## A takedown request

A truck that asks to be removed is removed, company or sole trader (IS #373 (Phase 10)):

1. README, "Takedown", steps 1 to 4: find the truck, run `supabase/manual/takedown.sql`, read
   its row, and add the line to the takedown log.
2. Reply to the requester. The map drops the truck within about three minutes; the weekly
   dumps from before it age out over about four weeks (README, "Backups").

---

## A paused project

Supabase pauses a Free project that "show[s] low activity over a 7-day period". It sends a
warning email "roughly one week before", and activity after it prevents the pause (#448's
1c, from Supabase's docs). Accepted (open decision 8, IS #457).

- **What it looks like:** Supabase answers `540 project paused` (#448's 1c), so every call the
  app makes to it fails: `/api/live` answers an error (the map keeps its last markers), and so
  do the admin screen and the login. Not seen on this project.
- **Resume:** the project's dashboard → **Resume project** and confirm. It "will return to
  its previous state, including data and configurations", and can be resumed "for up to 1
  year after it was paused" (#448's 1c). Then load the map and the admin screen once.
- **Prevent:** after the warning email, use the app (log in, open the admin screen) on a few
  days that week. "Typically a few user requests to the database each day over the previous
  week is enough" (#448's 1c), which one weekly run may not be.

---

## A restore

From a weekly dump, following README's "Backups" → "Restoring". It goes only into a fresh
database, so on a hosted project into a **new** project, in a free slot: Free allows two
active projects, and pausing another frees one. A paused project keeps its data and users,
so it isn't fresh. In this order, since the login has to reach the new project:

1. **The new project:** the migrations (`npx supabase db push`, without `--include-seed`),
   then README's "Hosted settings checklist", every Supabase row, with production's Site URL
   and Redirect URLs (its `/auth/callback` only, no wildcard).
2. **The data:** README's "Restoring", steps 1 to 4, against the new project: the admin by
   their old id, the load, the takedowns and `retention.sql`.
3. **Vercel's Production variables:** `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set to the new project's.
   Then redeploy Production.
4. **`.env.prod-db.local`:** the new project's session pooler URL, for the next dump.
5. **Log in and enroll TOTP at once** (README's "Restoring", step 5), now that the app points
   at the new project. Then look at `/map`.

Not tried: neither the hosted restore nor this move has been run (README, "Restoring",
Limits). README's step 2 shows the load on the local stack only.
