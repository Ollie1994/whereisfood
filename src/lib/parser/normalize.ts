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

// `#gbg` and `@truck` — the whole token, not just the sigil.
//
// ⚠ KNOWN COST, spec-mandated: a location written AS a tag is destroyed here.
// "Idag står vi på #Järntorget 11-14" normalizes to "Idag står vi på 11-14", and
// `extractLocation()` then has nothing to match, dropping the post below the 0.45
// display threshold. Stripping only the sigil would preserve it — but the issue's
// acceptance criteria require `#gbg` to be gone from the output, and doing that for
// generic tags while keeping location tags needs the dictionary, which step 0 must
// not depend on. Kept as specified; flagged for #65, which is where a caller could
// reasonably match against the pre-strip text as well.
//
// (An earlier version of this comment claimed tag text "says nothing about where the
// truck is". That is simply false for Instagram captions, and the false premise made
// the cost above look like no cost at all.)
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
const HASHTAG = new RegExp(`#+${HASHTAG_BODY}`, "gu");
const MENTION = new RegExp(`(?<![\\p{L}\\p{N}._])@${MENTION_BODY}`, "gu");

// Newlines, tabs, non-breaking spaces and runs of ordinary spaces all collapse to
// one space. JS `\s` already covers the Unicode space separators, so NBSP — which
// Instagram captions are full of — is handled without listing it.
const WHITESPACE = /\s+/gu;

// Strip tags to a FIXPOINT rather than in one pass.
//
// `String.replace` scans the original string, so a lookbehind still sees the
// characters that an earlier match removed: in "Tack @a@b" the second `@` is judged
// against the `a` that is already gone, and survives. Iterating until nothing more
// is removed closes that whole class rather than the one case, and it makes
// `normalizeCaption` idempotent by construction instead of by luck.
//
// Terminating: each pass either shortens the string or changes nothing, and the
// latter exits the loop.
function stripTags(text: string): string {
  for (;;) {
    const stripped = text.replace(HASHTAG, "").replace(MENTION, "");
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
