// Step 0 of the parser pipeline. Every other extractor consumes normalized text,
// so this runs first and exactly once.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
//
// WHAT IT DOES NOT DO: lowercase. The plan lists this step as "strip emoji,
// hashtags, mentions, collapse whitespace" and stops there, and that boundary is
// worth keeping deliberately:
//
//   - `address_raw` stores the caption text a location was resolved FROM, and
//     `extractAddressCandidate()` hands its substring to Nominatim. Both are better
//     with the original casing than with "järntorget".
//   - Case-insensitivity is a MATCHING concern. `detectNegation` and
//     `extractLocation` each need it, and each can apply it to its own comparison
//     without the shared step destroying information for everyone else.
//
// A normalizer that lowercases cannot be undone by a later consumer; one that does
// not can always be lowercased downstream. So the reversible choice wins.

// Emoji and the invisible characters that assemble them. `\p{Extended_Pictographic}`
// covers the pictographs themselves; the rest are the joiners and modifiers that
// would otherwise be left behind as stray codepoints once the base emoji is gone:
//
//   \p{Emoji_Modifier}      skin-tone modifiers (U+1F3FB–U+1F3FF)
//   \p{Regional_Indicator}  the paired letters that form flags
//   U+FE0F                  variation selector — "render the previous char as emoji"
//   U+200D                  zero-width joiner — binds emoji sequences together
//   U+20E3                  combining enclosing keycap
//
// Swedish letters and digits are untouched: none of these classes contain them.
const EMOJI = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu;

// The body of a tag or a handle. Word characters, plus separators that are allowed
// only BETWEEN them — requiring a word character after the separator keeps a
// sentence-ending period out of the match, so "Tack @truck." loses the handle and
// keeps the full stop.
//
// THE TWO TAKE DIFFERENT SEPARATORS, and getting this wrong destroys caption text.
// A hashtag terminates at a dot — Instagram's own rule — so "#gbg.Heden" is the tag
// `#gbg` followed by the word "Heden". Allowing `.` in the hashtag body swallowed
// that word whole, turning "#gbg.Heden idag 11-14" into "idag 11-14" and deleting
// the location the caption was about. Handles genuinely do contain dots
// (`@gbg.foodtruck`), so the mention body keeps it.
const HASHTAG_BODY = "[\\p{L}\\p{N}_]+(?:-[\\p{L}\\p{N}_]+)*";
const MENTION_BODY = "[\\p{L}\\p{N}_]+(?:[-.][\\p{L}\\p{N}_]+)*";

// HASHTAGS KEEP THEIR TEXT; MENTIONS DO NOT. The two carry different things: a tag
// is written by the truck to say something, a handle names an account.
//
// ⚠ SUPERSEDES #56's acceptance criterion, which required `#gbg` to be absent from
// the output. That criterion was wrong (#78): it optimised for a clean-looking
// string over a parseable one. "Idag står vi på #Järntorget 11-14" normalized to
// "Idag står vi på 11-14", `extractLocation()` had nothing to match, and a truck
// that told us exactly where it was rendered as a grey marker. The sigil goes, the
// words stay.
//
// A tag can carry ANY of the three signals the parser looks for — a location
// (`#Järntorget`), a date (`#idag`, `#måndag`), a time (`#11-14`, `#lunchtid`), or
// several at once (`#Lunch11-14Heden`) — which is why the text is segmented rather
// than merely unwrapped. Removing the sigil alone rescues only single-word tags.
//
// ⚠ `detectNegation` READS THIS SAME STRING, and preserving tag text widens its
// exposure: "#StängtPåSöndag" now segments to "Stängt På Söndag", the marker gets
// clean word boundaries, and a truck posting "Heden 11-14 idag! #StängtPåSöndag"
// has today's location deleted over a note about Sunday.
//
// This is a WIDENING, not a new failure: the prose form "Vi står på Heden 11-14
// idag, stängt på söndag" already does the same thing, because a cancellation marker
// carries no notion of WHICH day it cancels. Verified against `dev`. The real fix is
// to scope a negation to the date it names, which needs `extractDate` and therefore
// belongs downstream (#67) — tracked separately rather than papered over here, since
// narrowing it in step 0 would mean teaching the normalizer the negation vocabulary
// and inverting the layering.
//
// THE TWO SIGILS NEED DIFFERENT RULES, because they collide with ordinary text
// differently:
//
//   `#` never appears inside a word, so it is stripped unconditionally. It also
//   accepts a run of them, since `##gbg` otherwise leaves a stray `#` behind. This
//   matters more than it looks: `#gbg#foodtruck#lunch` with no spaces is a normal
//   way to write Instagram tags.
//
//   `@` appears inside every email address, so it keeps the lookbehind — an `@`
//   preceded by a word character, dot or underscore is part of an address, not a
//   mention. Without it, a caption listing a contact address silently produces
//   `info.se`.
//
// `\p{L}` rather than `[a-z]` so `#göteborg` is removed whole rather than leaving a
// dangling `öteborg`.
const HASHTAG = new RegExp(`#+(${HASHTAG_BODY})`, "gu");
const MENTION = new RegExp(`(?<![\\p{L}\\p{N}._])@${MENTION_BODY}`, "gu");

// Newlines, tabs, non-breaking spaces and runs of ordinary spaces all collapse to
// one space. JS `\s` already covers the Unicode space separators, so NBSP — which
// Instagram captions are full of — is handled without listing it.
const WHITESPACE = /\s+/gu;

// Segment a tag's text at the boundaries its own formatting marks.
//
// A multi-word tag is written without spaces, so unwrapping "#LunchJärntorget" to
// "LunchJärntorget" leaves one token no extractor can read — the fix would rescue
// only single-word tags. These three rules recover the boundaries that ARE marked:
//
//   lowercase → uppercase   "#LunchJärntorget" → "Lunch Järntorget"
//   letter → digit          "#lunch11-14"      → "lunch 11-14"
//   digit → letter          "#11-14Heden"      → "11-14 Heden"
//
// Two things must survive, and both are asserted by test because the obvious
// implementations break them:
//
//   `#GBG` must not shred into "G B G" — hence lowercase→uppercase specifically,
//   rather than splitting before every capital. Uppercase runs stay whole.
//
//   `#11-14` must keep its hyphen, or the fix meant to EXPOSE a time range is what
//   destroys it. Nothing here touches a separator between two digits.
//
// Applied only inside tag text, never to the caption at large: splitting camelCase
// across prose would break ordinary sentences and proper nouns.
//
// KNOWN LIMIT: an all-lowercase run-together tag (`#järntorgetidag`) has no marked
// boundary and stays glued. Finding one needs a wordlist, and step 0 must not depend
// on the dictionary. `extractLocation` (#65) is where that could be recovered, by
// matching dictionary entries as substrings rather than on word boundaries.
function segmentTagText(text: string): string {
  return (
    text
      // `_` is the one boundary a tag can state outright, and it is allowed in the
      // tag body — so `#lunch_järntorget` must not stay glued. Unlike the
      // all-lowercase limit below, this boundary is marked and needs no wordlist.
      .replace(/_/gu, " ")
      .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
      .replace(/(\p{L})(\p{N})/gu, "$1 $2")
      // Digit → letter, but only when a WORD follows, not a single letter.
      // Swedish street addresses carry an entrance letter — "Nordostpassagen 61B" —
      // and splitting it gives "61 B", so the same address would parse differently
      // written as prose than written as a tag. Two letters is the shortest thing
      // that is a word rather than a suffix.
      .replace(/(\p{N})(?=\p{L}{2})/gu, "$1 ")
  );
}

// Strip tags to a FIXPOINT rather than in one pass.
//
// `String.replace` scans the original string, so a lookbehind still sees the
// characters that an earlier match removed: in "Tack @a@b" the second `@` is judged
// against the `a` that is already gone, and survives. Iterating until nothing more
// is removed closes that whole class rather than the one case, and it makes
// `normalizeCaption` idempotent by construction instead of by luck.
//
// A hashtag becomes its segmented text SURROUNDED BY SPACES; a mention is removed
// outright. Both spaces are load-bearing, and the whitespace collapse afterwards
// makes a spare one free:
//
//   leading   "#gbg#foodtruck" must not fuse into "gbgfoodtruck".
//   trailing  ONLY before an `@`. "#gbg@foodtruckgbg" — a run-together tag block
//             ending in a handle is ordinary Instagram style — otherwise puts the
//             tag's text directly before the `@`, where MENTION's email lookbehind
//             sees a letter and refuses to match, leaving the handle in the caption.
//             The fixpoint cannot recover it, because the blocking character is real
//             text rather than something a later pass removes.
//
// The trailing space is CONDITIONAL because emitting it always costs more than it
// fixes. A hashtag body stops at a dot, so "#11.30-13.00" is the tag `#11` followed
// by ".30-13.00"; an unconditional trailing space turns that into "11 .30-13.00" and
// splits a time range in half. Leaving a handle in the caption is noise; destroying
// a time is data loss, so the space goes only where the `@` needs it.
//
// TERMINATING, but no longer for the reason first written here. The original argument
// was "each pass shortens the string or changes nothing" — false once a hashtag is
// replaced by its SEGMENTED text, which is longer than the tag it came from
// ("#LunchJärntorget" → " Lunch Järntorget"). The real invariant is that every pass
// consumes at least one sigil and no rule can introduce one: segmentation inserts
// only spaces, and mention removal deletes. So the sigil count strictly decreases
// and the loop cannot run more times than the caption has `#` and `@` characters.
function stripTags(text: string): string {
  for (;;) {
    const stripped = text
      .replace(HASHTAG, (match: string, body: string, offset: number, whole: string) => {
        const followedByMention = whole[offset + match.length] === "@";
        return ` ${segmentTagText(body)}${followedByMention ? " " : ""}`;
      })
      .replace(MENTION, "");
    if (stripped === text) return text;
    text = stripped;
  }
}

// Strip emoji, hashtags and mentions; collapse whitespace; trim.
//
// UNICODE NORMALISATION COMES FIRST, and it is not cosmetic. "ä" has two encodings:
// a single codepoint (NFC) and "a" plus a combining diaeresis (NFD). Text from
// Apple devices — and therefore much of the Mailgun lane — arrives NFD, where every
// regex here fails on it: the combining mark is `\p{M}`, outside the tag body class,
// so "#göteborg" strips to a stray diaeresis plus "teborg". Worse, it reaches
// `detectNegation`, and nine of that module's eleven tokens contain "ä" — so a real
// cancellation returns false and the truck's pin is never removed. Step 0 is the one
// place to fix this for every later step, which is why it is here and not repeated
// downstream.
//
// EMOJI BECOME A SPACE, NOT NOTHING. An emoji is frequently used as a separator:
// "Järntorget🌮11-14" is one token if the emoji is deleted, and neither the
// dictionary match nor the time extractor can see anything in it. A space is always
// safe because the whitespace collapse below closes the gap.
//
// Order matters throughout: the strips leave holes, and collapsing afterwards closes
// them, so "Järntorget 🌮 #gbg idag" does not become "Järntorget   idag".
export function normalizeCaption(raw: string): string {
  const composed = raw.normalize("NFC");
  return stripTags(composed.replace(EMOJI, " ")).replace(WHITESPACE, " ").trim();
}
