# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**
   ([direct link](https://github.com/Ollie1994/whereisfood/security/advisories/new)).
3. Describe the problem, how to reproduce it, and what it affects.

Please don't report it publicly: no issue, pull request or post elsewhere. We'll agree in
the report when it can be made public.

Report a real key, token or password the same way, wherever you find it in this project:
its code or history, an issue, a pull request or a workflow log. The local development
stack's keys and the fixed values in the test fixtures are not secrets.

## Scope

In scope: the latest code on the default branch, the app built from it, and how its
hosted services are set up.

Out of scope, please report these to their owners instead:

- Problems in Supabase, Vercel, Cloudflare or GitHub themselves
- Problems in a dependency that this app doesn't make exploitable

Also out of scope: load or volume testing, and social engineering.

## Testing

Use your own local copy (the README's "Getting started" sets one up), not a deployment,
and don't access, change or delete data that isn't yours. If you notice a problem on a
deployment, report what you noticed without probing further.

## What to expect

This project has one maintainer, so there is no fixed response time. You can expect an
acknowledgement once the report has been read, then an assessment and either a fix or an
explanation of why no change is made, and credit by your GitHub username if you want it.
