// Shared purity guard for modules that must stay pure — no database, no network,
// no clock. Test-only code: nothing in `src/app` or `src/lib` outside tests may
// import it, and its filename deliberately avoids `*.test.ts` so vitest does not
// collect it as a suite.
//
// WHY THIS IS SHARED, AND WHY IT USES THE COMPILER
//
// The plan states purity as a property of a *directory* — "no parser file imports
// supabaseAdmin, calls fetch, or calls new Date()" — and six issues each restate
// it per-file. Six hand-written guards would be six chances at the failure PR #74
// already paid for: three review rounds, three different holes, all in the same
// five-line import matcher (process-log 28–39).
//
//   /^\s*import\s/m        missed `import{x}from"y"` and `await import(…)`
//   \bimport\b + stripper  the stripper ate a real import between a `/*` inside
//                          a string and the next `*/`
//   line-anchored filter   dropped `/* c */ import { supabaseAdmin } …` entirely
//
// Each fix closed the reported hole and opened another, because matching a
// language grammar with regexes does not converge — there is always one more
// syntactic form. `ts.preProcessFile` is the scanner the TypeScript compiler uses
// to answer exactly this question, so the guard inherits TypeScript's definition
// of "an import" instead of competing with it. It sees static, dynamic, no-space,
// type-only, `export … from` and `require()` alike, and correctly ignores strings
// and comments that merely look like imports.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Purity is not one rule, so the policy is a parameter rather than a constant.
// `geo.ts` permits zero imports; parser modules legitimately import `date-fns-tz`
// and one another. Hardcoding either would make the guard wrong for the other and
// invite a second implementation — which is the thing this file exists to prevent.
export interface PurityPolicy {
  // Return true for a specifier the module must NOT import.
  forbidImport: (specifier: string) => boolean;
  // Both default to true: a module asserting purity means all three unless it
  // says otherwise, and an opt-out should have to be written down.
  forbidFetch?: boolean;
  forbidClock?: boolean;
}

// Reject any import at all — the strictest policy, used by modules that genuinely
// need nothing. Exported because "zero" is common enough to deserve a name.
export const FORBID_ALL_IMPORTS: PurityPolicy = { forbidImport: () => true };

// Build a policy that permits an explicit allowlist and rejects everything else.
// Deny-by-default: a new dependency has to be argued for in the test, which is
// where the decision is visible, rather than slipping in because nobody listed it.
export function allowOnly(allowed: readonly string[]): PurityPolicy {
  return { forbidImport: (specifier) => !allowed.includes(specifier) };
}

// The single filesystem concession, kept apart from the analysis so the mechanism
// itself can be tested against inline fixtures with no files on disk. Callers pass
// `new URL("./thing.ts", import.meta.url).href` so paths stay relative to the test.
export function readModuleSource(fileUrl: string): string {
  return readFileSync(fileURLToPath(fileUrl), "utf8");
}

// `fetch` and `Date` are GLOBALS — they need no import, so the scanner above says
// nothing about them and they need their own assertions. Matched against raw
// source with no comment stripping: requiring the call parenthesis is what keeps
// explanatory prose from tripping them, and if prose ever does trip one the result
// is a visible failure rather than a guard that has silently stopped guarding.
// That is the direction to fail in, and it is why no comment stripper belongs
// here — every stripper written for this guard so far has eaten real code.
const FETCH_CALL = /\bfetch\s*\(/;
const CLOCK_READ = /new Date\(|Date\.now\(/;

// Returns one human-readable violation per problem found, empty when clean.
// Returning strings rather than throwing lets the caller assert on the whole list,
// so a failure message names every offending specifier at once instead of
// surfacing them one rerun at a time.
export function findImpurities(source: string, policy: PurityPolicy): string[] {
  const violations: string[] = [];

  const imported = ts.preProcessFile(
    source,
    /* readImportFiles */ true,
    /* detectJavaScriptImports */ true,
  ).importedFiles;

  for (const { fileName } of imported) {
    if (policy.forbidImport(fileName)) {
      violations.push(`forbidden import: ${fileName}`);
    }
  }

  if (policy.forbidFetch !== false && FETCH_CALL.test(source)) {
    violations.push("calls fetch()");
  }

  if (policy.forbidClock !== false && CLOCK_READ.test(source)) {
    violations.push("reads the clock (new Date() or Date.now())");
  }

  return violations;
}
