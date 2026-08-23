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
// `ts.createSourceFile` is the real parser. It also removes the whole
// false-positive class for free — a string or comment that looks like an import is
// a `StringLiteral` or trivia, never a declaration node — so no comment stripper is
// needed, and none belongs here: every stripper written for this guard has eaten
// real code.
//
// THE TWO HALVES HAVE DIFFERENT STRENGTHS. Saying so precisely, because an earlier
// version of this comment claimed one guarantee for both and that over-claim was
// itself a review finding:
//
//   IMPORTS are exhaustive BY CONSTRUCTION. Every import form is an
//   `ImportDeclaration`, `ExportDeclaration`, `ImportEqualsDeclaration`, or a call
//   to `import`/`require`. That is a closed set in the grammar, so "is there
//   another form" has a structural answer rather than an empirical one.
//
//   GLOBALS are NAME-BASED, and cannot be otherwise without a TypeChecker. We match
//   the identifiers `fetch` and `Date`, resolved through the global namespace
//   objects, and we deliberately bias to FALSE POSITIVES: a module that shadows
//   `fetch` with its own binding and uses it will fail this guard. That is the loud
//   direction and it is acceptable here — no pure parser module has any reason to
//   name a local `fetch` or `Date`, and a spurious failure is a five-second read of
//   the message, whereas a silent miss is what this whole file exists to prevent.
//   The known limits are listed at `isClockRead` and `isValueReference`.
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

// The global namespace objects. `globalThis.fetch(...)` and `window.Date.now()`
// are the same reads as the bare forms, and an earlier version missed all of them:
// the property-name exclusion below (added so `config.Date` would not fire)
// swallowed the identifier whenever a global was reached through a namespace.
const GLOBAL_NAMESPACES = new Set(["globalThis", "window", "self", "global"]);

// Resolve an expression to the global identifier it denotes, or null.
// `Date` → "Date"; `globalThis.Date` → "Date"; `config.Date` → null.
function globalNameOf(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (
    ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    GLOBAL_NAMESPACES.has(expr.expression.text)
  ) {
    return expr.name.text;
  }
  return null;
}

// Does this node read the CLOCK, as opposed to merely mentioning `Date`?
//
// The distinction is load-bearing and an earlier version got it wrong. `new
// Date(parsedAt)` is deterministic string parsing — it is precisely what the parser
// modules will do, since they receive `parsedAt` and must convert it — while `new
// Date()` with no arguments reads the current time. Flagging both left one escape,
// `forbidClock: false`, which also permits `Date.now()`; the first parser module to
// land would have disabled clock detection wholesale to get its own legitimate
// conversion through. A guard that forces its own disabling is worse than none.
//
//   new Date()      → clock      new Date(x)   → deterministic
//   Date()          → clock, ALWAYS: called as a function, Date ignores its
//                     arguments and returns the current time string
//   Date.now()      → clock      Date.parse(x) → deterministic
//                                Date.UTC(...) → deterministic
function isClockRead(node: ts.Node): boolean {
  // `new Date()` — no arguments. `new Date(x)` is deterministic.
  if (ts.isNewExpression(node)) {
    return globalNameOf(node.expression) === "Date" && (node.arguments?.length ?? 0) === 0;
  }

  if (ts.isCallExpression(node)) {
    // `Date(...)` as a plain call returns the current time whatever it is passed.
    if (globalNameOf(node.expression) === "Date") return true;
    // `Date.now()`, but not `Date.parse` / `Date.UTC`.
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "now" &&
      globalNameOf(node.expression.expression) === "Date"
    ) {
      return true;
    }
  }

  return false;
}

// Is this identifier used as a VALUE, rather than as a type or as a name that
// merely happens to match? Types are erased and cannot read a clock; `obj.Date`
// and `{ Date: x }` are unrelated properties.
//
// This catches the ALIASING forms that no call-shape pattern can — `const f =
// fetch; f()`, `const D = Date; new D()`, `register(fetch)` — because there the
// identifier stands alone in value position. Call and constructor positions are
// excluded here and handled by `isClockRead` instead, which is what lets `new
// Date(parsedAt)` through while still catching `new Date()`.
//
// KNOWN LIMIT, accepted deliberately: this is name matching, not symbol
// resolution. A module that declares its own `fetch` or `Date` and USES it will be
// reported, because distinguishing a shadow from the global needs a TypeChecker.
// The failure is loud and the message names the identifier, and no pure parser
// module has reason to bind either name — so the cost is a rename, and the
// alternative (a Program and lib resolution per file) is not worth it here.
function isValueReference(id: ts.Identifier): boolean {
  const parent = id.parent;
  if (!parent) return false;

  // Type positions: `d: Date`, `typeof Date`, and `A.B` inside a type.
  if (ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)) return false;
  if (ts.isTypeQueryNode(parent)) return false;
  // Property NAMES: `obj.Date`, `{ Date: x }`, `interface { Date: T }`.
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === id) return false;
  if (ts.isPropertySignature(parent) && parent.name === id) return false;
  // Import/export clause names: `import { Date } from ...` is an import violation,
  // reported by the import walk — not separately as a clock read.
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  // Call and constructor positions — `isClockRead` owns these, because whether
  // they read the clock depends on the arguments.
  if (ts.isCallExpression(parent) && parent.expression === id) return false;
  if (ts.isNewExpression(parent) && parent.expression === id) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === id) return false;
  // Declaration names: `const Date = ...`, `function fetch() {}`, `get Date()`,
  // `enum E { Date }`, `interface I { fetch(): void }`.
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent) ||
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

  // A file that does not parse yields an EMPTY tree, and `createSourceFile` does
  // not throw — so before this check a single stray backtick made the guard return
  // `[]` for a module containing a real `supabaseAdmin` import and `Date.now()`.
  // Silently guarding nothing is the exact failure mode this file exists to
  // prevent, so a parse error is itself a violation. It also covers the ScriptKind
  // assumption below: `.tsx` input parsed as `.ts` surfaces here rather than
  // quietly under-reporting.
  const parseErrors = (sourceFile as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (parseErrors && parseErrors.length > 0) {
    const first = ts.flattenDiagnosticMessageText(parseErrors[0].messageText, " ");
    violations.push(`source does not parse, so nothing could be checked: ${first}`);
  }

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
      // `require(...)`, and also `module.require(...)` / `globalThis.require(...)`,
      // which the bare-identifier check missed.
      const isRequire =
        globalNameOf(node.expression) === "require" ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "require" &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "module");
      if (isDynamicImport || isRequire) {
        recordImport(specifierOf(node.arguments[0]));
      }

      if (policy.forbidFetch !== false && globalNameOf(node.expression) === "fetch") {
        violations.push("uses fetch");
      }
    }

    if (policy.forbidClock !== false && isClockRead(node)) {
      violations.push("uses Date (clock read)");
    }

    // Standalone value references — the aliasing forms. Call and constructor
    // positions are excluded by `isValueReference` and handled above.
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

  // One violation per distinct problem, as documented. Two `Date.now()` calls are
  // the same finding twice, and a caller asserting on the list should not have to
  // count occurrences. Distinct specifiers stay distinct because the specifier is
  // part of the string.
  return [...new Set(violations)];
}
