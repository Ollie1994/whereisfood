import { AFTER, alt, BEFORE, escapeRegex, FLAGS } from "@/lib/parser/boundary";
import { DICTIONARY } from "@/lib/parser/dictionary";
import type { LocationMatch } from "@/lib/types";

// Step 3 of the pipeline, and the parser's PRIMARY way of resolving a place. A hit
// here is positive identification: the entry already carries reviewed coordinates
// (#3), so a match needs no network call at all and `extractAddressCandidate` never
// runs. Nominatim exists only for the places this dictionary does not know.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
//
// Expects `normalizeCaption` output, which is NFC. Passing raw text risks decomposed
// "ä", against which every alias containing one silently fails to match — the same
// trap documented on `detectNegation`.

// WHAT IS RETURNED, AND WHY IT IS NOT JUST THE ENTRY.
//
// Issue #65 specifies `DictionaryEntry | null`. That signature cannot satisfy the
// phase plan, which requires `address_raw` to hold "the matched caption substring"
// on a dictionary hit — with only the entry in hand, `services/locations.ts` (#68)
// would have to fall back to `entry.match[0]`, a canonical alias that is not the
// text the caption actually used. "jarntorget" and "Nordstans" are what the truck
// wrote; "Järntorget" and "Nordstan" are what we recognised. `address_raw` is
// defined as the former.
//
// So the return is widened to carry both. Additive, and this is the only place the
// span is knowable without redoing the match. Downstream this makes `ParseResult`
// (#67) hold a `LocationMatch`; `scoreConfidence` (#66) is unaffected, since it
// reads only `hasLocation`.

// MATCHING IS LEFTMOST-LONGEST — the rule a lexer uses, and it settles the two
// distinct ambiguities the issue asks to be decided together:
//
//   OVERLAPPING aliases at the same position. "Eriksbergstorget" contains
//   "Eriksberg". Longest wins, so the caption resolves to the alias the truck
//   actually wrote rather than to whichever happens to be scanned first.
//
//   DISJOINT places in one caption. "Lunch på Heden idag, imorgon Järntorget" names
//   two. LEFTMOST wins, not longest — longest would pick Järntorget and pin the
//   truck at tomorrow's spot. A caption leads with its subject, and that subject is
//   what today's location should be. Note the parser has no notion of a second
//   location; one caption resolves to one place and the rest is lost. That is a real
//   limit, and the leftmost rule is what makes the part we keep the right part.
//
// Implemented by ONE alternation sorted longest-first rather than by scanning each
// alias separately and ranking the hits. JS alternation is leftmost-first-
// alternative: the engine finds the earliest position where anything matches, then
// takes the first listed alternative that fits there. Sorting by length descending
// therefore yields longest-at-the-leftmost-position exactly, in a single pass, with
// no candidate list to compare.
//
// Sorted on the ALIAS length rather than on the built pattern's, so escaping cannot
// perturb the order.
const ALIASES = DICTIONARY.flatMap((entry) =>
  entry.match.map((alias) => ({ entry, alias })),
).sort((a, b) => b.alias.length - a.alias.length);

// Cross-entry alias containment is what would break the second half of that rule —
// "Heden" in one entry and "Hedenplatsen" in another makes the winner depend on
// which entry was typed first. `dictionary.test.ts` already asserts no such pair
// exists, case-insensitively and by containment rather than by equality. It is
// asserted there because that is where a bad entry gets added; this comment records
// that this module DEPENDS on it rather than re-checking it here.

// A literal space in an alias becomes `\s+`. "Gustaf Adolfs torg" is three words,
// and although `normalizeCaption` collapses runs of whitespace to single spaces —
// which makes a literal space sufficient today — the extractor should not silently
// stop working if it is ever handed text from somewhere else. Escaping runs first,
// so the inserted `\s+` is not itself escaped.
function aliasPattern(alias: string): string {
  return escapeRegex(alias).replace(/\s+/gu, "\\s+");
}

// THE TRAILING GENITIVE `s` IS PART OF THE MATCH. Swedish forms the genitive by
// suffixing -s with no apostrophe, and captions use it constantly: "vid Nordstans
// entré", "Järntorgets hållplats", "Lindholmens pir". A strict word boundary after
// the alias misses every one of them, and a miss here is not a coarser pin — it is
// no location at all, since `extractAddressCandidate` finds no street suffix in
// "Nordstans" either.
//
// ONLY an `s`, and then a real boundary. The permissive alternative — allowing any
// letters to follow, which would also recover compounds like "Eriksbergshallen" and
// the glued all-lowercase tag `#järntorgetidag` that `normalize.ts` flags as a known
// limit — is REJECTED, deliberately:
//
//   Precision beats coverage here, because the two failure modes are not symmetric.
//   A missed place means no pin, which is visible and self-correcting: nothing shows
//   and the truck can post again. A WRONG place is a confident pin sending people to
//   the wrong side of the city, and nothing at all signals that it happened. It is
//   the same asymmetry that shapes `negation.ts`, one step earlier in the pipeline.
//
//   The permissive rule also has no bound on what it can swallow. "Heden" is five
//   letters and sits inside the ordinary Swedish idiom "sedan hedenhös"; "Garda" is
//   the ASCII alias for Gårda. A rule that fires on those cannot be fixed by editing
//   the dictionary, because the dictionary is not what is wrong.
//
//   And we have ZERO real caption data until trucks onboard in Phase 8 — the same
//   argument that caps the dictionary at sixteen entries (#4). Widening the matcher
//   on guesses about how captions get written is precisely what that decision
//   declined to do for the data itself.
//
// So `#järntorgetidag` stays unmatched, recorded as a limit rather than quietly
// fixed: revisit it when real captions show whether glued tags actually occur, at
// which point the question is answerable instead of arguable.
const LOCATION = new RegExp(
  `${BEFORE}(${alt(ALIASES.map(({ alias }) => aliasPattern(alias)))})s?${AFTER}`,
  FLAGS,
);

// Alias → entry, keyed on the shape the comparison actually produces: lowercased,
// with internal whitespace collapsed. The captured substring need not equal the
// alias byte for byte — `aliasPattern` matches `\s+` and the `i` flag matches any
// casing — so keying on the raw alias would miss.
//
// `toLowerCase()` rather than `toLocaleLowerCase("sv")`: Swedish has no locale-
// specific casing rule that differs from the default for any letter in this
// dictionary, and a locale-sensitive fold would make matching depend on the
// runtime's ICU data. The regex `i` flag uses simple case folding; this mirrors it.
const ENTRY_BY_ALIAS = new Map(
  ALIASES.map(({ entry, alias }) => [alias.toLowerCase().replace(/\s+/gu, " "), entry] as const),
);

// No `g` flag, deliberately — a global regex carries `lastIndex` across calls, so a
// shared instance would skip matches on every second caption. A single `exec`
// already returns the leftmost match, which is the whole rule.
export function extractLocation(normalized: string): LocationMatch | null {
  const found = LOCATION.exec(normalized);
  if (found === null) return null;

  // Group 1 is the alias WITHOUT the optional genitive `s`, which is what the map is
  // keyed on. `found[0]` is the full span including it, and that is what the caption
  // said — so the entry comes from the group and `matched` from the whole match.
  const entry = ENTRY_BY_ALIAS.get(found[1].toLowerCase().replace(/\s+/gu, " "));

  // Unreachable while every alternative in `LOCATION` comes from `ALIASES`, which is
  // also what builds the map. Returning null rather than throwing keeps a future
  // pattern change from failing an entire ingest: the caller's miss path is already
  // correct, and there is nothing a thrown error here would do better.
  if (entry === undefined) return null;

  return { entry, matched: found[0] };
}
