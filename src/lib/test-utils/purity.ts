// Shared purity guard for modules that must stay pure — no database, no network,
// no clock. Test-only code: nothing outside tests may import it, and its filename
// deliberately avoids `*.test.ts` so vitest does not collect it as a suite.
//
// WHY THIS IS SHARED, AND WHY IT PARSES
//
// The plan states purity as a property of a *directory* — "no parser file imports
// supabaseAdmin, calls fetch, or calls new Date()" — and six issues each restate
// it per-file. Six hand-written guards would be six chances at a failure this
// project has now paid for four times over (process-log 28–39, 40–43):
//
//   /^\s*import\s/m         missed `import{x}from"y"` and `await import(...)`
//   \bimport\b + stripper   the stripper ate a real import between a `/*` inside
//                           a string and the next `*/`
//   line-anchored filter    dropped `/* c */ import { supabaseAdmin } ...` entirely
//   ts.preProcessFile       missed `export * as ns from` and every non-literal
//                           specifier — it is a fast PRE-SCANNER for module
//                           resolution, not an exhaustive import detector
//
// The first three were regexes losing to a grammar. The fourth was subtler and is
// the reason this file now parses: reaching for a compiler API was the right
// instinct, but `preProcessFile` answers "which files must I resolve", not "does
// this module import anything" — so anything it cannot resolve to a filename it
// simply omits, silently.
//
// `ts.createSourceFile` is the real parser. Detection is by NODE KIND rather than
// by text shape, which makes it exhaustive by construction: every import form is
// an `ImportDeclaration`, `ExportDeclaration`, `ImportEqualsDeclaration` or a call
// to `import`/`require`, and there is no fifth thing. It also removes the whole
// false-positive class for free — a string or comment that looks like an import is
// a `StringLiteral` or trivia, never a declaration node — so no comment stripper is
// needed, and none belongs here: every stripper written for this guard has eaten
// real code.
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
  // Both default to true: a module asserting purity means all three unless it says
  // otherwise, and an opt-out should have to be written down.
  forbidFetch?: boolean;
  forbidClock?: boolean;
}

// Reject any import at all — the strictest policy, for modules that need nothing.
export const FORBID_ALL_IMPORTS: PurityPolicy = { forbidImport: () => true };

// Permit an explicit allowlist, reject everything else. Deny-by-default is the
// point: a new dependency has to be argued for in the test, where the decision is
// visible, rather than slipping in because nobody listed it.
export function allowOnly(allowed: readonly string[]): PurityPolicy {
  return { forbidImport: (specifier) => !allowed.includes(specifier) };
}

// The single filesystem concession, kept apart from the analysis so the mechanism
// can be tested against inline fixtures with nothing on disk. Callers pass
// `new URL("./thing.ts", import.meta.url).href`, keeping paths relative to the test.
export function readModuleSource(fileUrl: string): string {
  return readFileSync(fileURLToPath(fileUrl), "utf8");
}

// Is this identifier used as a VALUE, rather than as a type or as a name that
// merely happens to match? Types are erased and cannot read a clock; `obj.Date`
// and `{ Date: ... }` are unrelated properties; a local named `Date` is a shadow,
// not the global.
//
// This is why `fetch` and `Date` need no call-shape matching at all. In `fetch(u)`,
// `new Date()` and `Date.now()` the identifier is in value position every time, so
// one check covers all three — and it also covers `const f = fetch; f()`, which
// every call-shaped pattern misses. The old regexes additionally missed `Date()`
// with no `new`, `new  Date()` and `new\nDate()`; whitespace cannot matter to a
// parser.
function isValueReference(id: ts.Identifier): boolean {
  const parent = id.parent;
  if (!parent) return false;

  // Type positions: `d: Date`, and `A.B` inside a type.
  if (ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)) return false;
  // Property NAMES: `obj.Date`, `{ Date: x }`, `interface { Date: T }`.
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === id) return false;
  if (ts.isPropertySignature(parent) && parent.name === id) return false;
  // Import/export clause names: `import { Date } from ...` is an import violation,
  // reported by the import walk — not separately as a clock read.
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  // Declaration names: `const Date = ...`, `function fetch() {}`, `(fetch) => ...`.
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent)) &&
    parent.name === id
  ) {
    return false;
  }
  return true;
}

// A specifier we cannot read statically — `await import(someVar)`. It is a real
// import whose target is unknowable at parse time, so no policy can clear it.
// Reported under every policy: unverifiable is not the same as absent, and
// treating it as absent is exactly how `preProcessFile` came to miss it.
const NON_LITERAL = "<non-literal specifier>";

function specifierOf(node: ts.Expression | undefined): string {
  return node && ts.isStringLiteral(node) ? node.text : NON_LITERAL;
}

// Returns one human-readable violation per problem found, empty when clean.
// Returning strings rather than throwing lets the caller assert on the whole list,
// so a failure names every offending specifier at once instead of surfacing them
// one rerun at a time.
export function findImpurities(source: string, policy: PurityPolicy): string[] {
  const sourceFile = ts.createSourceFile(
    "module.ts",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const violations: string[] = [];

  const recordImport = (specifier: string) => {
    if (specifier === NON_LITERAL || policy.forbidImport(specifier)) {
      violations.push(`forbidden import: ${specifier}`);
    }
  };

  const visit = (node: ts.Node): void => {
    // `import ... from "x"`, `export ... from "x"`, `export * as ns from "x"` —
    // every one of these is a declaration carrying a moduleSpecifier.
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      recordImport(specifierOf(node.moduleSpecifier));
    }

    // `import db = require("x")` — TypeScript's own CJS interop form.
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      recordImport(specifierOf(node.moduleReference.expression));
    }

    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        recordImport(specifierOf(node.arguments[0]));
      }
    }

    if (ts.isIdentifier(node) && isValueReference(node)) {
      if (policy.forbidFetch !== false && node.text === "fetch") {
        violations.push("uses fetch");
      }
      if (policy.forbidClock !== false && node.text === "Date") {
        violations.push("uses Date (clock read)");
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return violations;
}
