// Resolves a Swedish date expression to a concrete Stockholm calendar date.
//
// Pure — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in this directory.
// `parsedAt` is always passed in, never read from the clock, because
// `scripts/reparse.mjs` (#71) replays old posts and must resolve their dates against
// the day each post was made rather than the day the script runs.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS MODULE IMPORTS NO DATE LIBRARY — a deliberate divergence from #57
//
// The issue says "timezone handling via `date-fns-tz`", and its handoff comment
// instructs adding that package to the purity allowlist. Neither is done, because
// THIS MODULE PERFORMS NO TIMEZONE CONVERSION, and adding one would make it less
// correct rather than more.
//
// A timezone converts between an INSTANT and a wall clock. Nothing here is an
// instant: `parsedAt` is a calendar date, the return value is a calendar date, and
// the operations between them — what weekday is this date, what is this date plus
// N days — have the same answer in every timezone on earth. #57 says as much in its
// own non-goals: "does not convert to UTC instants; that happens once time is known."
//
// Converting anyway would mean inventing a time of day to anchor the date to, and
// that invention is where the DST bugs live: anchored at Stockholm midnight, adding
// 24 hours lands on 01:00 the NEXT day on 2026-03-29, and on 23:00 the SAME day on
// 2026-10-25. Every one of those is a bug this module can simply not have.
//
// So the arithmetic runs in UTC, which has no DST and no offset and is therefore
// exact calendar arithmetic. Verified by test across both 2026 Stockholm DST
// boundaries, a year rollover and a leap day.
//
// `date-fns-tz` remains the right tool at the seam where a date and a time become a
// UTC instant — `extractTime` (#58) and `parseCaption` (#67). It is the wrong tool
// here. The purity allowlist is meant to be where a dependency is ARGUED for; this
// is the argument, and its conclusion is that the dependency is not needed.
// ─────────────────────────────────────────────────────────────────────────────

// Swedish weekdays, Monday-first. THIS MODULE OWNS THEM; `negation.ts` imports them.
//
// The list existed there first, because a cancellation names a day. #57 asked whether
// to share it or keep a second copy, and sharing wins for the reason this project
// keeps logging: two hand-maintained lists of Swedish weekdays drift, and a drifted
// one fails silently. The DIRECTION is the part worth stating — a date module owning
// a weekday table is the natural layering, whereas a date extractor importing from a
// negation detector would invert it. So the constant moved here rather than being
// imported from there, and `negation.ts` re-exports it so its consumers are
// unaffected.
//
// Order is load-bearing: the index into this array IS the Monday-based weekday
// number that `weekdayOf` returns.
export const WEEKDAYS = [
  "måndag",
  "tisdag",
  "onsdag",
  "torsdag",
  "fredag",
  "lördag",
  "söndag",
] as const;

// Swedish weekdays inflect, and captions use every form: "på söndag", "på söndagen",
// "på söndagar", "på söndagarna". Listing only the stem made the first match while
// the rest missed — a review finding on `negation.ts` (process-log #86), which
// `extractDate` would have hit identically. Shared with `negation.ts` for the same
// reason the list itself is: the stems and their endings are one piece of knowledge,
// and splitting them across two files is how one of them gets updated alone.
//
// ⚠ `s` IS DELIBERATELY ABSENT, and that is a correctness rule rather than an
// oversight. "i fredags" means LAST Friday — a past reference. Adding `s` here would
// resolve it to the COMING Friday, which is the one direction this module must never
// go. Without it the expression matches nothing and falls back to `parsedAt`, which
// is the safe reading of a caption looking backwards. Pinned by test.
//
// ⚠ AND IT IS NOT THE WHOLE GUARD AGAINST BACKWARD REFERENCES — `BACKWARD_MODIFIERS`
// below is the other half. Omitting `s` covers only the shapes that carry one;
// "förra fredagen" is a past reference with an ordinary inflection, and it resolved
// six days FORWARD until that guard existed (review finding on PR #83).
export const WEEKDAY_INFLECTION = "(?:en|ar|arna)?";

// Modifiers that point a weekday BACKWARD. "Förra fredagen var kul" is a note about
// last Friday, and without this it matched `fredagen` and resolved to the COMING
// Friday — six days ahead, in the one direction this module states it never goes.
// Omitting `s` from the inflections does not cover these: they take the ordinary
// definite form, so the stem matches cleanly.
//
// SCOPE, stated because four scoping errors in this project's parser came from not
// stating it (process-log #87–90): this guard governs the WEEKDAY BRANCH ONLY, and
// spans exactly one word immediately before the weekday. It does not apply to `idag`
// or `imorgon`, which take no such modifier — "förra imorgon" is not Swedish, and a
// guard that reached them would be modelling a construction that does not exist.
//
// Fails toward NO MATCH, which falls back to `parsedAt`. That direction is safe only
// for a modifier that is genuinely backward-looking — see the exclusion below, which
// is the whole reason this list is short.
//
// ⚠ `sista` IS EXCLUDED, and it was in this list for one review round before being
// taken out (PR #83 r2). It looks like it belongs — "sista fredagen" can mean the
// most recent Friday — but its ordinary use in a caption is FORWARD-looking:
//
//   "Sista fredagen i månaden kör vi på Heden"   the monthly recurring slot
//   "Sista söndagen i månaden är det marknad"    the standard phrasing for a market
//   "Vår sista lördag för säsongen"              a closing date, announced ahead
//
// Suppressing those cost a real future date and returned the posting day instead —
// a wrong pin TODAY, which is worse than the wrong future day the guard was added to
// prevent. "Fails toward no match" is only the safe direction when the thing being
// suppressed was wrong to begin with; for `sista` it usually was not.
//
// The three that remain are unambiguous: `förra` and `föregående` mean the preceding
// one, `senaste` the most recent. None has a forward reading. THAT is the bar for
// this list — not "could point backwards", but "cannot point forwards".
export const BACKWARD_MODIFIERS = ["förra", "senaste", "föregående"] as const;

// Words that EXCLUDE the weekday after them, so it must not become the pin's date
// (#96). Without this, a truck stating its hours and carving out one day was pinned on
// exactly the day it ruled out, at confidence 1.0 — the worst available answer rather
// than a degraded one:
//
//   "Heden 11-14 (ej söndag)"      →  Sunday
//   "Heden 11-14, ej söndag"       →  Sunday
//   "Heden 11-14 utom söndag"      →  Sunday
//   "Heden 11-14 förutom söndag"   →  Sunday
//   "Heden 11-14 (ej söndagar)"    →  Sunday
//
// `detectNegation` correctly does NOT fire on these — #82 constrains `ej` to an
// operating verb or an open state, and a weekday is neither — so the post is a positive
// statement with a carve-out, not a cancellation. Firing would DELETE the pin instead,
// which is worse. The defect is only in which date this module picks.
//
// ⚠ TWO LISTS, BECAUSE THEY ARE TWO GRAMMATICAL CATEGORIES, and treating them alike is
// the trap. `utom`/`förutom` are prepositions meaning "except" — they cannot attach to
// anything but what follows them. `ej`/`inte` are general negators whose scope depends
// on what PRECEDES them, and when a verb does, they negate the verb and the weekday is
// still the operative date:
//
//   "Glöm ej söndag!"           the truck IS there Sunday
//   "Glöm inte söndag!"         the truck IS there Sunday
//   "Missa inte söndag på Heden"  the truck IS there Sunday
//
// Verified: all three resolve to Sunday today, and that is correct. A list treating
// `ej` like `utom` would suppress the weekday and fall back to the POSTING DAY — a
// wrong pin TODAY, which is exactly the trade that got `sista` removed from
// `BACKWARD_MODIFIERS` above. Same bar, same outcome: not "could exclude", but
// "cannot include".
//
// So the negators count only when NO WORD PRECEDES THEM — `(?<!\p{L}\s*)` in
// `NOT_EXCLUDED`. That is one rule rather than a list of punctuation, and it covers
// start-of-string, `(` and `,` without enumerating either.
//
// ⚠ IT DOES NOT COVER A NEWLINE, AND AN EARLIER VERSION OF THIS COMMENT CLAIMED IT
// COVERED "EVERY SEPARATOR". `normalizeCaption` collapses newlines to a single space
// (`normalize.ts`), so by the time the text reaches here the clause break is gone and
// the preceding word abuts the negator. Verified:
//
//   "Vi står på Heden\nInte söndag"        →  Sunday, the excluded day
//   "Vi står på Heden 11-14\nInte söndag"  →  Saturday, correct — but only because a
//                                             DIGIT precedes, which `\p{L}` excludes
//
// The second row is the tell: whether the guard fires depends on whether the last
// character of the previous line happens to be a letter or a digit, which is arbitrary.
// A newline is the most common separator in an Instagram caption, so this is a live gap
// rather than a curiosity.
//
// NOT FIXED HERE, and the reason is structural rather than effort: the information is
// destroyed at step 0, before this module runs. Recovering it means either teaching
// `normalizeCaption` to preserve a clause marker — a change to the step every other
// extractor depends on — or knowing WHERE each match sits, which is the span work #90
// and #80 need and which plan decision #8 scopes. Tracked as #101.
//
// `utom`/`förutom` are unaffected: they are unconditional, so no separator has to
// survive for them to work.
export const EXCLUSION_PREPOSITIONS = ["utom", "förutom"] as const;
export const EXCLUSION_NEGATORS = ["ej", "inte"] as const;

// An exclusion applies to a COORDINATED LIST, not to one day. "Heden 11-14 utom lördag
// och söndag" excludes both, and the first version of this guard excluded only the day
// directly after the excluder — so `lördag` was suppressed, the engine skipped ahead,
// and `söndag` was pinned. The same #96 inversion, produced by the skip-ahead behaviour
// the first version described as "strictly better than bailing". It is better, and it
// is also what surfaces the second excluded day when the chain is not followed.
//
// ⚠ THE CHAIN IS BOUNDED TO WEEKDAY TOKENS, which is what keeps this from becoming the
// clause segmentation plan decision #8 defers to Phase 8. Each link must be a weekday
// followed by a conjunction; anything else ends it. So the exclusion does NOT run past
// ordinary prose, verified:
//
//   "Heden utom lördag och vi kör söndag"   →  söndag still matches
//   "Heden utom lördag, vi kör söndag"      →  söndag still matches
//
// `,` is a conjunction here because Swedish lists take it ("utom lördag, söndag").
//
// ⚠ AND "CANNOT RUN PAST ORDINARY PROSE" IS NARROWER THAN IT SOUNDS. Prose stops the
// chain; a SECOND CLAUSE THAT OPENS ON A WEEKDAY does not, because the comma plus the
// weekday is exactly one more valid link:
//
//   "Öppet utom lördag, söndag Lindholmen 12-16"  →  the posting day
//
// That caption states a real Sunday booking and loses it. Closing the gap means
// knowing where a clause ends, which is the segmentation plan decision #8 defers to
// Phase 8 — so it is pinned as a known-gap test and tracked with #102 rather than
// guarded by one more condition here. Every round in this parser that ADDED a
// condition was refuted a round later; the ones that removed a form were not.
export const EXCLUSION_CONJUNCTIONS = ["och", "eller", ",", "&"] as const;

// Word boundaries WITHOUT `\b`, which is ASCII-only and therefore wrong for Swedish:
// `\w` excludes å, ä and ö, so `\b` manufactures boundaries INSIDE words and
// `/\bsöndag\b/` matches inside "söndagsöppet". Swedish compounds are formed by
// exactly that concatenation, so this is a live failure mode rather than a
// hypothetical one.
//
// Duplicated from `negation.ts` rather than shared: it is a two-token regex idiom
// with no natural owner, and a third exported constant to carry it would cost more
// coupling than the duplication does. What is NOT duplicated is the trust — the
// behaviour these produce is asserted directly in `date.test.ts` ("söndagsöppet"
// must not match), so a wrong copy fails loudly here instead of silently matching
// inside a compound.
const BEFORE = "(?<![\\p{L}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{N}])";

function alt(tokens: readonly string[]): string {
  return `(?:${tokens.join("|")})`;
}

// BOTH SPELLINGS OF EACH WORD. "idag" and "i dag" are both current Swedish — SAOL
// prefers the two-word form — and a caption uses whichever spelling its writer
// learned. The same holds for "imorgon" / "i morgon". Matching only the closed-up
// form would miss the spelling the language authority actually recommends.
//
// ⚠ THE "i" IS REQUIRED, NOT OPTIONAL. Writing `(?:i\s+)?morgon` instead would be a
// real defect: bare "morgon" is the noun "morning", so "God morgon!" — an ordinary
// caption greeting — would resolve to TOMORROW and pin the truck on the wrong day.
// The `i` is what makes the word temporal. Pinned by test.
//
// `\s+` rather than `\s*` because the no-space case is already the first branch, so
// allowing both inside one branch would only add a second way to match one string.
const TODAY = "(?:idag|i\\s+dag)";
const TOMORROW = "(?:imorgon|i\\s+morgon)";

// One regex, one pass, FIRST MATCH WINS — see `extractDate` for why the first.
//
// No `g` flag, deliberately: a global regex carries `lastIndex` across calls, so a
// module-level instance alternates between finding and not finding on identical
// input. `negation.ts` documents the same trap, which passes any single-call test.
//
// The `i` flag is what lets `normalizeCaption` leave casing alone — matching is each
// extractor's own concern, and step 0 preserving case is what keeps `address_raw`
// readable for every other consumer.
//
// No prefix is required before a weekday. "På söndag 11-14" and "Söndag 11-14" are
// both ordinary, and leading with the day is the common caption shape.
// The backward-modifier guard, applied to the weekday branch ONLY.
//
// ⚠ THE INNER `BEFORE` IS NOT REDUNDANT — it is what makes the modifier a WORD.
// Without it the lookbehind matches the SUFFIX of a longer word, which is the exact
// unbounded-token class `BEFORE` and `AFTER` exist to prevent everywhere else in this
// module: "Nästsista fredagen" ends in "sista ", so the tail of one word silently
// suppressed the date behind it (PR #83 r2). Every other token here is anchored on
// both sides; this one was not, while its comment claimed it spanned one word.
const NOT_BACKWARD = `(?<!${BEFORE}${alt(BACKWARD_MODIFIERS)}\\s+)`;

// The exclusion guard (#96), applied to the weekday branch ONLY — same scope as
// `NOT_BACKWARD`, and it carries the inner `BEFORE` for the same reason: without it the
// lookbehind would match the SUFFIX of a longer word ("nyutom ", "blinte ") rather than
// the word itself.
//
// The negator alternative additionally requires that no word precedes it, which is what
// separates an exclusion from a verb negation. See the two lists above.
//
// ⚠ SCOPE IS THE WEEKDAY BRANCH, NOT `idag` / `imorgon`, stated because four scoping
// errors in this parser came from not stating it (process-log #87–90):
//
//   `idag`     suppressing it would be a NO-OP. `extractDate` falls back to `parsedAt`
//              on a miss, and for "idag" that is the same day — nothing changes.
//   `imorgon`  "varje dag utom imorgon" is grammatical and would resolve differently,
//              but there is no caption data to say it occurs. Widening on a guess is
//              what this phase has declined four times, and `sista` is the local proof
//              that the guess costs a wrong pin TODAY when it is wrong.
//
// ⚠ A SUPPRESSED WEEKDAY DOES NOT END THE SEARCH — the engine skips it and takes the
// next date expression. That cuts both ways, and both are verified:
//
//   GOOD  "Inte söndag, utan måndag"  suppresses `söndag`, matches `måndag`, and
//         resolves to the day the caption actually names rather than falling back.
//   BAD   it is also what pinned the second day of a coordinated exclusion before
//         `EXCLUSION_CONJUNCTIONS` existed — see that constant.
//
// ⚠ `måndag` RATHER THAN `lördag` IN THAT EXAMPLE. An earlier version of this comment
// cited "Inte söndag, utan lördag" as the verification, while the test added in the
// same commit argues that exact example proves nothing: `parsedAt` is a Saturday and a
// weekday that IS today resolves to today, so `lördag` equals the fallback and the
// claim holds whether the engine skips ahead or gives up. A stated verification that
// cannot fail is worse than none.
//
// An optional `på` may sit between the excluder and the day — "utom PÅ söndag" — which
// is ordinary Swedish and is the phrasing this module's own weekday tests use.
// Requiring `\s+` alone missed every one of them.
const EXCLUSION_PREP = "(?:på\\s+)?";

// One link of a coordinated exclusion: a weekday followed by a conjunction.
const EXCLUSION_LINK =
  `${EXCLUSION_PREP}${alt(WEEKDAYS)}${WEEKDAY_INFLECTION}` +
  `\\s*(?:${alt(EXCLUSION_CONJUNCTIONS)})\\s*`;

const NOT_EXCLUDED =
  `(?<!${BEFORE}(?:${alt(EXCLUSION_PREPOSITIONS)}` +
  `|(?<!\\p{L}\\s*)${alt(EXCLUSION_NEGATORS)})\\s+(?:${EXCLUSION_LINK})*${EXCLUSION_PREP})`;

const DATE_EXPRESSION = new RegExp(
  `${BEFORE}(?:(?<today>${TODAY})|(?<tomorrow>${TOMORROW})|` +
    `${NOT_BACKWARD}${NOT_EXCLUDED}(?<weekday>${alt(WEEKDAYS)})${WEEKDAY_INFLECTION})${AFTER}`,
  "iu",
);

const DAY_MS = 86_400_000;

// A calendar date as UTC midnight, or null when the string is not one.
//
// THE ROUND TRIP IS THE VALIDATION, and it does three jobs at once that three
// separate checks would each do worse. `Date.UTC` silently accepts what it should
// reject: `Date.UTC(2026, 1, 31)` rolls February 31st forward to March 3rd, and a
// two-digit year maps into the 1900s (`Date.UTC(26, 0, 1)` is 1926). Formatting the
// result back and requiring it to equal the input rejects both, plus anything the
// regex let through, without enumerating the ways a date can be impossible.
function toUtcMillis(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const millis = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatUtc(millis) === date ? millis : null;
}

// Built from the UTC field getters rather than `toISOString().slice(0, 10)`.
//
// `toISOString` switches to the expanded-year form outside 0000–9999 — year 10000 is
// "+010000-01-06T…", where a 10-character slice yields "+010000-0" — so the obvious
// one-liner is correct only across the range it would never be tested at. Reading the
// fields has no such edge, and it costs two lines.
function formatUtc(millis: number): string {
  const date = new Date(millis);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

// Monday-based weekday index, matching the position in `WEEKDAYS`.
// `getUTCDay` is Sunday-based (0 = Sunday), so the shift realigns the two.
function weekdayOf(millis: number): number {
  return (new Date(millis).getUTCDay() + 6) % 7;
}

// Calendar-date arithmetic, exported for `time.ts` (#58) rather than reimplemented
// there. `extractTime` needs exactly this for the midnight roll: "22-01" ends on the
// FOLLOWING calendar day, and the end instant has to be built from that day's wall
// clock rather than by adding 24 hours to the start instant — those differ by an
// hour across a DST boundary.
//
// Shared for the reason `WEEKDAYS` is: this is one piece of knowledge — that a
// calendar date has no timezone, so its arithmetic is exact in UTC and nowhere else
// — and the header above is where the argument for it lives. A second copy in
// `time.ts` would be a second place for that argument to rot.
//
// Returns null on a date this module cannot read, so callers keep the same
// fail-closed shape rather than propagating an Invalid Date.
export function addCalendarDays(date: string, days: number): string | null {
  const millis = toUtcMillis(date);
  return millis === null ? null : formatUtc(millis + days * DAY_MS);
}

// Resolve a Swedish date expression against the day the post was made.
//
// Expects normalized text — `normalizeCaption` output, which is NFC. Passing raw
// text risks decomposed "ä", against which every pattern here silently fails to
// match; that bug (#56) was invisible in both modules' own tests and lived only in
// the handoff between them, which is why the composition is asserted in this
// module's tests rather than assumed.
//
// ⚠ THE FAILURE DIRECTION HERE IS NOT `negation.ts`'s, and this module should not
// inherit that one's caution by imitation. Every guard there is tuned to fail toward
// "do nothing", because a false positive DELETES the pin of a truck standing there
// right now. A wrong date produces a wrong PIN — bounded by `confidence`, by the
// override matrix and by `expires_at`. So this module is allowed to guess where that
// one was not, and the fallback below guesses rather than refusing.
//
// ALWAYS RESOLVES FORWARD, never into the past. A truck posts about where it will
// be; a caption naming a day that has already passed is either a retrospective or a
// spelling this module does not know, and in both cases yesterday's date is useless.
//
// FIRST MATCH WINS when a caption names several days. "Idag Heden 11-14, imorgon
// Lindholmen" is the ordinary two-day shape, and the day a post is ABOUT is the one
// it leads with — the rest is a preview. The alternative, preferring the most
// specific expression, would pick "imorgon" out of that caption and move today's
// truck to tomorrow. Stated as a choice because it is one: a caption that leads with
// a future day resolves to that day, which is this rule's cost and is bounded the
// same way every wrong date is.
//
// ⚠ A LEADING CANCELLATION TAG IS THE SHARP EDGE OF THAT RULE, and it is #80's
// problem rather than this module's. Since #78 stopped deleting tag text,
// "#StängtPåSöndag Heden 11-14 idag!" normalizes to "Stängt På Söndag Heden 11-14
// idag" — so the FIRST date word is the one the caption says the truck is CLOSED on,
// and this returns Sunday for a post about today. (Today `detectNegation` fires on
// that caption and `parseCaption` bails before the date is used, so nothing is
// mis-pinned yet; it becomes live exactly when #80 stops the negation cancelling
// today.) Fixing it here would mean teaching this module which clauses are
// cancellations — the same layering inversion `normalize.ts` refuses for the same
// reason, and precisely the comparison #80 exists to make at the `parseCaption` seam.
// Recorded so #80 treats it as a case to cover rather than discovering it again.
//
// NO EXPRESSION FOUND → `parsedAt`. The overwhelmingly common caption says where the
// truck is without saying that it means today, because that is obvious to a human
// reading it on the day it was posted.
//
// That fallback also makes the vocabulary gaps below harmless rather than merely
// unhandled. "ikväll", "inatt" and "i eftermiddag" all name a time on the day of the
// post, so falling through to `parsedAt` gives them the RIGHT date — they need no
// entry here, and `extractTime` (#58) is what reads them.
//
// KNOWN LIMITS, each costing a wrong or unhelpful date and never a deletion:
//
//   "i övermorgon"  the day after tomorrow — resolves to `parsedAt`, two days early.
//   "nästa fredag"  genuinely ambiguous in Swedish between the coming Friday and the
//                   one after it; resolves to the coming Friday, which is what the
//                   bare weekday rule gives and what many speakers mean by it.
//   "22/8", "22 augusti"
//                   explicit calendar dates are not read at all. They are rare in a
//                   caption about today, and are the natural next issue if real
//                   captions show otherwise.
//   "lör", "sön"    abbreviated weekdays. Three letters is short enough to collide
//                   with ordinary words, and "sön" is a prefix of "söndag" already.
//   "lördagsöppet"  a weekday as the FIRST ELEMENT OF A COMPOUND — "söndagsbrunch",
//   "måndagskvällen"
//                   "på måndagskvällen". These do name the day, so resolving to
//                   `parsedAt` can be a day or more early. Reaching them is not a
//                   matter of adding `s` to the inflections: `AFTER` rejects them
//                   because a letter follows, so `s` would leave every case here
//                   unmatched while breaking "i fredags" — verified, not assumed.
//                   It needs a separate rule matching a weekday as a compound
//                   PREFIX, which is a real change to what counts as a match and
//                   wants real captions behind it rather than a guess.
//
//                   ⚠ `date.test.ts` asserts these do not match. That assertion pins
//                   CURRENT behaviour and the `\p{L}`-boundary mechanism — it is not
//                   a claim that not matching is correct. The two questions are
//                   separate and an earlier version of that test ran them together:
//                   `\b` is wrong for Swedish regardless (it splits inside "söndags"
//                   at the "ö"), while whether a compound SHOULD resolve to its
//                   weekday is undecided and listed here.
//   "11-14imorgon"  a date word glued directly to a DIGIT in prose, which `BEFORE`
//                   rejects along with letters. The realistic route for that shape
//                   is a hashtag, and `normalizeCaption` splits it on the digit /
//                   letter boundary first — "#11-14imorgon" resolves correctly. The
//                   bare-prose form is what stays unmatched, and relaxing `BEFORE`
//                   to letters only would diverge from `negation.ts`'s boundary for
//                   one unlikely caption.
//
// None is guessed at now. There are zero real captions to calibrate against, and the
// phase's most expensive module is the one that modelled Swedish without them.
export function extractDate(normalized: string, parsedAt: string): string {
  const origin = toUtcMillis(parsedAt);

  // A `parsedAt` we cannot read is returned untouched. The caller owns that value
  // (#67 derives it), so this should be unreachable — but the unguarded path THROWS
  // rather than degrading: `new Date(NaN).toISOString()` is a RangeError, and this
  // module runs inside `after()`, where a throw becomes an unhandled rejection that
  // loses the post rather than storing it with a bad date.
  //
  // ⚠ WHAT THIS DOES NOT DO, stated because the guard reads like more than it is:
  // it does not make the return type safe to trust blindly. Every OTHER path returns
  // `yyyy-MM-dd`; this one returns whatever it was given, so `extractDate("imorgon",
  // "2026-13-01")` is `"2026-13-01"`. The bad value moves downstream rather than
  // being neutralised, and a `locations` insert is where it would surface instead
  // (review finding on PR #83).
  //
  // Returning `null` so the caller could set `parsing_status = 'failed'` is the
  // better shape and is deliberately NOT done here: #57 fixes the signature as
  // `: string`, and widening it is a change to the contract #66 and #67 are being
  // written against. This is a guard against a throw, not a validation layer —
  // `parsedAt` is validated where it is derived.
  if (origin === null) return parsedAt;

  const match = DATE_EXPRESSION.exec(normalized);
  if (match?.groups === undefined) return parsedAt;

  if (match.groups.today !== undefined) return parsedAt;
  if (match.groups.tomorrow !== undefined) return formatUtc(origin + DAY_MS);

  // `toLowerCase` because the `i` flag matched case-insensitively while the lookup is
  // exact, and `normalizeCaption` deliberately preserves the caption's own casing.
  //
  // ⚠ THE TWO ARE NOT THE SAME COMPARISON, which is why the `-1` is checked rather
  // than assumed away with a cast. The `iu` regex matches by Unicode CASE FOLDING
  // while `indexOf` is exact equality, and folding is the wider relation: U+017F
  // (ſ, long s) folds to "s", so "tiſdag" matches the pattern and then fails the
  // lookup. Behind the cast this module previously had, that returned index `-1`,
  // which the modulo below silently turned into a plausible WRONG weekday — Sunday
  // for a caption naming Tuesday (review finding on PR #83). Falling back to
  // `parsedAt` is the honest answer for a word we matched but cannot identify.
  const weekday = match.groups.weekday.toLowerCase();
  const target = (WEEKDAYS as readonly string[]).indexOf(weekday);
  if (target === -1) return parsedAt;

  // The nearest upcoming occurrence, where a day that IS today resolves to today
  // rather than a week out — a truck posting "Lördag 11-14" on a Saturday means this
  // Saturday. The modulo keeps the result in 0–6, so it is never in the past.
  const delta = (target - weekdayOf(origin) + 7) % 7;
  return formatUtc(origin + delta * DAY_MS);
}
