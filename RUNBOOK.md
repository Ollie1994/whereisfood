# Runbook

What to open in an incident, and the weekly routine (Phase 10 plan, step 10 and #8). The repo
is public, so nothing here is a secret. Each value a step needs lives where `CLAUDE.md`'s
"Where secrets live" says: production's Supabase keys in its dashboard (Project Settings → API
Keys) and in Vercel's environment variables, and its database URL in the gitignored
`.env.prod-db.local`. `<admin email>` and `<project URL>` stand for production's own. A step
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
   decisions 2 and 3). The first rows come due 30 days after the production deploy for the
   audit log, and 52 weeks after the first production location ends for locations. Until
   then it answers `0` for each, which is expected.
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
   curl -sS -o /dev/null -w '%{http_code}\n' -X PUT "<project URL>/auth/v1/admin/users/<admin id>" \
     -H "apikey: $SECRET_KEY" -H "Content-Type: application/json" -d "{\"password\":\"$PASSWORD\"}"
   unset PASSWORD SECRET_KEY
   ```

   `200` means done. The admin id is the `users` row with `is_admin` true. Probed on the
   local stack with a throwaway user (IS #457): `200`, the stored hash changed, the new
   password signed in and the old one was refused. The admin never needs the password, but
   must have one (`CLAUDE.md`, "Supabase").
3. **Delete the factor and end every session:** the statement in "A lost phone", step 2.
   Sessions end after the password and the factor, or the thief signs straight back in
   (#13). Deleting the factor alone ends no session (IS #381).
4. **Re-enroll at once:** log in with the link, which shows the enroll QR code. Until then any
   `aal1` session can fill the free factor slot (#13).
5. **See what happened**, in the SQL editor (the audit log keeps 30 days, `retention.sql`):

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
   with input as (
     select '<admin email>'::text as email
   ),
   admin as (
     select auth.users.id from auth.users join input on auth.users.email = input.email
   ),
   deleted_factors as (
     delete from auth.mfa_factors where user_id in (select id from admin) returning 1
   ),
   deleted_sessions as (
     delete from auth.sessions where user_id in (select id from admin) returning 1
   )
   select
     (select count(*) from admin) as users,
     (select count(*) from deleted_factors) as factors_deleted,
     (select count(*) from deleted_sessions) as sessions_deleted;
   ```

   Expect `users` `1` and `factors_deleted` `1`. `users` `0` means the email matched no one,
   and nothing changed. The factor's challenges and the sessions' refresh tokens and sign-in
   records go with them (`ON DELETE CASCADE`). Probed on the local stack as `postgres`, in a
   transaction rolled back after (IS #457): `1|1|1`, with factors, sessions, refresh tokens and
   sign-in records at `0` inside it.
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

Then check the audit log, as in "A takeover", step 5, for use of the key.

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

From a weekly dump: README, "Backups" → "Restoring", steps 1 to 5. It goes only into a fresh
database. On a hosted project that means a new one (a paused project or a free slot, since
Free allows two active), and then the live app moves to it:

1. **The new project's settings:** README's "Hosted settings checklist", every Supabase row,
   with production's Site URL and Redirect URLs (its `/auth/callback` only, no wildcard).
2. **Vercel's Production variables:** `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set to the new project's.
   Then redeploy Production.
3. **`.env.prod-db.local`:** the new project's session pooler URL, for the next dump.
4. **Check:** log in (enroll TOTP at once, README's restore step 5), and look at `/map`.

Not tried: neither the hosted restore nor this move has been run (README, "Restoring",
Limits).
