import type { Location, Post } from "@/lib/types";

// The bridge between the two `source` columns. `posts.source` records the
// six-value PLATFORM, `locations.source` the three-value LANE, and they are
// CHECK-constrained separately in migrations 0001 and 0002. Nothing mapped between
// them before this module, so every location insert would have violated
// `locations_source_check` — the deferral is written down at `ingestion.ts:41-43`.
//
// `types.ts:23-24` already explains why the two unions exist and are not the same
// thing; this file is the mapping, not a third restatement of the distinction.
//
// Pure module — no DB, no HTTP, no clock. It sits in `src/lib/`, OUTSIDE the
// directory `parser/purity.test.ts` globs, so it inherits no guard from there and
// carries its own in `sources.test.ts`. `geo.ts` is the same case and the same
// pattern.

// WHY A `Record` AND NOT A `switch`. The requirement is that adding a platform to
// `Post["source"]` breaks the build rather than falling through at runtime. A
// `Record` keyed on the union gives that for free, and reports the missing key at
// the DECLARATION — where the decision belongs — instead of at a `never` default
// branch nobody reads. It also cannot drift: the key set IS the union.
//
// The three social platforms collapse to one lane because the lane answers a
// different question from the platform. The platform is provenance and is kept at
// full resolution on `posts`, which is the ML corpus. The lane is about TRUST —
// how much to believe a location extracted from it — and Instagram, Facebook and
// TikTok all arrive by the same Make.com webhook, parsed the same way, so nothing
// distinguishes their reliability.
//
// `manual` and `webhook` have no producer yet: the ingest validator accepts only
// the three social platforms and the email lane hardcodes its own value, so today
// exactly four of these six keys can occur. They are mapped anyway rather than
// omitted — the dashboard lane (Phase 4) writes `manual`, and a `Record` with a
// missing key would not compile in any case.
const POST_SOURCE_TO_LANE: Record<Post["source"], Location["source"]> = {
  instagram: "webhook",
  facebook: "webhook",
  tiktok: "webhook",
  email: "email",
  manual: "manual",
  webhook: "webhook",
};

// NO RUNTIME GUARD FOR AN UNKNOWN SOURCE, deliberately, because there is no path
// that produces one. `Post["source"]` is narrowed from the generated `string` by
// hand (`types.ts:33`), so it is worth being explicit about why that narrowing is
// honest rather than wishful: the webhook validator whitelists the three platforms
// before a row is built, the email lane writes a literal, and migration 0001's
// CHECK constraint rejects anything else at the database. Three enforcement points
// already stand between arbitrary input and this lookup.
//
// Adding a fourth here would be untestable except by casting through `unknown` —
// a test that proves only that TypeScript can be lied to.
export function postSourceToLane(source: Post["source"]): Location["source"] {
  return POST_SOURCE_TO_LANE[source];
}

// Source confidence: the RIGHT-hand factor of `confidence = parser_confidence ×
// source_confidence`. This module owns it, and these three numbers exist in
// exactly one place in the application.
//
// (`fake-data.ts` also contains them, and deliberately keeps them: it is a fixture
// describing a green/yellow/grey map, and its numbers are chosen to land either
// side of the 0.45 display threshold. Making a fixture import the value it is
// meant to illustrate would couple the demo data to the logic it demonstrates.)
//
// WHAT THE NUMBERS MEAN, since they look arbitrary and are not:
//
//   manual   1.0   a human typed it in the dashboard. Nothing to doubt.
//   webhook  0.85  a real post from the truck's own account, parsed by us. The
//                  discount is our parsing, not their honesty.
//   email    0.55  the lowest, and the reason is structural rather than a hunch:
//                  Mailgun's HMAC covers only `timestamp + token`, NOT the
//                  recipient or the body. It authenticates the RELAY, never the
//                  content — so unlike the webhook lane, nothing proves the truck
//                  wrote this. CLAUDE.md states that at length; the number is that
//                  fact expressed as arithmetic.
//
// The left-hand factor is `scoreConfidence()` (#66), and combining them is the
// locations service's job (#68) — not this module's.
const SOURCE_CONFIDENCE: Record<Location["source"], number> = {
  manual: 1.0,
  webhook: 0.85,
  email: 0.55,
};

export function sourceConfidence(lane: Location["source"]): number {
  return SOURCE_CONFIDENCE[lane];
}
