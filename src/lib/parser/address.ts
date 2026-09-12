import { AFTER, alt, BEFORE, FLAGS } from "@/lib/parser/boundary";
import { NOT_IN_NUMBER_AFTER, RANGE_SEPARATOR } from "@/lib/parser/time";

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

// ⚠ A SUFFIX IS NOT EVIDENCE OF A STREET. This is the correction that matters most
// in this module, and the first version got it wrong in the expensive direction.
//
// That version required two letters in front of the suffix and argued the rule
// "keeps the bare common nouns out". It keeps out the bare ones — "torget",
// "berget" — and nothing else, because Swedish forms common nouns by exactly the
// compounding the rule permits. Verified against the shipped pattern, every one of
// these came back as a street address:
//
//   hållplatsen · parkeringsplatsen · lekplatsen · idrottsplatsen · arbetsplatsen
//   spårvägen · motorvägen · hemvägen · gågatan
//
// And because matching was leftmost, "vi står vid hållplatsen på Kungsgatan 12"
// returned "hållplatsen" and threw the real address away. The caption said exactly
// where the truck was and the parser preferred a bus stop.
//
// WHY NOT A DENYLIST of those words: `-platsen` and `-vägen` are productive. Any noun
// plus `plats` yields another one, so the list has no closed form, and every gap in it
// is a WRONG pin — the failure direction this module exists to avoid. Same argument
// `negation.ts` makes for preferring an allowlist, with more force here because there
// is no grammar to lean on.
//
// SO: A CANDIDATE MUST BE CORROBORATED — a house number, or a modifier from the
// closed list above. A bare compound on its own is not an address.
//
// Structural, with no list to maintain, and it fails toward "no pin". It also happens
// to describe what this fallback is FOR: the dictionary already covers the named
// places where a bare name is precise, and this path exists for the numbered street
// addresses it does not know.
//
// REJECTED — accepting a capitalised bare compound ("Kungsgatan" yes, "hållplatsen"
// no). It would keep more coverage, and it only half-works: captions are routinely
// written all-lowercase, so it loses real addresses anyway, and it opens a hole for
// any clause STARTING with one of those nouns. A heuristic that fixes some of a
// wrong-pin class and leaves the rest is worse than a rule, because it reads as
// closed.
//
// THE COST, stated rather than discovered later: "Vi står på Kungsgatan idag" and
// "Vi står på Ramberget 11-14" now return null, and both are ordinary captions. They
// degrade to no pin. The answer for a named place is to add it to the dictionary —
// the one place a coordinate is looked at by a human before it becomes a pin.
// Revisit when Phase 8 produces real captions and the frequencies are knowable
// instead of guessable.
function isCorroborated(modifier: string | undefined, number: string | undefined): boolean {
  return modifier !== undefined || number !== undefined;
}

// The house number, and the guards that decide it is one.
//
// TWO OF THE GUARDS ARE IMPORTED FROM `time.ts`, which owns them, because the digits
// after a street name are CONTESTED between two extractors. "Vi står på Kungsgatan
// 11-14" is a street and a time window; `extractTime` reads 11:00–14:00 from the same
// characters, so taking 11 as a house number lets one pair of digits mean two
// different things in one parse and geocodes a doorway chosen by accident.
//
// The first version wrote its own separator class, `[-–.:]`, and it had already
// drifted from the real one by the time it shipped: no em dash, no `till`. So
// "Kungsgatan 11 till 14" and "Kungsgatan 11—14" both yielded house number 11 while
// `extractTime` read a window from the same digits — the exact failure the guard's own
// comment claimed to prevent (PR #89 review). Importing is what stops a guard and the
// thing it guards against being maintained apart.
//
//   NOT_IN_NUMBER_AFTER  "these digits are the whole number" — rejects a clock's
//                        minutes ("11:00", "11.30") and a longer number. Placed first
//                        so the digit run cannot backtrack to a shorter prefix and
//                        slip past the range guard behind it.
//   RANGE_SEPARATOR      the dash family and `till`, exactly as `extractTime` accepts
//                        them.
//
// A genuine house range ("61-63") is lost to this, and that trade is deliberate: a
// truck writing its opening hours is ordinary, a truck writing a building range is
// not.
//
// The entrance letter must be ATTACHED — "Kungsgatan 12B", never "Kungsgatan 12 B".
// Allowing a space there looked harmless and quietly swallowed the next word whenever
// it was one letter long: "Kungsgatan 12 i Göteborg" produced the candidate
// "Kungsgatan 12 i", because `i` is a single letter followed by a boundary and the
// pattern cannot tell a Swedish preposition from an entrance. Dropping the spaced form
// costs the letter and keeps the street and the building, which still geocodes to the
// right door; the alternative corrupts the query. `normalize.ts` protects the attached
// form from the other side, refusing to split "12B" when it segments a tag.
const NUMBER = `(?:\\s+(\\d{1,3}${NOT_IN_NUMBER_AFTER}(?!${RANGE_SEPARATOR}\\d)(?:\\p{L}${AFTER})?))?`;

// A street name is a compound ending in one of the suffixes — "Kungsgatan",
// "Ramberget" — or a bare suffix word that a modifier turns into a name: "Södra
// Vägen", "Nya Allén", both real Gothenburg streets. Hence `\p{L}{2,}` being optional
// rather than required: the corroboration rule above, not the compound, is what keeps
// "på torget" and "vid vägen" out.
//
// The genitive `s` sits OUTSIDE the captured street group, so "Kungsgatans korsning"
// yields "Kungsgatan" — the form the geocoder wants — rather than a query ending in a
// case ending. Same Swedish rule `location.ts` handles for dictionary aliases.
//
// GLOBAL, unlike every other pattern in this parser, because rejecting a candidate is
// not the same as failing to find one. "vi står vid hållplatsen på Kungsgatan 12"
// holds an uncorroborated candidate followed by a real one, and a single `exec` would
// stop at the first and return null for a caption that states an address outright. So
// the matches are walked and the first CORROBORATED one wins — still leftmost, now
// among the candidates that qualify.
//
// Read through `matchAll`, which per spec clones the regex before iterating and leaves
// this instance's `lastIndex` untouched. That is what makes a module-level global safe
// here where `negation.ts` warns against one; the stability test pins it.
const ADDRESS = new RegExp(
  `${BEFORE}(?:(${MODIFIER})\\s+)?((?:\\p{L}{2,})?${SUFFIX})s?${AFTER}${NUMBER}`,
  `${FLAGS}g`,
);

// The address-shaped substring, or `null` when the caption contains none.
//
// Expects `normalizeCaption` output, which is NFC — decomposed "ä" defeats
// `allén` and `vägen` exactly as it defeats the negation vocabulary.
export function extractAddressCandidate(normalized: string): string | null {
  for (const [, modifier, street, number] of normalized.matchAll(ADDRESS)) {
    if (!isCorroborated(modifier, number)) continue;

    // Rebuilt from the groups rather than returned as the whole match, which is what
    // drops the genitive `s`. Whitespace is collapsed because the pattern matches
    // `\s+` between the modifier and the street — "Andra   Långgatan 12" must reach
    // the geocoder as one clean query.
    return [modifier, street, number]
      .filter((part) => part !== undefined)
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
  }

  return null;
}
