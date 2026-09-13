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
          exclude: [...defaultExclude, `${INTEGRATION_DIR}/**`],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment,
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
          // Putting it on the SCRIPT rather than in the root `test` block is what keeps
          // it scoped: at the root it would also apply to `unit`, where an empty match
          // means a broken `include` glob and should stay loud.
          //
          // ⚠ IT STAYS AFTER #72, a trade accepted knowingly: a typo in the glob above
          // would then pass silently with zero tests. The integration suite is where
          // that gets closed, with its own non-vacuity assertion in the style
          // `parser/purity.test.ts` already uses ("finds parser modules to check") —
          // noted here so #72 inherits the obligation rather than discovering the hole.

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
