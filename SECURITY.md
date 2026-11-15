# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**
   ([direct link](https://github.com/Ollie1994/whereisfood/security/advisories/new)).
3. Describe the problem, how to reproduce it, and what it affects.

Please don't open a public issue or pull request for a vulnerability, and don't post it
anywhere else until it has been fixed, or until the report is closed because no change
will be made.

## Scope

In scope:

- Everything in this repository (the app's code, its configuration, the database setup,
  the scripts, hooks and GitHub Actions workflows) and the app built from it
- A real key, token or password found in this repository or its history. The local
  development stack's values are not secrets: the Supabase CLI's local keys and the
  test fixtures
- A vulnerability in one of this project's dependencies, when it can be exploited in this
  app as it uses that dependency (otherwise, please report it to the dependency itself)

Out of scope:

- Problems in Supabase, Vercel, Cloudflare or GitHub themselves: report those to them
- Denial of service, load or volume testing
- Social engineering, and anything that needs physical access to a device
- Reports from automated scanners without a way to reproduce the problem

Using the public site normally is fine. For testing, use your own local copy (the
README's "Getting started" sets one up), not a deployment, and don't access, change or
delete data that isn't yours. If a problem shows only on a deployment, report what you
noticed; don't probe it further.

## What to expect

This project has one maintainer, so there is no fixed response time. You can expect:

- an acknowledgement in the report once it has been read;
- an assessment, and either a fix or an explanation of why no change is made;
- credit by your GitHub username, if you want it, in the fix's pull request or the
  advisory, if one is published.

Supported: the latest code on `dev` and on `main`. A problem counts as fixed once the fix
is on both. There are no older releases to patch.
