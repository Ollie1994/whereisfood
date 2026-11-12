# Phases 8–10 scope: CI/CD, Security, Launch

**Status: input for the Phase 8, 9 and 10 plans, not a rule.** Its decisions take effect
when the reconciliation issue that follows IS #278 writes them into `project-context.md`
(as `**between phases**` rows, `CLAUDE.md`'s "Between phases" procedure); until then
`project-context.md` is current. Written 2026-11-12 between phases, reviewed in #278's PR.

Every question (Q1–Q36) was put to the owner on 2026-11-12 and decided then, except Q34
(left open for Phase 10). Where Claude recommended an option, the owner chose it, except Q24,
where the owner's own proposal replaced it. Q13 (MFA) was the owner's own call; Q16, Q18,
Q30 and Q34 had no recommendation. Every
phase also carries its retrospective and its reconciliation of `project-context.md`, not
repeated below.

## Decisions

| # | Decision |
|---|---|
| D1 | The work after Phase 7 is three phases: **8 · CI/CD → 9 · Security → 10 · Launch** (the first production deploy). CI/CD first, so the security PRs, MFA the largest, run through the gates, SAST and the secret scan, and #264 unblocks sooner. Amends IS #265's split (8 CI/CD and security, 9 Launch); Phase 6 #1 (CI/CD before the production deploy) still holds. Cost accepted: a third plan, retrospective and reconciliation |
| D2 | **TOTP MFA for the admin login** (Q13), with any standard authenticator app (Google Authenticator, Proton Authenticator, Aegis). On Supabase's Free plan, by the pricing page as a web search quoted it (Appendix B; the live page not read). Phase 9 |
| D3 | **A lost phone** is covered by the owner's authenticator backups, made by hand after each new login is added. The last resort is deleting the factor from the Supabase dashboard, or through the service-role admin API (`auth.admin.mfa.deleteFactor`), not from the app: a user can unenroll a verified factor only from an `aal2` session, which needs the lost phone (Appendix B) |

**The line between the phases:** 8 touches the **pipeline** (does it check code before it
merges?); 9 the **running app and its accounts** (does it change how the live app or an
account behaves?); 10 **production** (does it only make sense with a production project or
domain?). So the secret scan, SAST and Dependabot are 8 (pipeline by mechanism); the 2FA
audit is 9, its re-check before the deploy 10; the hosted-settings checklist is written in 9
and applied in 10; the CSP is 9, its production domain and HSTS 10.

---

## Phase 8 · CI/CD

From `project-context.md`, "Pre-deploy automation (planned)" → "To build", with the
review's additions.

**Workflows** (GitHub Actions for checks, Vercel keeps deploying, Q27):
- Grouped by trigger and permissions (Q28), since branch protection requires checks by
  **job** name: `ci.yml` with jobs `typecheck-lint`, `unit`, `integration`, `build`,
  `secret-scan`, `audit`, on a read-only token; `codeql.yml` apart (needs
  `security-events: write`); `sonarqube.yml` apart (needs its token).
- One set for PRs into both `dev` and `main` (`on: pull_request: branches: [dev, main]`),
  not two copies that drift (Q29). `codeql.yml` and `sonarqube.yml` also run on push to
  `dev`, the default branch: both compare a PR against an analysis of its base branch, and
  without one CodeQL can't tell a PR's new alerts from old ones and SonarQube Cloud's
  new-code comparison has nothing to compare with (round 1 on PR #280, the owner's call).
  `ci.yml` stays PR-only.
- `main` runs the same checks plus the full schema controls (through
  `if: github.base_ref == 'main'`) (Q30).
- The gates: `tsc`, lint, `test:all` (a local Supabase in the job, a Node `devEngines`
  admits), build. `npm run build` needs env values: `src/lib/supabase.ts:15-16` throws at
  import without `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`, and
  `src/lib/supabase-browser.ts:20-21` without the URL or `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
  so the job sets `.env.example`'s variables, the Supabase ones from the local stack, which
  aren't secrets. Which of them a build reads isn't probed: the plan runs the build without
  each to find out.
- **Hardening, all of it** (Q5): actions pinned by commit SHA; minimal `permissions:`, with
  the repository's default token set to read-only; no `pull_request_target` with a
  checkout of the PR's code; approval before first-time contributors' runs; a job holding a
  token (SonarQube's) installs nothing it doesn't need, or with `--ignore-scripts`, since
  `npm ci` runs dependencies' install scripts (the lockfile marks `fsevents` and
  `unrs-resolver` with `hasInstallScript`, besides the project's own `postinstall`).

**Checks:**
- **Secret scan: Gitleaks** (Q4), as a pre-commit hook from a tracked folder through
  `core.hooksPath` and in CI, because `--no-verify` or a clone without the hook skips it.
  It must run in the owner's Git Bash on Windows; its first run scans the whole history
  (GitHub's scan found nothing on 2026-10-24, another tool's rules differ). Flags probed in
  the plan.
- **SAST: SonarQube Cloud and CodeQL** (Q3). SonarQube's token isn't given to Dependabot or
  fork runs, so its job needs an `if:` that skips it there; without one it runs with no
  token, fails, and blocks those PRs (`project-context.md`, "Secrets in CI runs"). A skip
  reports as passing, so CodeQL, which needs no token, is what scans those PRs. Confirm
  SonarQube Cloud's free tier for public repositories.
- **`npm audit`** (Q35): one run, `--omit=dev` at level high, fails the PR on high and
  critical in production dependencies; a second, full run that never fails prints the
  rest, since `--omit=dev` leaves dev dependencies out. That keeps Phase 6 #24's
  dismissed dev-only `minimatch` alert visible, to "revisit if `npm audit --omit=dev`
  lists it".
- **Supabase's security advisor**, `npx supabase db advisors --local --type security
  --fail-on warn`, in the integration job (Q25). Run locally 2026-11-12 (CLI 2.109.1): two
  INFO results, `rls_enabled_no_policy` on `public.locations` and `public.trucks`, the
  design (RLS on, no policy, no grant); no WARN or ERROR.
- **Lint rules** against DOM HTML sinks (`react/no-danger`; `innerHTML`, `outerHTML`,
  `insertAdjacentHTML`, MapLibre's `Popup.setHTML`) and string-built supabase-js filters
  (`.or()`, `.filter()`, `.rpc()` in `src/lib/db/`), through `no-restricted-syntax` and
  `no-restricted-properties` (Q26). Today's code has none (Appendix C); the rules keep it so.
- **Schema controls:** `node scripts/controls.mjs --check` on every PR; the full run (~45 s
  a control, 64 took 48 min on 2026-10-23) when `supabase/migrations/` or
  `tests/controls/` change, and on `main` (Q7).
- **`bash scripts/process-log.sh check`** on every PR (Q8).

**Dependabot:**
- Security updates for npm; version updates for GitHub Actions, to keep the SHA pins
  current (Q9). No auto-merge: the exact pins (`next`, `eslint-config-next`,
  `maplibre-gl`) keep their browser check of `/map`.
- Its branches don't build on Vercel: the Ignored Build Step also cancels `dependabot/*`,
  so the Preview variables (the secret key among them) never reach them; CI still tests
  them (Q1). Check then that its updater runs a Node `devEngines` admits.
- Secrets: a Dependabot-triggered run reads the Dependabot secrets store, a fork PR
  neither.
- Review the alerts Dependabot's auto-triage dismissed, any on `eslint-config-next`
  included.

**Repository:**
- Branch protection on `dev` and `main`, both in Phase 8 (Q2): PR required, checks
  required, no force-push; on `main` the rules apply to admins too (Q30). No required
  approvals: GitHub doesn't let a PR's author approve it. So if CI itself breaks, merging
  to `main` waits until the rule is lifted by hand; the plan records that.
- A production deploy waits on nothing else: `main`'s required checks are the gate (Q6).
- `SECURITY.md` and GitHub's private vulnerability reporting (Q32).

**Process:** CI is the gate (Q10): locally the fast loop (`tsc`, `test:run`, lint), and a PR
needs CI green before review and merge. The `/map` browser check stays manual. `CLAUDE.md`'s
"There is no CI" and its gate list change in Phase 8's plan and reconciliation.

---

## Phase 9 · Security

**The login rework:**
- **TOTP MFA** (D2): an enroll step (QR code) and a code step after the email, through the
  browser `supabaseClient`, which `CLAUDE.md` allows for Auth; `requireAdmin` (proxy and
  `withAdmin`) refuses a session below `aal2`, since all data goes through `supabaseAdmin`
  and RLS never sees the session; the integration tests' admin login reaches `aal2`;
  `[auth.mfa.totp]` enroll and verify on, locally and on the preview. Verifying a factor
  logs out the user's other sessions. The plan settles which answer an `aal1` session gets
  (`CLAUDE.md`'s "Admin routes": 401 no valid session, 403 non-admin) and keeps "a session
  cookie is checked before any network or DB call". Details: Appendix B.
- **#241's 6-digit email code** rides along (Q23): one rework of the screen, the email code
  then the TOTP code. (#241: the link failed twice in the Gmail app, which had no PKCE
  verifier cookie.)
- **Session timeouts** (Q19): `[auth.sessions]` is commented out (`config.toml:279-283`) and
  Supabase's docs say a session lasts indefinitely by default, so a stolen session skips
  MFA. `timebox` and/or `inactivity_timeout`: in Phase 9 if the Free plan has them, else
  Phase 10 with Pro (one community post says Pro-only, not confirmed). Values in the plan.
- **Login abuse, probed first** (Q31): the form takes any address and asks Auth for a link;
  at `email_sent = 2` an hour (local), someone who knows the admin's address could use up
  the sends; and with sign-ups off, an unknown address may get a different answer, revealing
  the admin's. Neither probed. After probing locally and reading the hosted limit, the plan
  picks a CAPTCHA (`config.toml`'s `[auth.captcha]` lists `hcaptcha` and `turnstile`), one
  message for every address, or accepting it.

**Security headers, split design** (Q11). A nonce CSP needs every page dynamically rendered
and the nonce set in the proxy (Next's guide,
`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`), and `CLAUDE.md`
keeps the proxy off `/map` (`src/proxy.test.ts` pins its matcher). So:
- a static CSP for every page but `/admin` in `next.config.ts` (the guide's "Without
  Nonces"): `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`,
  sources for the tiles and Supabase, `'unsafe-inline'` scripts; Referrer-Policy,
  Permissions-Policy;
- a strict nonce CSP on `/admin`, set by the proxy, which already runs there and where the
  readable session cookie matters (Appendix A, finding 1). The config's rule skips
  `/admin`, so a response carries one CSP; with both, the static one would either be
  enforced beside the strict one or replace it, depending on how Next merges the two
  (not probed) (round 1 on PR #280, the owner's call);
- a test that they're present, and that `/admin` carries exactly one CSP, run by Phase 8's
  CI.
- It must let through MapLibre's worker (`public/maplibre/<version>/`), the tiles' range
  requests, `blob:`/`data:` images and the Supabase URL the login calls, so a `/map` and a
  login browser check after it. `/api/live` keeps its CDN caching (no `Cache-Control`,
  `Vary: Cookie` or `Set-Cookie` from a header rule), checked by re-running MISS → HIT →
  STALE on the preview.
- Then **one ZAP baseline scan by hand**, locally against `next start` or on the preview
  (which needs the Vercel bypass secret), result recorded (Q33).

**Monitoring** (Q14, OWASP A09, which no phase owned): usage and spend alerts on Vercel and
Supabase, and an alert when 5xx errors spike, if Hobby and Free allow it (the plan checks);
Supabase's Auth logs are the record of logins. No log drain.

**Smaller items:**
- Probe whether Vercel replaces a client's `x-forwarded-host` (Q20): `origin.ts` trusts it as
  sent ("Whether Vercel replaces a client's own values wasn't checked"); a browser form
  can't set it, so CSRF holds. The result goes into `origin.ts`'s comment.
- Length limits on truck name, description and location label in the validators, with
  Swedish messages; no migration (Q22).

**Accounts and settings:**
- **The 2FA audit** of every account that exists then and each one's recovery email, codes
  kept offline, naming the admin's login mailbox, the first factor (Q12).
- **A hosted-settings checklist** (Q21), written and checked on the preview, applied to the
  production project in Phase 10: sign-ups off, redirect URLs, rate limits, MFA, Deployment
  Protection, Git Fork Protection; to settle in it: Supabase's "Enforce SSL", unused
  services (Realtime, Storage, GraphQL), network restrictions on direct database
  connections, and the hosted Security Advisor (`db advisors --linked`), not yet run on the
  preview.

---

## Phase 10 · Launch

**From today's Phase 9 row** (minus the headers, now Phase 9's): the history retention
period for the privacy note (Phase 7 plan #25); the app's final name (#26); Supabase Pro
(backups); a production Supabase project with new keys (Phase 6 plan #18); the tiles' custom
domain on R2 and its CORS rule; production env; the Swedish privacy note; the takedown
procedure (one transaction: delete the truck's locations, clear or delete each `users` row
pointing at it, then delete the truck; Phase 5 plan #7); telling trucks they're listed; the acquisition plan; the
runbook (Vercel Attack Mode); Vercel Pro + Spend Management before the first marketing push.

**Before the deploy:** 2FA re-checked on every account, the registrar included; the Ignored
Build Step checked before Production gets variables, no branch preview promoted; every
credential rotated.

**From the split:** the tiles' domain in the CSP, and HSTS; session timeouts if Pro-only
(Q19); the hosted-settings checklist applied to the production project, its Security
Advisor clean before the deploy (Q21).

**Open, for the Phase 10 plan** (Q34, the owner's call to explore then): an incident section
in the runbook (a compromised session, phone, mailbox or key: end every session with
`signOut({ scope: 'global' })` or the dashboard, re-enroll the factor, rotate the key; a
takedown request); a backup restore tried once on Pro; the privacy note naming Vercel's and
Supabase's logs, which hold IP addresses.

**Decided** (Q36, Claude's suggestion, the owner's yes, 2026-11-12): once production exists,
an unfixed vulnerability found in-house is tracked in a GitHub private security advisory,
not a public issue, PR or doc, until its fix ships. `SECURITY.md` (Phase 8, Q32)
covers outside reporters; this covers the owner's own findings. Before production there is
nothing live to attack, so this review is public.

---

## Outside Phases 8–10

- Standalone: #246 (`/map` without WebGL2 shows Next's error page; `src/app` has no
  `error.tsx`) and #259 (README's "Today's
  entry") (Q17); #264 (README rework), after Phase 8 (Q16); #248 and #256.
- The Owners phase's threat model (many accounts with their own rights).
- **This draft** is tracked through #278's PR (Q18). **The reconciliation** is a second
  issue, blocked by #278 (Q24): it renumbers the phases in `project-context.md`, `CLAUDE.md`,
  README and `src/app/admin/layout.tsx`, writes the `**between phases**` rows, and edits
  `0001_baseline.sql:28`'s "takedown (Phase 8)" comment (Q15).

---

## Appendix A · OWASP Top 10:2025 (checked 2026-11-12)

The final 2025 list came out in January 2026 (A08's and A09's names from memory, to check on
owasp.org). An awareness list; OWASP ASVS is the verification standard if one is wanted.

| # | Category | Status | Evidence, gap | Phase |
|---|---|---|---|---|
| A01 | Broken Access Control | Strong | `proxy.ts` and `withAdmin` on every admin route, found on disk by `admin-auth.test.ts`; RLS on all tables, anon and `authenticated` revoked, `authenticated` reads only its own `users` row; `Origin` checked on writes; no server fetch of user URLs (SSRF). Gap: `x-forwarded-host` on Vercel | 9 (Q20) |
| A02 | Security Misconfiguration | Partial | Sign-ups and anonymous sign-ins off; previews behind Vercel Authentication; Git Fork Protection; no stack traces. Gaps: no security headers; hosted settings unchecked | 9 (Q11, Q21); 10 |
| A03 | Software Supply Chain Failures | Phase 8 | Dependabot and malware alerts, exact pins, lockfile; Phase 8 adds updates, `npm audit`, the alerts review, hardening | 8 |
| A04 | Cryptographic Failures | Handed off | TLS from Vercel; tokens, PKCE, sessions from Supabase Auth; rotation before the deploy. Session cookies readable by scripts (finding 1) | 9; 10 |
| A05 | Injection | Strong | No DOM HTML sink and no string-built query (Appendix C). Two places build HTML from constants: `map-setup.ts:51`'s attribution, which MapLibre renders as HTML, and `proxy.ts`'s `unavailablePage` template; Q26's lint rules see neither. The popup's `href` can't be `javascript:` because it starts with the fixed `https://instagram.com/` (`TruckPopup.tsx:49`), whatever the handle. Gap: no length limits | 8 (Q26); 9 (Q22) |
| A06 | Insecure Design | Good | No anon access to history, no delete, overlap refused by the database, `/api/live` never caches `[]`, abuse cases weighed | Owners (threat model) |
| A07 | Authentication Failures | MFA decided | Magic link with PKCE, sign-ups off, `email_sent = 2`/h, `otp_expiry = 3600`, refresh-token rotation. Gaps: single factor (D2), sessions never expire (Q19), login abuse (Q31) | 9; 10 |
| A08 | Software or Data Integrity Failures | Phase 8 | Branch protection, required checks, Dependabot kept off Vercel builds (Q1); `updated_at` by trigger | 8 |
| A09 | Logging & Alerting Failures | Weakest | `console.error`/`warn` to Vercel's runtime logs only (`handler.ts`, `proxy.ts`, `admin-auth.ts`, `auth/logout`, `services/live.ts`); nothing alerts; no admin audit trail beyond `created_by`/`updated_at`; Hobby's log retention not checked | 9 (Q14) |
| A10 | Mishandling of Exceptional Conditions | Good | `withErrorHandling` on every route; `requireAdmin` answers 503, never 401 or a pass, on an Auth or DB failure (Phase 7 plan #32); `readJson` returns 400. Gap: no error boundary | #246 |

**Finding 1 · session cookies are readable by page scripts.** The app passes no cookie
options, and `@supabase/ssr`'s defaults are `httpOnly: false`, `sameSite: "lax"`, `maxAge`
400 days (`node_modules/@supabase/ssr/dist/main/utils/constants.js`, read 2026-11-12; no
`httponly` in `supabase-session.ts`, `supabase-browser.ts` or `proxy.ts`). `SameSite=Lax`
and the `Origin` check cover CSRF, but a script injection could read the admin's session:
hence the CSP, strict on `/admin`.

**Finding 2 · the admin's mailbox is the first factor** (Q12; one of two after MFA).

**Finding 3 · A09 had no owner** (Q14).

## Appendix B · MFA on Supabase Free (researched 2026-11-12)

- **TOTP is on the Free plan, as a web search quoted the pricing page**: "Basic Multi-Factor
  Auth: included in free". The live page wasn't read; the Phase 9 plan reads it before
  building. `config.toml`'s "available to Supabase Pro plan" above `[auth.mfa]` is the CLI
  template's comment, and the quoted page contradicts it for TOTP.
- **Phone (SMS) MFA is a paid add-on** outside the spend cap (the usage docs' example: $75 a
  month for the first project, not confirmed on the pricing page); `CLAUDE.md`'s 2FA rule
  excludes SMS anyway.
- **WebAuthn is experimental**: `@supabase/auth-js` 2.106.2 lists `"webauthn"` among its
  factor types with `@experimental` flags; passkey sign-in is a beta (changelog,
  2026-05-28).
- **The installed API** (`auth-js` 2.106.2, `lib/types.d.ts`): `mfa.enroll`, `challenge`,
  `verify`, `getAuthenticatorAssuranceLevel` (`aal1`/`aal2`); verifying promotes the session
  to `aal2` and logs out the others (line 1018); unenrolling a verified factor needs `aal2`
  (line 1254); enrolling returns `qr_code`, `secret` and the `otpauth://` `uri` (lines
  1605–1612).
- **Apps**: TOTP is RFC 6238, so any app that scans a standard setup QR code works. Not
  checked: that Supabase uses 6 digits and 30 s (`otp_length = 6` is phone MFA's); a local
  enroll settles it.
- **Locally** `[auth.mfa.totp]` has `enroll_enabled` and `verify_enabled` false; the hosted
  setting isn't read.

## Appendix C · The owner's checklist (2026-11-12)

The owner's list of what must not be forgotten, each item → where it's covered.

| Item | Covered? | Where, evidence |
|---|---|---|
| OWASP Top 10 | Yes | Appendix A |
| 2FA for the admin login | Decided | D2, Phase 9 |
| Supabase security | Mostly; gaps placed | RLS and per-table grants, no anon access to `trucks`/`locations` (`0001_baseline.sql`), guarded by the schema controls; no SQL function but the `moddatetime` trigger, no `SECURITY DEFINER`, extensions in the `extensions` schema; the local advisor clean but for 2 INFO by design. Open: the advisor in CI (Q25), hosted settings (Q21), session timeouts (Q19), MFA (D2) |
| Prepared statements | Yes, by design | The app writes no SQL: supabase-js → PostgREST, which builds the SQL and sends values as parameters (its documented design, not probed). The db layer's filters are only `.eq`, `.is`, `.lt`, `.gt`, `.order`, `.limit`, and it has no `.or()`, `.filter()`, `.rpc()` or `.textSearch()` (`grep` of `src/lib/db/`; the 16 `.filter(` elsewhere in `src/` are JavaScript's array method). Kept so by Q26 |
| SQL injection | Yes | As above; the migration has no dynamic SQL (its one `execute` is a trigger's `execute procedure`) and no function taking input. Hand-written SQL is never in `src/`: it is in the migration, `seed.sql`, the 65 files in `tests/controls/`, README's 2 `sql` snippets run by hand, and the future takedown (`git ls-files '*.sql'`) |
| Input validation | Yes, one gap | Bodies through `readJson` and pure parsers (`parseNewTruck`, `parseTruckPatch`, `parseNewLocation`, `parseLocationPatch`) that keep only known keys; path ids through `pathId` → `isUuid`; `places`'s `truckId` through `isUuid`; coordinates bounded to Gothenburg. `checklist`, `cancel`, `confirm`, `live` and `logout` take no body. Gap: length limits (Q22) |
| Input sanitization | Not needed, by design | No HTML is accepted; text is validated, stored plain, and escaped by React on output, the right layer. A sanitizer (e.g. DOMPurify) only if HTML input is ever accepted |
| XSS | Yes; hardening placed | No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `setHTML` or `dangerouslySetInnerHTML` in `src/` (`grep`); markers are `document.createElement` elements, the popup a React root (`useMapLibre.tsx`); its one user-derived `href` starts with the fixed `https://instagram.com/`. HTML built from constants, which Q26's rules don't see: MapLibre's attribution (`map-setup.ts:51`) and the proxy's `unavailablePage`; neither takes input today. Open: CSP (Q11), lint rules (Q26) |
| Workflow, CI/CD checks, branch protection, SAST (SonarQube free tier) | Phase 8 | Phase 8's Workflows, Checks, Repository |
| CI/CD in GitHub or Vercel; one workflow or many; `dev` vs `main` | Decided | Q27, Q28, Q29, Q30 |

## Appendix D · Sources

- OWASP Top 10:2025: owasp.org/Top10/2025/0x00_2025-Introduction/; The Register, 2025-11-11;
  Invicti; Qualys, 2026-06-15.
- Supabase: supabase.com/pricing; docs, "Manage Advanced MFA Phone usage", "Multi-Factor
  Authentication (Phone)", "User sessions"; changelog 46458, "Passkeys for Supabase Auth
  (Beta)".
- Next.js: `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
