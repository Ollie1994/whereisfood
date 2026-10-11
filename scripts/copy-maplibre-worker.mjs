// Copies MapLibre 6's worker (and what it imports, plus their source maps) from
// node_modules into `public/maplibre/<version>/`. Runs as the `postinstall`, `predev`
// and `prebuild` npm hooks: `postinstall` keeps the copy in step with node_modules
// however Next is started later (`npx next dev` included); the other two refresh it
// before every `npm run dev` / `npm run build`. The folder is gitignored.
//
// What gets copied, where, and why the bundler can't do it: `src/lib/maplibre-worker.mjs`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORKER_DIR, WORKER_FILES, workerDir } from "../src/lib/maplibre-worker.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIR = path.join(ROOT, "node_modules", "maplibre-gl");
const PUBLIC_DIR = path.join(ROOT, "public");

const { version } = JSON.parse(fs.readFileSync(path.join(PACKAGE_DIR, "package.json"), "utf8"));
const target = path.join(PUBLIC_DIR, ...workerDir(version).split("/"));

// Start clean, so copies for older versions don't pile up.
fs.rmSync(path.join(PUBLIC_DIR, WORKER_DIR), { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

for (const file of WORKER_FILES) {
  // A missing source throws, which fails `npm install` / `dev` / `build` loudly.
  fs.copyFileSync(path.join(PACKAGE_DIR, "dist", file), path.join(target, file));
  // Each file ends with `//# sourceMappingURL=<file>.map`; copy the map too, so
  // devtools neither 404s on it nor shows minified worker frames.
  const map = path.join(PACKAGE_DIR, "dist", `${file}.map`);
  if (fs.existsSync(map)) fs.copyFileSync(map, path.join(target, `${file}.map`));
}

console.log(`maplibre worker: copied ${WORKER_FILES.join(", ")} to public/${workerDir(version)}/`);
