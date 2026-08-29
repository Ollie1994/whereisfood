// The early-bail check. `parseCaption` runs this immediately after normalization
// and, when it fires, stops — a cancelled truck has no location, date or time worth
// extracting.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
//
// THE COST OF BEING WRONG IS ASYMMETRIC, and it shapes the vocabulary below.
// Per the phase plan (#1), a detected negation DELETES the truck's overlapping
// locations and writes no row. A missed cancellation leaves a stale pin, which
// `expires_at` eventually clears. A FALSE cancellation removes a pin for a truck
// that is standing there right now, and nothing signals that it happened. So this
// list is tuned for precision, and stays small on purpose — the same reasoning the
// plan applies to the location dictionary (#4): we have zero real caption data, so
// every entry beyond the obvious is a guess, and a guess here deletes data.

// Single words. Every one of these is also asserted by name in the tests, so a
// token cannot be added here without a case covering it.
export const NEGATION_WORDS = [
  // "not" — required by the issue's acceptance criteria. See the ambiguity note
  // under KNOWN LIMITS: this is the least precise entry in the list.
  "inte",
  // "not" in the clipped register of signs and notices: "Ej öppet idag".
  "ej",
  // "cancelled", across the inflections a caption realistically uses.
  "inställt",
  "inställd",
  "inställda",
  "inställs",
  // "closed" — the STATE. `stänger` ("closes") is deliberately absent; see below.
  "stängt",
  "stängd",
  "stängda",
] as const;

// Multi-word forms of "to cancel". The boundary rules below apply to the phrase as
// a whole, so the space is matched literally and "ställerin" does not count.
export const NEGATION_PHRASES = ["ställer in", "ställs in"] as const;

// DELIBERATE EXCLUSIONS — each of these looks like it belongs and does not:
//
//   `stänger`  "Vi stänger 14" is an END TIME, not a cancellation. Including it
//              would delete the location of every truck that posts its closing
//              hour, which is the single most ordinary thing a truck posts.
//   `ingen`    "Ingen kö idag!" — no queue today — is an INVITATION. The word is
//   `inget`    at least as common in positive captions as in cancellations, and it
//   `inga`     cannot be told apart without reading the object.
//   `nej`      Rare in captions, and usually answers a comment rather than
//              cancelling a day.
//   `tyvärr`   "Unfortunately" — modifies anything, including "tyvärr slut på
//              tacos", which means they are there and sold out of one item.
//
// Each is covered by a test asserting it does NOT fire, so re-adding one requires
// deleting an assertion that says why it was left out.

// Word boundaries WITHOUT `\b`, which is ASCII-only and therefore wrong for Swedish.
//
// `\b` sits between a `\w` and a non-`\w` character, and `\w` is `[A-Za-z0-9_]` —
// so å, ä and ö count as NON-word characters and manufacture boundaries inside
// words. `/\bstängt\b/` matches inside "snöstängt", because the "ö" before the "s"
// reads as a boundary. Swedish compounds are formed by exactly that kind of
// concatenation, so this is a live failure mode rather than a hypothetical.
//
// Lookarounds over `\p{L}\p{N}` treat every letter as a letter, in any language.
function boundedPattern(tokens: readonly string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${tokens.join("|")})(?![\\p{L}\\p{N}])`, "iu");
}

// Built once at module load rather than per call. The `i` flag is what lets
// `normalizeCaption` leave casing alone: matching is this module's concern, so
// "Inställt" and "inställt" are handled here rather than by flattening the caption
// for every other consumer.
const NEGATION = boundedPattern([...NEGATION_WORDS, ...NEGATION_PHRASES]);

// True when the caption cancels. Expects normalized text.
//
// KNOWN LIMITS, accepted for this phase:
//
//   `inte` is genuinely ambiguous. "Vi kör inte idag" cancels; "Vi står inte vid
//   Järntorget utan på Heden" is a RELOCATION and will be read as a cancellation,
//   deleting the day rather than moving it. The issue's acceptance criteria require
//   `inte`, so it ships — but it is the entry most likely to need revisiting once
//   real captions exist, and the first place to look if trucks report vanishing.
//
//   `ställer in` also means "to adjust/tune". Implausible in a food-truck caption,
//   and kept for that reason alone.
//
//   Bounded, not unbounded: a negation still passes through the override matrix
//   (#1, #6), so a low-confidence lane cannot cancel a higher-confidence location.
export function detectNegation(normalized: string): boolean {
  return NEGATION.test(normalized);
}
