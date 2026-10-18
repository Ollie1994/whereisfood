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
  // (plan phase-5-schema-reset, decision #1). `noInlineConfig` makes an
  // `eslint-disable` comment in the file inert. `src/lib/map-types.lint.test.ts` runs
  // this config on the real file and on each import form appended to it, so a renamed
  // file or a weakened selector fails `npm run test:run`.
  {
    files: ["src/lib/map-types.ts"],
    linterOptions: { noInlineConfig: true },
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[
          "ImportDeclaration",
          "ExportAllDeclaration",
          "ExportNamedDeclaration[source]",
          "TSImportType",
          "TSImportEqualsDeclaration[moduleReference.type='TSExternalModuleReference']",
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
