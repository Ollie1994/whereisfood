import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// DOM HTML sinks, banned in every JS and TS file (Phase 8 plan step 4, Q26; IS #289). With
// no `object`, `no-restricted-properties` bans the property on any object. Each entry has a
// fixture in scripts/lint-rules.test.mjs (plan #9): a mistyped name or selector lints clean.
// Not seen: a computed name (`el["inner" + "HTML"]`) or an alias; a sink inside a
// dependency; HTML built from constants that a library renders (MapLibre's attribution in
// `map-setup.ts`, the proxy's `unavailablePage`).
const HTML_SINKS = [
  { property: "innerHTML", message: "innerHTML parses HTML: build elements with document.createElement (Q26)." },
  { property: "outerHTML", message: "outerHTML parses HTML: build elements with document.createElement (Q26)." },
  {
    property: "insertAdjacentHTML",
    message: "insertAdjacentHTML parses HTML: build elements with document.createElement (Q26).",
  },
  { property: "setHTML", message: "setHTML renders HTML: render a React root or DOM nodes instead (Q26)." },
];

// supabase-js filters in the db layer (Q26). `.or()` and `.rpc()` take a string PostgREST
// parses, so neither may get a string built in the call (a template with an expression, or
// a `+`). A rule on syntax can't tell supabase-js's `.filter()` from an array's, and misses a
// builder held in a variable, so `.filter` is banned outright here: a row post-filter takes
// another form, or a disable naming this rule (CLAUDE.md, "db layer").
// A string-built argument held in a variable first isn't seen.
const BUILT_STRING = ":matches(TemplateLiteral[expressions.length>0], BinaryExpression[operator='+'])";
const DB_FILTERS = [
  {
    selector: `CallExpression[callee.property.name='or'] > ${BUILT_STRING}`,
    message: "A string built into .or() is parsed by PostgREST: use .eq/.in/.is, or a literal (Q26).",
  },
  {
    selector: `CallExpression[callee.property.name='rpc'] > ${BUILT_STRING}`,
    message: "A string built into .rpc() is a function name or argument PostgREST parses: pass a literal (Q26).",
  },
  {
    selector: "MemberExpression[property.name='filter']",
    message: "No .filter in src/lib/db/: supabase-js's and an array's look alike to lint (Q26).",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The files eslint-config-next registers the react plugin for.
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react/no-danger": "error",
      "no-restricted-properties": ["error", ...HTML_SINKS],
    },
  },
  // `no-restricted-syntax`, which no earlier entry sets: in flat config a later entry's
  // options for a rule replace an earlier one's, so the sinks stay on their own rule.
  {
    files: ["src/lib/db/**"],
    rules: {
      "no-restricted-syntax": ["error", ...DB_FILTERS],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MapLibre's minified worker, copied from node_modules (scripts/copy-maplibre-worker.mjs).
    // Flat config does not read .gitignore, so it is listed here too.
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;
