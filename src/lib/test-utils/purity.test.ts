import { describe, expect, it } from "vitest";
import {
  allowOnly,
  findImpurities,
  FORBID_ALL_IMPORTS,
  type PurityPolicy,
} from "@/lib/test-utils/purity";

// This suite is the reason the helper exists. PR #74 needed three review rounds
// and produced three different holes in three hand-written import matchers, each
// fix closing the reported hole and opening another. Every form that beat a
// previous version is pinned here as a fixture, so the mechanism is verified
// adversarially ONCE and never re-derived per module.
//
// Fixtures are inline source strings rather than real files: the analysis takes
// text, so the mechanism is testable with nothing on disk, and a fixture that
// would crash on import (supabase throws on missing env) can still be expressed.
const DB = "@/lib/db/posts";

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
    ["inline block comment then import", `/* eslint-disable */ import { x } from "${DB}";`],
    ["type-only import", `import type { Post } from "${DB}";`],
    ["require()", `const db = require("${DB}");`],
    ["multi-line import", `import {\n  supabaseAdmin,\n} from "${DB}";`],
  ];

  it.each(IMPORT_FORMS)("catches a %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([`forbidden import: ${DB}`]);
  });

  it("names the offending specifier so a failure is actionable without a rerun", () => {
    const source = `import { a } from "${DB}";\nimport { b } from "@/lib/supabase";`;
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([
      `forbidden import: ${DB}`,
      "forbidden import: @/lib/supabase",
    ]);
  });
});

describe("findImpurities — things that must NOT trip it", () => {
  // The mirror image of the forms above, and the reason a regex was the wrong
  // tool: a matcher strict enough to catch every import form above tends to fire
  // on prose and strings that merely resemble one. A guard with false positives
  // gets relaxed, and a relaxed guard is how the real holes got in.
  const DECOYS: ReadonlyArray<[label: string, source: string]> = [
    ["an import-shaped string literal", `const s = 'import { x } from "${DB}"';`],
    ["an import-shaped line comment", `// import { supabaseAdmin } from "${DB}"`],
    ["an import-shaped block comment", `/*\n * import { x } from "${DB}"\n */`],
    ["the word import in prose", "// this module imports nothing, deliberately"],
    ["the word require in prose", "// callers require a finite number here"],
    ["a template literal mentioning fetch", "const s = 'we never fetch here';"],
  ];

  it.each(DECOYS)("ignores %s", (_label, source) => {
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([]);
  });

  it("ignores an empty module", () => {
    expect(findImpurities("", FORBID_ALL_IMPORTS)).toEqual([]);
  });
});

describe("findImpurities — globals", () => {
  // fetch and Date need no import, so the scanner says nothing about them.
  it("catches a fetch call", () => {
    expect(findImpurities(`await fetch("https://x");`, FORBID_ALL_IMPORTS)).toEqual([
      "calls fetch()",
    ]);
  });

  it("catches new Date() and Date.now()", () => {
    expect(findImpurities("const t = new Date();", FORBID_ALL_IMPORTS)).toEqual([
      "reads the clock (new Date() or Date.now())",
    ]);
    expect(findImpurities("const t = Date.now();", FORBID_ALL_IMPORTS)).toEqual([
      "reads the clock (new Date() or Date.now())",
    ]);
  });

  it("does not fire on a Date type annotation or a passed-in date", () => {
    // The parser receives `parsedAt` as a string and may still reference Date as
    // a type. Only the two READS are forbidden — banning the identifier outright
    // would make the guard wrong for the modules it is about to cover.
    expect(findImpurities("function f(d: Date): string { return d.toISOString(); }", FORBID_ALL_IMPORTS))
      .toEqual([]);
  });

  it("reports every violation at once rather than stopping at the first", () => {
    const source = `import { x } from "${DB}";\nawait fetch("https://x");\nconst t = Date.now();`;
    expect(findImpurities(source, FORBID_ALL_IMPORTS)).toEqual([
      `forbidden import: ${DB}`,
      "calls fetch()",
      "reads the clock (new Date() or Date.now())",
    ]);
  });

  it("allows an opt-out, but only when written down", () => {
    const clockOk: PurityPolicy = { forbidImport: () => true, forbidClock: false };
    expect(findImpurities("const t = Date.now();", clockOk)).toEqual([]);
    // Absent the explicit false, the clock is forbidden — the default is strict.
    expect(findImpurities("const t = Date.now();", { forbidImport: () => true })).toEqual([
      "reads the clock (new Date() or Date.now())",
    ]);
  });
});

describe("policies", () => {
  // Purity is not one rule. geo.ts permits zero imports; parser modules
  // legitimately import date-fns-tz and one another. Both are exercised, because
  // a mechanism proven under only one policy is a mechanism with one call site.
  it("FORBID_ALL_IMPORTS rejects even a harmless library", () => {
    expect(findImpurities(`import { toZonedTime } from "date-fns-tz";`, FORBID_ALL_IMPORTS))
      .toEqual(["forbidden import: date-fns-tz"]);
  });

  it("allowOnly permits the listed specifiers and rejects the rest", () => {
    const parserPolicy = allowOnly(["date-fns-tz", "@/lib/parser/dictionary"]);
    expect(findImpurities(`import { toZonedTime } from "date-fns-tz";`, parserPolicy)).toEqual([]);
    expect(findImpurities(`import { DICTIONARY } from "@/lib/parser/dictionary";`, parserPolicy))
      .toEqual([]);
    expect(findImpurities(`import { supabaseAdmin } from "@/lib/supabase";`, parserPolicy))
      .toEqual(["forbidden import: @/lib/supabase"]);
  });

  it("allowOnly denies by default — an unlisted dependency is rejected, not ignored", () => {
    // Deny-by-default is the point: adding a dependency has to be argued for in
    // the test, where the decision is visible, rather than slipping in unnoticed.
    expect(findImpurities(`import { readFileSync } from "node:fs";`, allowOnly(["date-fns-tz"])))
      .toEqual(["forbidden import: node:fs"]);
  });
});
