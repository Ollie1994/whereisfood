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
// from `dictionary.ts` — DATA, which grows by hand and is allowed to contain a dot,
// a hyphen or a parenthesis. An unescaped `.` is "any character", which turns a
// missing entry into a silently over-broad matcher rather than into an error anyone
// would notice.
//
// Escaping everything in the ECMAScript punctuator set rather than the subset that
// is special today: the cost is a redundant backslash, and the alternative is a list
// that has to stay correct as the language grows.
export function escapeRegex(literal: string): string {
  // The hyphen sits LAST in the class, where it is a literal rather than a range
  // operator. In the middle it reads as a range — `\\-/` is "from backslash to
  // slash" — which throws at module load if the endpoints are out of order and,
  // when they are not, silently escapes a set of characters nobody chose.
  return literal.replace(/[.*+?^${}()|[\]\\/-]/gu, "\\$&");
}
