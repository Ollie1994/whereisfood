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
    ["a call with no space", `await fetch("https://x");`],
    // Missed by every call-shaped pattern.
    ["fetch aliased to a variable", `const f = fetch; await f("https://x");`],
    ["fetch passed as an argument", "register(fetch);"],
  ];

  it.each(FETCH_FORMS)("catches %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toContain(FETCH);
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
    ["a local variable shadowing Date", "const Date = 1;"],
    ["a parameter named fetch", "function f(fetch) { return 1; }"],
  ])("does not fire on %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([]);
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
