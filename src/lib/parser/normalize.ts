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

// `#gbg` and `@truck` — the whole token, not just the sigil, since neither the tag
// text nor the handle says anything about where the truck is.
//
// The lookbehind is what keeps `info@foodtruck.se` intact: an `@` preceded by a
// letter or digit is part of an address, not a mention. Without it, normalizing a
// caption that lists a contact email would silently produce `info.se`.
//
// `\p{L}` rather than `[a-z]` so `#göteborg` is removed whole rather than leaving a
// dangling `öteborg`.
const TAG_OR_MENTION = /(?<![\p{L}\p{N}])[#@][\p{L}\p{N}_]+/gu;

// Newlines, tabs, non-breaking spaces and runs of ordinary spaces all collapse to
// one space. JS `\s` already covers the Unicode space separators, so NBSP — which
// Instagram captions are full of — is handled without listing it.
const WHITESPACE = /\s+/gu;

// Strip emoji, hashtags and mentions; collapse whitespace; trim.
//
// Order matters: the strips leave holes, and collapsing afterwards closes them, so
// "Järntorget 🌮 #gbg idag" does not become "Järntorget   idag".
export function normalizeCaption(raw: string): string {
  return raw.replace(EMOJI, "").replace(TAG_OR_MENTION, "").replace(WHITESPACE, " ").trim();
}
