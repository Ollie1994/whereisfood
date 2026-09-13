import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { allowOnly, findImpurities, readModuleSource } from "@/lib/test-utils/purity";

// The parser's purity guarantee, asserted over the DIRECTORY rather than per file.
//
// The plan states it that way — "No parser file imports supabaseAdmin, calls fetch,
// or calls new Date() — verified by test, not by inspection" — and a per-file check
// cannot satisfy that sentence: it only ever covers files whose author remembered to
// write one. This glob covers files that do not exist yet, so #57, #58, #65, #66 and
// #67 inherit it with no purity code of their own.
//
// The mechanism lives in `@/lib/test-utils/purity` (issue #75) and is verified
// adversarially there against every import form that defeated an earlier version of
// it. Nothing in this file re-implements any part of that — the whole point of #75
// being its own issue was that re-deriving this check is what cost PR #74 and #76
// seven review rounds between them.

const PARSER_DIR = fileURLToPath(new URL(".", import.meta.url));

// What a parser module may import. DENY BY DEFAULT: `allowOnly` rejects anything
// absent from this list, so adding a dependency means editing this line — which is
// where that decision should be visible and argued, rather than in an import
// statement nobody reads again.
//
// It grows as modules land, and each addition should be a deliberate edit rather
// than a surprise. What is on it now, and one thing that is deliberately NOT:
//
//   `@/lib/parser/date`  `negation.ts` imports the weekday table and its inflection
//                        suffixes from `date.ts` (#57), which owns them. Two
//                        hand-maintained lists of Swedish weekdays drift, and a
//                        drifted one fails silently.
//
//   `date-fns-tz`        Added by #58, at the seam #57 predicted it would belong to
//                        rather than the one it was originally written against.
//                        `date.ts` needs no date library — it converts between two
//                        calendar dates, never between an instant and a wall clock,
//                        and every operation it performs has the same answer in
//                        every timezone. `time.ts` is the opposite case: "11:00 in
//                        Gothenburg" is 09:00Z in August and 10:00Z in January, so
//                        the offset is the whole problem and `fromZonedTime` is what
//                        solves it. Same package, one layer down, and the layer is
//                        what the allowlist is for.
//
//   `@/lib/parser/boundary`
//                        Added by #65. `BEFORE`, `AFTER`, `alt` and `escapeRegex`
//                        were written in `negation.ts` (#56) and moved when
//                        `location.ts` became the second consumer — the same call
//                        already made for the weekday table, and made for the same
//                        reason: two hand-maintained copies of an ASCII-unsafe
//                        boundary drift, and a drifted one fails silently on exactly
//                        the Swedish compounds it exists to handle.
//
//                        INSIDE this directory, so it inherits the glob rather than
//                        extending the guard's reach — it is one more module checked,
//                        not an outward edge. Contrast `@/lib/types` below.
//
//   `@/lib/parser/dictionary`
//                        Added by #65. `location.ts` matches against `DICTIONARY`;
//                        that IS the module's job. Also inside the directory.
//
//   `@/lib/parser/time`  Added by #65 review. `address.ts` imports `CLOCK_JOINER` and
//                        `NOT_IN_NUMBER_AFTER` because the digits after a street name
//                        are CONTESTED between the two modules — "Kungsgatan 11-14"
//                        is a street and a time window, and whichever module takes
//                        those digits, the other must not.
//
//                        This edge was earned twice. `address.ts` first hand-wrote
//                        its own separator class, already drifted (no em dash, no
//                        `till`). The fix imported `RANGE_SEPARATOR` and reassembled
//                        the guard locally, WITHOUT `REPEATED_MARKER` — so "Kungsgatan
//                        11 - kl 14" was claimed by both modules, by the very fix for
//                        that class. `CLOCK_JOINER` is now the composition rather than
//                        its parts, which is what ended it: importing the pieces of a
//                        construction is not sharing the construction.
//
//                        Also inside the directory, so it is one more module checked
//                        rather than an outward edge.
//
//   `@/lib/types`        Added by #62. `dictionary.ts` is typed against
//                        `DictionaryEntry`, which the plan's Files table places in
//                        `types.ts` alongside `ParseResult` and `NewLocation`.
//
//                        WHY THIS IS SAFE, stated rather than assumed: `types.ts`
//                        exports only types and interfaces and its own single
//                        import is `import type { Database }`, so the whole module
//                        is erased at compile time and the emitted JS imports
//                        nothing. It cannot reach a database or a clock because it
//                        contains no runtime code to do so with.
//
//                        WHY IT IS STILL LISTED HERE. The guard is syntactic — it
//                        rejects `import type` and `import("x").T` exactly like a
//                        value import, on the argument that a dependency only a
//                        type refers to is still a dependency in the source. That
//                        is the right default, and the cost of it is this entry:
//                        one deliberate line, which is where the decision is
//                        visible. `geo.test.ts` makes the same call for the
//                        stricter FORBID_ALL_IMPORTS policy.
//
//                        NOTE, now settled by #67: an earlier version of this comment
//                        predicted that composing the parser "should need nothing
//                        new". It was wrong twice over. `parseCaption()` returns
//                        `ParseResult`, which lives in this module — so #67 needed
//                        this entry and #62 merely got here first — and composing the
//                        directory meant importing every module in it, which is the
//                        five entries above.
//
//                        ⚠ #67 ALSO ADDED AN EDGE IN THE OTHER DIRECTION, which is
//                        the part worth reading twice: `types.ts` now carries
//                        `import type { ExtractedTime } from "@/lib/parser/time"`, so
//                        the two modules reference each other at the type level. The
//                        obligation recorded below is unaffected — it is about a claim
//                        stopping at an UNASSERTED file, and both ends here are
//                        asserted, this glob covering `time.ts` and `types.test.ts`
//                        covering `types.ts`. Neither is `import type`-erased out of
//                        the guard's sight either: this guard rejects `import type`
//                        exactly like a value import, which is why the entry exists.
//
// ⚠ THIS GUARD IS NOT TRANSITIVE, and `@/lib/types` is the first entry where that
// matters. The glob below covers `src/lib/parser/`; an allowlisted module OUTSIDE
// that directory is checked by nothing here, so the parser's purity claim is only
// as strong as whatever guards the far end. Appending `Date.now()` to `types.ts`
// leaves this suite green at 6/6 — verified, not assumed.
//
// `src/lib/types.test.ts` closes it, asserting `types.ts` and the generated
// `database.types.ts` it imports. Making the guard itself follow imports would mean
// module resolution and a `ts.Program` per file, which is the weight #75 chose not
// to take on and which two files do not justify.
//
// SO: ADDING AN OUTWARD EDGE TO THIS LIST INCURS AN OBLIGATION. If a parser module
// ever needs a third external import, either assert that module's purity too or
// accept — in writing, here — that the claim now stops at it.
const EXTRACTOR_IMPORTS = [
  "@/lib/parser/boundary",
  "@/lib/parser/date",
  "@/lib/parser/dictionary",
  "@/lib/parser/time",
  "@/lib/types",
  "date-fns-tz",
];

// ⚠ THE COMPOSER GETS ITS OWN LIST, AND THE SPLIT IS THE WHOLE POINT.
//
// `index.ts` imports every extractor in this directory, because calling them in order
// IS its job. A first version of #67 simply appended those five specifiers to the
// single shared list above — which is not the same statement at all. One list applied
// to ten modules says "ANY parser module may import any of these", so widening it for
// the composer silently granted the same permission to every extractor.
//
// That was a REAL loss of guard strength, not a theoretical one, and it landed on the
// exact edge the next issue forbids. #80's body states: *"Step 0 must not be taught
// the negation vocabulary. Narrowing this in `normalizeCaption` would invert the
// layering — hence the dependency on `extractDate`."* Verified by mutation, both ways:
// appending `import { detectNegation } from "@/lib/parser/negation"` to
// `normalize.ts` FAILS against the list as it stands on `dev` and PASSED against the
// merged single list. #80 is about to edit `negation.ts` and `index.ts`, so the guard
// against the wrong fix would have been gone at precisely the moment it was needed.
//
// The lesson, which is the one this list's deny-by-default comment already states and
// which the merged version quietly broke: an allowlist is a record of WHO may depend
// on WHAT. Answering "may `index.ts` import `negation.ts`?" by editing a list that
// also answers "may `normalize.ts`?" is not answering the question asked.
const COMPOSED_EXTRACTORS = [
  "@/lib/parser/address",
  "@/lib/parser/confidence",
  "@/lib/parser/location",
  "@/lib/parser/negation",
  "@/lib/parser/normalize",
];

// The composer, by filename. `parserModules()` returns paths relative to this
// directory, so this is the exact string that arrives below.
const COMPOSER = "index.ts";

// ⚠ NO CLOSURE CLAIM HERE, and the deleted one is why. A first version of this
// comment said the list was "closed over the parser: every remaining module is here".
// It was not — `index.ts` itself is absent from both lists, correctly, since nothing
// imports the composer. A tidy-sounding invariant asserted over a list nobody
// recounted, which is the same shape as the two absence claims logged against #66.
function policyFor(module: string) {
  return allowOnly(
    module === COMPOSER ? [...EXTRACTOR_IMPORTS, ...COMPOSED_EXTRACTORS] : EXTRACTOR_IMPORTS,
  );
}

// RECURSIVE, deliberately. A flat `readdirSync` would let a module in a
// subdirectory — `dictionary/index.ts`, `rules/time.ts` — escape the guard entirely
// while this suite stayed green, which is the same silent-pass failure the
// non-vacuity assertion below exists to prevent, just one directory down. Paths are
// returned relative to PARSER_DIR so the test name says where the module lives.
function parserModules(dir = PARSER_DIR, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        return parserModules(`${dir}${entry.name}/`, `${relative}/`);
      }
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [relative] : [];
    })
    .sort();
}

describe("every module in src/lib/parser is pure", () => {
  const modules = parserModules();

  it("finds parser modules to check", () => {
    // NOT redundant with the assertions below. `it.each([])` on an empty list
    // registers no tests, so without this the suite passes green while checking
    // nothing — the exact failure logged as process-log row 43, where a fixture
    // that never engaged the code under test occupied the slot where the real
    // test would go. This is the assertion that makes the rest non-vacuous.
    expect(modules.length).toBeGreaterThan(0);
  });

  it("finds the composer, so its carve-out is not applied to a file that moved", () => {
    // `policyFor` keys on a filename, and a filename is a string that can go stale —
    // renaming `index.ts` would silently demote it to the extractor policy and fail
    // every import it legitimately has. That failure is at least loud. The quiet one
    // is the reverse: if this constant ever named a file that does NOT exist, the
    // carve-out would apply to nothing while reading as though it applied to
    // something. Same non-vacuity argument as the assertion above.
    expect(modules).toContain(COMPOSER);
  });

  it.each(modules)("%s imports nothing forbidden, and never touches the network or clock", (name) => {
    const violations = findImpurities(
      readModuleSource(new URL(name, import.meta.url).href),
      policyFor(name),
    );

    expect(violations).toEqual([]);
  });
});
