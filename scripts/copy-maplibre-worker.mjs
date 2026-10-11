// Copies MapLibre 6's worker (and what it imports, plus their source maps) from
// node_modules into `public/maplibre/<version>/`. Runs as the `postinstall`, `predev`
// and `prebuild` npm hooks: `postinstall` keeps the copy in step with node_modules
// however Next is started later (`npx next dev` included); the other two make sure it
// is there before every `npm run dev` / `npm run build`, e.g. after an install with
// `--ignore-scripts`. The folder is gitignored.
//
// IDEMPOTENT ON PURPOSE. Three hooks means it runs often, sometimes while a dev server
// is serving these files, so it rewrites only a file whose content changed and removes
// only folders for OTHER versions. It never deletes the folder in use (a Windows
// `EBUSY` would abort `npm run build`).
//
// What gets copied, where, and why the bundler can't do it: `src/lib/maplibre-worker.mjs`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORKER_DIR, WORKER_FILES, workerDir } from "../src/lib/maplibre-worker.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIR = path.join(ROOT, "node_modules", "maplibre-gl");
const PUBLIC_DIR = path.join(ROOT, "public");
const PACKAGE_JSON = path.join(PACKAGE_DIR, "package.json");

// Under `postinstall`, maplibre-gl can legitimately be absent (`npm uninstall
// maplibre-gl`, a partial install), and failing there would block dependency
// management. Before `dev`/`build` it can't, so there a missing package throws below.
if (!fs.existsSync(PACKAGE_JSON) && process.env.npm_lifecycle_event === "postinstall") {
  console.log("maplibre worker: maplibre-gl is not installed, nothing to copy");
  process.exit(0);
}

const { version } = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
const target = path.join(PUBLIC_DIR, ...workerDir(version).split("/"));
fs.mkdirSync(target, { recursive: true });

// Each file ends with `//# sourceMappingURL=<file>.map`; copy the map too, so devtools
// neither 404s on it nor shows minified worker frames.
const sources = WORKER_FILES.flatMap((file) => [file, `${file}.map`]).filter(
  (file) => WORKER_FILES.includes(file) || fs.existsSync(path.join(PACKAGE_DIR, "dist", file)),
);

let copied = 0;
for (const file of sources) {
  // A missing worker file throws here, which fails `dev` / `build` loudly.
  const from = fs.readFileSync(path.join(PACKAGE_DIR, "dist", file));
  const to = path.join(target, file);
  if (fs.existsSync(to) && fs.readFileSync(to).equals(from)) continue;
  fs.writeFileSync(to, from);
  copied++;
}

// Folders for older versions, so they don't pile up. Never the one just written.
for (const entry of fs.readdirSync(path.join(PUBLIC_DIR, WORKER_DIR))) {
  if (entry !== version) {
    fs.rmSync(path.join(PUBLIC_DIR, WORKER_DIR, entry), { recursive: true, force: true });
  }
}

console.log(
  `maplibre worker: public/${workerDir(version)}/ ` +
    (copied ? `updated ${copied} file(s)` : "already up to date"),
);
