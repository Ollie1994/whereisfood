import { AFTER, alt, BEFORE, FLAGS } from "@/lib/parser/boundary";

// The fallback half of step 3. Runs ONLY when `extractLocation` missed, and its job
// is to hand the geocoder a query rather than a sentence: Nominatim asked for "vi
// står på Andra Långgatan 12 idag 11-14" returns nothing useful, and asked for
// "Andra Långgatan 12" returns the street.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
//
// DICTIONARY-INDEPENDENT BY CONSTRUCTION: nothing here imports `dictionary.ts`, and
// the two modules are coupled only by the ORDER `parseCaption` runs them in (#67).
// That matters because `-torget` is one of the suffixes below, so this module would
// happily match "Järntorget" — which is correct for the unknown squares it exists to
// catch ("Olskrokstorget"), and never reached for the known ones, because a
// dictionary hit returns before this is called.
//
// RETURNING `null` IS THE COMMON CASE AND THE IMPORTANT ONE. Most captions contain
// no address at all, and `null` is what suppresses the network call entirely — the
// plan states it as an acceptance criterion in its own right. A module that returned
// "its best guess" instead would put every caption on the wire.

// Swedish street naming is regular, which is what makes this tractable without a
// gazetteer. The suffix list is the one the issue specifies; it is deliberately
// short rather than exhaustive, for the same reason `negation.ts` keeps its
// vocabularies short — an unlisted suffix costs a missed address, which degrades to
// no pin, while a loose pattern costs a wrong one.
//
// DEFINITE FORMS ONLY (`gatan`, not `gata`). Swedish addresses are written definite,
// and the indefinite forms are ordinary common nouns: "lastgata", "vid en gata".
export const STREET_SUFFIXES = [
  "gatan",
  "vägen",
  "torget",
  "platsen",
  "allén",
  "kajen",
  "liden",
  "berget",
] as const;

// Words that form the FIRST half of a two-word street name. A closed list, because
// the alternative — "take the preceding word" — takes the preposition instead and
// sends "på Långgatan" to the geocoder as "på långgatan".
//
// This list is not decoration. "Långgatan 12" is ambiguous in Gothenburg between
// Första, Andra, Tredje and Fjärde Långgatan, which are four different streets; the
// geocoder answers anyway, confidently, and that is the exact failure this module is
// built to avoid. The ordinals are what disambiguate them.
//
// KNOWN LIMIT, pinned by a test: a two-word street whose first word is NOT on this
// list is missed entirely — "Danska Vägen" is a real street and returns null. It
// stays closed because the only rule that would catch it is "take the preceding
// word", which turns "vid vägen" and "på torget" into addresses; casing cannot
// separate them, since captions are routinely written all-lowercase. The cost is a
// missed address, which degrades to no pin. The alternative cost is a wrong pin.
export const STREET_MODIFIERS = [
  "norra",
  "södra",
  "östra",
  "västra",
  "övre",
  "nedre",
  "gamla",
  "nya",
  "stora",
  "lilla",
  "första",
  "andra",
  "tredje",
  "fjärde",
  "femte",
] as const;

const SUFFIX = alt(STREET_SUFFIXES);
const MODIFIER = alt(STREET_MODIFIERS);

// A street name is EITHER a compound ending in a suffix, with the modifier optional
// — "Nordostpassagen", "Andra Långgatan" — OR a bare suffix word that a modifier
// makes into a name: "Södra Vägen", "Nya Allén". Both are real Gothenburg streets,
// and the second branch exists only for them.
//
// The compound branch requires at least two letters in front of the suffix, and that
// requirement is what keeps the bare common nouns out. "berget" is "the mountain",
// "allén" is "the avenue", "torget" is "the square" — each is an ordinary word a
// caption uses about somewhere it has already named. Requiring either a compound or
// a modifier means a bare one is never an address.
//
// The two branches are ordered longest-first for the same reason `location.ts`
// sorts its aliases: at a given start position JS takes the first alternative that
// fits, so the compound branch must be tried before the bare one or "Södra Vägen"
// would... in fact still match the compound branch through "Vägen" alone — which it
// cannot, since `\p{L}{2,}` needs two letters before the suffix inside the same
// word. The ordering is kept anyway because it is what makes the intent readable.
const STREET = `(?:${MODIFIER}\\s+)?\\p{L}{2,}${SUFFIX}|${MODIFIER}\\s+${SUFFIX}`;

// The house number is OPTIONAL and it is guarded, because a bare number after a
// street name is not reliably a house number.
//
// `(?!\\d)` first, so the engine cannot backtrack the digit run to a shorter prefix
// and slip past the range guard that follows — without it, "11-14" would fail as
// "11" and then succeed as "1".
//
// THE RANGE GUARD IS THE POINT. "Vi står på Långgatan 11-14" is a street and a TIME
// WINDOW, not house 11. `extractTime` reads those same digits as 11:00–14:00, so
// taking the number here would let one pair of digits mean two different things in
// one parse — and the geocoded pin would be a specific doorway chosen by accident.
// When a range follows, the number is dropped and the street alone is returned,
// which is both correct and still geocodable.
//
// A genuine house range ("61-63") is lost to this, and that trade is deliberate:
// a truck writing its opening hours is ordinary, a truck writing a building range
// is not.
//
// The entrance letter must be ATTACHED — "Kungsgatan 12B", never "Kungsgatan 12 B".
// Allowing a space there looked harmless and quietly swallowed the next word whenever
// it was one letter long: "Kungsgatan 12 i Göteborg" produced the candidate
// "Kungsgatan 12 i", because `i` is a single letter followed by a boundary and the
// pattern cannot tell a Swedish preposition from an entrance. Dropping the spaced
// form costs the letter and keeps the street and the building, which still geocodes
// to the right door; the alternative corrupts the query. `normalize.ts` protects the
// attached form from the other side, refusing to split "12B" when it segments a tag.
const NUMBER = `(?:\\s+(\\d{1,3}(?!\\d)(?!\\s*[-–.:]\\s*\\d)(?:\\p{L}${AFTER})?))?`;

// The genitive `s` sits OUTSIDE the captured street group, so "Kungsgatans korsning"
// yields "Kungsgatan" — the form the geocoder wants — rather than a query that ends
// in a case ending. Same Swedish rule `location.ts` handles for dictionary aliases.
//
// No `g` flag: a single `exec` returns the leftmost match, and leftmost is the rule
// here too. A caption naming two addresses resolves to the first, matching
// `extractLocation`'s behaviour rather than inventing a second one.
const ADDRESS = new RegExp(`${BEFORE}(${STREET})s?${AFTER}${NUMBER}`, FLAGS);

// The address-shaped substring, or `null` when the caption contains none.
//
// Expects `normalizeCaption` output, which is NFC — decomposed "ä" defeats
// `allén` and `vägen` exactly as it defeats the negation vocabulary.
export function extractAddressCandidate(normalized: string): string | null {
  const found = ADDRESS.exec(normalized);
  if (found === null) return null;

  const [, street, number] = found;

  // Rebuilt from the groups rather than returned as `found[0]`, which is what drops
  // the genitive `s`. Whitespace inside is collapsed because the pattern matches
  // `\s+` between the modifier and the street — "Andra   Långgatan 12" must reach
  // the geocoder as one clean query.
  const candidate = number === undefined ? street : `${street} ${number}`;
  return candidate.replace(/\s+/gu, " ").trim();
}
