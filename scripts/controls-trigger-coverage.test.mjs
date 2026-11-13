// The trigger list's guard (Phase 8 plan #8, IS #287). A PR that changes a file the
// controls' named tests run, with no TRIGGERS entry covering it, would skip the full
// controls; this test fails instead.
//
// For each control's `-- run:` filter it asks vitest which files the filter selects
// (`vitest list --project integration <filter> --filesOnly --json`; with `.env.local`
// moved away it still listed `schema.test.ts`, exit 0, so it doesn't run the setup file,
// IS #287's PR), and fails on a filter that selects none, which `vitest list` exits 0 for.
// From those files and the integration project's `setupFiles` it follows imports
// transitively: relative ones, and ones an `alias` key of the integration project in
// `vitest.config.ts` rewrites (`@/` → `src/`). Imports are read with TypeScript's
// `preProcessFile`: on a probe source it returned `import type`, a side-effect import,
// `export … from`, `export * from` and `import("literal")`, and not an import in a comment
// or a string, or `import(name)` (TypeScript 5.9.3, IS #287's PR). A bare package
// import, or an alias that lands in `node_modules` (`server-only`), isn't followed:
// `package.json` and `package-lock.json` stand for it.
// Every file reached must be covered by TRIGGERS.
//
// What it can't see: a computed import (`import(name)`); a module vitest loads through
// `vi.mock`, `vi.doMock`, `vi.importActual` or `vi.importMock`, whose specifiers
// `preProcessFile` doesn't return (probed for `vi.mock` and `vi.importActual`; no
// integration file calls any of the four today: grep, IS #287's PR); a file a test reads rather
// than imports (`readFileSync`), such as the migrations; and anything a control's SQL
// depends on beyond the schema.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../vitest.config.ts";
import { triggerFor } from "./controls-trigger.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTROLS_DIR = join(ROOT, "tests", "controls");

// Each control's `-- run:` value, from its header (the lines before the first blank one,
// or the whole file with none, as `controls.mjs` reads it). `controls.mjs --check` checks
// the header's form; here a file with no `run:` fails the first test below.
function runFilter(file) {
  const lines = readFileSync(join(CONTROLS_DIR, file), "utf8").split(/\r?\n/);
  const blank = lines.findIndex((line) => line.trim() === "");
  const header = blank === -1 ? lines : lines.slice(0, blank);
  return header.map((line) => /^--\s*run\s*:\s*(.*\S)\s*$/.exec(line)?.[1]).find((value) => value !== undefined);
}

const CONTROL_FILES = readdirSync(CONTROLS_DIR).filter((file) => file.endsWith(".sql")).sort();
const FILTERS = [...new Set(CONTROL_FILES.map(runFilter).filter((filter) => filter !== undefined))];

const integration = config.test.projects.find((project) => project.test.name === "integration");
const ALIAS = integration.resolve.alias;
const SETUP_FILES = integration.test.setupFiles.map((file) => resolve(ROOT, file));

// What vitest selects for one filter, as absolute paths.
function vitestList(filter) {
  const result = spawnSync(`npx vitest list --project integration ${filter} --filesOnly --json`, {
    shell: true,
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`vitest list ${filter}: exit ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout).map((entry) => resolve(entry.file));
}

// Vite's default `resolve.extensions`, in its order: `DEFAULT_EXTENSIONS` in Vite 8.3.5's
// `dist/node/chunks/node.js`, not exported. `vitest.config.ts` sets no `extensions`.
const EXTENSIONS = [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json"];

// A specifier's file in the order Vite 8.3.5's `tryCleanFsResolve` tries them: the file as
// written; for a `.js`, `.mjs`, `.cjs` or `.jsx` specifier, its TypeScript source (`js` →
// `ts` in the extension, and `.js` → `.tsx` too); each extension added; then a folder's
// `index` with each extension. Not followed: a folder's `package.json` entry, and
// `tryPrefix`. A Vite upgrade that changes these rules isn't seen here.
function resolveFile(base) {
  const ext = /\.(?:js|mjs|cjs|jsx)$/.exec(base)?.[0];
  const stem = ext === undefined ? base : base.slice(0, -ext.length);
  const candidates = [
    base,
    ...(ext === undefined ? [] : [stem + ext.replace("js", "ts"), ...(ext === ".js" ? [`${stem}.tsx`] : [])]),
    ...EXTENSIONS.map((e) => base + e),
    ...EXTENSIONS.map((e) => join(base, `index${e}`)),
  ];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile());
}

// Where an import leads: a file in the repository, or null for a package. Throws for an
// import it can't resolve and for a file outside the repository.
function resolveImport(specifier, fromFile) {
  let base;
  const key = Object.keys(ALIAS).find((k) => specifier === k || specifier.startsWith(`${k}/`));
  // `resolve`, so an alias's path has the same separators as a relative one's.
  if (key !== undefined) base = resolve(ALIAS[key] + specifier.slice(key.length));
  else if (specifier.startsWith("./") || specifier.startsWith("../")) base = resolve(dirname(fromFile), specifier);
  else return { file: null, kind: "package" };
  const file = resolveFile(base);
  if (file === undefined) throw new Error(`${relative(ROOT, fromFile)}: can't resolve "${specifier}"`);
  const rel = relative(ROOT, file);
  // Outside the repository no TRIGGERS entry or package file stands for it. On Windows,
  // `relative` across drives returns an absolute path, not one starting with `..`.
  // `..` as a whole segment: a root-level `..probe.ts` is a file in the repository, and a
  // `startsWith("..")` test threw "leads outside" for it (round 2 on PR #316).
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`${relative(ROOT, fromFile)}: "${specifier}" leads outside the repository (${file})`);
  if (rel.split(sep).includes("node_modules")) return { file: null, kind: "package" };
  return { file, kind: key !== undefined ? "alias" : "relative" };
}

// Every repository file reached from `roots`, repo-relative with `/`, and how many
// imports of each kind were followed. Keyed by the repo-relative path: `resolve` keeps a
// drive letter's case (`c:/x/y/z` and `C:/x/y/z` resolved unequal), and `relative` gave
// `src\z.ts` for both (round 4 on PR #316).
function reach(roots) {
  const seen = new Map();
  const followed = { relative: 0, alias: 0, package: 0 };
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.pop();
    const key = relative(ROOT, file).split(sep).join("/");
    if (seen.has(key)) continue;
    seen.set(key, file);
    const { importedFiles } = ts.preProcessFile(readFileSync(file, "utf8"), true, true);
    for (const { fileName } of importedFiles) {
      const target = resolveImport(fileName, file);
      followed[target.kind] += 1;
      if (target.file !== null) queue.push(target.file);
    }
  }
  return { files: [...seen.keys()].sort(), followed };
}

describe("the controls' trigger list", () => {
  const selected = new Map();

  beforeAll(() => {
    for (const filter of FILTERS) selected.set(filter, vitestList(filter));
  }, 120_000);

  it("reads a `-- run:` filter from every control", () => {
    expect(CONTROL_FILES.length).toBeGreaterThan(0);
    expect(CONTROL_FILES.filter((file) => runFilter(file) === undefined)).toEqual([]);
  });

  it.each(FILTERS)("filter `%s` selects at least one integration file", (filter) => {
    expect(selected.get(filter)).not.toEqual([]);
  });

  it("covers every file the named tests and the setup file reach", () => {
    const { files, followed } = reach([...SETUP_FILES, ...[...selected.values()].flat()]);
    // The walk followed both kinds, so a resolver that found nothing can't pass.
    expect(followed.relative).toBeGreaterThan(0);
    expect(followed.alias).toBeGreaterThan(0);
    expect(files.filter((file) => triggerFor(file) === undefined)).toEqual([]);
  });
});
