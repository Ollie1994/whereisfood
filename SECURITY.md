# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**
   ([direct link](https://github.com/Ollie1994/whereisfood/security/advisories/new)).
3. Describe the problem, how to reproduce it, and what it affects.

Please don't open a public issue or pull request for a vulnerability, and don't post it
anywhere else until it has been fixed.

## Scope

In scope:

- The public map (`/map`) and its data endpoint (`/api/live`)
- The admin screens (`/admin`) and the admin API (`/api/admin/*`), including login
- The database rules (row-level security and grants) in `supabase/migrations/`
- This repository's GitHub Actions workflows

Out of scope:

- Problems in Supabase, Vercel, Cloudflare or GitHub themselves: report those to them
- Denial of service, load or volume testing
- Social engineering, and anything that needs physical access to a device
- Reports from automated scanners without a way to reproduce the problem

When you test, use your own local copy (the README's "Getting started" sets one up), not
a deployment. Don't access, change or delete data that isn't yours.

## What to expect

This project has one maintainer, so there is no fixed response time. You can expect:

- an acknowledgement in the report once it has been read;
- an assessment, and either a fix or an explanation of why no change is made;
- credit in the published advisory, if you want it.

Only the latest code on the default branch is supported. There are no older releases to
patch.
