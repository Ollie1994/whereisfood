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
// ⚠ THIS LIST NOW ONLY MATTERS IN FRONT OF A COMPOUND. Since r4 there is no
// bare-suffix form at all, so "Södra Vägen 12" and "Danska Vägen 12" both return null
// — the list cannot rescue either, because `Vägen` is not a compound. What it still
// does is keep "Andra" attached to "Andra Långgatan 12".
//
// Left narrow for the same reason as ever: a wrong first word is worse than a missing
// one, and Phase 8 captions should decide which words to add.
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
//   r3  "a bare suffix needs a modifier". Same mistake a third time, in the numbered
//       form the r1 tests never covered: "lilla vägen 2 kvarter till Kungsgatan 12"
//       returned "lilla vägen 2". "Södra Vägen" and "lilla vägen" ARE the same shape.
//
// So every round after r1 has REMOVED a form rather than guarded one, and what is
// left is one sentence with no exceptions:
//
//   **A candidate is a suffix-COMPOUND followed by a house number.**
//
// A modifier is a DISAMBIGUATOR — it says which Långgatan, not that this is a street.
// r1 promoted it to evidence and r3 promoted it again for one form; it now has
// exactly one job, which it can do safely: sitting in front of a compound, it is
// captured as part of that street's name. "Andra Långgatan 12" is ambiguous between
// four Gothenburg streets without it.
//
// WHY THIS IS THE END OF THE LINE AND NOT ANOTHER NOTCH. The house number is the only
// signal in a caption that is not also ordinary prose, and there is no third
// corroborator to promote: every remaining candidate signal — capitalisation, a
// preposition in front, a longer compound — is a heuristic whose gaps produce WRONG
// pins, and there is zero real caption data to calibrate one against until Phase 8.
//
// ⚠ THE TEST FOR WHETHER A ROUND IS CONVERGING OR CIRCLING, learned here the hard
// way: does the fix REMOVE a form the rule cannot keep safe, or add a condition that
// tries to keep it? r1 and r3 added conditions and each was refuted one round later
// by the same class in a form the tests had not covered. r2 and r4 removed forms, and
// neither has been refuted.
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
//   "Vi står på Ramberget 11-14"        a named point, no number to give
//   "Vi står på Södra Vägen 12"         a bare suffix; no bare-suffix form survives r4
//   "Vi står på Nya Allén 3"            the same
//   "Vi ses vid Kungsgatans korsning"   a genitive, and no number either way
//
// Every one has the same remedy, and it is a good one: **add the place to the
// dictionary.** That is the human-reviewed, bounded, testable half of this design;
// this regex is the half that handles numbered addresses nobody has reviewed. Pushing
// coverage into the dictionary moves it toward evidence, and pushing it into the
// pattern moves it away.
// ⚠ THERE IS NO BARE-SUFFIX FORM, and r3's attempt to keep one safe is why.
//
// r1's pattern allowed a bare suffix when a modifier named it — "Södra Vägen", "Nya
// Allén", both real Gothenburg streets. r2 flattened that away by accident. r3
// restored it as an explicit condition, "a bare suffix needs a modifier", and r4
// showed the condition cannot work:
//
//   "Vi kör lilla vägen 2 kvarter till Kungsgatan 12"   →  "lilla vägen 2"
//   "Vi tar nya vägen 5 minuter till Kungsgatan 12"     →  "nya vägen 5"
//   "Vi står vid stora torget 5 meter från Kungsgatan 12" → "stora torget 5"
//
// **"Södra Vägen" and "lilla vägen" are the same shape.** Modifier plus bare suffix,
// in both cases, and nothing in the string distinguishes a street name from an
// ordinary adjective phrase. r3 only tested the un-numbered form of those phrases —
// the exact omission its own comment warned about one paragraph earlier — so the
// condition looked sound and was not.
//
// So the form is REMOVED rather than guarded again. `\p{L}{2,}` in front of the suffix
// is now mandatory, and the rule has no exceptions left:
//
//   **A candidate is a suffix-COMPOUND followed by a house number.**
//
// COST, pinned: "Södra Vägen 12" and "Nya Allén 3" no longer resolve. That is the
// whole reason the form existed, and it is a real loss — but it is the same loss this
// module already takes for every named place it cannot verify, with the same remedy:
// put them in `dictionary.ts`, where a human looks at the coordinate. Two entries buy
// back exactly what this deletion costs, and buy it back with evidence.
//
// A modifier keeps ONE job, which it can do safely: when it sits in front of a
// suffix-compound it is captured as part of the name. "Andra Långgatan 12" is
// ambiguous between four Gothenburg streets without it.

// THE GENITIVE `s` IS NOT STRIPPED, and this reverses r3.
//
// r2 deleted the `s?` arguing nothing could reach it. That claim was false and r3
// verified it false — four inputs reach it — so r3 put the `s?` back. **That was the
// wrong inference.** A justification being false does not make the conclusion false,
// and evaluating the conclusion on its own merits is a separate step r3 skipped.
//
// On the merits, deleting it was right. r3 claimed only UNGRAMMATICAL captions reach
// the `s?`, so "neither direction risks a wrong pin". Also false: genitive plus
// numeral is ordinary Swedish whenever the numeral counts what follows, and every one
// of these invented a place AND discarded the real address behind it —
// a REGRESSION against the version r3 was correcting:
//
//   "Vi tar spårvägens 5 till Kungsgatan 12"      →  "spårvägen 5"
//   "Motorvägens 3 filer, vi står på Kungsgatan 12" → "Motorvägen 3"
//   "gågatans 5 bästa mackor, Kungsgatan 12"      →  "gågatan 5"
//
// What it bought in exchange was "Kungsgatans 12", which is not how Swedish writes an
// address at all. A typo rescued against three ordinary phrases invented.
//
// `location.ts` strips a genitive and should: there the suffix is a VERIFIED
// dictionary alias, so "Nordstans" can only mean Nordstan. Here the stem is arbitrary
// text, so the same rule generates places. The two modules differ in what backs the
// match, which is the whole difference between them.
function isCandidate(number: string | undefined): boolean {
  // The single condition. Everything else that used to live here was a form the rule
  // could not keep safe, and each was removed rather than guarded a second time.
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
// ⚠ THIS GUARD IS DELIBERATELY BROADER THAN `extractTime`'S ACTUAL DECISION, and
// saying so is the honest version of a claim two earlier rounds got wrong.
//
// `CLOCK_JOINER` is the SHAPE of a range. `extractTime` then applies two further
// rejections this module does not mirror — an hour that is not a valid clock, and
// `TRAILING_UNIT`, a unit after the range — so both extractors decline and the address
// is lost outright:
//
//   "Kungsgatan 12 - 14 kr"                time: null   address: null   (TRAILING_UNIT)
//   "Kungsgatan 12 - 45 portioner kvar"    time: null   address: null   (45 is no hour)
//
// ⚠ THE SECOND ROW DOES NOT EXERCISE `TRAILING_UNIT`, and r3's version of this comment
// said it did. `firstValidRange` rejects "45" as a clock before the unit filter runs,
// and "portioner" is not in `TRAILING_UNITS` at all. The tests r3 wrote to pin this
// used only that shape, so they passed with `TRAILING_UNIT` deleted — verified by
// mutation. A test that credits the wrong mechanism pins nothing, and it is the fourth
// time in this PR that a claim about a guard was written without running it. The first
// row is the one that engages the filter, and it is the one under test.
//
// NOT FIXED BY IMPORTING ONE MORE FRAGMENT, and that is the point. `TRAILING_UNIT` is
// applied by `extractTime` as a POST-FILTER on the text after a match, so mirroring it
// here means a nested lookahead that also has to replicate `CLOCK` — replicating more
// of another module's grammar, which is exactly what failed in r0 (a hand-written
// separator class), r1 (`RANGE_SEPARATOR` without `REPEATED_MARKER`) and again here.
// Each round predicted one more piece of `extractTime`'s decision and missed the next.
//
// THE REAL FIX IS ARCHITECTURAL AND BELONGS TO #67. A module that must PREDICT another
// module's decision will keep getting it wrong; the place to resolve two extractors
// competing for the same characters is the one that holds both results.
// `parseCaption` sees `extractTime`'s actual match span and the address candidate's
// number span, and can resolve the overlap with facts instead of a lookahead. Tracked
// as issue #90 rather than half-built here.
//
// Until then the direction is the safe one — the cost is a MISSED address, which
// degrades to no pin, never a number claimed by two meanings at once. A genuine house
// range ("61-63") is lost to the same guard, and that trade is deliberate too: a truck
// writing its opening hours is ordinary, a truck writing a building range is not.
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
// The genitive `s` sits OUTSIDE the captured street group, so a case ending never
// reaches the geocoder: "Kungsgatans 12" is queried as "Kungsgatan 12".
//
// ⚠ THIS WAS DELETED IN r2 AND PUT BACK IN r3, and the reason is worth more than the
// character it costs. r2 removed it arguing "a genitive and a house number do not
// co-occur in Swedish, so no input can reach it" — dead code, delete it. That is a
// reasonable-sounding claim and it is FALSE: "Kungsgatans 12", "Södra Vägens 12",
// "Andra Långgatans 5" and "gågatans 5" all reach it, and all returned null without
// it. Verified by building both patterns and diffing their outputs, which is what
// should have happened before the deletion rather than after.
//
// What is true is narrower and does not justify deleting anything: those inputs are
// UNGRAMMATICAL. Swedish does not write a house number after a genitive. So the `s?`
// only ever fires on a malformed caption — and decoding a malformed caption into a
// correct pin is worth one character, because neither direction risks a WRONG pin.
// It also keeps the two matchers consistent: `location.ts` strips a genitive from a
// dictionary alias for the same reason.
//
// The general lesson, which cost this PR four rounds of the same thing: "this branch
// is unreachable" is a claim about every possible input, and it is exactly the kind
// of claim that cannot be established by reading the pattern.
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
  `${BEFORE}(?:(${MODIFIER})\\s+)?(\\p{L}{2,}${SUFFIX})${AFTER}${NUMBER}`,
  `${FLAGS}g`,
);

// The address-shaped substring, or `null` when the caption contains none.
//
// Expects `normalizeCaption` output, which is NFC — decomposed "ä" defeats
// `allén` and `vägen` exactly as it defeats the negation vocabulary.
export function extractAddressCandidate(normalized: string): string | null {
  for (const [, modifier, street, number] of normalized.matchAll(ADDRESS)) {
    if (!isCandidate(number)) continue;

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
