import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCE_DIR, WORKER_FILES } from "./copy-maplibre-worker.mjs";

// Every module specifier in a minified ES module: `from"x"`, `import"x"`, `import("x")`.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

const importsOf = (file) =>
  [...fs.readFileSync(path.join(SOURCE_DIR, file), "utf8").matchAll(SPECIFIER)].map(
    (match) => match[1],
  );

describe("WORKER_FILES", () => {
  it("exist in the installed maplibre-gl", () => {
    for (const file of WORKER_FILES) {
      expect(fs.existsSync(path.join(SOURCE_DIR, file)), file).toBe(true);
    }
  });

  // The failure this guards is the one PR #136 hit: a worker that imports a file which
  // was not copied next to it 404s in the browser and the map draws no tiles, while
  // every gate stays green. So the copied set must be closed under its own imports.
  it.each(WORKER_FILES)("%s imports only files that are copied with it", (file) => {
    for (const specifier of importsOf(file)) {
      expect(specifier.startsWith("./"), `${file} imports ${specifier}`).toBe(true);
      expect(WORKER_FILES, `${file} imports ${specifier}`).toContain(specifier.slice(2));
    }
  });

  // Without this, a regex that silently matched nothing would make the test above pass
  // vacuously.
  it("finds the worker's import of the shared chunk", () => {
    expect(importsOf("maplibre-gl-worker.mjs")).toContain("./maplibre-gl-shared.mjs");
  });
});
