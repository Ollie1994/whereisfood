import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  allowOnly,
  findImpurities,
  FORBID_ALL_IMPORTS,
  type PurityPolicy,
} from "@/lib/test-utils/purity";

// This suite is the reason the helper exists. Four review rounds produced four
// different holes in four versions of this guard, each fix closing the reported
// hole and opening another. Every form that beat a previous version is pinned here
// as a fixture, so the mechanism is verified adversarially ONCE and never
// re-derived per module.
//
// Fixtures are inline source strings rather than real files: the analysis takes
// text, so the mechanism is testable with nothing on disk, and a fixture that
// would crash on import (supabase throws on missing env) can still be expressed.
const DB = "@/lib/db/posts";
const FORBIDDEN = `forbidden import: ${DB}`;
const NON_LITERAL = "forbidden import: <non-literal specifier>";

describe("findImpurities — import forms", () => {
  // Each of these is a real import with real side effects at module load.
  const IMPORT_FORMS: ReadonlyArray<[label: string, source: string]> = [
    ["plain named import", `import { supabaseAdmin } from "${DB}";`],
    ["no-space import", `import{supabaseAdmin}from"${DB}";`],
    ["default import", `import db from "${DB}";`],
    ["namespace import", `import * as db from "${DB}";`],
    ["bare side-effect import", `import "${DB}";`],
    ["dynamic import", `const d = await import("${DB}");`],
    ["re-export", `export { supabaseAdmin } from "${DB}";`],
    ["export star", `export * from "${DB}";`],
    // Missed by ts.preProcessFile, which is why this file parses instead. It
    // loads the module and runs its side effects like any other import.
    ["export star as namespace", `export * as db from "${DB}";`],
    ["export type from", `export type { Post } from "${DB}";`],
    ["import equals require", `import db = require("${DB}");`],
    ["inline block comment then import", `/* eslint-disable */ import { x } from "${DB}";`],
    ["type-only import", `import type { Post } from "${DB}";`],
    ["require()", `const db = require("${DB}");`],
    ["multi-line import", `import {\n  supabaseAdmin,\n} from "${DB}";`],
    // A TYPE-position import. Missed until review round 4 because the walk covered
    // declaration kinds and this is a type node — the gap that moved the
    // completeness claim out of prose and into the SyntaxKind test below.
    ["import type node", `type P = import("${DB}").Post;`],
    ["globalThis.require()", `const db = globalThis.require("${DB}");`],
  ];

  it.each(IMPORT_FORMS)("catches a %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([FORBIDDEN]);
  });

  it("names the offending specifier so a failure is actionable without a rerun", () => {
    const source = `import { a } from "${DB}";\nimport { b } from "@/lib/supabase";`;
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([
      FORBIDDEN,
      "forbidden import: @/lib/supabase",
    ]);
  });
});

describe("findImpurities — unresolvable specifiers", () => {
  // A specifier that cannot be read statically is a real import whose target is
  // unknowable at parse time. Reporting it under EVERY policy is deliberate:
  // unverifiable is not the same as absent, and treating it as absent is exactly
  // how the previous version came to miss it.
  const UNRESOLVABLE: ReadonlyArray<[label: string, source: string]> = [
    ["dynamic import of a variable", `const s = "${DB}"; const d = await import(s);`],
    ["require of a variable", `const s = "${DB}"; const d = require(s);`],
    ["dynamic import of a computed string", `const d = await import("@/lib/" + "db");`],
  ];

  it.each(UNRESOLVABLE)("catches %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([NON_LITERAL]);
  });

  it("rejects an unresolvable specifier even under a permissive allowlist", () => {
    // No allowlist can clear what it cannot read.
    expect(findImpurities(`const d = await import(s);`, allowOnly(["date-fns-tz"]))).toEqual([
      NON_LITERAL,
    ]);
  });
});

describe("findImpurities — things that must NOT trip it", () => {
  // The mirror image of the forms above, and the reason text matching was the
  // wrong tool: a matcher strict enough to catch every form tends to fire on prose
  // and strings that merely resemble one. A guard with false positives gets
  // relaxed, and a relaxed guard is how the real holes got in.
  //
  // Parsing removes this whole class for free: a string or comment that looks like
  // an import is a StringLiteral or trivia, never a declaration node.
  const DECOYS: ReadonlyArray<[label: string, source: string]> = [
    ["an import-shaped string literal", `const s = 'import { x } from "${DB}"';`],
    ["an import-shaped line comment", `// import { supabaseAdmin } from "${DB}"`],
    ["an import-shaped block comment", `/*\n * import { x } from "${DB}"\n */`],
    ["the word import in prose", "// this module imports nothing, deliberately"],
    ["the word require in prose", "// callers require a finite number here"],
    // These two are why the fetch/clock checks moved into the parser as well.
    // The previous regexes fired on both, so a pure module carrying either in a
    // message or a comment would have failed its own purity test.
    ["fetch() inside a template literal", "const m = `could not fetch(${u})`;"],
    ["fetch() named in a comment", "// this module must never call fetch(url)"],
    ["Date.now() named in a comment", "// callers pass parsedAt; never call Date.now()"],
  ];

  it.each(DECOYS)("ignores %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([]);
  });

  it("ignores an empty module", () => {
    expect(findImpurities("", FORBID_ALL_IMPORTS)).toEqual([]);
  });
});

describe("findImpurities — globals", () => {
  // fetch and Date need no import, so the import walk says nothing about them.
  // They are detected as VALUE REFERENCES rather than by call shape, which is what
  // makes the whitespace and aliasing variants below fall out for free.
  const FETCH = "uses fetch";
  const CLOCK = "uses Date (clock read)";

  const CLOCK_FORMS: ReadonlyArray<[label: string, source: string]> = [
    ["new Date()", "const t = new Date();"],
    ["Date.now()", "const t = Date.now();"],
    // All three were missed by the regex, which required a literal single space
    // after a mandatory `new`.
    ["Date() with no new", "const t = Date();"],
    ["new  Date() with two spaces", "const t = new  Date();"],
    ["new Date() split across lines", "const t = new\nDate();"],
    ["Date aliased to a variable", "const D = Date; const t = new D();"],
  ];

  it.each(CLOCK_FORMS)("catches %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toContain(CLOCK);
  });

  const FETCH_FORMS: ReadonlyArray<[label: string, source: string]> = [
    ["a direct call", `await fetch("https://x");`],
    // Missed by every call-shaped pattern.
    ["fetch aliased to a variable", `const f = fetch; await f("https://x");`],
    ["fetch passed as an argument", "register(fetch);"],
  ];

  it.each(FETCH_FORMS)("catches %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toContain(FETCH);
  });

  // Reached through a global namespace object rather than bare. An earlier version
  // missed every one of these: the property-name exclusion added so `config.Date`
  // would not fire also swallowed `globalThis.Date`.
  it.each([
    ["globalThis.fetch()", `await globalThis.fetch("https://x");`, FETCH],
    ["window.fetch()", `await window.fetch("https://x");`, FETCH],
    ["self.fetch()", `await self.fetch("https://x");`, FETCH],
    ["globalThis.Date.now()", "const t = globalThis.Date.now();", CLOCK],
    ["new globalThis.Date()", "const t = new globalThis.Date();", CLOCK],
  ])("catches %s", (_label, source, expected) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toContain(expected);
  });

  // The forms that broke the previous version, which excluded property accesses
  // outright and re-added only three call shapes. It therefore caught
  // `globalThis.fetch(u)` but not `const f = globalThis.fetch`, and `Date.now()`
  // but not `const n = Date.now` — the same read either way.
  //
  // These are pinned as a group because they share one cause: enumerating the
  // positions a value can appear in is open-ended. Resolving what an expression
  // DENOTES and denying unless it is deterministic is not, which is why the last
  // three below were never enumerated anywhere and are caught anyway.
  it.each([
    ["a namespaced fetch aliased", `const f = globalThis.fetch; await f("u");`, FETCH],
    ["a namespaced Date aliased", "const D = globalThis.Date; const t = new D();", CLOCK],
    ["Date.now aliased without calling", "const n = Date.now; const t = n();", CLOCK],
    ["fetch.call()", `fetch.call(null, "u");`, FETCH],
    ["fetch.bind()", "const f = fetch.bind(null);", FETCH],
    ["Date reached by element access", `const t = Date["now"]();`, CLOCK],
    ["Date destructured", "const { now } = Date;", CLOCK],
    ["fetch passed to another function", "register(globalThis.fetch);", FETCH],
  ])("catches %s", (_label, source, expected) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toContain(expected);
  });

  // Reached through element access, or behind a wrapper TypeScript erases. The
  // previous version resolved only Identifier and PropertyAccess, so it never
  // judged `globalThis["fetch"]` at all — and, worse, judged the bare `Date` inside
  // `Date["parse"]` on its own, reporting a clock read for a deterministic call.
  // The last three here were never reported by review; they fall out of unwrapping
  // rather than being enumerated.
  it.each([
    ["element access on a namespace", `const r = globalThis["fetch"]("u");`, FETCH],
    ["element access then member", "const t = window['Date'].now();", CLOCK],
    ["non-null assertion", `const r = globalThis!.fetch("u");`, FETCH],
    ["parenthesised namespace", "const f = (globalThis).fetch;", FETCH],
    ["non-null then element access", "const D = globalThis!['Date'];", CLOCK],
    ["parenthesised base, element access", `const t = (Date)["now"]();`, CLOCK],
    ["as-cast then member", "const f = (fetch as never).bind(null);", FETCH],
    ["parenthesised constructor", "const t = new (Date)();", CLOCK],
  ])("catches %s", (_label, source, expected) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toContain(expected);
  });

  it("resolves element access for the deterministic members too", () => {
    // The mirror: if element access is resolved for catching, it must also be
    // resolved for allowing, or `Date["parse"]` reports a spurious clock read.
    expect(findImpurities(`const t = Date["parse"]("2026-01-01");`, FORBID_ALL_IMPORTS)).toEqual([]);
  });

  it.each([
    ["export * as Date", 'export * as Date from "./x";'],
    ["interface Date", "interface Date { x: number }"],
    ["type Date alias", "type Date = string;"],
    ["class implements Date", "class C implements Date {}"],
  ])("does not report a clock read for %s", (_label, source) => {
    // Declaring or re-exporting something named Date reads no clock. `export * as
    // Date` is still an import violation — just not two violations.
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).not.toContain(CLOCK);
  });

  it("does not fire on a same-named member of an unrelated object", () => {
    // The mirror of the above: `client.fetch` and `config.Date` are not the
    // globals, and resolution has to tell them apart from `globalThis.fetch`.
    expect(findImpurities(`await client.fetch("u");`, FORBID_ALL_IMPORTS)).toEqual([]);
    expect(findImpurities("const y = config.Date.now();", FORBID_ALL_IMPORTS)).toEqual([]);
  });

  // The distinction that keeps this guard usable by the six parser modules.
  // `new Date(parsedAt)` is deterministic string parsing — exactly what a parser
  // does with the `parsedAt` it is handed — while `new Date()` reads the clock.
  // Flagging both left `forbidClock: false` as the only escape, which also permits
  // `Date.now()`, so the first parser module would have disabled clock detection
  // wholesale to get its own legitimate conversion through.
  it.each([
    ["new Date(parsedAt)", 'export function f(p: string) { return new Date(p); }'],
    ["Date.parse(x)", 'const t = Date.parse("2026-01-01");'],
    ["Date.UTC(...)", "const t = Date.UTC(2026, 0, 1);"],
  ])("does not fire on %s — deterministic, not a clock read", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([]);
  });

  it("treats new Date(...spread) as a clock read", () => {
    // An empty spread makes it `new Date()`. Nothing here can prove the array is
    // non-empty, and the deny-by-default direction is the safe one.
    expect(findImpurities("const t = new Date(...args);", FORBID_ALL_IMPORTS)).toEqual([CLOCK]);
  });

  it("does not report a Date import twice", () => {
    // `import Date from "./x"` is an import violation, not additionally a clock
    // read — the binding shadows the global rather than using it.
    expect(findImpurities('import Date from "./x";', FORBID_ALL_IMPORTS)).toEqual([
      "forbidden import: ./x",
    ]);
  });

  it("does not fire on a Date TYPE annotation", () => {
    // The parser receives `parsedAt` as a string and may still reference Date as a
    // type. Types are erased and cannot read a clock — banning the identifier
    // outright would make the guard wrong for the modules it is about to cover.
    expect(
      findImpurities("function f(d: Date): string { return d.toISOString(); }", FORBID_ALL_IMPORTS),
    ).toEqual([]);
  });

  it.each([
    ["a property named Date", "const y = config.Date;"],
    ["an object key named Date", "const o = { Date: 1 };"],
    ["an interface member named Date", "interface Row { Date: string }"],
    ["a typeof Date type query", "type T = typeof Date;"],
    ["a getter named Date", "class C { get Date() { return 1; } }"],
    ["a setter named Date", "class C { set Date(v: number) {} }"],
    ["an enum member named Date", "enum E { Date }"],
    ["a method signature named fetch", "interface I { fetch(): void }"],
    ["a declaration named Date", "const Date = 1;"],
    ["a parameter declaration named fetch", "function f(fetch: number) { return 1; }"],
  ])("does not fire on %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([]);
  });

  it("DOES fire on a shadow that is used — a known, accepted false positive", () => {
    // Distinguishing a local binding from the global needs a TypeChecker, which is
    // not worth a Program and lib resolution per file here. The bias is deliberate:
    // a spurious failure names the identifier and costs a rename, while a silent
    // miss is what this whole file exists to prevent. Pinned so the limit is
    // documented behaviour rather than a surprise to whoever hits it.
    expect(
      findImpurities("function f(fetch: (n: number) => void) { return fetch(1); }", FORBID_ALL_IMPORTS),
    ).toEqual([FETCH]);
  });

  it("reports one violation per distinct problem, not one per occurrence", () => {
    expect(findImpurities("const a = Date.now(); const b = Date.now();", FORBID_ALL_IMPORTS)).toEqual(
      [CLOCK],
    );
  });

  it("reports every violation at once rather than stopping at the first", () => {
    const source = `import { x } from "${DB}";\nawait fetch("https://x");\nconst t = Date.now();`;
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([FORBIDDEN, FETCH, CLOCK]);
  });

  it("allows an opt-out, but only when written down", () => {
    const clockOk: PurityPolicy = { forbidImport: () => true, forbidClock: false };
    expect(findImpurities("const t = Date.now();", clockOk)).toEqual([]);
    // Absent the explicit false, the clock is forbidden — the default is strict.
    expect(findImpurities("const t = Date.now();", { forbidImport: () => true })).toEqual([CLOCK]);
  });
});

describe("import-form completeness is checked, not claimed", () => {
  // Four review rounds each closed the import form that had just been reported,
  // and the header each time claimed the set was now closed. It was not: round 4
  // found `ImportType` (`type P = import("x").T`), a TYPE node that the walk over
  // declaration kinds never reached.
  //
  // Prose cannot carry that claim, so this test does. `ts.SyntaxKind` IS a closed
  // set — enumerable at runtime — so every import-related kind is accounted for
  // either as one the guard handles, or as one explicitly reviewed and recorded as
  // carrying no module specifier of its own. A TypeScript upgrade that introduces
  // a new form fails here rather than silently opening a hole.

  // Kinds that carry a specifier, each covered by a fixture in this file.
  const HANDLED = [
    "ImportDeclaration", // import x from "y"
    "ImportEqualsDeclaration", // import x = require("y")
    "ImportType", // type P = import("y").T
    "ImportKeyword", // await import("y")
    "RequireKeyword", // require("y")
    "ExternalModuleReference", // the require(...) inside import-equals
  ];

  // Kinds reviewed and confirmed to carry no specifier of their own — they are
  // children of a handled kind, or unrelated to module resolution.
  const NO_SPECIFIER_OF_ITS_OWN = [
    "ImportClause", // the bindings of an ImportDeclaration
    "NamespaceImport", // `* as ns` within an ImportClause
    "NamedImports", // `{ a, b }` within an ImportClause
    "ImportSpecifier", // one name within NamedImports
    "ImportAttributes", // `with { type: "json" }` on a handled declaration
    "ImportAttribute", // one entry within ImportAttributes
    "ImportTypeAssertionContainer", // deprecated assertion wrapper on ImportType
    "JSDocImportTag", // `@import` in JSDoc; .ts sources use real imports
  ];

  it("accounts for every import-related SyntaxKind", () => {
    const all = Object.keys(ts.SyntaxKind)
      .filter((key) => Number.isNaN(Number(key)))
      .filter((key) => /Import|Require|ExternalModule/.test(key));

    const accounted = new Set([...HANDLED, ...NO_SPECIFIER_OF_ITS_OWN]);
    const unaccounted = all.filter((kind) => !accounted.has(kind));

    // A failure here means TypeScript grew an import form. Decide which list it
    // belongs in, and add a fixture if it carries a specifier.
    expect(unaccounted).toEqual([]);
  });

  it("has no stale entries — every listed kind still exists in this TypeScript", () => {
    // The mirror direction: a list that outlives the thing it describes is the
    // manual-drift this project keeps logging.
    const existing = new Set(Object.keys(ts.SyntaxKind));
    expect([...HANDLED, ...NO_SPECIFIER_OF_ITS_OWN].filter((k) => !existing.has(k))).toEqual([]);
  });
});

describe("findImpurities — source that does not parse", () => {
  // `createSourceFile` does not throw on a broken file; it returns an empty tree.
  // Before this check, one stray backtick made the guard return [] for a module
  // containing a real import AND a clock read — it silently stopped guarding,
  // which is the precise failure this file exists to prevent.
  const BROKEN = 'const s = `oops; import { supabaseAdmin } from "@/lib/supabase"; const t = Date.now();';

  it("reports a parse failure rather than reporting nothing", () => {
    const violations = findImpurities(BROKEN, FORBID_ALL_IMPORTS);
    expect(violations).not.toEqual([]);
    expect(violations[0]).toMatch(/^source does not parse/);
  });

  it("names the parse error so the cause is visible without a rerun", () => {
    expect(findImpurities(BROKEN, FORBID_ALL_IMPORTS)[0]).toContain("Unterminated template literal");
  });

  it("accepts valid TypeScript-only syntax without reporting a parse error", () => {
    // Guards the ScriptKind choice: generics, decorators-free TS, satisfies, and
    // type-only constructs must all parse cleanly or every parser module would
    // report a spurious parse failure.
    const source = `
      type A<T extends string> = { readonly [K in T]?: number };
      export const x = { a: 1 } satisfies Record<string, number>;
      export function f<T>(v: T): T | null { return v as T | null; }
      export enum E { A = "a" }
    `;
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([]);
  });
});

describe("policies", () => {
  // Purity is not one rule. geo.ts permits zero imports; parser modules
  // legitimately import date-fns-tz and one another. Both are exercised, because a
  // mechanism proven under only one policy is a mechanism with one call site.
  it("FORBID_ALL_IMPORTS rejects even a harmless library", () => {
    expect(findImpurities(`import { toZonedTime } from "date-fns-tz";`, FORBID_ALL_IMPORTS)).toEqual(
      ["forbidden import: date-fns-tz"],
    );
  });

  it("allowOnly permits the listed specifiers and rejects the rest", () => {
    const parserPolicy = allowOnly(["date-fns-tz", "@/lib/parser/dictionary"]);
    expect(findImpurities(`import { toZonedTime } from "date-fns-tz";`, parserPolicy)).toEqual([]);
    expect(
      findImpurities(`import { DICTIONARY } from "@/lib/parser/dictionary";`, parserPolicy),
    ).toEqual([]);
    expect(findImpurities(`import { supabaseAdmin } from "@/lib/supabase";`, parserPolicy)).toEqual([
      "forbidden import: @/lib/supabase",
    ]);
  });

  it("allowOnly denies by default — an unlisted dependency is rejected, not ignored", () => {
    // Deny-by-default is the point: adding a dependency has to be argued for in
    // the test, where the decision is visible, rather than slipping in unnoticed.
    expect(
      findImpurities(`import { readFileSync } from "node:fs";`, allowOnly(["date-fns-tz"])),
    ).toEqual(["forbidden import: node:fs"]);
  });
});
