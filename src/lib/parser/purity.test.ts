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
//   `@/lib/parser/time`  Added by #65 review. `address.ts` imports `RANGE_SEPARATOR`
//                        and `NOT_IN_NUMBER_AFTER` because the digits after a street
//                        name are CONTESTED between the two modules — "Kungsgatan
//                        11-14" is a street and a time window, and whichever module
//                        takes those digits, the other must not. `address.ts` shipped
//                        its own separator class and it had already drifted (no em
//                        dash, no `till`), so the guard failed on exactly the inputs
//                        it named. Also inside the directory.
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
//                        NOTE for #67: an earlier version of this comment predicted
//                        that composing the parser "should need nothing new". That
//                        was wrong — `parseCaption()` returns `ParseResult`, which
//                        lives in the same module, so #67 needed this entry too and
//                        #62 merely got here first.
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
const PARSER_POLICY = allowOnly([
  "@/lib/parser/boundary",
  "@/lib/parser/date",
  "@/lib/parser/dictionary",
  "@/lib/parser/time",
  "@/lib/types",
  "date-fns-tz",
]);

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

  it.each(modules)("%s imports nothing forbidden, and never touches the network or clock", (name) => {
    const violations = findImpurities(
      readModuleSource(new URL(name, import.meta.url).href),
      PARSER_POLICY,
    );

    expect(violations).toEqual([]);
  });
});
