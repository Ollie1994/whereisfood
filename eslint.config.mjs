import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// DOM HTML sinks, banned in every JS and TS file (Phase 8 plan step 4, Q26; IS #289). With
// no `object`, `no-restricted-properties` bans the property on any object. Each entry has a
// fixture in scripts/lint-rules.test.mjs (plan #9): a mistyped name or selector lints clean.
// Not seen: a computed name (`el["inner" + "HTML"]`) or an alias; a sink set through an
// object's key (`Object.assign(el, { innerHTML: s })`); `dangerouslySetInnerHTML` passed
// through `createElement`'s props; a sink inside a dependency; HTML built from constants that
// a library renders (MapLibre's attribution in `map-setup.ts`, the proxy's `unavailablePage`).
// Probed with `ESLint#lintText`, round 1 on PR #320.
const HTML_SINKS = [
  { property: "innerHTML", message: "innerHTML parses HTML: build elements with document.createElement (Q26)." },
  { property: "outerHTML", message: "outerHTML parses HTML: build elements with document.createElement (Q26)." },
  {
    property: "insertAdjacentHTML",
    message: "insertAdjacentHTML parses HTML: build elements with document.createElement (Q26).",
  },
  { property: "setHTML", message: "setHTML renders HTML: render a React root or DOM nodes instead (Q26)." },
];

// supabase-js filters in the db layer (Q26). `.or()`'s argument and `.rpc()`'s function
// name are strings PostgREST parses, so neither may hold a string built in the call (a
// template with an expression, or a `+`), as the argument or anywhere inside it (`.trim()`,
// a ternary, an array's `.join`). `.rpc()` POSTs its second argument as the JSON body by
// default (postgrest-js 2.106.2's `rpc`: `method = "POST"; body = args`), so only its first
// is checked; with `{ get: true }` or `{ head: true }` the arguments go in the URL's query
// string instead, which isn't checked. `.or()`'s callee chain (`.from(…)`) isn't checked
// (`:not(…)`).
// A rule on syntax can't tell supabase-js's `.filter()` from an array's, and misses a builder
// held in a variable, so `.filter` is banned outright here, by name, computed name or
// destructuring: a row post-filter takes another form, or a disable naming this rule
// (CLAUDE.md, "db layer"). Not seen: a string built into a variable first; supabase-js's
// `.not(column, operator, value)`, whose value PostgREST also parses (Q26 names `.or`,
// `.filter` and `.rpc`). Probed with `ESLint#lintText`, round 1 on PR #320.
const BUILT_STRING = ":matches(TemplateLiteral[expressions.length>0], BinaryExpression[operator='+'])";
const OR_CALL = "CallExpression[callee.property.name='or']";
const RPC_CALL = "CallExpression[callee.property.name='rpc']";
const DB_FILTERS = [
  {
    selector: `${OR_CALL} > ${BUILT_STRING}, ${OR_CALL} > :not(MemberExpression) ${BUILT_STRING}`,
    message: "A string built into .or() is parsed by PostgREST: use .eq/.in/.is, or a literal (Q26).",
  },
  {
    selector: `${RPC_CALL} > ${BUILT_STRING}:first-child, ${RPC_CALL} > :first-child ${BUILT_STRING}`,
    message: "A string built into .rpc()'s function name is parsed by PostgREST: pass a literal (Q26).",
  },
  {
    selector:
      "MemberExpression[property.name='filter'], MemberExpression[computed=true][property.value='filter'], ObjectPattern > Property[key.name='filter']",
    message: "No .filter in src/lib/db/: supabase-js's and an array's look alike to lint (Q26).",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `react/no-danger` on the files eslint-config-next registers the react plugin for, and on
  // components too (`customComponentNames`): plain "error" checks only lowercase DOM elements,
  // so `<Foo dangerouslySetInnerHTML={…} />` linted clean (round 1 on PR #320).
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react/no-danger": ["error", { customComponentNames: ["*"] }],
    },
  },
  // A core rule, so `.cjs` too.
  {
    files: ["**/*.{js,cjs,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
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
