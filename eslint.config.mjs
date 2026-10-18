import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
  // map-types.ts holds frozen copies of the pre-Phase-5 rows, so it must import
  // nothing: an import from `database.types` or `@/lib/types` would follow the schema
  // (plan phase-5-schema-reset, decision #1). Parse-tree selectors, not a text grep: a
  // grep missed `export type{X}from"…"` and multi-line re-exports (PR #166 round 2).
  // Each selector was shown to fail lint on a copy of the file (PR #166).
  {
    files: ["src/lib/map-types.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[
          "ImportDeclaration",
          "ExportAllDeclaration",
          "ExportNamedDeclaration[source]",
          "TSImportType",
          "TSImportEqualsDeclaration",
          "ImportExpression",
          "CallExpression[callee.name='require']",
        ].map((selector) => ({
          selector,
          message: "map-types.ts imports nothing: its types are frozen copies (plan phase-5-schema-reset, decision #1).",
        })),
      ],
    },
  },
]);

export default eslintConfig;
