// Copies MapLibre 6's worker into `public/maplibre/`, so the browser can load it from
// a fixed same-origin URL. Runs as the `predev` and `prebuild` npm hooks; the folder
// is gitignored, so it always matches the installed `maplibre-gl`.
//
// WHY NOT THE BUNDLER. MapLibre documents `setWorkerUrl(new URL("maplibre-gl/dist/
// maplibre-gl-worker.mjs", import.meta.url))` for Turbopack / Next.js. With Next 16.3.8
// that emits the worker as a static asset, copied verbatim, while the worker's first
// line is `import … from "./maplibre-gl-shared.mjs"`. The shared chunk lands under a
// hashed name, so that import 404s, the worker dies, and the map draws only its
// background layer (PR #136, verified in the browser).
//
// So the worker AND everything it imports must sit side by side. `WORKER_FILES` is that
// set, and `copy-maplibre-worker.test.mjs` fails if a MapLibre upgrade makes the worker
// import a file that is not in it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const SOURCE_DIR = path.join(ROOT, "node_modules", "maplibre-gl", "dist");
export const TARGET_DIR = path.join(ROOT, "public", "maplibre");

// The worker entry first; `useMapLibre.tsx` passes `/maplibre/<entry>` to setWorkerUrl.
export const WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

export function copyWorkerFiles() {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  for (const file of WORKER_FILES) {
    fs.copyFileSync(path.join(SOURCE_DIR, file), path.join(TARGET_DIR, file));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  copyWorkerFiles();
  console.log(`maplibre worker: copied ${WORKER_FILES.join(", ")} to public/maplibre/`);
}
