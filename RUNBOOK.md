# Runbook

What to open in an incident, the weekly routine (Phase 10 plan, steps 10 and 11, #8 and #13),
and a release (step 15b).
The repo is public, so nothing here is a secret. Each value a step needs lives where `CLAUDE.md`'s
"Where secrets live" says: production's Supabase keys in its dashboard (Project Settings → API Keys)
and in Vercel's environment variables, and its database URL in the gitignored `.env.prod-db.local`.
`<project URL>` and `<admin id>` stand for production's own; in "A restore", for the new project's.
A step that rests on a probe or a doc names it, with its issue.

- [The weekly routine](#the-weekly-routine)
- [Attack Mode](#attack-mode)
- [Exporting evidence](#exporting-evidence)
- [A takeover of the admin account](#a-takeover-of-the-admin-account)
- [A lost phone](#a-lost-phone)
- [A login link that doesn't come](#a-login-link-that-doesnt-come)
- [A leaked key](#a-leaked-key)
- [A takedown request](#a-takedown-request)
- [Other requests](#other-requests)
- [A private vulnerability](#a-private-vulnerability)
- [A paused project](#a-paused-project)
- [A restore](#a-restore)
- [A release](#a-release)

---

## The weekly routine

Once a week, in this order:

1. **The dump:** README, "Backups" → "The weekly dump". Step 2 runs only after `DUMP OK`; step 3
   runs whatever the dump answered. A week with no new good dump (`DUMP FAILED`, `NO URL`, or the
   routine skipped) or a prune left undone (`PRUNE FAILED` until the hand deletion) keeps an old
   dump longer: check "A takedown request", step 4, for a requester whose date it moves. **While an
   incident is being investigated** (a takeover, a leaked key), first move the dumps from before it
   into a `hold` folder inside the backups folder: the prune deletes only
   `whereisfood-YYYY-MM-DD.sql` files at the folder's top level, and these may be the only copy of
   rows an intruder deleted. **At most 8 weeks** (the owner's call, IS #457): delete the held dumps
   when the incident is closed, or 8 weeks after the hold began, whichever comes first. Held dumps
   keep the rows of any truck taken down before or during the hold until then, past README's "about
   four weeks": say so in a takedown's reply meanwhile, and write to each earlier requester whose
   date this moves ("A takedown request", steps 3 and 4).
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

Before anything an incident deletes (sessions, factors, and the MFA challenges and AMR claims their
deletion cascades to; the audit log `retention.sql` trims), save it to files, every row. Those four
by named columns, leaving out the credentials: a factor's `secret` (the TOTP seed),
`web_authn_credential` and `last_webauthn_challenge_data`, a challenge's `otp_code` and
`web_authn_session_data`, and a session's `refresh_token_hmac_key`, which `select *` wrote in plain
text (`information_schema.columns` on the local stack and the preview, PR #476). Not through the SQL
editor, whose results show at most 100 rows ("Limited to only 100 rows"). With the local stack
started, through its `psql`, from the repo in Git Bash:

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
    "sessions|select id, user_id, created_at, updated_at, factor_id, aal, not_after, refreshed_at, user_agent, ip, tag, oauth_client_id, scopes, refresh_token_counter from auth.sessions order by created_at" \
    "factors|select id, user_id, friendly_name, factor_type, status, created_at, updated_at, last_challenged_at, phone, web_authn_aaguid from auth.mfa_factors order by created_at" \
    "challenges|select id, factor_id, created_at, verified_at, ip_address from auth.mfa_challenges order by created_at" \
    "amr|select id, session_id, created_at, updated_at, authentication_method from auth.mfa_amr_claims order by created_at" \
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

Each file is written as `.part` and renamed only when `psql` succeeds, so a file with its own name
is a complete export. Probed on the local stack, by its own URL (IS #457; again with these named
columns, PR #476): each answered `EXPORT OK` with as many lines as its table had rows (PR #476's
run: audit 54, sessions 1, factors 1, challenges 1, amr 2, admins 1, trucks 23); with an unreachable
URL, each of IS #457's five answered `EXPORT FAILED` and left no file; with none, `NO URL`. The
named columns were read on the local stack and the preview, not on production, which has none yet:
if a table answers `EXPORT FAILED` with `column … does not exist`, take that column out of its query
and run the block again, never `select *`, which writes the credentials. A line count can exceed the
rows if a value holds a line break. Run it again later in an incident to export what has changed.
The files hold IP addresses and emails, and `trucks` holds every truck's row, so it keeps a truck
taken down after the export: keep them in `hold` with the held dumps, and delete them with those, at
most 8 weeks after the hold began ("The weekly routine").

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

## A login link that doesn't come

Production sends through Supabase's built-in email, which allows 2 emails an hour for the whole
project (README, "Hosted settings checklist", Rate Limits). Anyone who knows the admin's address
can ask for login links and spend them, so yours doesn't come. That is accepted until the Owners
phase's custom SMTP (the Phase 10 plan's open decision 6, IS #458). It grants no access: a session
you already hold keeps working until its 12-hour box (`CLAUDE.md`, "The session time-box").

Signs: **login-link emails you didn't ask for** in the admin's mailbox (Auth sends each link
someone asks for to your address, while the budget lasts), and the login form answering "För
många försök. Vänta en stund och skicka sedan en ny länk. …", which it shows when Auth refuses
the request with 429 (`src/lib/login.ts`). Your own requests spend the budget too, so that
answer after two of yours in an hour is no sign; nor is the TOTP step's "För många försök. Vänta
en stund och försök igen.", a limit on codes. That a spent hourly budget answers 429 wasn't
probed (locally the CLI sets the budget to 360 000, `GOTRUE_RATE_LIMIT_EMAIL_SENT`, IS #377). If
a factor-enrolled, factor-unenrolled or password-changed email you didn't cause came too
("MFA method added", "MFA method removed", "Password changed" in README's checklist), this is
"A takeover", not this section.

1. **Check the mail itself:** the spam folder, and the address typed on the login form. A link
   lives 15 minutes: production's "Email OTP expiration" is 900 s, which the dashboard says is
   the "Duration before an email OTP / link expires" (IS #458).
2. **Wait an hour, then ask once.** Each link Auth sends spends one of the two; a refused
   request sends none. Only the newest link sent can work: a later link sent to your address,
   whoever asked for it, voids the earlier one at Auth's `/verify` (`otp_expired`; local stack,
   IS #458: a link opened after a second send answered `otp_expired`). Whether a request the
   hourly budget refuses leaves it working is unknown: production refuses only that way (the
   per-user interval applies only with custom SMTP, README's Rate Limits row), and that refusal
   wasn't probed; locally, a link still made a session after another client's request was
   refused by the per-user interval (`max_frequency`). So don't count on an older link while
   someone is asking. And each request from your browser, refused or not, replaces its PKCE
   verifier, so only a link
   from your browser's newest request finishes there (`src/lib/login.ts`). So while someone
   keeps asking, even your fresh link can fail with "Inloggningslänken fungerade inte": go on to
   step 3, then step 4, rather than ask again.
3. **See who asks**, in production's SQL editor, and save the result (a copy or a screenshot,
   outside the repo): the weekly `retention.sql` deletes audit rows older than 30 days.
   `select created_at, payload->>'actor_username' as address, ip_address from
   auth.audit_log_entries where payload->>'action' = 'user_recovery_requested' order by
   created_at desc limit 50;`. A link the budget let through
   for an address with an account writes such a row, with the address as `payload`'s
   `actor_username`; a request for an address with no account writes none, and neither does a
   refused one: of three back-to-back requests for one address, the second and third answered
   `429` `over_email_send_rate_limit` (`max_frequency`) and only the first left a row (local
   stack, IS #458; a refusal by the hourly budget wasn't probed). So the rows count at most the
   links sent, about two an hour, however many were asked for: few rows doesn't mean few
   requests. Rows you didn't cause mean someone holds your address. On the local stack their
   `ip_address` was empty; a hosted project's weren't read.
4. **If it goes on, move the account to a new address** that no page shows and that can't be
   guessed from the old one or `/integritet`'s contact, a mailbox with two-factor from its
   creation (`CLAUDE.md`, "Secrets"). Auth sends a link only to an address that has an account
   (sign-ups are off), so the old address then spends nothing. In production's SQL editor, check
   that there is one admin and note its id ("A lost phone", step 2's query). Then, with the
   secret key read without echoing (`read -rs SECRET_KEY`), as "A takeover", step 2, does:

   ```bash
   curl -sS -w '\n%{http_code}\n' -X PUT "<project URL>/auth/v1/admin/users/<admin id>" \
     -H "apikey: $SECRET_KEY" -H "Content-Type: application/json" \
     -d '{"email":"<new address>","email_confirm":true}'
   unset SECRET_KEY
   ```

   `200` means done; a `4xx` or `000` reads as in "A takeover", step 2. Then log in with the new
   address once an hour has passed since the last link sent to anyone, yours included (step 3's
   newest `created_at`): the budget is the project's, not the address's, so the move stops the
   spending but leaves what was spent, and a "För många försök" before then doesn't mean the
   move failed. Probed on the local stack with a throwaway user that had a verified TOTP factor and
   an `aal2` session (IS #458): the `PUT` answered `200`; the new address held at once, with no
   change left pending, and the identity's email moved with it; no mail went to either address;
   the factor kept its id and stayed `verified`; the `aal2` session still answered `200` at
   `GET /auth/v1/user`. After it, a link asked for the old address answered `422`
   `otp_disabled` and sent nothing, one asked for the new address sent one, and a sign-in by the
   new address reached `aal2` with the same factor. Update the address in your password manager.

**Don't delete the admin and create a new one** to get a new address. `users.id` has no
`ON DELETE` action, so the `users` row would go first, and deleting the auth user clears
`created_by` on every location it entered (`on delete set null`) and deletes its factor, which
the `PUT` keeps (the foreign keys' delete rules in `pg_constraint` on the local stack: `users`
no action, `locations.created_by` set null, `auth.mfa_factors` cascade; IS #458).

---

## A leaked key

A secret that reaches a commit, an issue or a PR is rotated, not just deleted (`CLAUDE.md`,
"Secrets"). By key, from Supabase's docs as #448's 1b read them:

- **Production's secret key** (`sb_secret_…`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel):
  several can exist at once, so in Supabase's Project Settings → API Keys add a new secret
  key, named for its one consumer as `vercel_production` is (IS #460; the name takes lowercase
  letters, digits and underscores; whether two keys may share one wasn't tried, so if the old
  key's name is refused, add today's date, as `vercel_production_<yyyymmdd>`), put it in
  Vercel's Production variable, redeploy Production, check the admin screen works, then delete
  the old key there. This add-before-delete order wasn't tried: #460 deleted the unused old key
  first.
- **The publishable key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`): public by design, in every
  browser. How to revoke one wasn't stated on the pages read.
- **The database password** (in `.env.prod-db.local`): the dashboard's Connect dialog has
  **Reset database password** (seen on the preview's, IS #455; production's was reset on
  2026-11-22, IS #460, before anything used it, so how a reset affects anything else still
  wasn't seen). Then put the new one into `.env.prod-db.local`, and anywhere else that
  stored it (a CLI link made with it). The app doesn't use it.
- **The legacy API keys** (`anon` and `service_role` JWTs): disabled on production and the
  preview since 2026-11-22 (README's "Hosted settings checklist", IS #460). They "stay valid
  until you disable them in the Settings > API Keys section", even where the project uses the
  new `sb_` keys (#448's 1b), so check they still read disabled on each. This is read here,
  during an incident; the weekly routine doesn't read the API Keys page. Treat keys found on
  that you didn't turn on as a sign someone reached the Supabase dashboard (a new project, as
  a restore makes, has them on until its checklist step: production's did, IS #460). Then:
  1. Secure the Supabase account, from a device you trust: change its password, revoke every
     access token (avatar → Account preferences → Access Tokens) and log the CLI in again
     (`npx supabase login`), and check each organization's members and the account's
     two-factor. Whether a password change ends the account's other sessions wasn't read.
  2. Disable the legacy keys again as soon as this check passes, since `service_role`
     bypasses RLS: the `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in that
     project's Vercel variables (Production's, or Preview's, branch `dev`, for the preview),
     and for the preview `.env.preview.local`'s keys, start `sb_publishable_` and
     `sb_secret_`. If one in Vercel is a legacy JWT, the keys stay on until its replacement's
     redeploy finishes, or the app stops working; whether to disable them sooner and take the
     app down meanwhile is the owner's call at the time.
  3. Rotate what the dashboard shows or sets: the secret key and the database password by
     their bullets here, and the JWT keys by the next bullet's incident steps 2 and 3 (its
     step 1 is this list's step 1). The bullets name production's places; for the preview,
     the new secret key goes in its Preview variable (branch `dev`) and, as the owner's copy
     of the same key, `.env.preview.local`'s `PREVIEW_SECRET_KEY`; the new password goes in
     that file's two database URLs. Then the "After rotating" paragraph below: "A takeover",
     steps 2 to 4, then the checks for use and for what it left behind.
- **The JWT keys** (Project Settings → JWT Keys): production signs Auth's tokens with an ECC
  (P-256) key, whose private half the dashboard doesn't show, and its legacy JWT secret
  (HS256) was revoked on 2026-11-22 (IS #460). Its Legacy JWT Secret tab reads "Your project
  has revoked the legacy JWT secret", and `<project URL>/auth/v1/.well-known/jwks.json` lists
  only the ECC key's id.
  - **In an incident** (a key there you didn't make, a secret back in use, or any key that
    may have leaked): whoever holds it can sign tokens with any expiry, so don't wait for it
    to expire.
    1. Secure the Supabase account first, as the legacy API keys bullet's step 1 says, so the
       holder can't add another key while you rotate.
    2. Create a standby key and rotate it into use, then revoke every other key at once,
       accepting that every user is signed out.
    3. Check that the legacy API keys still read disabled, then rotate the secret key and the
       database password by their bullets, and run the "After rotating" paragraph below.
  - **A routine rotation:** Create Standby Key, then rotate it into use; "Non-expired access
    tokens will remain to be accepted, so no users will be forcefully signed out" (#448's 1b).
    Revoke the old key once its tokens have expired: an access token lives 3600 s (README's
    checklist).
  - Neither was tried here: #460 only revoked the HS256 secret, already a previous key, after
    the legacy API keys it signed were disabled, with no user ever signed in.
  - **The preview's JWT keys weren't read.** If a project's legacy JWT secret is still in use
    and it leaks: where its JWT Signing Keys tab shows a newer key as Current, revoke the
    secret, as #460 did. Where the secret is still the current key, follow the incident steps
    above, which move signing to a new key, and then revoke the secret. Supabase's own rotation
    of a legacy secret "needs both legacy keys rotated at once" (#448's 1b), and whether that
    turns disabled legacy API keys back on wasn't read, so don't use it.
- **Anything else** (a GitHub token, a CLI login, the Vercel bypass secret): revoke it where
  it was issued, and make a new one.

**After rotating the secret key, a legacy `service_role` key, a JWT signing key or secret, the
database password, or a Supabase or Vercel account's token or CLI login**, also
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
objection to the processing of a truck's data is handled the same way, as the page says; any
other request goes to "Other requests":

1. Confirm the requester as "Other requests" says, by a code through the truck's Instagram: a
   takedown deletes the truck's whole history, and every restore re-runs it (the owner's call, round
   5 on PR #476). With no channel to confirm through at all, remove anyway: an unlisted truck is the
   safe default.
2. README, "Takedown", steps 1 to 4: find the truck, run `supabase/manual/takedown.sql`, read
   its row, and add the line to the takedown log.
3. Reply to the requester. The map drops the truck within about three minutes. The backups
   keep its rows until the latest of: about four weeks after the takedown, as the weekly
   dumps from before it age out (README, "Backups"); while an incident hold is open, the held
   dumps' deletion, with the evidence export's copy of `trucks` beside them, at most 8 weeks
   after the hold began ("The weekly routine", "Exporting evidence"); and after a
   restore, the old project's deletion, at most 8 weeks after the restore ("A restore", step
   6). Give the latest date that applies.
4. Keep the request mail and the reply until no copy from before the takedown is left, as
   `/integritet` says: no dump dated on or before its date in the backups folder or in `hold` (a
   dump is named by its UTC date, so one from earlier that day holds the truck), no export dated on
   or before it in `hold`, and, after a restore, the old project deleted. If that comes later than
   the date given, for any reason (a week with no new good dump (`DUMP FAILED`, `NO URL`, or the
   routine skipped) or a prune left undone (`PRUNE FAILED` until the hand deletion); a hold; a
   restore), write to the requester with the new date. Then delete both, and delete them from Trash
   too. The takedown log keeps what a restore needs, the truck's id and the date (README,
   "Takedown", step 4), not who asked.

---

## Other requests

`/integritet` also offers access, correction and restriction by mail. Answer each as soon as
possible and within a month (GDPR art. 12(3)), then delete the request and the reply, from
Trash too, once the matter is closed: a restriction's mail stays until it is lifted.

Before sending a truck's data or changing it, confirm that the requesting address speaks for the
truck (GDPR art. 12(6) allows asking): send a code in a message to the Instagram account on the
truck's row, and ask for it to be mailed back from the requesting address. Send files only to that
address. With no handle on the row, or when the handle itself is what's disputed, do the same
through another channel the truck publishes itself (its website, or a contact in its own posts);
with none, answer that the request can't be verified, and what would let you verify it. A takedown
is confirmed the same way ("A takedown request").

- **Access:** the truck's rows as CSV files, through the local stack's `psql` as "Exporting
  evidence" does (the SQL editor shows at most 100 rows). From the repo in Git Bash, with the
  truck's id from README's "Takedown", step 1, and a folder outside the backups:

  ```bash
  OUT="<a folder outside the backups>"
  TRUCK="<the truck's id>"
  PROD_DB_URL=$(grep '^PROD_DB_URL=' .env.prod-db.local | cut -d= -f2- | tr -d "\r\"'")
  if [ -z "$PROD_DB_URL" ]; then
    echo "NO URL: nothing exported"
  elif ! [[ "$TRUCK" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    echo "NOT AN ID: nothing exported"
  else
    mkdir -p "$OUT"
    for item in \
      "trucks|select * from trucks where id = '$TRUCK'" \
      "locations|select id, truck_id, latitude, longitude, label, starts_at, ends_at, cancelled_at, source, created_at, updated_at from locations where truck_id = '$TRUCK' order by starts_at"; do
      table=${item%%|*}; query=${item#*|}
      if docker exec -i supabase_db_whereisfood psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -c \
        "\copy ($query) to stdout with csv header" > "$OUT/$table.csv.part"; then
        mv "$OUT/$table.csv.part" "$OUT/$table.csv"
        echo "EXPORT OK $table: $(($(wc -l < "$OUT/$table.csv") - 1)) lines after the header"
      else
        rm -f "$OUT/$table.csv.part"
        echo "EXPORT FAILED $table"
      fi
    done
  fi
  unset PROD_DB_URL
  ```

  `locations` leaves out `created_by`, the admin's user id. Probed on the local stack (PR #476): a
  truck with 31 places gave `EXPORT OK` with 1 and 31 lines; an id that isn't a UUID, `' or true or
  id::text = '` among them, gave `NOT AN ID` and wrote nothing. Send both files, say that the
  backups hold the same rows until they age out, and delete the folder once sent.
- **Correction:** the truck, or a place that hasn't ended, in the admin screen. A place that
  has ended can't be edited there (Phase 7 plan #33), so in production's SQL editor, for example
  `update locations set label = '<the right name>' where id = '<the place's id>' returning *;`
  (the `locations_updated_at` trigger sets `updated_at`). Say that the backups hold the old
  value until they age out.
- **Restriction**, while a correction or an objection is settled: enter no new places for the truck,
  and cancel its running and upcoming ones in the admin screen, until it is settled. A cancel can't
  be undone, so note each one cancelled and enter it again when the restriction is lifted.
- **An objection to anything but a truck's data**, such as a visitor's IP address in Vercel's
  logs: no takedown reaches it, and the service can't edit those logs; answer that each
  provider keeps them under its own terms, as the page says.

---

## A private vulnerability

A vulnerability reported privately (`SECURITY.md`), before production too, and once production
exists one found in-house, is fixed without a public issue or PR until it ships (`CLAUDE.md`,
"Doc changes", the exception; plan #13, IS #347):

1. **The advisory:** the report's draft advisory, or a new one for an in-house finding. Its
   description is public once it is published, so write it on purpose; keep working notes (what
   was found, each review round's record, each miss the process log will need) in a file
   outside the repo, like the backups, not in the advisory. Start its temporary private fork and
   clone it. In that clone, before the first commit: set `core.hooksPath` (README, "1.
   Install") and create `.env.local` (README, "3. Environment").
2. **The fix**, in the fork, with `ci.yml`'s gates run by hand, since CI can't reach the fork
   (GitHub's docs). First stop the main clone's local stack (`npx supabase stop` there) and run
   `npx supabase start` and `npx supabase db reset` from the fork's clone: both clones share
   `config.toml`'s `project_id`, so a running stack would be the main clone's, without the
   fix's migrations. Then: `npx next typegen`, then `npx tsc --noEmit`; `npm run lint`;
   `npm audit --omit=dev --audit-level=high` and `npm audit --audit-level=critical`;
   `npm run test:all`; Supabase's security advisor as the `integration` job runs it;
   `npm run build`, then `node scripts/smoke.mjs <Local: URL>` against `npm start`;
   `node scripts/controls.mjs` when the change touches a path a `TRIGGERS` entry in
   `scripts/controls-trigger.mjs` covers, or the fix goes into `main`; and
   `bash scripts/process-log.sh check` if the fix touches the log. The review rounds run on the
   fork's diff, their records in the notes; the sweep and the claims check take the notes'
   draft PR body as their file and no `--skip-issue`. Never press the advisory's "Merge pull
   request(s)": GitHub's docs say it doesn't enforce the branch's protection rules.
3. **Ship it.** From the push of the fix's branch the fix is public, until it is deployed: CI's
   run, and the full controls set on a PR into `main` or one touching a `TRIGGERS` path, about
   45 s a control. So push only when ready to ship.
   - Before production, always: a branch off `dev` and a PR into `dev`, whose preview deploys
     it, wherever else the code is, so plan #9's first merge into `main` keeps its order.
   - Once production exists, the vulnerable code deployed there: a branch off `main` and a PR
     into `main`, deployed, then `main` synced into `dev` by a PR ("A release", step 3's
     commands, on the branch `<the fix's branch>-sync-main`, with no issue until step 5's
     records); both rulesets refuse a direct push. Before step 4, check that `dev`'s copy is
     fixed too, the fix's test passing on `dev` after the sync: a sync can keep `dev`'s changed
     version of the code, and the next deploy from `dev` would bring the vulnerability back.
   - Once production exists, the vulnerable code only on `dev`: a branch off `dev` and a PR
     into `dev`.

   The PR's body says what the fix changes and points to the advisory: the one record public
   before the advisory.
4. **Publish the advisory** once the fix is live, or at the time agreed with the reporter if
   that is later.
5. **The public records**, then: an issue recording the fix, the PR body's round records, and the
   process-log rows, dated that day (`add` refuses a date earlier than the last row's), each
   with the day of its miss in its Miss. The final records check runs again on them. Delete the
   notes file.

---

## A paused project

Supabase pauses a Free project that "show[s] low activity over a 7-day period". It sends a
warning email "roughly one week before", and activity after it prevents the pause (#448's
1c, from Supabase's docs). Accepted (open decision 8, IS #457).

- **What it looks like:** Supabase answers `540 project paused` (#448's 1c), so every call the
  app makes to it fails: `/api/live` answers an error, and so do the admin screen and the
  login. A map tab already open keeps its last markers; a new load of `/karta` lands on
  `/om`, since the gate asks Auth first and sends any answer but `ok` there (`MapPage`'s
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
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` set to the new project's,
   the URL the project URL alone (README's "Production", "Variables"). Then redeploy
   Production.
5. **Log in and enroll TOTP at once** (README's "Restoring", step 5), now that the app points
   at the new project. Then look at `/karta`.
6. **The old project:** pause it now that the new one works, which also frees its slot, and
   delete it when the restore is confirmed or 8 weeks after the restore, whichever comes
   first (the owner's call, IS #457). Until then it still holds every truck's history, a
   takedown or retention run since misses it (a paused project runs no SQL), and its keys
   still work: say so in a takedown's reply meanwhile, and write to each earlier requester whose
   date this moves ("A takedown request", steps 3 and 4).
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

---

## A release

Production builds from `main`; work lands on `dev` (Phase 10 plan #9 and step 15b). A release
takes `dev` to `main` by a PR, then brings `main`'s merge commit back to `dev` by another, as
IS #461 (PR #488) and IS #462 (PR #490) did first. Each of the two has its own issue, opened
first.

**When** (the owner's call, 2026-11-23, IS #500): when production needs a change, not after
each issue. Each release is two PRs, and the one into `main` runs the full controls set (step
1's timing), while the docs are read from `dev`, the default branch, and production doesn't
read them. So release for code, a dependency or anything else the build reads, and for a new
build with nothing else changed, as #463's needed after a corrected `NEXT_PUBLIC_` variable,
which the build compiles in. A workflow that runs on pushes to `main` (`codeql.yml`) reaches
`main` only by a PR into it, so a change to one rides with the next release.

One other way to a new build is a Redeploy (README's Ignored Build Step row names a CLI deploy
too, not tried). Plan step 16 ruled it out for production's first deploys,
since its path through the Ignored Build Step hasn't been read, and step 2 below keeps that for
a failed release. "A leaked key" and "A restore" accept it in recovery, where a variable change
must take effect at once (it applies only to the next deployment, README, "Preview deploys").
Outside recovery, a changed Production variable goes out by a release.

A migration reaches production by a push, not a release (README, "Production", "Schema"), and a
release carries all of `dev`. So while `dev` holds code that needs a migration production
hasn't had, no release goes out before that push. A limit: the order of the push and the
release, a migration `main`'s code can't run against, and a release production needs while one
is waiting aren't settled here; none has gone to production since `0001_baseline.sql`.

A release at a phase's end, so `main` carries the reconciled docs, is optional. The longer
`main` trails `dev`, the more a fix shipped straight to `main` has to merge against in its sync
("A private vulnerability"; step 3: "A clean merge can still keep `dev`'s own version").

Post each PR's text through `scripts/post-body.mjs` (`CLAUDE.md`, "Doc changes"):
`--check <file>`, then `gh pr create` with `--body-file <file>`, then `node
scripts/post-body.mjs <n> <file>`. Keep each PR's title in a file too, and read it into a
variable, `TITLE="$(cat <title file>)"`. Bash doesn't expand a variable's value again, so
backticks, `$` and apostrophes in the title pass as written. Tried on IS #462 with
``Release `dev`'s work into `main` $HOME``: it reached the script byte for byte.

1. **The PR into `main`.** Before opening it, two checks:
   - **No file that overrides the Ignored Build Step** comes with it. A branch's `vercel.json`
     can (README, "A branch's `vercel.json`"), and plan step 16 requires none on `dev` or
     `main`. README's re-read uses this wide match, and on 2026-11-22 it printed only
     `public/vercel.svg`, an image (IS #459, and again for IS #462). Read anything else it
     prints. Run it again just before the merge, since `dev` can gain commits meanwhile:

     ```bash
     git fetch origin
     git ls-tree -r --name-only origin/dev | grep -iE '(^|/)(vercel|now)\.|(^|/)\.vercel/'
     ```

   - **`secret-scan`'s closing-keyword check** over every commit it will carry, as IS #461 did
     over 1093 before PR #488. It runs `dev`'s copy of the script, from a worktree, since the
     PR's CI runs that one and a local checkout's `EXEMPT` may differ:

     ```bash
     git fetch origin
     D="$(mktemp -d)"
     if git worktree add -q --detach "$D/dev" origin/dev; then
       git log -z --format='%H%n%B' origin/main..origin/dev \
         | PR_TITLE="$TITLE" PR_BRANCH=dev node "$D/dev/scripts/closing-keywords.mjs"
       echo "exit $?"
       git worktree remove "$D/dev"
     else
       echo "NO WORKTREE: nothing checked"
     fi
     rmdir "$D"
     ```

     The exit code is the script's, since it is the pipeline's last command: 0 clean, 1 a hit,
     2 input it couldn't read. Its output says which: a hit prints an `::error::` line for each
     closing reference, while a stack trace is a failure to run, not a hit. On a hit, ignore
     its advice to reword: that is for a PR's own branch, and `dev` refuses a force-push.
     - **A commit:** a PR into `dev` adds its full 40-character SHA to the script's `EXEMPT`,
       with the reason (the script's header). The error line prints only 7 characters; `git
       log --format=%H origin/main..origin/dev` gives the full one. That commit already closed
       its issue when it landed on `dev`, so reopen the issue if its work isn't done
       (process-log row 682, #348).
     - **The title:** choose another one.

     Then run it again, until it exits 0, since an `EXEMPT` PR adds commits of its own.

   Open the PR fresh from `dev`, never retargeted (`CLAUDE.md`, "Testing"), with the title the
   check read: `gh pr create --base main --head dev --title "$TITLE" --body-file <file>`.

   It needs every check `main`'s ruleset requires, CodeQL's three among them. `controls` runs
   the full set on a PR into `main` (27 minutes for 65 controls on PR #488's run). Settle each
   CodeQL finding before the merge. One the `CodeQL` check fails on must be fixed, or dismissed
   with a reason, for the check to pass; an issue alone settles only one it passes on. The
   repository's "Check runs failure threshold" sets which fail: Security alert severity level
   "High or higher", Standard alert severity level "Only errors" (read by the owner on
   2026-11-22 in Settings → Advanced Security → Code scanning → Protection rules,
   IS #491). PR #489's critical alert failed it.

   Merge with a merge commit, `gh pr merge <n> --merge`, without `--delete-branch`: the PR's
   branch is `dev`. A merge into `main` closes no issue by keyword, since only one into the
   default branch, `dev`, does: close the release's issue by hand.
2. **What the merge starts:** a Production build, which the Ignored Build Step lets through for
   `main` (README, "Preview deploys"), and CodeQL's analysis of `main`. Read the build's result
   before step 3's push, from every status on the merge commit, newest first, with its time and
   link. The combined `/status` shows only the latest per context, so it can show another
   branch's build of the same commit (README, "The Ignored Build Step's checks"). A status's
   description doesn't name the environment, so open its link to see which deployment it is:

   ```bash
   gh api --paginate "repos/{owner}/{repo}/commits/<merge commit>/statuses" \
     -q '.[] | "\(.created_at) \(.context): \(.state) - \(.description) \(.target_url)"'
   ```

   Wait while it reads `pending`. After a failure, read the production domain. After PR
   #488's failed build it still answered `404`, as before it, but that was with no production
   deployment yet. Whether a failed build leaves an earlier production deployment serving
   wasn't seen.
   - **Retry without a Redeploy or a promoted preview,** which plan step 16 rules out.
   - **A cause in the code:** a PR into `dev`, then a new release.
   - **Nothing to change** (an outage on Vercel's side): a new release carrying a one-line doc
     change through its own issue, as plan step 16 does when `dev` has nothing new.
   - **A fix shipped straight to `main`** ("A private vulnerability", step 3): a new PR into
     `main`.

   The sync in step 3 goes ahead either way.
3. **The sync back into `dev`.** `main` now holds a merge commit `dev` lacks. Both rulesets
   require a PR up to date with its base and refuse a direct push, so the next PR into `main`
   can't merge until `dev` holds it. A branch off `dev`, named with its own issue's number, as
   remote branches aren't deleted on merge, merges `origin/main` and goes into `dev` by a PR.
   First list what `main` holds that `dev` lacks, other than merges:

   ```bash
   git fetch origin
   git log --no-merges --oneline origin/dev..origin/main
   git checkout -b phase-<N>/sync-main-<issue> origin/dev
   git merge origin/main
   git push -u origin phase-<N>/sync-main-<issue>
   gh pr create --base dev --head phase-<N>/sync-main-<issue> \
     --title "$TITLE" --body-file <file>
   ```

   The title and branch name go through `secret-scan`'s closing-keyword check like any PR's.
   After a fix shipped straight to `main`, the sync has no issue until the advisory's records
   ("A private vulnerability", step 5), and its branch is `<the fix's branch>-sync-main` in
   place of `phase-<N>/sync-main-<issue>`. It must differ from the fix's own branch, which still
   exists: a push to that name would fast-forward it.

   The list is empty after a plain release: `main`'s only new commit is its merge commit. When
   `dev` has gained nothing since the release, the merge fast-forwards and makes no commit of
   its own, as IS #462's did: `main`'s merge commit had `dev`'s tip as its second parent, with
   the same tree. Otherwise it makes a merge commit.
   Then check, by its test on the sync branch, that `dev` keeps each listed change, such as a
   fix shipped straight to `main`. A clean merge can still keep `dev`'s own version of the
   code around it. Resolve a conflict so `dev` keeps that change.

   Merge the sync PR with a merge commit too, `gh pr merge <n> --merge`, **never a rebase**,
   though `dev`'s ruleset allows one. A rebase writes new commits, so `dev` would still lack
   `main`'s merge commit, and the next PR into `main` would stay out of date. After the merge,
   this prints `dev holds main`:

   ```bash
   git fetch origin
   git merge-base --is-ancestor origin/main origin/dev && echo "dev holds main"
   ```
