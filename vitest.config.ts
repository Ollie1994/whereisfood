import { defineConfig } from "vitest/config";
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

// ⚠ VITEST'S OWN DEFAULT SUFFIX, COPIED VERBATIM. The only thing this split should
// change is WHICH DIRECTORY a project looks in — never which files count as tests.
//
// The first version of this file wrote `src/**/*.test.ts`, which narrows the extension
// set as a side effect of scoping the directory, and the narrowing is SILENT. Verified:
// with `src/lib/zzprobe.test.tsx` and `src/lib/zzprobe2.spec.ts` both containing
// `expect(1).toBe(2)`, `npm run test:run` reported `917 passed` and exited 0. Two
// failing files, never collected, nothing said so.
//
// That is a live hazard rather than a tidiness point: Phase 4 and 5 add hook and
// component tests, which are idiomatically `.tsx` — `useMapLibre.tsx` is already a
// `.tsx` module — so the first UI test written would have passed by not running.
//
// ⚠ AND IT IS NOT FIXED BY WRITING `{ts,tsx}`. That drops `.spec.*`, `.mts`, `.cts`
// and the `.js` family, which is the same "enumerate a set and miss a member" mistake
// `test-utils/purity.ts` paid for four times over. The set belongs to vitest; the
// correct move is to reuse its pattern and prefix a directory, so a future vitest that
// recognises a new extension is inherited rather than missed.
//
// Source: vitest 3.2.7's compiled default, `**/*.{test,spec}.?(c|m)[jt]s?(x)`, read out
// of `node_modules` — the same place the `workspace` deprecation was confirmed.
const TEST_FILES = "*.{test,spec}.?(c|m)[jt]s?(x)";

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment,
          // Co-located, per the testing convention: a test file next to its source.
          // Scoped to `src/` so nothing under `tests/` can drift into the fast suite —
          // the include is what makes "unit runs with Docker stopped" a property of the
          // config rather than of where someone happened to put a file.
          //
          // The DIRECTORY is this line's whole contribution; `TEST_FILES` above is
          // vitest's own pattern, so `.tsx` component tests and `.spec.*` files are
          // collected here exactly as they would be with no `include` at all.
          include: [`src/**/${TEST_FILES}`],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment,
          include: [`tests/integration/**/${TEST_FILES}`],

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
