import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// The no-imports rule for `map-types.ts` (the `eslint.config.mjs` override), run
// through ESLint's Node API under the repo's real config, on the real file's text.
//
// ⚠ THE PATH IS THE POINT. The override is scoped to `src/lib/map-types.ts`, and ESLint
// says nothing when a `files` path matches no file. Reading the real file here is what
// fails when it is renamed or moved; linting the same text at another path passes every
// form below, because the override then never applies (PR #166).
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FILE = fileURLToPath(new URL("./map-types.ts", import.meta.url));
const RULE = "no-restricted-syntax";

let eslint: ESLint;
let source: string;

beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
  source = readFileSync(FILE, "utf8");
});

async function restrictedImports(text: string) {
  const [result] = await eslint.lintText(text, { filePath: FILE });
  return result.messages.filter((m) => m.ruleId === RULE);
}

describe("map-types.ts imports nothing", () => {
  it("lints clean as committed", async () => {
    const [result] = await eslint.lintText(source, { filePath: FILE });
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  }, 60_000);

  // Each form imports a module. Every one was a lint error in PR #166's controls;
  // the first five rows include the two a text grep missed (rows 3 and 4).
  const appended: ReadonlyArray<[form: string, line: string]> = [
    ["import declaration", 'import type { Truck } from "@/lib/types";'],
    ["export *", 'export * from "@/lib/types";'],
    ["re-export, no spaces", 'export type{Location}from"@/lib/types";'],
    ["re-export across lines", 'export type {\n  Location,\n} from\n  "@/lib/types";'],
    ["inline import() type", 'export type T = import("@/lib/types").Truck;'],
    ["import = require", 'import T = require("@/lib/types");'],
    ["dynamic import()", 'export const p = import("@/lib/types");'],
    ["require()", 'const r = require("@/lib/types");'],
    [
      "import behind eslint-disable-next-line",
      '// eslint-disable-next-line no-restricted-syntax\nimport type { Truck } from "@/lib/types";',
    ],
  ];

  it.each(appended)("refuses %s", async (_form, line) => {
    const messages = await restrictedImports(`${source}\n${line}\n`);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("imports nothing");
  }, 60_000);

  it("refuses an import behind a file-wide eslint-disable", async () => {
    const text = `/* eslint-disable */\n${source}\nimport type { Truck } from "@/lib/types";\n`;
    expect(await restrictedImports(text)).toHaveLength(1);
  }, 60_000);

  // A namespace alias imports no module, so it is not refused.
  it("allows an `import X = Foo.Bar` namespace alias", async () => {
    expect(await restrictedImports(`${source}\nimport X = Foo.Bar;\n`)).toHaveLength(0);
  }, 60_000);
});
