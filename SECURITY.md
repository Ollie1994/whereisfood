# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**
   ([direct link](https://github.com/Ollie1994/whereisfood/security/advisories/new)).
3. Describe the problem, how to reproduce it, and what it affects.

Please don't open a public issue or pull request for a vulnerability, and don't post it
anywhere else until it has been fixed, or until the report is closed without a fix.

## Scope

In scope:

- The public map (`/map`) and its data endpoint (`/api/live`)
- The admin screens (`/admin` and the pages under it), the admin API (`/api/admin/*`),
  and the login callback and logout (`/auth/*`)
- The server code under `src/` (the access checks included) and the Supabase setup in
  `supabase/` (the database rules in its migrations, and `config.toml`)
- This repository's GitHub Actions workflows
- A key, token or password found in this repository or its history
- A vulnerability in one of this project's dependencies, when it can be exploited in this
  app as it uses that dependency (otherwise, please report it to the dependency itself)

Out of scope:

- Problems in Supabase, Vercel, Cloudflare or GitHub themselves: report those to them
- Denial of service, load or volume testing
- Social engineering, and anything that needs physical access to a device
- Reports from automated scanners without a way to reproduce the problem

When you test, use your own local copy (the README's "Getting started" sets one up), not
a deployment. Don't access, change or delete data that isn't yours. If a problem shows
only on a deployment, report what you saw; don't probe further.

## What to expect

This project has one maintainer, so there is no fixed response time. You can expect:

- an acknowledgement in the report once it has been read;
- an assessment, and either a fix or an explanation of why no change is made;
- credit, if you want it, wherever the problem is written up.

Supported: the latest code on `dev`, the default branch, and on `main`, which production
will build from. A problem counts as fixed once the fix is on both. There are no older
releases to patch.
