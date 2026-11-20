# Runbook

What to open in an incident, and the weekly routine (Phase 10 plan, step 10 and #8). The repo
is public, so nothing here is a secret. Each value a step needs lives where `CLAUDE.md`'s
"Where secrets live" says: production's Supabase keys in its dashboard (Project Settings → API
Keys) and in Vercel's environment variables, and its database URL in the gitignored
`.env.prod-db.local`. `<project URL>` and `<admin id>` stand for production's own; in "A
restore", for the new project's. A step that rests on a probe or a doc names it, with its
issue.

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

1. **The dump:** README, "Backups" → "The weekly dump". Step 2 runs only after `DUMP OK`;
   step 3 runs whatever the dump answered. **While an incident is being investigated** (a
   takeover, a leaked key), first move the dumps from before it into a `hold` folder inside
   the backups folder: the prune deletes only `whereisfood-YYYY-MM-DD.sql` files at the
   folder's top level, and these may be the only copy of rows an intruder deleted. **At most
   8 weeks** (the owner's call, IS #457): delete the held dumps when the incident is closed,
   or 8 weeks after the hold began, whichever comes first. Held dumps keep the rows of any
   truck taken down before or during the hold until then, past README's "about four weeks":
   say so in a takedown's reply meanwhile ("A takedown request").
2. **`supabase/manual/retention.sql`** in production's SQL editor. Its row counts the
   locations and audit-log rows it deleted (52 weeks and 30 days, Phase 10 plan's open
   decisions 2 and 3). The first audit-log rows come due 30 days after the production
   project's first Auth event (the admin's creation, with "Write audit logs to the database"
   on), and the first locations 52 weeks after the first production location ends. Until
   then it answers `0` for that count, which is expected. **Skip it while an incident is
   being investigated** (a takeover, a leaked key): it deletes the audit rows "A takeover",
   step 5, reads, and no dump holds them (the dumps hold `public` only). README's `DUMP OK`
   line doesn't know about an incident; this rule does.
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

For a flood of traffic, on Vercel. From Vercel's docs
(vercel.com/docs/vercel-firewall/attack-mode, read 2026-11-20, IS #457):

- **On:** the project → Firewall → the ⋯ menu at the top right → **Enable Attack Mode**,
  for 1, 6 or 24 hours. It "turns off automatically when this period ends"; enable it again to
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
2. **Replace the password, and the email if it changed**, through Auth's admin API. First, in
   the SQL editor, `select u.id, a.email from users u join auth.users a on a.id = u.id where
   u.is_admin;`: one row, the admin's id, and an email that should be your mailbox's. A thief
   who held the mailbox may have moved it to theirs, and step 4's link goes to that address.
   Two rows: shut the other out as "A lost phone", step 2, says, then go on here with yours.
   After step 5, follow "A leaked key" to rotate whatever made it.
   Then, with the secret key read without echoing (`read -rs SECRET_KEY`), as README's
   restore step 1 does, and `<your email>` in place:

   ```bash
   PASSWORD=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')
   curl -sS -w '\n%{http_code}\n' -X PUT "<project URL>/auth/v1/admin/users/<admin id>" \
     -H "apikey: $SECRET_KEY" -H "Content-Type: application/json" \
     -d "{\"password\":\"$PASSWORD\",\"email\":\"<your email>\",\"email_confirm\":true}"
   unset PASSWORD SECRET_KEY
   ```

   It prints Auth's answer, then the status. `200` means done. A `4xx` gives its reason in the
   answer: a wrong key answered `401`, and an id no user has `404` `user_not_found` (both on
   the local stack, IS #457). For `000`, a dropped connection: the block has already cleared
   the key, so `read -rs SECRET_KEY` again, then run the block again. Probed on the local
   stack with a throwaway user (IS #457): a password-only `PUT` answered `200`, the stored
   hash changed, the new password signed in and the old one was refused; with the email too,
   `200`, the new address confirmed at once, no change left pending, the identity's email
   moved with it, and no email sent. It also voids a login link sent before it, whichever of
   these the `PUT` held: a new password with a new email, with the same email, or alone. In
   each, the user's `auth.one_time_tokens` row was gone after the `PUT`, and the link answered
   `403` at Auth's verify and made no session; the same link with no `PUT` answered `200` and
   made one (IS #457, local stack). So a thief's pending link can't fill the free slot after
   step 3. The admin never needs the password, but must have one (`CLAUDE.md`, "Supabase").
   The key and the password are on `curl`'s command line while it runs, where other
   processes of this user can read them (README, "Restoring", Limits): on a machine you
   suspect, run it from another.
3. **Delete the factor and end every session:** "A lost phone", steps 2 and 3. Sessions end
   after the password and the factor, or the thief signs straight back in (#13). Deleting the
   factor alone ends no session (IS #381).
4. **Re-enroll at once:** log in with the link, which shows the enroll QR code. Until then any
   `aal1` session can fill the free factor slot (#13).
5. **See what happened**, in the SQL editor. The audit log keeps 30 days (`retention.sql`),
   so skip the weekly `retention.sql` until this is done, keeping the dump and its hold ("The
   weekly routine", step 1), and save the result with the editor's Export:

   ```sql
   select created_at, payload->>'action' as action, ip_address
   from auth.audit_log_entries order by created_at desc limit 100;
   ```

   Then the data, for changes you didn't make, one query at a time (how the editor shows
   several results wasn't checked):

   ```sql
   select id, truck_id, label, starts_at, ends_at, cancelled_at, updated_at
   from locations order by updated_at desc limit 50;
   select id, name, is_active, created_at from trucks order by created_at desc;
   select id, is_admin, truck_id, created_at from users;
   ```

   A location edit moves `updated_at` (its trigger skips one that clears `created_by`:
   `CLAUDE.md`, "db layer"), and a new row has its `created_at`. A truck or `users` edit and a
   deleted row leave no time, so compare what you see with what you know, an admin you don't
   know included.

The swap (unenroll, enroll and a password set by the thief) stays possible as sabotage, a
lockout, not a way in: the app admits only a magic-link sign-in (#13).

---

## A lost phone

The authenticator app holds the admin's one TOTP factor. If the phone **broke** and the app's
backup restores onto the new one, nothing else is needed. If it was **lost or stolen**, its
finder holds the same TOTP secrets and maybe the mailbox's app too: run the steps below even
if the backup restored. They run in production's SQL editor (open decision 9: the dashboard,
no secret key outside Supabase, no unenroll screen; IS #457):

0. **The accounts first, before step 3.**
   - **The mailbox** (lost or stolen): change its password and end its sessions, the lost
     phone's included ("A takeover", step 1). Until then its app can fetch a login link.
   - **The dashboards:** every account `CLAUDE.md`'s "Secrets" lists with two-factor
     (GitHub, Supabase, Vercel, Cloudflare, the registrar, the recovery email) may have it on
     the phone. Sign in with each account's recovery codes, kept where you keep them, never in
     the repo. If the phone was lost or stolen, also, in each: reset its two-factor (remove the
     old authenticator, enroll the new phone, save the new recovery codes), sign out every
     other session and device, revoke the tokens and app authorisations the phone held, and
     change any password the phone's browser or password manager kept. Otherwise the finder's
     codes and signed-in apps still work.
1. Make sure it is the phone, not a takeover. If anything under "A takeover" looks off, follow
   that instead.
2. Check there is one admin:

   ```sql
   select u.id, a.email, u.created_at
   from users u join auth.users a on a.id = u.id where u.is_admin;
   ```

   It answers one row, with your email. No row means no admin: stop. Two rows mean someone made
   a second admin, which a signed-in user can't do with their own session, but a key or the
   database password can. Tell yours by its email (the takeover's step 2 restores it first if
   it was changed), and keep the other's rows as evidence, but shut it out, with its id:
   - `update users set is_admin = false where id = '<other id>';`
   - ban it at Auth, the takeover's step 2 `curl` with `-d '{"ban_duration":"876000h"}'` and
     `<other id>`;
   - `delete from auth.mfa_factors where user_id = '<other id>';` and
     `delete from auth.sessions where user_id = '<other id>';`.

   A ban refuses new sign-ins but ends no session. Probed on the local stack with a throwaway
   user (IS #457): `200`, then a password sign-in answered `400` `user_banned`, while its
   session stayed. Then treat it as "A leaked key" too, after the steps here, and go back to
   where you came from.
3. Delete the admin's factor and every session they have, in one statement:

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

   Expect `admins` `1` and `factors_deleted` `1`. It finds the admin by `users.is_admin`, not
   by the email, which a thief holding the mailbox could change. A signed-in user can't change
   `is_admin` with their own session (`CLAUDE.md`, "Supabase": no owner self-UPDATE on
   `users`); step 2 covers a key that can. The factor's challenges and the sessions' refresh
   tokens and sign-in records go with them (`ON DELETE CASCADE`). Probed on the local stack as
   `postgres`, in a transaction rolled back after (IS #457): `1|1|1`, with factors, sessions,
   refresh tokens and sign-in records at `0` inside it.
4. **Log in at once** and enroll the new phone from the QR code. Until then any `aal1`
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
- **The database password** (in `.env.prod-db.local`): the dashboard's Connect dialog has
  **Reset database password** (seen on the preview's, IS #455; how a reset affects anything
  else wasn't read). Then put the new one into `.env.prod-db.local`, and anywhere else that
  stored it (a CLI link made with it). The app doesn't use it.
- **The legacy keys** (`anon` and `service_role` JWTs): they "stay valid until you disable
  them in the Settings > API Keys section", even where the project uses the new `sb_` keys
  (#448's 1b). First check that Vercel's Production `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY` start `sb_publishable_` and `sb_secret_`; if either is a legacy
  JWT, replace it with an `sb_` key and redeploy, or the app stops working. Then disable the
  legacy keys there. If the legacy JWT secret itself leaked, rotating it signs every user out
  and needs both legacy keys rotated at once (#448's 1b).
- **Anything else** (a GitHub token, a CLI login, the Vercel bypass secret): revoke it where
  it was issued, and make a new one.

**After rotating the secret key, a legacy `service_role` key or JWT secret, the database
password, or a Supabase or Vercel account's token or CLI login**, also
run "A takeover", steps 2 to 4. Supabase's docs don't say a key's rotation ends the sessions a
thief made with it (#448's 1b: "not stated"), and any of them can change the admin's email,
factor and sessions with no email sent ("A takeover", step 2's probe). Then hold the weekly
routine as an incident ("The weekly routine").

Then look for use of the key, knowing how little shows:

- **Auth admin actions** (users made, changed or deleted through Auth) are in Auth's audit
  log: "A takeover", step 5. A change made by SQL with the database password goes around
  Auth and leaves no audit row.
- **Changes to data:** only new rows (`created_at`) and most location edits (`updated_at`)
  leave a time: "A takeover", step 5's queries. A truck edit, a `users` change (`is_admin`,
  `truck_id`) and a deleted row leave none, so check the `users` rows for an admin you don't
  know, and the trucks against what you know.
- **Reads** through the data API with the secret key bypass row-level security and leave
  nothing in any table. Supabase's API logs keep 1 day on Free (Phase 9 plan open decision
  7), so a read older than that can't be ruled out. Treat what the key could read, the
  location history included, as possibly read.

**Then look for what it left behind**, which a rotation doesn't remove. After the database
password or an account token, all of these; after the secret key, the first two:

- **Keys and accounts:** the API Keys page, for a key you didn't make (delete it), and Auth's
  users, for one you didn't make (ban it and end its sessions, as "A lost phone", step 2,
  does).
- **Settings:** README's "Hosted settings checklist", row by row, Auth's sign-ups and Redirect
  URLs included; Vercel's Production variables and its recent deployments.
- **The database,** each query in the SQL editor against what the migrations give, here the
  local stack's answers (IS #457):

  ```sql
  select grantee, table_name, privilege_type from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated');
  select tablename, policyname from pg_policies where schemaname = 'public';
  select event_object_table, trigger_name from information_schema.triggers
  where trigger_schema = 'public';
  select rolname from pg_roles where rolcanlogin order by 1;
  ```

  Locally: `authenticated` `users` `SELECT` only; the one policy `users_select_own`; the one
  trigger `locations_updated_at`. A login role you don't recognise is suspect: the hosted
  list wasn't read, so compare it with the preview's. Then the Security Advisor on
  production, by its URL, since the CLI is normally linked to the preview:
  `npx supabase db advisors --db-url "$PROD_DB_URL" --type security`, with `PROD_DB_URL` read
  as README's weekly dump reads it (`--db-url` is in the CLI's `--help`; not run).

---

## A takedown request

A truck that asks to be removed is removed, company or sole trader (IS #373 (Phase 10)):

1. README, "Takedown", steps 1 to 4: find the truck, run `supabase/manual/takedown.sql`, read
   its row, and add the line to the takedown log.
2. Reply to the requester. The map drops the truck within about three minutes; the weekly
   dumps from before it age out over about four weeks (README, "Backups"), or, while an
   incident hold is open, when the held dumps are deleted, at most 8 weeks after the hold
   began ("The weekly routine").

---

## A paused project

Supabase pauses a Free project that "show[s] low activity over a 7-day period". It sends a
warning email "roughly one week before", and activity after it prevents the pause (#448's
1c, from Supabase's docs). Accepted (open decision 8, IS #457).

- **What it looks like:** Supabase answers `540 project paused` (#448's 1c), so every call the
  app makes to it fails: `/api/live` answers an error, and so do the admin screen and the
  login. A map tab already open keeps its last markers; a new load of `/map` lands on
  `/about`, since the gate asks Auth first and sends any answer but `ok` there (`MapPage`'s
  `requireAdmin`, which reads an Auth error as `unavailable`). Not seen on this project.
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

1. **The new project:** link the CLI to it first, since a push goes to whichever project the
   CLI is linked to (README, "Hosted preview database", links the preview), then push the
   migrations without `--include-seed`:

   ```bash
   npx supabase link --project-ref <new project ref>
   npx supabase db push --dry-run   # lists the migrations, and no seed
   npx supabase db push
   ```

   Then README's "Hosted settings checklist", every Supabase row, with production's Site URL
   and Redirect URLs (its `/auth/callback` only, no wildcard), and the checks the Phase 10
   plan's step 13 runs on a new production project: Phase 5 #19's hosted check (the
   `sv-SE-x-icu` collation, both extensions in `extensions`, the Data API's Max rows at least
   `MAX_ROWS`), and the Security Advisor (`npx supabase db advisors --linked --type
   security`): no ERROR, each WARN fixed or accepted.
2. **`.env.prod-db.local`:** the new project's session pooler URL, before the load, so
   nothing reaches the old project by mistake.
3. **The data:** README's "Restoring" against the new project: its check that `trucks` and
   `auth.users` both count 0, then its steps 1 to 4 (the admin by their old id, the load, the
   takedowns and `retention.sql`). README shows the load on the local stack; against the new
   project, the same `psql` through the local stack's container reads the URL instead (not
   tried):

   ```bash
   PROD_DB_URL=$(grep '^PROD_DB_URL=' .env.prod-db.local | cut -d= -f2- | tr -d "\r\"'")
   docker exec -i supabase_db_whereisfood psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -1 < <dump file>
   unset PROD_DB_URL
   ```

4. **Vercel's Production variables:** `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set to the new project's.
   Then redeploy Production.
5. **Log in and enroll TOTP at once** (README's "Restoring", step 5), now that the app points
   at the new project. Then look at `/map`.
6. **The CLI back to the preview:** `npx supabase link --project-ref <preview project ref>`.
   README's "Later migrations go up with plain `npx supabase db push`" assumes the preview;
   left linked to production, the next migration would skip it.
7. **The old project:** pause it once the new one works, and delete it once the restore is
   confirmed. Until then it still holds every truck's history, a takedown or retention run
   since misses it, and its keys still work. Say so in a takedown's reply meanwhile.

Not tried: neither the hosted restore nor this move has been run (README, "Restoring",
Limits).
