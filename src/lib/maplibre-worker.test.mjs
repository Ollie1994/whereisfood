import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getVersion } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { WORKER_FILES, workerUrl } from "@/lib/maplibre-worker.mjs";

const PACKAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../node_modules/maplibre-gl",
);
const DIST = path.join(PACKAGE_DIR, "dist");

// Every module reference in a minified ES module, in any of the three quote styles
// the minifier uses (it writes most string literals as backtick templates):
// `from"x"`, `import"x"`, `import("x")` and `new URL("x", import.meta.url)`, with
// `/* */` block comments in between (a `//` line comment there isn't read): the minifier
// keeps `/* @vite-ignore */` annotations, and the installed worker already writes
// `import(\n/* @vite-ignore */\ne)`.
// The comment body is `(?:[^*]|\*(?!\/))*` (IS #329; CodeQL alert #3, js/redos). With
// `[\s\S]*?` there, `import(/*` followed by n copies of `*//*` took 13 ms at n = 20,
// 871 ms at n = 26 and 18 s at n = 28; this form took 0.1 ms or less, and both found the
// same references in every `.mjs` of maplibre-gl's dist. The test below times n = 26.
// Still polynomial: `import(/*` repeated 5000 times, never closed, took 255 ms (PR #331's
// round 1); the input is maplibre-gl's own build.
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\bnew URL\(\s*)(?:\/\*(?:[^*]|\*(?!\/))*\*\/\s*)*(["'`])([^"'`]+)\1/g;

const referencesOf = (file) =>
  [...fs.readFileSync(path.join(DIST, file), "utf8").matchAll(SPECIFIER)].map(
    (match) => match[2],
  );

describe("WORKER_FILES", () => {
  it("exist in the installed maplibre-gl", () => {
    for (const file of WORKER_FILES) {
      expect(fs.existsSync(path.join(DIST, file)), file).toBe(true);
    }
  });

  // The failure this guards is the one PR #136 hit: a worker that imports a file which
  // was not copied next to it 404s in the browser and the map draws no tiles, while
  // every gate stays green. So the copied set must be closed under its own imports.
  it.each(WORKER_FILES)("%s references only files that are copied with it", (file) => {
    for (const specifier of referencesOf(file)) {
      expect(specifier.startsWith("./"), `${file} references ${specifier}`).toBe(true);
      expect(WORKER_FILES, `${file} references ${specifier}`).toContain(specifier.slice(2));
    }
  });

  // Without these, a regex that silently matched nothing would make the test above
  // pass vacuously. Only the worker is covered: maplibre-gl-shared.mjs has no reference
  // SPECIFIER finds (0 in 6.11.2, with the old form and this one), so its closure check
  // above checks nothing.
  it("finds the worker's import of the shared chunk", () => {
    expect(referencesOf("maplibre-gl-worker.mjs")).toContain("./maplibre-gl-shared.mjs");
  });

  it("matches backtick-quoted and comment-annotated references, the minifier's forms", () => {
    const sample =
      "new URL(`./maplibre-gl-worker.mjs`,import.meta.url);import(`./chunk.mjs`);" +
      "import(\n/* @vite-ignore */\n`./annotated.mjs`)" +
      'import(/* a *//* b * c */"./two.mjs")';
    const found = [...sample.matchAll(SPECIFIER)].map((match) => match[2]);
    expect(found).toEqual(["./maplibre-gl-worker.mjs", "./chunk.mjs", "./annotated.mjs", "./two.mjs"]);
  });

  // A comment ends at its first `*/`: the `[\s\S]*?` form ran on past it, across `foo`, to
  // the next comment's end, and reported "y" here.
  it("doesn't read a string after code that follows a comment", () => {
    expect([...'import(/* a */ foo /* b */"y")'.matchAll(SPECIFIER)]).toEqual([]);
  });

  it("matches 26 copies of `*//*` after `import(/*` within 250 ms", { timeout: 250 }, () => {
    expect([...`import(/*${"*//*".repeat(26)}`.matchAll(SPECIFIER)]).toEqual([]);
  });
});

describe("workerUrl", () => {
  it("is versioned and points at the worker entry", () => {
    expect(workerUrl("6.11.2")).toBe("/maplibre/6.11.2/maplibre-gl-worker.mjs");
  });

  // The hook builds the URL from `getVersion()` and the copy script from
  // `maplibre-gl/package.json`. If they ever disagreed, the worker would 404.
  it("uses a version that matches the one the copy script reads", () => {
    const { version } = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf8"));
    expect(getVersion()).toBe(version);
  });
});
