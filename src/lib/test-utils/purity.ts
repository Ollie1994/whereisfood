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
//   IMPORTS are exhaustive over a set the GRAMMAR closes — but the set is bigger
//   than it looks, and an earlier version of this comment asserted closure while
//   missing `ImportType` (`type P = import("x").T`). So the claim is no longer
//   made in prose: `purity.test.ts` enumerates every `ts.SyntaxKind` whose name
//   mentions Import/Require/ExternalModule and fails if one is neither handled
//   here nor listed there as carrying no specifier of its own. A TypeScript
//   upgrade that adds a form breaks that test instead of quietly opening a hole.
//   That is what "structural" has to mean to be worth saying: checkable, not
//   asserted.
//
//   GLOBALS are NAME-BASED, and cannot be otherwise without a TypeChecker. We
//   resolve expressions to the global they denote — through namespace objects,
//   member access and the wrappers TypeScript erases — and deny unless the use is
//   on a closed deterministic allowlist. We deliberately bias to FALSE POSITIVES:
//   a module that shadows `fetch` with its own binding and uses it will fail this
//   guard. That is the loud direction and it is acceptable here — no pure parser
//   module has reason to bind either name, and a spurious failure costs a rename,
//   whereas a silent miss is what this whole file exists to prevent.
//
//   KNOWN LIMIT — DATAFLOW. Resolution is syntactic, so a global laundered through
//   a variable escapes: `const r = require; r("@/lib/db")` and
//   `const g = globalThis; g.fetch(u)` are not detected. Following those needs a
//   TypeChecker and a `Program` per file. Not built, because the modules this
//   covers are small and pure by intent — the guard exists to catch a dependency
//   added without thinking, not to defeat someone routing around it. Stated here
//   so it is a documented boundary rather than a hole discovered later.
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

// The globals we care about. Anything reached FROM one of these is reached from
// the network or the clock, whatever syntax gets you there.
const WATCHED_GLOBALS = new Set(["fetch", "Date"]);

// Resolve an expression to the global entity it denotes, or null. This is the
// whole globals mechanism, and it replaced an enumeration of usage shapes.
//
//   fetch                 → "fetch"        globalThis.fetch → "fetch"
//   Date                  → "Date"         window.Date      → "Date"
//   Date.now              → "Date.now"     fetch.bind       → "fetch.bind"
//   config.Date           → null           obj.fetch        → null
//
// WHY RESOLUTION RATHER THAN EXCLUSION. The previous version excluded property
// accesses outright and then re-added three specific call shapes, so it caught
// `globalThis.fetch(u)` but not `const f = globalThis.fetch`, and `Date.now()` but
// not `const n = Date.now`. Both are the same read. Enumerating the shapes a value
// can be used in is an open-ended list — call, new, alias, `.call`, `.bind`,
// destructure, pass as an argument — and every version of this guard that tried to
// enumerate something eventually missed a member of it.
//
// So the default is inverted. Resolve what an expression DENOTES, then deny unless
// it is on the deterministic allowlist below. That list is closed because the Date
// API is closed: `Date.parse` and `Date.UTC` are the only static members that do
// not read the clock. New syntax for reaching a global needs no change here.
// Strip the wrappers that are transparent at runtime. `(globalThis).fetch`,
// `globalThis!.fetch` and `(globalThis as Window).fetch` are all `globalThis.fetch`,
// and an earlier version resolved none of them because it matched node kinds
// without unwrapping first. This is a closed set: these are the expression forms
// TypeScript erases entirely.
function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr;
  for (;;) {
    if (
      ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    return current;
  }
}

// The member name a property or element access reads, or null when the key is not
// a literal. `x.fetch` → "fetch"; `x["fetch"]` → "fetch"; `x[k]` → null.
// Element access is included because `globalThis["fetch"]` is the same read as
// `globalThis.fetch`, and only one of the two was previously resolved.
function memberNameOf(expr: ts.Expression): { base: ts.Expression; name: string } | null {
  const node = unwrap(expr);
  if (ts.isPropertyAccessExpression(node)) {
    return { base: node.expression, name: node.name.text };
  }
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
    return { base: node.expression, name: node.argumentExpression.text };
  }
  return null;
}

function denotedGlobal(expr: ts.Expression): string | null {
  const node = unwrap(expr);

  if (ts.isIdentifier(node)) {
    return WATCHED_GLOBALS.has(node.text) ? node.text : null;
  }

  const member = memberNameOf(node);
  if (member) {
    const base = unwrap(member.base);
    // `globalThis.fetch`, `window["Date"]` — the namespace object is transparent.
    if (ts.isIdentifier(base) && GLOBAL_NAMESPACES.has(base.text)) {
      return WATCHED_GLOBALS.has(member.name) ? member.name : null;
    }
    // A member of something that already denotes a global: `Date.now`,
    // `fetch.bind`, `globalThis.Date.now`.
    const baseGlobal = denotedGlobal(base);
    return baseGlobal ? `${baseGlobal}.${member.name}` : null;
  }

  return null;
}

// Is this callee `require`, however it was reached? `require(...)`,
// `module.require(...)`, `globalThis.require(...)`. Same resolution idea as
// `denotedGlobal`, kept separate because require is an import concern, not a
// watched global.
function isRequireCallee(expr: ts.Expression): boolean {
  const node = unwrap(expr);
  if (ts.isIdentifier(node)) return node.text === "require";
  const member = memberNameOf(node);
  if (member && member.name === "require") {
    const base = unwrap(member.base);
    return (
      ts.isIdentifier(base) && (GLOBAL_NAMESPACES.has(base.text) || base.text === "module")
    );
  }
  return false;
}

// The only Date members that do not read the clock. Closed set — this is the whole
// deterministic surface of the Date constructor object.
const DETERMINISTIC_DATE_MEMBERS = new Set(["Date.parse", "Date.UTC"]);

// `new Date(x)` is deterministic parsing; `new Date()` reads the clock. A spread
// argument is treated as a clock read because an empty spread makes it one and
// nothing here can prove otherwise.
function isDeterministicConstruction(node: ts.NewExpression): boolean {
  const args = node.arguments;
  if (!args || args.length === 0) return false;
  return !args.some((arg) => ts.isSpreadElement(arg));
}

// Is this node in a position where it denotes a runtime VALUE, rather than a type
// or a name that merely happens to match? Types are erased and cannot read a clock;
// `obj.Date` and `{ Date: x }` are unrelated properties.
//
// KNOWN LIMIT, accepted deliberately: this is name matching, not symbol
// resolution. A module that declares its own `fetch` or `Date` and USES it will be
// reported, because distinguishing a shadow from the global needs a TypeChecker.
// The failure is loud and the message names the identifier, and no pure parser
// module has reason to bind either name — so the cost is a rename, and the
// alternative (a Program and lib resolution per file) is not worth it here.
function isValuePosition(node: ts.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // Type positions: `d: Date`, `typeof Date`, and `A.B` inside a type.
  if (ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)) return false;
  if (ts.isTypeQueryNode(parent)) return false;
  // Property NAMES: `obj.Date`, `{ Date: x }`, `interface { Date: T }`. The
  // property ACCESS itself is resolved by `denotedGlobal`; the bare name node is
  // never the thing to judge.
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
  if (ts.isPropertySignature(parent) && parent.name === node) return false;
  // Import/export names: `import Date from "./x"` is an import violation, reported
  // by the import walk — not additionally as a clock read.
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
  if (ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false;
  if (ts.isNamespaceExport(parent)) return false;
  // Type DECLARATIONS that happen to use the name: `interface Date {}`,
  // `type Date = string`. Declaring a type called Date reads no clock.
  if (
    (ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)) &&
    parent.name === node
  ) {
    return false;
  }
  // `class C implements Date {}` — a heritage clause in type position.
  if (
    parent.parent !== undefined &&
    ts.isExpressionWithTypeArguments(parent) &&
    ts.isHeritageClause(parent.parent) &&
    parent.parent.token === ts.SyntaxKind.ImplementsKeyword
  ) {
    return false;
  }
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
    parent.name === node
  ) {
    return false;
  }
  return true;
}

// The enclosing node, seeing through the wrappers TypeScript erases. `new (Date)()`
// must be judged as `new Date()`, so the parent that matters is the NewExpression,
// not the parentheses.
function effectiveParent(node: ts.Node): ts.Node | undefined {
  let current = node.parent;
  while (
    current !== undefined &&
    (ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.parent;
  }
  return current;
}

// Is this node merely the base of a larger expression that itself denotes a
// global? `Date` inside `Date.now` is, so it is judged once as `Date.now` rather
// than twice — which matters because `Date` alone is a clock read while
// `Date.parse` is not.
function isBaseOfLargerDenotation(node: ts.Expression): boolean {
  const parent = effectiveParent(node);
  if (
    parent === undefined ||
    !(ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent))
  ) {
    return false;
  }
  return unwrap(parent.expression) === node && denotedGlobal(parent) !== null;
}

// Classify one expression that denotes a watched global. Deny by default: the
// caller has already established this expression IS the global, so the only
// question is whether this particular use is one of the deterministic exceptions.
function classifyGlobalUse(node: ts.Expression, denoted: string): "fetch" | "clock" | null {
  // Anything reached from `fetch` is the network: the bare value, a call,
  // `fetch.bind(...)`, `fetch.call(...)`, an alias, an argument.
  if (denoted === "fetch" || denoted.startsWith("fetch.")) return "fetch";

  if (denoted === "Date") {
    const parent = effectiveParent(node);
    // `new Date(x)` — deterministic parsing, and precisely what the parser
    // modules do with the `parsedAt` they are handed. `new Date()` is a clock read.
    if (parent && ts.isNewExpression(parent) && unwrap(parent.expression) === node) {
      return isDeterministicConstruction(parent) ? null : "clock";
    }
    // Everything else — `Date()` (which ignores its arguments and returns the
    // current time), a bare alias, an argument, a destructure — is a clock read.
    return "clock";
  }

  // A member of Date: allowed only if it is one of the two deterministic ones.
  return DETERMINISTIC_DATE_MEMBERS.has(denoted) ? null : "clock";
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

    // `type P = import("x").Post` — a type-position import. Erased at compile time
    // like `import type`, and rejected for the same reason: this guard's callers
    // decide what a module may depend on, and a dependency that only a type refers
    // to is still a dependency in the source. Missed until review because it is a
    // TYPE node, so it was not among the declaration kinds being walked — which is
    // why the completeness of that set is now asserted by a test rather than
    // claimed in a comment.
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      recordImport(
        ts.isStringLiteral(node.argument.literal) ? node.argument.literal.text : NON_LITERAL,
      );
    }

    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      // `require(...)`, and also `module.require(...)` / `globalThis.require(...)`,
      // which the bare-identifier check missed.
      const isRequire = isRequireCallee(node.expression);
      if (isDynamicImport || isRequire) {
        recordImport(specifierOf(node.arguments[0]));
      }
    }

    // Globals. Every expression that RESOLVES to a watched global is judged, in
    // whatever position it appears — no enumeration of call shapes.
    // Identifier, `x.y` and `x["y"]` are the three shapes an expression can have
    // that denote a global. Element access belongs here because `globalThis["fetch"]`
    // is the same read as `globalThis.fetch`, and omitting it both missed that and
    // made `Date["parse"]` report a spurious clock read — the base identifier was
    // judged alone because nothing judged the whole access.
    if (
      ts.isIdentifier(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      if (!isBaseOfLargerDenotation(node) && isValuePosition(node)) {
        const denoted = denotedGlobal(node);
        const use = denoted ? classifyGlobalUse(node, denoted) : null;
        if (use === "fetch" && policy.forbidFetch !== false) {
          violations.push("uses fetch");
        }
        if (use === "clock" && policy.forbidClock !== false) {
          violations.push("uses Date (clock read)");
        }
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
