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

// supabase-js filters in the db layer (Q26). `.or()`'s filter string and `.rpc()`'s
// function name, each its first argument, are strings PostgREST parses, so neither may
// hold a string built in the call (a template with an expression, or a `+`), as the
// argument or anywhere inside it (`.trim()`, a ternary, an array's `.join`, a computed
// member), one report per argument: esquery's `:has` matches the argument itself as well
// as what's inside it (with the direct form dropped from `:matches(<built>,
// :has(<built>))`, every fixture still passed; round 2 on PR #320). `:first-child` is the
// first argument, never the callee (`.from(…)`). Later arguments aren't checked:
// `.or()`'s options, and `.rpc()`'s arguments, which postgrest-js 2.106.2's `rpc` POSTs
// as the JSON body unless `{ get: true }`, or `{ head: true }` with no object argument,
// puts them in the URL's query string.
// A rule on syntax can't tell supabase-js's `.filter()` from an array's, and misses a
// builder held in a variable, so `.filter` is banned outright here: by name, by a
// string-literal computed name, or destructured by identifier. A row post-filter takes
// another form, or a disable naming this rule (CLAUDE.md, "db layer"). Not seen: a string
// built into a variable first; a computed `.or`, `.rpc` or `.filter` name other than a
// string literal of `filter` (`q["or"](…)`, a template, a string-keyed destructure);
// supabase-js's `.not(column, operator, value)`, whose value PostgREST also parses (Q26
// names `.or`, `.filter` and `.rpc`). Probed with `ESLint#lintText`, rounds 1 and 2 on PR
// #320.
const BUILT_STRING = ":matches(TemplateLiteral[expressions.length>0], BinaryExpression[operator='+'])";
const OR_CALL = "CallExpression[callee.property.name='or']";
const RPC_CALL = "CallExpression[callee.property.name='rpc']";
const BUILT_IN = `:first-child:has(${BUILT_STRING})`;
const DB_FILTERS = [
  {
    selector: `${OR_CALL} > ${BUILT_IN}`,
    message: "A string built into .or() is parsed by PostgREST: use .eq/.in/.is, or a literal (Q26).",
  },
  {
    selector: `${RPC_CALL} > ${BUILT_IN}`,
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
  // On the files eslint-config-next registers the react plugin for. `react/no-danger` checks
  // DOM elements only, so `<Foo dangerouslySetInnerHTML={…} />` linted clean (round 1 on PR
  // #320), and `forbid-component-props` covers components. Not `no-danger`'s
  // `customComponentNames: ["*"]`: with it, `<foo:bar x="1" />` crashed the lint ("f.split is
  // not a function", round 2). Neither rule was set on `dev` (`--print-config`), and this
  // `forbid` list replaces the rule's default (`className`, `style`), so neither is forbidden.
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react/no-danger": "error",
      "react/forbid-component-props": ["error", { forbid: ["dangerouslySetInnerHTML"] }],
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
