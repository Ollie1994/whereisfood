import { AFTER, alt, BEFORE, FLAGS } from "@/lib/parser/boundary";
import { CLOCK_JOINER, NOT_IN_NUMBER_AFTER } from "@/lib/parser/time";

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

// Words that form the FIRST half of a two-word street name.
//
// ⚠ WHAT THIS LIST IS FOR, stated precisely because r1 got it wrong. It NAMES; it
// does not LICENSE. A modifier in front of a matched street is captured as part of
// the street's name, and that is its entire job — it is never evidence that the thing
// it precedes is a street at all. See the rule below for what happened when it was
// promoted to evidence.
//
// The naming job is not decoration. "Långgatan 12" is ambiguous in Gothenburg between
// Första, Andra, Tredje and Fjärde Långgatan, which are four different streets, and
// the geocoder answers anyway, confidently. The ordinals are what disambiguate them,
// so dropping "Andra" from "Andra Långgatan 12" would pin a truck on one of three
// wrong streets.
//
// A closed list, because the alternative — "take the preceding word" — takes the
// preposition instead and sends "på Långgatan 12" to the geocoder as "på långgatan
// 12".
//
// KNOWN LIMIT, pinned by a test: a two-word street whose first word is NOT on this
// list loses that first word — "Danska Vägen 12" geocodes as "Vägen 12". Widening it
// is safe now in a way it was not in r1, since the list no longer licenses anything;
// it is left narrow because a wrong first word is worse than a missing one, and Phase
// 8 captions are what should decide which words to add.
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

// ⚠ A SUFFIX IS NOT EVIDENCE OF A STREET, AND NEITHER IS A MODIFIER. This is the
// rule the module is built around, and it took two review rounds to state correctly
// because both wrong versions were argued rather than tried.
//
// Swedish street names and Swedish common nouns are built the same way — a stem plus
// a definite suffix — so **no morphological rule separates them**. That is a fact
// about the language, not a gap in the pattern, and it is why each attempt to add
// one more condition found the same class again one round later:
//
//   r0  `\p{L}{2,}` in front of the suffix, "to keep the bare common nouns out".
//       It keeps out the bare ones and nothing else: hållplatsen, parkeringsplatsen,
//       lekplatsen, idrottsplatsen, arbetsplatsen, spårvägen, motorvägen, hemvägen
//       and gågatan all came back as street addresses.
//
//   r1  corroboration by a house number OR a modifier. The modifier half is the same
//       mistake in new clothes: `stora`, `nya`, `lilla`, `nedre`, `andra` are
//       ORDINARY ADJECTIVES, so "vi står vid stora torget på Kungsgatan 12" returned
//       "stora torget", "Vi kör lilla vägen till Kungsgatan 12" returned "lilla
//       vägen", and "Vi tar nya vägen idag" returned "nya vägen". Each one not only
//       invented a place but, being leftmost, discarded the real address behind it.
//
// So r2 REMOVES a rule rather than adding a third:
//
//   **A candidate is a suffix-compound followed by a house number. Nothing else.**
//
// A modifier is a DISAMBIGUATOR — it says which Långgatan, not that this is a street
// — and r1 promoted it to evidence, which it never was. It keeps that real job below:
// when a modifier sits in front of a matched street it is captured as part of the
// name, because "Långgatan 12" is ambiguous between four Gothenburg streets. It just
// no longer licenses a candidate on its own.
//
// WHY THIS IS THE END OF THE LINE AND NOT ANOTHER NOTCH. The rule is now one sentence
// with one condition, and that condition is the only signal in a caption that is not
// also ordinary prose. There is no third corroborator to promote: every remaining
// candidate signal — capitalisation, a preposition in front, a longer compound — is a
// heuristic whose gaps produce WRONG pins, and we have zero real caption data to
// calibrate one against until Phase 8. Adding one would be the r1 mistake a third
// time.
//
// ⚠ THE LIMIT THAT REMAINS, stated because it CANNOT be closed here and a comment
// claiming otherwise is what caused both earlier rounds. A numbered common noun is
// indistinguishable from a numbered street:
//
//   "gågatan 5" · "spårvägen 3" · "hållplatsen 5"     still match, by design
//
// Pinned by a test asserting exactly that, so the claim above stays honest. The
// defences against it are downstream and real: the Nominatim query is bounded to the
// Gothenburg viewbox and its result re-validated against it (#3), a fallback
// resolution scores one confidence notch lower than a dictionary hit, and a
// location-only fallback lands at 0.45 — under the display threshold for both the
// webhook and the email lane.
//
// THE COST OF THE RULE, also pinned. All of these are real and all now return null:
//
//   "Vi står på Kungsgatan idag"        a street with no number
//   "Vi står på Södra Vägen idag"       a real street the modifier used to license
//   "Vi står på Ramberget 11-14"        a named point, no number to give
//
// Every one has the same remedy, and it is a good one: **add the place to the
// dictionary.** That is the human-reviewed, bounded, testable half of this design;
// this regex is the half that handles numbered addresses nobody has reviewed. Pushing
// coverage into the dictionary moves it toward evidence, and pushing it into the
// pattern moves it away.
function isCorroborated(number: string | undefined): boolean {
  return number !== undefined;
}

// The house number, and the guards that decide it is one.
//
// THE GUARDS ARE IMPORTED FROM `time.ts`, which owns them, because the digits after a
// street name are CONTESTED between the two modules. "Vi står på Kungsgatan 11-14" is
// a street and a time window; `extractTime` reads 11:00–14:00 from the same
// characters, so taking 11 as a house number lets one pair of digits mean two
// different things in one parse and geocodes a doorway chosen by accident.
//
// ⚠ IMPORT THE CONSTRUCTION, NOT ITS PIECES. This has now gone wrong twice, each time
// more subtly:
//
//   r0  a hand-written separator class `[-–.:]`, already drifted from `time.ts` on
//       the day it was typed — no em dash, no `till`, so "Kungsgatan 11 till 14"
//       yielded house number 11.
//
//   r1  imported `RANGE_SEPARATOR` and reassembled the guard locally, WITHOUT
//       `REPEATED_MARKER`. "Kungsgatan 11 - kl 14" yielded house number 11 while
//       `extractTime` read 11:00–14:00 — the identical failure, produced by the fix
//       for it. Importing the pieces of a construction is not sharing the
//       construction.
//
// `CLOCK_JOINER` is now the whole of what may sit between two clocks, exported as one
// string and used verbatim by `RANGE` in `time.ts`. There is no assembly left here to
// get wrong, which is the property that ends this class rather than patching it.
//
//   NOT_IN_NUMBER_AFTER  "these digits are the whole number" — rejects a clock's
//                        minutes ("11:00", "11.30") and a longer number. Placed first
//                        so the digit run cannot backtrack to a shorter prefix and
//                        slip past the range guard behind it.
//   CLOCK_JOINER         everything `extractTime` accepts between two clocks: the
//                        dash family, `till`, and a repeated `kl`/`klockan` marker.
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
const NUMBER = `(?:\\s+(\\d{1,3}${NOT_IN_NUMBER_AFTER}(?!${CLOCK_JOINER}\\d)(?:\\p{L}${AFTER})?))?`;

// A street name is a compound ending in one of the suffixes — "Kungsgatan",
// "Ramberget" — optionally preceded by a modifier that forms part of its name:
// "Andra Långgatan", "Södra Vägen". `\p{L}{2,}` is optional so that the second of
// those still matches, and it costs nothing now that the house number is what
// licenses a candidate.
//
// NO GENITIVE HANDLING, and its removal is part of the r2 simplification. `location.ts`
// strips a trailing `s` because a dictionary alias can be genitive and still name the
// place — "vid Nordstans entré". Here it could never fire: a genitive and a house
// number do not co-occur in Swedish, and without a number there is no candidate to
// strip it from. It was carried for one round as an `s?` that no input could reach,
// which is the kind of thing that costs a later reader a round to rediscover.
// "Kungsgatans korsning" is rejected, and it is rejected by the rule above rather
// than by a special case.
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
  `${BEFORE}(?:(${MODIFIER})\\s+)?((?:\\p{L}{2,})?${SUFFIX})${AFTER}${NUMBER}`,
  `${FLAGS}g`,
);

// The address-shaped substring, or `null` when the caption contains none.
//
// Expects `normalizeCaption` output, which is NFC — decomposed "ä" defeats
// `allén` and `vägen` exactly as it defeats the negation vocabulary.
export function extractAddressCandidate(normalized: string): string | null {
  for (const [, modifier, street, number] of normalized.matchAll(ADDRESS)) {
    if (!isCorroborated(number)) continue;

    // Rebuilt from the groups rather than returned as the whole match, so the
    // whitespace the pattern matched with `\s+` is normalised on the way out —
    // "Andra   Långgatan 12" must reach the geocoder as one clean query.
    return [modifier, street, number]
      .filter((part) => part !== undefined)
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
  }

  return null;
}
