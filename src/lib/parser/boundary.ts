// How this parser writes a word boundary and an alternation. Data-free, pure, and
// owned by no single extractor — which is exactly why it is here rather than in the
// module that happened to need it first.
//
// The contents were written in `negation.ts` (#56) and moved when `location.ts`
// (#65) became the second consumer. That is the same call already made for the
// weekday table, which was written in `negation.ts` and now lives in `date.ts`:
// two hand-maintained copies drift, and a drifted one fails silently. A boundary
// belongs to neither module's subject matter, so it gets its own.

// Word boundaries WITHOUT `\b`, which is ASCII-only and therefore wrong for Swedish.
//
// `\b` sits between a `\w` and a non-`\w` character, and `\w` is `[A-Za-z0-9_]` — so
// å, ä and ö count as NON-word characters and manufacture boundaries inside words.
// `/\bstängt\b/` matches inside "snöstängt", because the "ö" before the "s" reads as
// a boundary. Swedish compounds are formed by exactly that concatenation, so this is
// a live failure mode rather than a hypothetical.
//
// Both are zero-width lookarounds, so they compose into a larger pattern without
// consuming anything and without disturbing capture-group numbering.
export const BEFORE = "(?<![\\p{L}\\p{N}])";
export const AFTER = "(?![\\p{L}\\p{N}])";

// The `u` flag is required — `\p{…}` is a literal `p` without it, so every pattern
// built from `BEFORE`/`AFTER` would silently match nothing useful. The `i` flag is
// what lets `normalizeCaption` leave casing alone: matching is each consumer's
// concern, so case folding happens at the comparison rather than by flattening the
// caption for everyone downstream.
export const FLAGS = "iu";

// A non-capturing alternation over a token list. Non-capturing matters wherever the
// caller reads groups by index — `location.ts` does — and it is the right default
// regardless, since nothing here ever wants the group.
export function alt(tokens: readonly string[]): string {
  return `(?:${tokens.join("|")})`;
}

// Escape a literal for embedding in a pattern.
//
// `negation.ts` needed none of this: its vocabulary is hand-written lowercase Swedish
// words with no metacharacters in them. `location.ts` does, because its tokens come
// from `dictionary.ts` — DATA, which grows by hand and is allowed to contain a dot
// or a parenthesis. An unescaped `.` is "any character", which turns a missing entry
// into a silently over-broad matcher rather than into an error anyone would notice.
//
// A hyphen is deliberately NOT in the set below and needs no escape: outside a
// character class it is already a literal. That is not a detail — see the warning.
//
// ⚠ ESCAPE ONLY WHAT MAY BE ESCAPED. "Escape everything punctuation-shaped, the cost
// is a redundant backslash" was the first version's argument and it is FALSE under
// the `u` flag, which is the only flag this module's consumers use.
//
// In Unicode mode an identity escape is legal for the SyntaxCharacters and for `/`,
// and for NOTHING else — `\-` outside a character class is a SyntaxError, not a
// redundant backslash. So the over-broad version threw at module load for the first
// alias containing a hyphen, taking down every importer of `location.ts` with it.
// "Hisings-Backa" is an ordinary Gothenburg place name and was one dictionary entry
// away. Verified: `new RegExp("Hisings\\-Backa", "iu")` throws, and the same pattern
// without `u` does not, which is why nothing else in the codebase caught it.
//
// The set below IS the complete legal one, so it does not need to grow with the
// language: a character that becomes special later will also become escapable later.
// Adding to it speculatively is what broke it.
const NEEDS_ESCAPE = /[$()*+.?[\]^{|}\\/]/gu;

export function escapeRegex(literal: string): string {
  return literal.replace(NEEDS_ESCAPE, "\\$&");
}
