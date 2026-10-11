// Where MapLibre 6's worker is served from. ONE definition, shared by the browser
// (`useMapLibre.tsx` passes `workerUrl(getVersion())` to `setWorkerUrl`) and by Node
// (`scripts/copy-maplibre-worker.mjs` copies the files there), so the two cannot
// drift apart. Plain `.mjs` because the script runs on Node without a TS loader.
//
// WHY THE VERSION IS IN THE PATH, AND WHAT IT DOES NOT FIX. The main-thread MapLibre
// code ships in a hashed Next chunk; `public/` files are not hashed. Unversioned, a tab
// still running an old chunk after a MapLibre upgrade deploys would load the NEW worker
// and fail inside it, with the old message protocol. Versioned, the same tab asks for
// its own version's worker, which the new deploy no longer serves: a plain 404 and no
// tiles until a reload. That is a clearer failure, not a fix. A real fix would keep old
// versions reachable (skew protection, or committing every version), which a one-admin
// MVP doesn't need. `getVersion()` returns the installed package version (6.11.2 =
// `maplibre-gl/package.json`, checked in the test).
//
// The URL is root-relative. If `basePath` or `assetPrefix` is ever set in
// `next.config.ts`, it must be prefixed here too, or the worker 404s.
//
// WHY NOT THE BUNDLER. MapLibre documents `setWorkerUrl(new URL("maplibre-gl/dist/
// maplibre-gl-worker.mjs", import.meta.url))` for Turbopack / Next.js. With Next 16.3.8
// that emits the worker as a static asset copied verbatim, while the worker's first
// line is `import … from "./maplibre-gl-shared.mjs"` and the shared chunk lands under
// a hashed name. The import 404s, the worker dies, and the map draws only its
// background (PR #136, verified in the browser). So the worker and everything it
// imports must sit side by side: `WORKER_FILES`, kept closed under its own imports by
// `maplibre-worker.test.mjs`.

export const WORKER_DIR = "maplibre";

// The worker entry first, then what it imports.
export const WORKER_FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

/** @param {string} version e.g. "6.11.2" */
export const workerDir = (version) => `${WORKER_DIR}/${version}`;

/** @param {string} version e.g. "6.11.2" */
export const workerUrl = (version) => `/${workerDir(version)}/${WORKER_FILES[0]}`;
