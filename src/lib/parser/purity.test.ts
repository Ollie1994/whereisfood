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
//   `date-fns-tz`        NOT added, though #57 predicted it would be. `date.ts`
//                        turned out to need no date library: it converts between two
//                        calendar dates, never between an instant and a wall clock,
//                        and every operation it performs has the same answer in
//                        every timezone. Anchoring a date to an invented time of day
//                        purely to satisfy the prediction would have ADDED the DST
//                        edge cases it was meant to avoid. The reasoning is in
//                        `date.ts`'s header. #58 and #67 are where it genuinely
//                        belongs, since those turn a date plus a time into an
//                        instant — expect this line to change then.
const PARSER_POLICY = allowOnly(["@/lib/parser/date"]);

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
