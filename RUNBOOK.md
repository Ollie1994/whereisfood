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
- [Exporting evidence](#exporting-evidence)
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
   say so in a takedown's reply meanwhile, and write to each earlier requester whose date this
   moves ("A takedown request", steps 2 and 3).
2. **`supabase/manual/retention.sql`** in production's SQL editor. Its row counts the
   locations and audit-log rows it deleted (52 weeks and 30 days, Phase 10 plan's open
   decisions 2 and 3). The first audit-log rows come due 30 days after the production
   project's first Auth event (the admin's creation, with "Write audit logs to the database"
   on), and the first locations 52 weeks after the first production location ends. Until
   then it answers `0` for that count, which is expected. **During an incident** (a
   takeover, a leaked key), **skip it until "Exporting evidence" has printed `EXPORT OK
   audit`, and never more than 8 weeks** (the owner's call, IS #457): it deletes the audit
   rows that export saves, and no dump holds them (the dumps hold `public` only). README's
   `DUMP OK` line doesn't know about an incident; this rule does.
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

## Exporting evidence

Before anything an incident deletes (sessions, factors, the audit log `retention.sql` trims),
save it to files, whole. Not through the SQL editor, whose results show at most 100 rows
("Limited to only 100 rows"). With the local stack started, through its `psql`, from the
repo in Git Bash:

```bash
BACKUPS="<backups folder>"
PROD_DB_URL=$(grep '^PROD_DB_URL=' .env.prod-db.local | cut -d= -f2- | tr -d "\r\"'")
EXPORT="$BACKUPS/hold/incident-$(date -u +%Y-%m-%d)"
if [ -z "$PROD_DB_URL" ]; then
  echo "NO URL: nothing exported"
else
  mkdir -p "$EXPORT"
  for item in \
    "audit|select * from auth.audit_log_entries order by created_at" \
    "sessions|select * from auth.sessions order by created_at" \
    "factors|select * from auth.mfa_factors order by created_at" \
    "admins|select u.id, a.email, u.is_admin, u.truck_id, u.created_at, a.created_at as auth_created_at from public.users u join auth.users a on a.id = u.id order by u.created_at" \
    "trucks|select * from public.trucks order by created_at"; do
    name=${item%%|*}; query=${item#*|}
    if docker exec -i supabase_db_whereisfood psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -c \
      "\copy ($query) to stdout with csv header" > "$EXPORT/$name.csv.part"; then
      mv "$EXPORT/$name.csv.part" "$EXPORT/$name.csv"
      echo "EXPORT OK $name: $(($(wc -l < "$EXPORT/$name.csv") - 1)) lines after the header"
    else
      rm -f "$EXPORT/$name.csv.part"
      echo "EXPORT FAILED $name: nothing kept for it"
    fi
  done
fi
unset PROD_DB_URL
```

Each file is written as `.part` and renamed only when `psql` succeeds, so a file with its
own name is a complete export. Probed on the local stack, by its own URL (IS #457): each
answered `EXPORT OK` with as many lines as its table had rows (audit 54, sessions 1, factors
1, admins 1, trucks 23); with an unreachable URL, each answered `EXPORT FAILED` and left no
file; with none, `NO URL`. A line count can exceed the rows if a value holds a line break.
Run it again later in an incident to export what has changed. The files hold IP addresses
and emails, and `trucks` holds every truck's row, so it keeps a truck taken down after the
export: keep them in `hold` with the held dumps, and delete them with those, at most 8 weeks
after the hold began ("The weekly routine").

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
   Two rows: shut the other out as "A lost phone", step 2, says (it tells yours by its id,
   not the email), then come back to this step with yours. "A leaked key" comes after step 5.
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
5. **See what happened**, from "Exporting evidence"'s files (run it first if step 3 didn't):
   `audit.csv` by `created_at`, `payload`'s `action` and `ip_address`; `admins.csv` and
   `trucks.csv` against what you know, an admin you don't know included. For locations, the
   newest edits, in the SQL editor (50 rows, under its 100-row display):
   `select id, truck_id, label, starts_at, ends_at, cancelled_at, updated_at from locations
   order by updated_at desc limit 50;`. A location edit moves `updated_at` (its trigger skips
   one that clears `created_by`: `CLAUDE.md`, "db layer"), and a new row has its
   `created_at`. A truck or `users` edit and a deleted row leave no time.

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
   select u.id, a.email, a.created_at as auth_created_at
   from users u join auth.users a on a.id = u.id where u.is_admin;
   ```

   It answers one row, with your email. No row means no admin: stop. Two rows mean someone made
   a second admin, which a signed-in user can't do with their own session, but a key or the
   database password can. **Tell yours by its id**, not the email, which a thief may have
   changed: the `users` row with `is_admin` true in the newest weekly dump from before the
   incident (the id README's restore calls the old id). Keep that id in your password manager
   from production's setup on: if every kept dump already shows both admins, the noted id
   decides. Without it, stop and compare each `auth_created_at` with when you created the
   production admin, or with the last restore's date, since a restore recreates the admin and
   resets it; don't guess. Then shut the other out, keeping its rows as evidence:
   1. Export first: "Exporting evidence" saves every session and factor, its included (they
      hold its IPs, user agents and times). Go on only after its `EXPORT OK sessions` and
      `EXPORT OK factors`.
   2. Then, in the SQL editor:

      ```sql
      update users set is_admin = false where id = '<other id>';
      update auth.users set banned_until = now() + interval '100 years' where id = '<other id>';
      delete from auth.mfa_factors where user_id = '<other id>';
      delete from auth.sessions where user_id = '<other id>';
      ```

   A ban refuses new sign-ins but ends no session, hence the deletes. Probed on the local
   stack with throwaway users (IS #457): after the ban by SQL, a password sign-in answered
   `400` `user_banned`; a ban through the admin API left the user's session in place. Use a
   finite date: `banned_until = 'infinity'` made the sign-in answer `500` and the admin API
   fail to delete the user. Then come back to the step that sent you here; "A leaked key"
   follows once the section you came from is finished.
3. Delete the admin's factor and every session they have, in one statement. In a takeover,
   run "Exporting evidence" first (unless step 2 just did), since the thief's sessions are
   among them.

   ```sql
   with admin as (
     select id from public.users where is_admin
   ),
   deleted_factors as (
     delete from auth.mfa_factors where user_id in (select id from admin) returning 1
   ),
   deleted_sessions as (
     delete from auth.sessions where user_id in (select id from admin) returning 1
   ),
   deleted_links as (
     delete from auth.one_time_tokens where user_id in (select id from admin) returning 1
   ),
   cleared_tokens as (
     update auth.users set recovery_token = '', confirmation_token = '',
       email_change_token_new = '', email_change_token_current = '', reauthentication_token = ''
     where id in (select id from admin) returning 1
   )
   select
     (select count(*) from admin) as admins,
     (select count(*) from deleted_factors) as factors_deleted,
     (select count(*) from deleted_sessions) as sessions_deleted,
     (select count(*) from deleted_links) as links_voided,
     (select count(*) from cleared_tokens) as tokens_cleared;
   ```

   Expect `admins` `1`, `factors_deleted` `1` and `tokens_cleared` `1`. `links_voided` voids
   a login link already sent, which a stolen phone's mail app may hold: probed on the local
   stack with a throwaway user (IS #457), a link whose `auth.one_time_tokens` row was deleted
   by SQL answered `403` at Auth's verify and made no session, where the same link left alone
   answered `200`. `tokens_cleared` also empties the token columns `auth.users` keeps, in case
   a hosted Auth reads them when no `one_time_tokens` row is left (not seen; locally the
   deleted row alone was enough). Set to `''`, not `null`; a password sign-in still answered
   `200` after (IS #457). The emails carry no code (`CLAUDE.md`, "Supabase"), only the link.
   It finds the admin by `users.is_admin`, not by the email, which a thief holding the
   mailbox could change. A signed-in user can't change `is_admin` with their own session
   (`CLAUDE.md`, "Supabase": no owner self-UPDATE on `users`); step 2 covers a key that can.
   The factor's challenges and the sessions' refresh tokens and sign-in records go with them
   (`ON DELETE CASCADE`). Probed on the local stack as `postgres`, in a transaction rolled
   back after (IS #457): `1|1|1|0|1` (no link was pending), with factors, sessions, refresh
   tokens and sign-in records at `0` inside it.
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
- **The database's `public` schema,** compared whole with the migrations': dump production's
  and the local stack's schema (the local stack started, no data needed) and diff them:

  ```bash
  PROD_DB_URL=$(grep '^PROD_DB_URL=' .env.prod-db.local | cut -d= -f2- | tr -d "\r\"'")
  if [ -z "$PROD_DB_URL" ]; then
    echo "NO URL: nothing checked; with no URL the CLI would try a database on localhost"
  else
    npx supabase db dump --db-url "$PROD_DB_URL" --schema public -f prod-schema.sql
    npx supabase db dump --local --schema public -f local-schema.sql
    diff <(grep -v '^--' local-schema.sql | grep -v '^\s*$') <(grep -v '^--' prod-schema.sql | grep -v '^\s*$')
  fi
  unset PROD_DB_URL
  ```

  The dump holds every table's RLS setting, each policy with its condition, the grants
  (`PUBLIC`'s included), functions and their grants, triggers and default privileges. The
  preview's diffed this way showed 3 lines only, all on the local side: `ALTER DEFAULT
  PRIVILEGES … GRANT UPDATE ON SEQUENCES` to `anon`, `authenticated` and `service_role` (IS
  #457). Anything else is a change to explain. The control: a `SECURITY DEFINER` function
  that anon could run, a `GRANT SELECT … TO PUBLIC` and RLS turned off on `trucks`, planted
  on the local stack, each showed in the diff, and were removed after. Delete both files
  after.
- **What a `public` dump doesn't hold:** roles and triggers in other schemas, in the SQL
  editor, compared with the same queries on the preview (the hosted answers weren't read):

  ```sql
  select rolname, rolbypassrls from pg_roles where rolcanlogin or rolbypassrls order by 1;
  select n.nspname, c.relname, t.tgname from pg_trigger t
  join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname <> 'public' order by 1, 2, 3;
  ```

  Locally there is no trigger on any `auth` table. A role or trigger the preview doesn't
  have is suspect.
- **The Security Advisor** on production, with the CLI linked to it for the run, then back to
  the preview (if the CLI login was what leaked, `npx supabase login` with a new token first).
  Resume either project in its dashboard first if it is paused: a paused project "cannot
  process requests" (#448's 1c). From the repo root, since the check reads
  `supabase/.temp/project-ref` there:

  ```bash
  if npx supabase link --project-ref <production project ref> \
    && grep -qxF '<production project ref>' supabase/.temp/project-ref; then
    npx supabase db advisors --linked --type security --level info --fail-on error
    echo "advisor exit $?"
  else
    echo "NOT LINKED to production: nothing checked"
  fi
  if npx supabase link --project-ref <preview project ref> \
    && grep -qxF '<preview project ref>' supabase/.temp/project-ref; then
    echo "back on the preview"
  else
    echo "STILL NOT ON THE PREVIEW: link it before any db push"
  fi
  ```

  Each check needs both: `link` exiting 0 and `supabase/.temp/project-ref` holding the
  intended ref. A failed `link` exits 1 and leaves the CLI linked to whichever project it was
  linked to before, so an unguarded `--linked` run, or a later plain `db push`, would reach
  that one instead. Probed with a ref no project has, from the preview: `link` exited 1,
  `supabase/.temp/project-ref` kept the preview's ref, and both `grep -qx` and `grep -qxF`
  matched only the linked ref (IS #474). Other failures weren't tried.

  `--linked`, not `--db-url`: on the preview, with a scratch table with RLS off and an anon
  grant in `public`, `--linked` reported ERROR `rls_disabled_in_public` on it (and the Auth
  lint `auth_leaked_password_protection`, which the runs by URL didn't report), while a run by
  the session pooler's URL, with or without `options=-c pgrst.db_schemas=…` on it, missed it.
  With `--fail-on error`, `--linked` exited 1 with the table and 0 without (IS #474; the
  table was dropped after). Read the output too: without `--fail-on`, each run exited 0.

---

## A takedown request

A truck that asks to be removed is removed, company or sole trader (IS #373 (Phase 10)), as
soon as possible and within a month of the request, as `/integritet` promises (PR #476). An
objection to the processing is handled the same way, as the page says:

1. README, "Takedown", steps 1 to 4: find the truck, run `supabase/manual/takedown.sql`, read
   its row, and add the line to the takedown log.
2. Reply to the requester. The map drops the truck within about three minutes. The backups
   keep its rows until the latest of: about four weeks after the takedown, as the weekly
   dumps from before it age out (README, "Backups"); while an incident hold is open, the held
   dumps' deletion, with the evidence export's copy of `trucks` beside them, at most 8 weeks
   after the hold began ("The weekly routine", "Exporting evidence"); and after a
   restore, the old project's deletion, at most 8 weeks after the restore ("A restore", step
   6). Give the latest date that applies.
3. Keep the request mail and the reply until the date given has passed, as `/integritet` says. If
   an incident hold or a restore moves that date later before then, write to the requester with
   the new date. Then delete both, and delete them from Trash too. The takedown log keeps what a
   restore needs, the truck's id and the date (README, "Takedown", step 4), not who asked.

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
so it isn't fresh. **Skip the weekly dump until step 3's load is done**: from step 2 on, its
URL points at the new project, and a dump of it before the load would prune a good one.
Start the local stack first (`npx supabase start`): step 3's load runs through its
container. In this order, since the login has to reach the new project:

1. **The new project:** link the CLI to it first, since a push goes to whichever project the
   CLI is linked to (README, "Hosted preview database", links the preview), then push the
   migrations without `--include-seed`:

   ```bash
   if npx supabase link --project-ref <new project ref> \
     && grep -qxF '<new project ref>' supabase/.temp/project-ref; then
     npx supabase db push --dry-run   # lists the migrations, and no seed
   else
     echo "NOT LINKED to the new project: stop"
   fi
   ```

   Read the dry run, then, still linked to it, push:

   ```bash
   if grep -qxF '<new project ref>' supabase/.temp/project-ref; then
     if npx supabase db push; then echo "PUSH OK"
     else echo "PUSH FAILED (or declined at its prompt): nothing else until it succeeds"; fi
   else
     echo "NOT LINKED to the new project: nothing pushed"
   fi
   ```

   After `PUSH OK`: README's "Hosted settings checklist", every Supabase row, with
   production's Site URL and Redirect URLs (its `/auth/callback` only, no wildcard), and
   Phase 5 #19's hosted check, which the Phase 10 plan's step 13 runs on a new production
   project (the `sv-SE-x-icu` collation, both extensions in `extensions`, the Data API's Max
   rows at least `MAX_ROWS`). Then the Security Advisor on the project as set up, still linked
   to it. The block checks for itself that no migration is pending, since a table a failed push
   never created has no RLS setting for the advisor to flag:

   ```bash
   if grep -qxF '<new project ref>' supabase/.temp/project-ref \
     && npx supabase db push --dry-run 2>&1 | grep -qx 'Remote database is up to date.'; then
     npx supabase db advisors --linked --type security --level info --fail-on error
     echo "advisor exit $?"
   else
     echo "NOT LINKED, or migrations still pending: nothing checked"
   fi
   ```

   The dry run, probed against the preview (IS #474): up to date, it printed `Remote database
   is up to date.`; with a throwaway migration file present (removed after), it printed
   `Would push these migrations:` and the file, and not that line. It exited 0 both times, so
   the line, not the exit code, is the test. No ERROR, each WARN fixed or accepted; why
   `--linked`, not a URL, is "A leaked key"'s. Each block runs from the repo root, with the
   new project resumed if paused. A failed `link` leaves the CLI linked to whichever project
   it was before ("A leaked key", the advisor's checks), where a push or an advisor run would
   land instead.
2. **`.env.prod-db.local`:** the new project's session pooler URL, before the load, so
   nothing reaches the old project by mistake.
3. **The data:** README's "Restoring" against the new project: its check that `trucks` and
   `auth.users` both count 0, then its steps 1 to 4 (the admin by their old id, the load, the
   takedowns and `retention.sql`). README shows the load on the local stack; against the new
   project, the same `psql` through the local stack's container reads the URL instead (not
   tried):

   ```bash
   PROD_DB_URL=$(grep '^PROD_DB_URL=' .env.prod-db.local | cut -d= -f2- | tr -d "\r\"'")
   if [ -z "$PROD_DB_URL" ]; then echo "NO URL: nothing loaded"; else
     docker exec -i supabase_db_whereisfood psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -1 < <dump file>
   fi
   unset PROD_DB_URL
   ```

4. **Vercel's Production variables:** `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set to the new project's.
   Then redeploy Production.
5. **Log in and enroll TOTP at once** (README's "Restoring", step 5), now that the app points
   at the new project. Then look at `/map`.
6. **The old project:** pause it now that the new one works, which also frees its slot, and
   delete it when the restore is confirmed or 8 weeks after the restore, whichever comes
   first (the owner's call, IS #457). Until then it still holds every truck's history, a
   takedown or retention run since misses it (a paused project runs no SQL), and its keys
   still work: say so in a takedown's reply meanwhile, and write to each earlier requester whose
   date this moves ("A takedown request", steps 2 and 3).
7. **The CLI back to the preview:** resume the preview if you paused it for the slot (step
   6's pause has freed one), then, from the repo root:

   ```bash
   if npx supabase link --project-ref <preview project ref> \
     && grep -qxF '<preview project ref>' supabase/.temp/project-ref; then
     echo "back on the preview"
   else
     echo "STILL NOT ON THE PREVIEW: link it before any db push"
   fi
   ```

   Run this after a stop too (a failed push, a restore broken off), not only at the end.

   README's "Later migrations go up with plain `npx supabase db push`" assumes the preview;
   left linked to production, the next migration would skip it.

Not tried: neither the hosted restore nor this move has been run (README, "Restoring",
Limits).
