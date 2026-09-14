import { defaultExclude, defaultInclude, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// TWO PROJECTS, SPLIT BY WHAT THEY NEED TO RUN — not by what they test.
//
// Phase 3 adds an integration layer that talks to a real local Supabase (#72). Without
// this split one stopped Docker daemon fails the entire suite, which holds the 917 pure
// tests hostage to infrastructure they do not use. The split lands BEFORE the first
// integration test exists, so the boundary is in place when there is something to put
// behind it rather than being retrofitted around a suite that already went red.
//
// `projects` rather than `workspace`: vitest 3.2.7's own types mark the latter
// `@deprecated use the 'projects' field in the root config instead` — verified in
// `node_modules/vitest/dist/config.d.ts`, not assumed from the changelog.

// ⚠ DECLARED ONCE AND SPREAD INTO BOTH PROJECTS, because a project config is a full
// vite config and does NOT inherit `resolve` from the root. A root-level alias looks
// like it should apply and silently does not — the failure is an unresolved `@/lib/...`
// import in whichever project was left out, which reads as a missing module rather than
// as a config mistake. Both entries below carry it, and `tests/integration/` importing
// through `@/` is the whole reason the integration project needs it too.
//
// `vite-tsconfig-paths` would remove the duplication and is deliberately not taken on
// (#28): one alias mirroring one `tsconfig` path does not justify a plugin, and the
// mirroring is asserted by the suites themselves failing to resolve if it drifts.
const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

// Node environment in both — nothing under test touches a DOM. The validators are pure
// Node modules (crypto), the parser is pure, and the integration layer talks to
// Postgres over HTTP.
const environment = "node";

// The one directory that needs infrastructure. Everything else is a unit test by
// definition, and the projects below are written as exactly that statement.
const INTEGRATION_DIR = "tests/integration";

// ⚠ THE SPLIT SUBTRACTS; IT NEVER ENUMERATES. This file has now twice narrowed what
// counts as a test as a SIDE EFFECT of deciding where integration tests live, and both
// times the narrowing failed green:
//
//   EXTENSIONS (PR #98 r1). `src/**/*.test.ts` silently dropped `.tsx`, `.spec.*`,
//   `.mts` and `.cts`. A failing `src/lib/x.test.tsx` and a failing `src/lib/x.spec.ts`
//   both reported `917 passed`, exit 0, never collected. Phase 4 and 5 add `.tsx` hook
//   and component tests — `useMapLibre.tsx` is already `.tsx` — so the first UI test
//   written would have passed by not running.
//
//   DIRECTORIES (PR #98 r2). Fixing the extensions left `src/**` as the unit root, so a
//   test in neither root belonged to no project at all. Verified: failing files at
//   `tests/helpers/zz.test.ts` and `scripts/zz.test.ts` left BOTH scripts at exit 0.
//   `scripts/` is not hypothetical — `scripts/reparse.mjs` is #71, this phase.
//
// Same class, one axis apart, and the second was introduced by the fix for the first.
// So the rule is now structural rather than remembered: `unit` is vitest's DEFAULT
// reach minus one directory, and `integration` is that directory. Neither project
// states a file pattern of its own, so neither can narrow one.
//
// `defaultInclude` and `defaultExclude` are imported from `vitest/config` — the real
// values, not a copy of them. r1 hand-copied the pattern correctly and that was still
// the weaker move: a copy is right until vitest changes, and nothing would say when it
// had. Current values, for the reader: include `["**/*.{test,spec}.?(c|m)[jt]s?(x)"]`,
// exclude `node_modules`, `dist`, `cypress`, dotfile caches and tool configs.
const INTEGRATION_INCLUDE = defaultInclude.map((pattern) => `${INTEGRATION_DIR}/${pattern}`);

// Generated directories, mirroring `.gitignore`'s `/coverage`, `/.next/`, `/out/` and
// `/build`. Vitest's `defaultExclude` does not cover any of them — see the note on the
// unit project's `exclude`.
//
// ⚠ ROOT-ANCHORED, matching how `.gitignore` writes them. A first pass used `**/build/**`
// and `**/out/**`, which reach any depth and would silently swallow a legitimate
// `src/lib/build/thing.test.ts` — the same class of over-reach as #170 and #172, in the
// opposite direction: excluding too much rather than including too little, and equally
// silent. Vitest resolves these relative to the project root, so no leading `**/` is
// what pins them to the four directories `.gitignore` actually names.
//
// Verified both ways: a failing test under `.next/` and `coverage/` is NOT collected,
// and a failing test under `src/lib/build/` IS.
const BUILD_OUTPUT = [".next/**", "out/**", "build/**", "coverage/**"];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment,
          // EVERYTHING VITEST WOULD COLLECT, MINUS the one directory that needs a
          // database. Not `src/**`: a test is a unit test unless it is an integration
          // test, and defining it the other way round is what left orphans unrun.
          //
          // Co-location stays the convention — a test file next to its source — but it
          // is now a convention rather than a thing the runner enforces by ignoring
          // whatever breaks it.
          include: defaultInclude,
          // `exclude` REPLACES vitest's defaults rather than extending them, so the
          // defaults are spread back in. Dropping them would pull `node_modules` into
          // the run.
          //
          // ⚠ `defaultExclude` DOES NOT COVER BUILD OUTPUT. It is `node_modules`,
          // `dist`, `cypress`, the `.{idea,git,cache,output,temp}` dotfiles and tool
          // configs — no `.next`, no `out`, no `build`, no `coverage`. Verified: a
          // failing `.next/zz/orphan.test.ts` is collected and fails `test:run`.
          //
          // Latent rather than live — nothing emits a `*.test.*` file into `.next`
          // today — and NOT a regression, since `dev`'s config had the same reach. But
          // `include: defaultInclude` restored that reach in r2 after r1's `src/**` had
          // narrowed it away, and widening something back without noticing is how the
          // r1→r2 overcorrection happened in the first place.
          //
          // The list comes from `.gitignore`, which is this project's own declaration
          // of what is generated: `/coverage`, `/.next/`, `/out/`, `/build`. That makes
          // it a mirror of an existing statement rather than a set invented here —
          // which is the distinction that matters after #173, where copying a set
          // vitest owns was the mistake. This set is ours.
          exclude: [...defaultExclude, `${INTEGRATION_DIR}/**`, ...BUILD_OUTPUT],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment,

          // ⚠ REQUIRED, NOT CONVENIENCE. `src/lib/supabase.ts` reads `process.env` at
          // MODULE SCOPE and throws when a variable is missing, and vitest does not load
          // `.env.local` the way `next dev` does — so the environment has to be
          // populated before any test module imports it. A helper cannot guarantee that
          // (ESM evaluates imports in declaration order, and a linter may reorder them);
          // `setupFiles` is the only deterministic seam.
          //
          // The same file also refuses to run against a non-local database, because
          // `resetTables()` issues unfiltered deletes.
          setupFiles: ["tests/integration/setup.ts"],
          // The mirror of `unit`'s exclusion, derived from the same constant so the two
          // cannot drift into overlapping or leaving a gap between them. Globstar
          // matches zero segments, so a file directly in `tests/integration/` is
          // collected as well as one nested under it.
          include: INTEGRATION_INCLUDE,

          // ⚠ `passWithNoTests` IS NOT HERE EITHER, and for the same reason — it is on
          // the `NonProjectOptions` list, so it belongs to the run rather than to a
          // project. It lives on the `test:integration` script as `--passWithNoTests`.
          //
          // Vitest FAILS on an empty match by default, so without it that script is red
          // from the moment this config lands until #72 writes the first file — red for
          // a reason unrelated to anything being wrong. Verified both ways: exit 1
          // without the flag, exit 0 with it, including when `tests/integration/` does
          // not exist at all (which is what a fresh clone has — git tracks no empty
          // directory, so no `.gitkeep` is needed).
          //
          // It is on `test:integration` ONLY. `test:all` does not carry it and does not
          // need it: vitest's empty-match check is per-RUN, so a run that also collects
          // the 917 unit tests is never empty. Measured — `npx vitest run` with
          // `tests/integration/` absent exits 0 with no flag at all.
          //
          // ⚠ "PUTTING IT ON THE SCRIPT KEEPS IT SCOPED TO INTEGRATION" IS WHAT THIS
          // SAID, AND IT IS FALSE. The claim was that at the root the flag would also
          // mute `unit`, where an empty match means a broken glob and should stay loud.
          // Vitest never checks per-project emptiness, so the flag's LOCATION changes
          // nothing about `unit`. Verified by breaking the unit `include` to match
          // nothing while one real integration test existed:
          //
          //   npx vitest run                     → exit 0, "Test Files 1 passed"
          //   npx vitest run --passWithNoTests   → exit 0, identical
          //   npx vitest run --project unit      → exit 1
          //
          // So `test:all` — the documented MERGE GATE — reports success while running
          // zero unit tests, and the flag is not what allows it. Only running a project
          // alone makes its emptiness visible, because then the RUN is empty.
          //
          // ⚠ THE OBLIGATION HANDED TO #99 IS THEREFORE BOTH PROJECTS, NOT INTEGRATION.
          // And it cannot be discharged from inside the project it protects: an
          // assertion living in `unit` does not run when `unit` collects nothing, so a
          // vacuity guard inside a vacant project never fires. It needs an external
          // comparison — collected files against files on disk — which is why #99 is
          // its own issue rather than a line here.

          // ⚠ SEQUENTIAL EXECUTION — the setting this split exists for, and the one
          // whose absence is silent.
          //
          // Vitest parallelises test FILES by default, and every integration file will
          // share one local database. Concurrent files mutating the same rows produce
          // order-dependent flakes that read like logic bugs in the code under test —
          // the plan flags this as M5, and it is the expensive kind of failure because
          // the first instinct is to debug the service rather than the runner.
          //
          // ⚠ IT IS NOT `fileParallelism: false`, WHICH IS WHAT #61 SPECIFIES. That
          // option cannot be set on a project at all: vitest 3.2.7 types
          // `ProjectConfig` as `Omit<InlineConfig, NonProjectOptions | …>` and
          // `NonProjectOptions` lists `fileParallelism` (and `passWithNoTests`, see
          // `package.json`). Writing it here is a `tsc` error, not a silent no-op —
          // "Object literal may only specify known properties, and 'fileParallelism'
          // does not exist in type 'ProjectConfig'" — but the first version of this
          // file had it, and a throwaway sequencing probe caught the interleaving
          // before the gate did.
          //
          // The project-level lever is `poolOptions.forks.singleFork`, which
          // `ProjectConfig` explicitly re-adds via `Pick<…, "singleFork" | "isolate">`.
          //
          // `pool` is pinned alongside it rather than left to the default. `singleFork`
          // configures the FORKS pool specifically, so it silently stops applying if
          // the pool ever changes — naming the pool is what keeps the two from
          // drifting apart.
          pool: "forks",
          poolOptions: {
            forks: {
              // One child process, so files run one after another.
              //
              // Verified, not trusted: two throwaway files appending start/end markers
              // to a shared log. Without this they interleave — the observed order was
              // `b-start, a-start, a-end, b-end`. With it they nest: `a-start, a-end,
              // b-start, b-end`. Deleted afterwards; #72 owns the real suite, and the
              // plan already requires it green on THREE consecutive runs precisely
              // because one pass does not prove sequencing is holding.
              singleFork: true,
            },
          },
        },
      },
    ],
  },
});
