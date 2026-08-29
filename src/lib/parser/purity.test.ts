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
// Empty today because `normalize.ts` and `negation.ts` need nothing at all. It grows
// as modules land: `date-fns-tz` for #57/#58, `@/lib/parser/dictionary` for #65.
// Each addition should be a deliberate edit, not a surprise.
const PARSER_POLICY = allowOnly([]);

function parserModules(): string[] {
  return readdirSync(PARSER_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
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
