// The early-bail check. `parseCaption` runs this immediately after normalization
// and, when it fires, stops — a cancelled truck has no location, date or time worth
// extracting.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
//
// THE COST OF BEING WRONG IS ASYMMETRIC, and it decides the whole design below.
// Per the phase plan (#1), a detected negation DELETES the truck's overlapping
// locations and writes no row. A missed cancellation leaves a stale pin that
// `expires_at` clears within hours. A FALSE cancellation removes the pin of a truck
// standing there right now, and nothing signals that it happened. So every rule
// here is built to fail toward "not a cancellation".
//
// WHY THIS IS NOT ONE WORD LIST. The first version matched a flat vocabulary and
// fired on all of these, each of which describes a truck that is OPEN:
//
//   "Vi tar ej kort, endast Swish"        ej negates the payment method
//   "Ej bokning, först till kvarn!"       ej negates booking
//   "Glöm inte att vi står på Heden!"     inte negates "forget" — an invitation
//   "Missa inte dagens lunch"             same, and extremely common phrasing
//   "Vi stänger inte förrän 15 idag"      inte negates the closing time
//   "Vi har inte stängt, vi står här"     a double negative
//
// `inte` and `ej` are general negation PARTICLES: they negate whatever they attach
// to, and on their own say nothing about whether the truck is operating. Treating
// them as cancellation words means deleting pins for ordinary marketing copy. So
// the two kinds of token are separated and given different rules.

// SELF-SUFFICIENT MARKERS. These name the state directly — the word alone means
// "not operating today" with no other context required.
export const CANCELLATION_MARKERS = [
  // "cancelled", across the inflections a caption realistically uses.
  "inställt",
  "inställd",
  "inställda",
  "inställs",
  // "closed" — the STATE. `stänger` ("closes") is deliberately absent; see the
  // exclusions below.
  "stängt",
  "stängd",
  "stängda",
] as const;

// Multi-word forms of "to cancel", matched as whole phrases so "ställerin" and a
// stray "in" do not count.
export const CANCELLATION_PHRASES = ["ställer in", "ställs in"] as const;

// GENERAL NEGATION PARTICLES. Never sufficient alone — only meaningful when they
// negate the truck actually operating.
export const NEGATORS = ["inte", "ej"] as const;

// Verbs describing a truck operating, in the position Swedish puts them: the
// particle FOLLOWS the finite verb. "Vi kör inte idag", "Vi står inte här."
export const OPERATING_VERBS = [
  "kör",
  "står",
  "kommer",
  "öppnar",
  "säljer",
  "serverar",
  "finns",
  "hittar",
] as const;

// States of being open, in the position where the particle PRECEDES them.
// "Ej öppet idag", "Inte öppna idag."
export const OPEN_STATES = ["öppet", "öppen", "öppna", "på plats", "ute"] as const;

// Temporal expressions — what a cancellation attaches itself to. "Vi kör inte IDAG."
// Used by both rules below, in opposite positions, which is why it is one list.
export const TEMPORAL_WORDS = [
  "idag",
  "dag",
  "imorgon",
  "morgon",
  "ikväll",
  "kväll",
  "inatt",
  "natt",
  "imorse",
  "morse",
  "helgen",
  "helg",
  "veckan",
  "vecka",
  "måndag",
  "tisdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lördag",
  "söndag",
] as const;

// What may stand immediately before a particle in a genuine cancellation: a copula
// or auxiliary. "Vi HAR inte öppet", "Vi ÄR inte öppna".
export const AUXILIARIES = ["har", "hade", "är", "var", "blir", "blev", "kommer"] as const;

// ⚠ THESE TWO LISTS ARE INCOMPLETE, AND THAT IS SAFE. A verb or state we failed to
// think of means a cancellation is MISSED — a stale pin, cleared by `expires_at`
// within hours. It never means a false deletion. That asymmetry is why an
// enumeration is acceptable here when it would not be for a guard whose gaps fail
// the other way: the incompleteness costs freshness, not correctness.
//
// DELIBERATE EXCLUSIONS — each looks like it belongs and does not. Each is pinned
// by a test asserting it does NOT fire, so re-adding one means deleting the
// assertion that records why:
//
//   `stänger`  "Vi stänger 14" is an END TIME, not a cancellation — the single most
//              ordinary thing a truck posts.
//   `ingen`    "Ingen kö idag!" is an INVITATION. As common in positive captions as
//   `inget`    in cancellations, and they cannot be told apart without reading the
//   `inga`     object.
//   `nej`      Usually answers a comment rather than cancelling a day.
//   `tyvärr`   Modifies anything, including "tyvärr slut på tacos" — they are there.

// Word boundaries WITHOUT `\b`, which is ASCII-only and therefore wrong for Swedish.
//
// `\b` sits between a `\w` and a non-`\w` character, and `\w` is `[A-Za-z0-9_]` — so
// å, ä and ö count as NON-word characters and manufacture boundaries inside words.
// `/\bstängt\b/` matches inside "snöstängt", because the "ö" before the "s" reads as
// a boundary. Swedish compounds are formed by exactly that concatenation, so this is
// a live failure mode rather than a hypothetical.
const BEFORE = "(?<![\\p{L}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{N}])";

function alt(tokens: readonly string[]): string {
  return `(?:${tokens.join("|")})`;
}

// Built once at module load. No `g` flag, deliberately: a global regex carries
// `lastIndex` across `.test()` calls, so a shared instance alternates true and false
// on the same input — a bug that passes any single-call test.
//
// The `i` flag is what lets `normalizeCaption` leave casing alone. Matching is this
// module's concern, so it is handled here rather than by flattening the caption for
// every other consumer.
const FLAGS = "iu";

const MARKER = new RegExp(
  `${BEFORE}${alt([...CANCELLATION_MARKERS, ...CANCELLATION_PHRASES])}${AFTER}`,
  FLAGS,
);

// A marker with a particle immediately in front of it is a DOUBLE NEGATIVE:
// "Vi har inte stängt" says they are open. Suppresses the marker entirely.
const NEGATED_MARKER = new RegExp(
  `${BEFORE}${alt(NEGATORS)}\\s+${alt([...CANCELLATION_MARKERS, ...CANCELLATION_PHRASES])}${AFTER}`,
  FLAGS,
);

// ADJACENCY, not proximity, is what makes these rules work. A window of a few words
// would still fire on "Glöm inte att vi står på Heden", where the particle and the
// verb sit three tokens apart and negate different things. Requiring them to be
// neighbours is what separates "kör inte" from "inte ... står".
//
// ⚠ ADJACENCY ALONE WAS NOT ENOUGH (#81). These fired on captions describing a truck
// that is OPEN, each of which deletes its location:
//
//   "Glöm inte öppet idag"              the particle negates the imperative
//   "Missa inte öppet hus på Heden"     — an invitation, not a cancellation
//   "Vi kör inte pizza idag men tacos"  the particle negates the MENU ITEM
//
// So each rule now also constrains its other side. The decision the issue left open
// was HOW, and the choice is about failure direction rather than coverage:
//
//   REJECTED — a denylist of imperatives (`glöm`, `missa`, …). It reads as the
//   obvious fix and fails in the wrong direction: an imperative nobody listed means
//   the guard FIRES and deletes a present truck's pin. A list whose gaps delete data
//   cannot be trusted to be complete, and this one cannot be completed — Swedish has
//   no closed set of verbs that can be used this way.
//
//   CHOSEN — an allowlist of the contexts a real cancellation appears in. A context
//   nobody listed means the guard STAYS QUIET, which costs a stale pin that
//   `expires_at` clears within hours. Same information, inverted, and only this
//   direction is safe to leave incomplete. It is the same reasoning that makes
//   OPERATING_VERBS acceptable above.
const TEMPORAL = `(?:(?:på|i)\\s+)?${alt(TEMPORAL_WORDS)}`;

// End of the clause the particle sits in: punctuation, or the end of the caption.
const CLAUSE_END = "\\s*(?:[.,!?:;]|$)";

// A cancellation names WHEN, or stops. "Vi kör inte idag", "Vi kör inte." What
// follows the particle in the false positives is an object — "pizza" — and an object
// is what tells you the particle negated something other than being there.
const VERB_THEN_NEGATOR = new RegExp(
  `${BEFORE}${alt(OPERATING_VERBS)}\\s+${alt(NEGATORS)}${AFTER}(?:\\s+${TEMPORAL}${AFTER}|${CLAUSE_END})`,
  FLAGS,
);

// A cancellation starts its clause, or follows a copula, or follows the date it
// applies to: "Ej öppet", "Vi har inte öppet", "Idag ej öppet". An imperative in
// front — "glöm inte öppet" — is none of those, and is excluded by not being listed
// rather than by being named.
const NEGATOR_THEN_STATE = new RegExp(
  `(?:^|[.,!?:;]\\s*|${BEFORE}${alt(AUXILIARIES)}\\s+|${BEFORE}${TEMPORAL}\\s+)` +
    `${alt(NEGATORS)}\\s+${alt(OPEN_STATES)}${AFTER}`,
  FLAGS,
);

// True when the caption cancels. Expects normalized text — `normalizeCaption`
// output, which is NFC. Passing raw text risks decomposed "ä", against which every
// pattern here silently fails to match.
//
// RESOLVED, and no longer a known limit: "Vi står inte vid Järntorget utan på Heden"
// no longer cancels. Requiring a temporal expression after the particle settles the
// relocation/cancellation ambiguity toward "not a cancellation", because what follows
// is a PLACE rather than a time. That was not the change's goal — it fell out of the
// same constraint added for "kör inte pizza", which is the sign the rule is about the
// grammar rather than about the reported cases.
//
// THE COST, stated plainly: "Vi står inte på Heden idag" is now missed, and it may
// well be a genuine cancellation. Both readings are live and nothing here can tell
// them apart, so the ambiguity is resolved the only way it safely can be — a missed
// cancellation is a stale pin that `expires_at` clears within hours, while the other
// reading deletes a truck that is standing somewhere else.
//
// Still bounded by the override matrix (#1, #6): a low-confidence lane cannot cancel
// a higher-confidence location regardless.
export function detectNegation(normalized: string): boolean {
  // A double negative wins over everything: it is the one construction that means
  // the opposite of the word it contains.
  if (NEGATED_MARKER.test(normalized)) return false;

  return (
    MARKER.test(normalized) ||
    VERB_THEN_NEGATOR.test(normalized) ||
    NEGATOR_THEN_STATE.test(normalized)
  );
}
