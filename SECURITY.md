# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**
   ([direct link](https://github.com/Ollie1994/whereisfood/security/advisories/new)).
3. Describe the problem, how to reproduce it, and what it affects.

Please don't report it publicly: no issue, pull request or post elsewhere. The maintainer
will agree with you in the report when it can be made public. If you've had no reply after
90 days, you may make it public.

Report a real key, token or password the same way, wherever you find it in this project:
its code or history, an issue, a pull request or a workflow log. The local development
stack's values are not secrets: the Supabase CLI's local keys and the fixed values in the
test fixtures.

## Scope

In scope: the latest code on `dev` and `main`, the apps built from them, how their hosted
services are set up, and a problem in one of their dependencies that this app makes
exploitable.

Out of scope, please report these to their owners instead:

- Problems in Supabase, Vercel, Cloudflare or GitHub themselves
- Problems in a dependency that this app doesn't make exploitable

Also out of scope: load or volume testing, social engineering, and reports from automated
scanners without a way to reproduce the problem.

## Testing

Use your own local copy (the README's "Getting started" sets one up), not a deployment,
and don't access, change or delete data that isn't yours. If you notice a problem on a
deployment, report what you noticed without probing further.

## What to expect

This project has one maintainer, so there is no fixed response time. You can expect an
acknowledgement once the report has been read, then an assessment and either a fix or an
explanation of why no change is made, and credit by your GitHub username if you want it.
