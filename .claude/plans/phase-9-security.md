# Phase 9 — Security

**Planned:** 2026-11-16 · **Status:** planned

**Source:** `project-context.md` Part 2 ("Phase map", "Admin and auth", "Pre-deploy
automation"), Part 3's "Decisions carried forward" (the two rows marked **between phases**
for Phase 9: IS #278 (Phase 9) and IS #373 (Phase 9), taken up by #1 and #2), the scope
draft `.claude/drafts/phases-8-10-scope.md` ("Phase 9 · Security", Appendices A–C, which
the IS #278 row points to), IS #373's body (the soft launch's threat model, which the IS #373
row points to), and the `/create-milestone` conversation of 2026-11-16. The IS #278 (Phase
10), IS #373 (Phase 10) and (Phase 11) rows are their own phases' plans' (`CLAUDE.md`,
"Process Log"). Where this plan and `project-context.md` disagree, **this plan wins** until
step 16 reconciles the context.

**Purpose of the phase:** Phase 10 puts real data in production, on Supabase's Free plan
until Phase 11 (the IS #373 rows). Before that, the running app and its accounts are
hardened: the admin login gets a second factor, sessions get a bound, every page gets
security headers, and the risks the soft launch's reviews found (a stolen session setting a
password, cancelling history, outliving logout) are closed or recorded.

---

## Goal

The running app and its accounts are hardened before production: the admin login requires
TOTP MFA (with #241's email code), sessions are bounded until Pro, every page sends security
headers (a strict CSP on `/admin`), the login-abuse and stolen-session risks are probed and
settled, alerts exist where the free plans allow, and every account and hosted setting is
checked against a written checklist.

---

## Prerequisites

- Node and npm in the ranges `package.json`'s `devEngines` admits (`CLAUDE.md`,
  "Dependencies"); Docker running, for local Supabase and the integration tests.
- An authenticator app on the owner's phone (any RFC 6238 app: Google Authenticator,
  Proton Authenticator, Aegis; D2), with its backups on (D3).
- Access to the preview project's Supabase dashboard and the Vercel project, for the hosted
  settings (read and set by the owner where the CLI token can't, recorded on the issue).
- **TOTP MFA is on Supabase's Free plan:** the pricing page lists "Basic Multi-Factor Auth"
  as "Included" on Free (read 2026-11-16, which settles Appendix B's "the live page not
  read"). Phone MFA is a paid add-on and excluded anyway (`CLAUDE.md`, "Secrets").

---

## Out of Scope

| Item | Where it goes |
|---|---|
| The production Supabase project and keys; applying the hosted-settings checklist to production; the 2FA re-check before the deploy | Phase 10 |
| The soft-launch gate, `/about`, the privacy note, the removal contact, the retention period, the takedown | Phase 10 (the IS #373 (Phase 10) row) |
| CodeQL on `main`; #347; #349 | Phase 10 |
| Supabase Pro and its session timeouts (this phase builds the cover until then, #4); the custom domain, its CSP entry and HSTS; Vercel Pro | Phase 11 (the IS #373 (Phase 11) row) |
| Passkey/WebAuthn MFA (experimental in Supabase, Appendix B); phone MFA (paid; `CLAUDE.md`'s 2FA rule excludes SMS) | not planned |
| A log drain; paid monitoring | not planned (Q14) |
| #248, #256, #264, #308, #310 | standalone, outside any phase |
| Truck-owner accounts and their threat model | Owners phase |

---

## Files

**The login rework (MFA and #241's email code):**
- `src/app/admin/login/page.tsx`, `src/components/Admin/LoginForm.tsx`, `src/hooks/useLogin.ts`,
  `src/lib/login.ts` (+ tests): the email step and #241's 6-digit code.
- New: the enroll and code steps (a page under `/admin/login` or `/admin/mfa`, open
  decision 5), their hook (`useMfa`) and components (`MfaEnroll`, `MfaCode`).
- `src/app/auth/callback/route.ts` (+ test): an `aal1` session goes to the MFA step.
- `src/app/auth/logout/route.ts` (+ test), `src/components/Admin/LogoutButton.tsx`: logout
  ends every session (#5).

**The check:**
- `src/lib/services/admin-auth.ts` (+ test): `aal2`, the enroll window, the time-box (#4).
- `src/proxy.ts` (+ test), `src/lib/http/admin.ts` (+ test), `src/lib/supabase-session.ts`.

**Headers:**
- `next.config.ts`: the static headers (Referrer-Policy, Permissions-Policy and the rest) on
  every page, `/admin` included, and the static CSP on every page but `/admin`, whose CSP is
  the proxy's.
- `src/proxy.ts`: the nonce CSP on every `/admin` answer that renders a page, `/admin/login`
  (returned early today) and the 503 `unavailablePage` included, on the request and the
  response.
- New: `src/lib/http/csp.ts` (+ test), the CSP builder and header list both use.
- `src/app/admin/**/page.tsx`: every `/admin` page rendered dynamically.
- `scripts/smoke.mjs` (+ test): header assertions on what it reaches without a session (a
  public page, `/admin/login`); the pages behind a session are read in the browser checks.

**Smaller items:**
- `src/lib/validators/truck.ts`, `src/lib/validators/location.ts` (+ tests): length limits.
- `src/lib/services/locations.ts`, `src/lib/db/locations.ts`, the cancel and confirm routes
  (`src/app/api/admin/locations/[id]/cancel` and `confirm`), `src/lib/http/entries.ts`,
  `src/components/Admin/TodayList.tsx`, `src/hooks/useAdminLocations.ts`'s comment on 404 (+
  tests): cancel and confirm refuse an ended entry (#8).
- `src/lib/http/origin.ts`: the `x-forwarded-host` probe's result in its comment.

**Config and tests:**
- `supabase/config.toml`: `[auth.mfa.totp]` enroll and verify on, `max_enrolled_factors = 1`
  (#13), `secure_password_change = true`, the password-changed notification, a
  factor-enrolled notification if Supabase offers one (#13), and whatever step 8 chooses
  (rate limits, CAPTCHA).
- New: a TOTP helper for the integration tests (#9), `tests/integration/helpers.ts` (the admin
  login reaches `aal2`), and new or extended integration tests (`admin-auth.test.ts`, MFA,
  logout, cancel and confirm).
- No migration: `users_select_own` stays as it is (#7).

**Docs:**
- `CLAUDE.md`: the rules this phase changes ("Admin routes" for `aal2`, the headers, logout,
  the time-box, the password setting); the bold plan line (step 0, then step 16).
- `README.md`: the admin user's enroll step in setup ("5. Create the admin user"), and the
  hosted-settings checklist (#10).
- `.claude/context/project-context.md` (step 16), `.claude/process-log.md`, this plan.

---

## Functions and components

| Name | Layer | What it does |
|---|---|---|
| `requireAdmin` | service (`admin-auth.ts`) | Also refuses a session below `aal2`, with the level read from a token Auth has verified, never a decoded cookie (open decision 11); a new refusal reason for "needs the second factor"; refuses a session whose `amr` holds `password` (#13); the time-box, signing the refused session out (#4) |
| `mfaStepAllowed` (working name) | service | An `aal1` session may enroll only while the user has no verified factor (the enroll window) |
| login steps (`login.ts`) | lib, pure | The steps (email, 6-digit code, TOTP enroll or code) and their Swedish texts |
| `buildAdminCsp(nonce)`, the static header list (`csp.ts`) | lib, pure | The two CSPs and the other headers, shared by `next.config.ts` and the proxy |
| length limits (`MAX_*`) | validators, pure | The bounds on free text, with Swedish messages |
| TOTP helper | tests only | An RFC 6238 code from a secret, so integration tests reach `aal2` (#9) |
| `useLogin`, `useMfa` | hooks (browser; Auth only, through `supabaseClient`) | #241's code step; enroll (QR) and verify |
| `LoginForm`, `MfaEnroll`, `MfaCode` | components (render only) | The email and code form; the QR image from a `data:` URL with the secret; the code input |
| `proxy` | proxy | `aal2` through `requireAdmin`; the nonce CSP on `/admin` |
| callback, logout | routes | An `aal1` session to the MFA step; logout with `scope: "global"` (#5) |
| `cancelEntry`, `confirmEntry` | service (`locations.ts`) | Refuse an ended entry, as `editEntry` does: `cancelLocation` and `confirmLocation` filter on `ends_at`, then a read tells "ended" from "missing or cancelled" (#8) |
| `entryOrNotFound` | http (`entries.ts`) | Maps "ended" to `editEntry`'s ended status, not 404 (#8) |

---

## Steps

Each step is one issue and one PR into `dev` (step 5 may split, with parts b and c in one
PR), except where a step is settings only, recorded on its issue. Every PR merges through
CI's required checks (`CLAUDE.md`, "Testing"). **Step 1 comes first; then steps 2–4 and 11
may run in any order**; step 5 comes before steps 6–9; step 8 before step 9; step 9 before
step 10; steps 8 and 11 before step 13; every settings change before step 12; step 14 last
before the closing steps (#12).

0. **This plan.** The plan file, and `CLAUDE.md`'s bold "Current phase plan" line naming
   it, where between phases it reads `none (the last one: .claude/plans/phase-8-ci-cd.md)`.
   Only that line of the header changes.
1. **Probes** (#3), the ones that need no setting changed. Each result is recorded on the
   step's issue, with its command, and the plan's affected decisions or open decisions
   updated through the step's PR. The probes that need TOTP switched on run in step 5a:
   - login abuse, locally (Q31): how fast `email_sent = 2` an hour is spent; the email
     code's guessing limit (`token_verifications`); then the preview's hosted
     limits, read. What the form answers for an unknown address is already recorded
     (`src/lib/login.ts`: the same "sent" text, though Auth's own answers in the browser
     still tell them apart);
   - the forged-cookie refresh flood (IS #373): a cookie with a past `expires_at` makes the
     server call Auth's token refresh, rate-limited per IP, and the calls come from the
     server's IP, so a flood spends the admin's own refresh budget, and a 429 there ends
     the admin's session (`src/proxy.ts`'s comment on `_callRefreshToken`);
   - the lost-phone routes (D3): where an `auth.admin.mfa.deleteFactor` call may run, since
     it needs the service-role key (`CLAUDE.md`, "Where secrets live", lists no production
     key on a developer's machine);
   - the `amr` claim: does a verified token carry the first factor's sign-in time (#4)?;
   - the preview project's JWT signing keys (symmetric or asymmetric) and what that means
     for reading `aal` (open decision 11);
   - the preview's "Write audit logs to the database" setting, and whether Supabase offers
     factor-enrolled and factor-unenrolled notification emails (#13);
   - whether Vercel replaces a client's `x-forwarded-host` (Q20).
2. **Secure password change.** `secure_password_change = true` and the password-changed
   notification in `config.toml`; the same in the preview's hosted settings. A probe, not a
   test: Auth asks for re-authentication only when the session is over 24 hours old
   (Supabase's password docs: "a session created within the last 24 hours" counts as
   recent), which a test can't make, so the probe ages a session by SQL on the local stack
   and records the refusal. The limit is stated: a stolen session under 24 hours old can
   still set a password, which #13's `password` refusal makes useless in the app. Then, with
   the notification on, whether Auth's notification emails count toward `email_sent` (step 8
   reads it), and whether Supabase's "require current password" option (`current_password`
   on `updateUser`) is on Free and stops a first password being set. `CLAUDE.md` records the
   rule.
3. **Length limits** on truck name, description, cuisine type and location label, with
   Swedish messages (Q22); no migration.
4. **Cancel and confirm refuse an ended entry** (#8): `cancelLocation` and `confirmLocation`
   filter on the timestamp they already take; when nothing is written, the service reads the
   entry to tell "ended" from "missing or cancelled"; `entryOrNotFound` and the routes
   answer "ended" with a Swedish message and the status `editEntry`'s ended refusal uses
   (not 404); `TodayList` hides both buttons on an ended row; integration
   tests.
5. **The login rework** (D2, D3, Q23):
   - a. `[auth.mfa.totp]` enroll and verify on and `max_enrolled_factors = 1` (#13),
     locally and on the preview; the TOTP test helper (#9); `helpers.ts`'s admin login
     reaches `aal2`. Then the probes that need TOTP: what the app's `unenroll` and a
     login's verify do to another device's `aal1` and `aal2` sessions; the swap #13 records,
     from a second `aal2` session (unenroll the factor, enroll another); deleting a factor in
     the SQL editor, locally and on the preview, and the dashboard's user page; whether a
     later verify changes the `amr` claim's first-factor entry (#4); whether an abandoned,
     unverified factor fills the one slot; whether a login's verify ends the user's `aal1`
     sessions (#9); whether Auth itself refuses an `aal1` enroll once a verified factor
     exists (auth-js has a `mfa_verified_factor_exists` code); each recovery route #13 names
     (ending every session and replacing the password with the service role, deleting a
     factor); MFA verify's guessing limit; TOTP's digits and period;
   - b. `requireAdmin` refuses below `aal2`, and any session whose `amr` holds `password`
     (#13); the enroll window; which paths an `aal1`
     session reaches and what an admin route answers it (open decisions 5, 6, 11); the
     admin-auth test's on-disk route list gains the `aal1` case; `CLAUDE.md`'s "Admin
     routes" updated;
   - c. the enroll and code screens (the QR from a `data:` URL), phone-first and Swedish; if
     5a shows an unverified factor fills the one slot, the enroll step first removes one an
     abandoned enroll left. **b and c ship in one PR**, so `dev` never has a login that
     can't reach `aal2`;
   - d. #241's 6-digit email code, and whether the magic link stays (open decision 3).
6. **The session time-box** (#4): `requireAdmin` refuses a session whose sign-in is older
   than the set age (open decision 2), and the refusal signs that session out at Auth, so
   its refresh token can't go on calling Auth; unit and integration tests; `CLAUDE.md` and
   "Admin and auth" say so until Pro's timeouts replace it in Phase 11.
7. **Logout ends every session** (#5): `signOut({ scope: "global" })`; an integration test
   that another session's next request is refused.
8. **The login-abuse fix** chosen from the probes of steps 1, 2 and 5a (open decision 1),
   built and tested, or accepted with a reason; the rate limits it sets, locally and on the
   preview (open decision 8).
9. **Security headers** (Q11): the static headers on every page, `/admin` included, and the
   static CSP on every page but `/admin`, in `next.config.ts`; the nonce CSP from the proxy
   on every `/admin` answer that renders a page (`/admin/login` and the 503 page included),
   each with exactly one CSP, every `/admin` page rendered dynamically; the assertions in
   `smoke.mjs` for what it reaches without a session; browser checks of `/map`, the login,
   `/admin` with a session, `/admin/trucks` and the place picker, reading the response
   headers; `/api/live` re-checked MISS → HIT → STALE on the preview. The public pages'
   cookie limit is recorded as accepted (#6).
10. **One ZAP baseline scan** by hand, locally against `next start` or on the preview
    (Q33); each finding settled.
11. **Monitoring** (Q14): usage, spend and 5xx alerts on Vercel and Supabase where the free
    plans allow (open decision 7), and the log retentions read and recorded.
12. **The hosted-settings checklist** (Q21) in `README.md` (#10), each item checked on the
    preview: sign-ups off, redirect URLs, rate limits, MFA, the password setting, the audit
    log setting, Deployment Protection, Git Fork Protection, "Enforce SSL", unused services,
    network restrictions, and the hosted Security Advisor (`db advisors --linked`).
13. **The 2FA audit** (Q12): every account that exists then and each one's recovery email,
    the admin's login mailbox named, recovery codes offline. No secret is recorded.
14. **The phone checkpoint** on `dev`'s preview: the email code, the TOTP enroll and code,
    `/admin`, an entry reaching `/map`, logout ending the other device's session, and no
    CSP block in the browser's console.
15. **The Phase 9 retrospective** (`.claude/process-log.md`, "How to use it"): its range
    starts at the row after the Phase 8 retrospective's range. Blocked by every other
    planned issue; its follow-ups block step 16.
16. **The reconciliation of `project-context.md`**, blocked by step 15 and its follow-ups.
    It replaces the IS #278 (Phase 9) and IS #373 (Phase 9) markers with #1 and #2, and
    rewrites the "Phase 7 open decisions 1–5" row those rows amend (the login is the email
    code and TOTP; a session ends at the time-box or a logout of any device) and the Phase 7
    row for #17, #18, #19, #20 and #33, which #8 extends to cancel and confirm, with the
    other places that state today's rule (Part 2's Product model item 3, "Status codes",
    and Part 1's "Ändra" until it ends). It rewrites Part 2's "Admin and auth" (MFA, the
    code, the time-box, logout), "Pre-deploy automation" (the 2FA audit's result, which the
    IS #278 (Phase 9) row names and `CLAUDE.md`'s "Secrets" points to), the Phase map's
    Phase 9 row, Part 1 where it describes the login, and the README's status parts. It
    carries forward the decisions that outlive the phase (#4–#11 and #13 at least), leaves
    the IS #278 (Phase 10) and IS #373 (Phase 10) and (Phase 11) markers as they are, and
    sets `CLAUDE.md`'s bold line to none, naming this plan as the last one.

---

## Rationale

### #1 — Phase 9's scope as the scope draft settles it (IS #278 (Phase 9))

Takes up the IS #278 (Phase 9) **between phases** row: TOTP MFA for the admin login with
#241's emailed code (amending Phase 7 open decision 1), its enroll-window constraints and
the lost-phone routes to probe; session timeouts (amending open decision 2); the login-abuse
and code-guessing probes; the split CSP and the cookie's-reach decision; monitoring; the
smaller probes and limits (`x-forwarded-host`, length limits); the 2FA audit and the
hosted-settings checklist. The detail is the scope draft's "Phase 9 · Security". The owner's
calls (the draft's D2, D3, Q11–Q14, Q19–Q23, Q31, Q33).

### #2 — The soft launch's inputs (IS #373 (Phase 9))

Takes up the IS #373 (Phase 9) **between phases** row. Session timeouts are Pro-only and Pro
comes in Phase 11, so this phase builds the cover (#4). A stolen session can set a password
silently, which outlasts logout and every timeout: step 2 turns the setting and its email
on. A password alone reaches only `aal1`, which `requireAdmin` refuses, but a stolen `aal2`
session can also swap the admin's factor for its own, which Supabase's Free plan can't
block: #13 records what holds instead. It can cancel or confirm an ended entry: #8. Reading
`aal` through `getClaims()` with asymmetric keys would let a logged-out token pass until it
expires: open decision 11. The gate needs the session cookie to reach `/map`, outside
`/admin`'s strict CSP: #6. The recovery steps (end every session; check for a password, a
factor or an email change; the audit log) feed Phase 10's runbook.

### #3 — Probes first

The draft leaves several designs to probes: the login-abuse fix, the lost-phone route, the
time-box's source, how `aal` is read. Building before probing is how a design gets reworked
in review; step 1 changes nothing and settles what it can first. The probes that need TOTP
switched on wait for step 5a, which switches it on (round 1 on PR #376).

### #4 — Until Pro, an app-level time-box plus logging out

Supabase's session timeouts are Pro-only (the IS #373 (Phase 9) row), and Pro comes in Phase
11. Options: (a) logging out after each use; (b) `requireAdmin` refusing a session whose
sign-in is older than a set age; (c) Pro from the deploy (about $25 a month, reopening the
soft launch's Free). **Chosen: (b) with (a)** (the owner, 2026-11-16): free, a little code,
and it holds when a logout is forgotten. It is measured from the **first factor's** sign-in
(the email login), never the newest `amr` entry: a later TOTP verify adds a fresh entry, and
a session's holder must not be able to reset the bound by verifying again (round 1 on PR
#376; step 5a probes it). The source is the `amr` claim if step 1 shows it carries that time
(open decision 2). A refusal alone would leave the Supabase session alive, its refresh token
still good for direct Auth calls, so the refusal also signs that session out at Auth (round
3 on PR #376, the owner's approval). Phase 11's Pro timeouts replace it.

### #5 — Logout ends every session

The app's logout is `scope: "local"`, so it ends only its own session; a session an attacker
made separately survives it, and the app had no "log out everywhere". With one admin, the
normal logout uses `scope: "global"` (the owner, 2026-11-16): logging out on the laptop also
logs out the phone, a small cost for a stolen session dying with any logout.

### #6 — The public pages' cookie limit is accepted

The session cookie is readable by page scripts (`@supabase/ssr`'s default) with `path: "/"`, so
it reaches `/map`, which the admin uses during the soft launch, outside `/admin`'s strict CSP.
Options: httpOnly cookies (MFA and the code steps move to server routes), a strict nonce CSP
on every page (the proxy on `/map`, reopening Phase 7 #10, #28), Next's experimental SRI hash
CSP, or accepting it. **Accepted** (the owner, 2026-11-16): no public page puts user input
into HTML (React escapes the trucks' text; Appendix C), so an injection there is unlikely.
Recorded as a limit; the Owners phase, which adds user-written content, reopens it.

### #7 — `users_select_own` under `aal1` is accepted

`authenticated` may read its own `users` row through the Data API (`0001_baseline.sql`), so an
`aal1` token reads it too. It is only the admin's own row (`is_admin`, `truck_id`); no other
data is readable at `aal1`. **Accepted** (the owner, 2026-11-16): no migration, recorded as a
limit. The alternative, an `aal2` condition in the policy, needs a migration and controls.

### #8 — Cancel and confirm refuse an ended entry

`editEntry` refuses an ended entry, but `cancelEntry` and `confirmEntry` make no `hasEnded`
check (`src/lib/services/locations.ts`), so a stolen session could cancel past history,
which the app can't undo. **Both refuse it** (the owner, 2026-11-16). `cancelLocation` and
`confirmLocation` already take the instant (`cancelledAt`, `confirmedAt`) from the service,
as `CLAUDE.md`'s "db layer" requires, and filter on `ends_at` after it, so the check and the
write are one statement. Only those two: not the shared `updateLiveRow`, which edits use
too. A filtered update that writes nothing can't say why, so the service then reads the
entry, as `editEntry` does, to tell "ended" from "missing or cancelled"; the routes answer
"ended" with a Swedish message, not 404, and `TodayList` hides both buttons on an ended row
(rounds 1 and 2 on PR #376, the owner's approval). Confirming an ended entry has no use.

### #9 — A TOTP helper of our own for the tests

The integration tests must reach `aal2`, which needs a code from the factor's secret. A
~20-line RFC 6238 function on Node's `crypto`, tested against the RFC's vectors, instead of a
library (the owner, 2026-11-16): no new dependency to audit or update. Each fixture admin
(`helpers.ts` makes one per `sessionUser` call, and `resetTables()` removes it) enrolls its
one factor when it is created, before any second session of it exists, and keeps the secret
with the fixture; later logins of that user only challenge and verify. Verifying a newly
enrolled factor logs out the user's other sessions (auth-js `types.d.ts:1018`), so an
enroll after a second session exists would make multi-session tests pass or fail for the
wrong reason (round 2 on PR #376). If step 5a shows a login's verify also ends the user's
`aal1` sessions, a test that needs sessions at two levels uses two fixture users, and an
`aal1` refusal must be told apart from "no session" (open decision 6).

### #10 — The hosted-settings checklist lives in the README

Next to "Hosted preview database", where the setup steps already are, so whoever sets up
production in Phase 10 reads it in one place (the owner, 2026-11-16).

### #11 — `aal` comes from a token Auth has verified

Never a decoded cookie: auth-js says a session read from cookies "must not be trusted", and
`getAuthenticatorAssuranceLevel()` with no argument decodes the stored token unchecked (the
scope draft's login rework). Never "the user has a verified factor" either, which an `aal1`
session of an enrolled user also passes. Which verified route (open decision 11) keeps a
logged-out session refused, as `getUser()` does today.

### #12 — Which steps may move

Steps 2–4 and 11 depend on nothing in this phase and may run in any order. Step 5 changes
the login, which steps 6–9 build on, and its parts b and c ship together, so `dev` always
has a login that reaches `aal2`. Step 8 comes before step 9, since a CAPTCHA would need
sources in the login's CSP; step 9's CSP must fit the new login screens; step 10 scans the
headers; step 13 follows steps 8 and 11, which may create accounts (a CAPTCHA provider, an
alerting service) that the audit must cover; step 12 checks every setting the earlier steps
changed; step 14 checks the whole on a phone (round 1 on PR #376, the owner's approval).

### #13 — One factor per user; a stolen `aal2` session is a takeover, detected and recovered

A stolen `aal2` session can call Supabase Auth directly, so the app's enroll-window check
doesn't bind it. **`max_enrolled_factors = 1`**, locally and on the preview (later
production; `config.toml` has 10 today): the admin's one factor fills it, so a thief can't
add a second factor beside it (round 1 on PR #376, the owner's approval; IS #373 listed
"enrolling an MFA factor" among a stolen session's direct Auth calls).

**What it doesn't stop on its own** (round 2 on PR #376, the owner's approval): at `aal2`
the thief can unenroll the admin's factor, enroll their own and set a password (inside the
recent-login window `secure_password_change` allows), then sign in again later, outliving
the time-box and every logout. Supabase's Free plan has no server-side block for that: its
hooks there are the access-token and email hooks only, as on Pro (the pricing page's "Auth
Hooks" row: "All" from Team), so Phase 11's Pro doesn't add one either.

**`requireAdmin` refuses a password login** (round 3 on PR #376, the owner's approval): the
admin never signs in by password, so a session whose `amr` holds `password` is refused. A
password the thief sets then gets them nothing in the app: getting back in needs the email
code, so the mailbox too. The swap stays possible as sabotage (locking the admin out), not as
a way in; recorded as a limit. What else holds:
- **preventing the theft:** the CSP (#6 states its limit), the time-box (#4), logout ending
  every session (#5);
- **detecting it:** the password-changed email (step 2), and factor-enrolled and
  factor-unenrolled emails if Supabase offers them (step 1 reads);
- **recovering, in this order** (D3's routes, open decision 4), since with one factor
  allowed, deleting it leaves a gap a password-holder could enroll into: secure the mailbox;
  end every session; replace the password with the service role's `updateUserById` (or SQL),
  since Auth may refuse a password change from `aal1` once MFA is on (auth-js has an
  `insufficient_aal` code); delete the factor; re-enroll at once. Step 5a probes each route.

Step 5a probes the swap from a second `aal2` session.

---

## Acceptance Criteria

- [ ] The probes of steps 1 and 5a are recorded, each with its command and result, and the
  decisions they settle are updated.
- [ ] `config.toml` has `secure_password_change = true` and the password-changed
  notification on, and so does the preview; step 2's probe shows a password change from a
  session over 24 hours old refused.
- [ ] Each length-limited field over its maximum answers 400 with a Swedish message, and at
  its maximum is accepted (unit tests).
- [ ] Cancel and confirm refuse an ended entry with a Swedish message, not 404 (integration
  tests); `TodayList` shows neither button on an ended row; edit is unchanged.
- [ ] The TOTP helper passes RFC 6238's test vectors.
- [ ] TOTP enroll and verify are on, and `max_enrolled_factors = 1`, locally and on the
  preview; enrolling a second factor is refused, and an abandoned unverified factor doesn't
  block the next enroll (tests).
- [ ] An `aal1` session is refused on every admin route and page (the admin-auth test finds
  the routes on disk); an `aal2` admin passes; `aal` is read from a verified token (a test
  with a forged `aal2` claim fails).
- [ ] An `aal1` session may enroll only while the user has no verified factor (test).
- [ ] The login runs email → 6-digit code → TOTP (enroll the first time) → `/admin`.
- [ ] A session whose `amr` holds `password` is refused (test).
- [ ] A session past the time-box is refused and signed out at Auth (test).
- [ ] Logout ends every session: another session's next request is refused (test).
- [ ] The login-abuse fix is built and tested, or accepted with a reason.
- [ ] Every page carries the static headers, `/admin` included; each `/admin` answer that
  renders a page (`/admin/login` and the 503 page included) carries exactly one nonce CSP
  with `frame-ancestors 'none'`; `smoke.mjs` asserts them on what it reaches without a
  session, and the browser checks read them on `/admin` with a session and `/admin/trucks`;
  a proxy test shows the 503 page's one CSP; the `/map`, login and picker browser checks
  pass; `/api/live` still goes MISS → HIT → STALE on the preview.
- [ ] The ZAP scan's result is recorded, each finding settled.
- [ ] Alerts are set, or the free plans' limits recorded; the log retentions are read.
- [ ] The `x-forwarded-host` result is in `origin.ts`'s comment.
- [ ] The hosted-settings checklist is in `README.md`, each item checked on the preview.
- [ ] The 2FA audit is done, with no secret recorded.
- [ ] `CLAUDE.md`'s rules are updated: `aal2` for admin routes, the headers, logout, the
  time-box, the password setting, the `password` refusal.
- [ ] The phone checkpoint passed on `dev`'s preview.
- [ ] Every PR merged through CI's required checks.
- [ ] The closing steps of the milestone-retrospective procedure are done.

---

## Open Decisions

1. **The login-abuse fix (step 8)**, after the probes of steps 1 and 5a: a CAPTCHA
   (`config.toml`'s `[auth.captcha]`: hCaptcha or Turnstile), a shorter code life, a
   lockout, or accepting it. The form already shows one message for every address
   (`src/lib/login.ts`), and that doesn't hide which addresses have accounts, since the
   browser sees Auth's own answers.
2. **The time-box's length and source (step 6).** Leaning 12 hours. The `amr` claim if step
   1 shows it carries the sign-in time; otherwise a fallback named then.
3. **The magic link (step 5d):** kept beside the 6-digit code, or the code only.
4. **The lost-phone route (D3)**, where a `deleteFactor` call may run, and whether the login
   rework needs an unenroll screen, from the probes in steps 1 and 5a. The recovery order is
   #13's.
5. **Which paths an `aal1` session reaches** for the enroll and code steps, and the proxy's
   exemption for them (step 5b). Today `/auth/callback` sends every login to `/admin`, and
   the proxy exempts only `/admin/login`.
6. **What an admin route answers an `aal1` session (step 5b):** 401 or 403, and its Swedish
   text (`CLAUDE.md`'s "Admin routes": 401 for no valid session, 403 for a non-admin). It is
   told apart from "no session" in the answer, so a test can't pass for the wrong reason
   (#9).
7. **What Vercel Hobby and Supabase Free can alert on (step 11).**
8. **The rate limits' values (step 8)**, which step 12 then checks.
9. **The CSP's exact sources (step 9)**, found by the browser checks: MapLibre's worker, the
   tiles' range requests, the basemap's glyphs and sprite, `blob:`/`data:` images, the
   Supabase URL the login calls, and the CAPTCHA's script and frame if step 8 chooses one.
10. **TOTP's digits and period (step 5a)**, confirmed by a local enroll.
11. **How `requireAdmin` reads `aal` (step 5b).** `getClaims()` verifies an asymmetric token
    locally, so a logged-out token would pass until it expires; `getUser()` asks Auth, which
    refuses it, but returns no `aal`. Leaning: `getUser()`, then the `aal` claim of the token
    Auth just accepted, which keeps logout effective. Step 1 reads the preview's key type.
