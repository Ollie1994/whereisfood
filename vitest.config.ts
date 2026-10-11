import { defaultExclude, defaultInclude, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// TWO PROJECTS, SPLIT BY WHAT THEY NEED TO RUN — not by what they test.
//
// Phase 3 added an integration layer that talks to a real local Supabase (#72). Without
// this split one stopped Docker daemon fails the entire suite, which holds every pure
// test hostage to infrastructure it does not use. The split landed BEFORE the first
// integration test exists, so the boundary is in place when there is something to put
// behind it rather than being retrofitted around a suite that already went red.
//
// `projects`, not `workspace`: vitest 3.2 deprecated `workspace` and vitest 4 removed
// it (official v4 migration guide).

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

// Node environment in both — nothing under test touches a DOM. The unit tests cover
// plain modules, and the integration layer talks to Postgres over HTTP.
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
//   both reported `917 passed`, exit 0, never collected. Phases 6 and 7 add `.tsx` hook
//   and component tests — `useMapLibre.tsx` is already `.tsx` — so the first UI test
//   written would have passed by not running.
//
//   DIRECTORIES (PR #98 r2). Fixing the extensions left `src/**` as the unit root, so a
//   test in neither root belonged to no project at all. Verified: failing files at
//   `tests/helpers/zz.test.ts` and `scripts/zz.test.ts` left BOTH scripts at exit 0.
//   `scripts/` is not hypothetical — it holds the repo's runnable `.mjs` tools, and a
//   test written next to one would have run in neither project.
//
// Same class, one axis apart, and the second was introduced by the fix for the first.
// So the rule is now structural rather than remembered: `unit` is vitest's DEFAULT
// reach minus one directory, and `integration` is that directory. Neither project
// states a file pattern of its own, so neither can narrow one.
//
// `defaultInclude` and `defaultExclude` are imported from `vitest/config` — the real
// values, not a copy of them. r1 hand-copied the pattern correctly and that was still
// the weaker move: a copy is right until vitest changes, and nothing would say when it
// had. Current values (vitest 4.1.11), for the reader: include
// `["**/*.{test,spec}.?(c|m)[jt]s?(x)"]`, exclude `["**/node_modules/**", "**/.git/**"]`.
// Vitest 3 also excluded `dist`, `cypress`, the `.{idea,git,cache,output,temp}` dotfile
// directories and tool configs. Of those, only `supabase/.temp` exists here (via
// `.temp`), and it is now in `BUILD_OUTPUT` below with the rest of `.gitignore`'s
// generated folders. The per-project file counts were unchanged by the upgrade.
const INTEGRATION_INCLUDE = defaultInclude.map((pattern) => `${INTEGRATION_DIR}/${pattern}`);

// Generated directories: every generated folder `.gitignore` names (`/coverage`,
// `/.next/`, `/out/`, `/build`, `.vercel`, `/public/maplibre/`, `supabase/.branches`,
// `supabase/.temp`). Vitest 4's `defaultExclude` covers none of them, see the note on
// the unit project's `exclude`. The last four were added with vitest 4 (PR #137):
// vitest 3's defaults had covered `supabase/.temp`, and the mirror had been partial.
// A folder added to `.gitignore` as generated belongs here too.
//
// ⚠ ANCHORED EXACTLY AS `.gitignore` WRITES THEM. An entry with a slash (`/build`,
// `supabase/.temp`) is root-anchored there, so it is here: a first pass used
// `**/build/**` and `**/out/**`, which reach any depth and would silently swallow a
// legitimate `src/lib/build/thing.test.ts` (the class of over-reach #170 and #172
// caught in the other direction, equally silent). `.vercel` has no slash, so git
// matches it at any depth, and so does `**/.vercel/**` here.
//
// Verified both ways: a failing test under `.next/` and `coverage/` is NOT collected,
// and a failing test under `src/lib/build/` IS. Re-verified on vitest 4.1.11 for
// `supabase/.temp/`, `.vercel/`, `src/.vercel/` and `public/maplibre/` (not
// collected) and `src/lib/build/` (collected).
const BUILD_OUTPUT = [
  ".next/**",
  "out/**",
  "build/**",
  "coverage/**",
  "**/.vercel/**",
  "public/maplibre/**",
  "supabase/.branches/**",
  "supabase/.temp/**",
];

export default defineConfig({
  test: {
    // ⚠ ADDING A PROJECT? Add it to `RUNS` in `scripts/test-all.mjs` too. The merge
    // gate runs each project by name (#99). It reads the declared projects from this
    // resolved config and FAILS while any is missing from `RUNS` (even one that collects
    // no files), so forgetting is loud, not silent — but the gate is red until the list is updated.
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
          // ⚠ `defaultExclude` DOES NOT COVER BUILD OUTPUT. Since vitest 4 it is only
          // `node_modules` and `.git` — no `.next`, no `out`, no `build`, no `coverage`.
          // Verified (on vitest 3, whose list was longer but had none of them either): a
          // failing `.next/zz/orphan.test.ts` is collected and fails `test:run`.
          //
          // Latent rather than live — nothing emits a `*.test.*` file into `.next`
          // today — and NOT a regression, since `dev`'s config had the same reach. But
          // `include: defaultInclude` restored that reach in r2 after r1's `src/**` had
          // narrowed it away, and widening something back without noticing is how the
          // r1→r2 overcorrection happened in the first place.
          //
          // The list comes from `.gitignore`, which is this project's own declaration
          // of what is generated (`BUILD_OUTPUT` above names each entry). That makes
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
          // The same file also refuses to run against a non-local database — not
          // because the cleanup helper is unscoped (it has been prefix-scoped since
          // PR #106 r1) but because this suite deletes rows at all, its predicate has
          // been wrong three times, and no such failure has ever produced a red test.
          setupFiles: ["tests/integration/setup.ts"],
          // The mirror of `unit`'s exclusion, derived from the same constant so the two
          // cannot drift into overlapping or leaving a gap between them. Globstar
          // matches zero segments, so a file directly in `tests/integration/` is
          // collected as well as one nested under it.
          include: INTEGRATION_INCLUDE,

          // ⚠ `passWithNoTests` IS NOT USED ANYWHERE (since #99). It is on the
          // `NonProjectOptions` list, so it could only ever live on a script, and
          // `test:integration` used to carry it, originally so that script wasn't red
          // before #72 wrote the first integration file. That reason is gone: the
          // directory is tracked and non-empty. Every `vitest run` script (`test:run`,
          // `test:integration`, and so `test:all`) treats a project that collects zero test
          // FILES as a failure, because once a suite exists, that means a broken glob, not a
          // legitimately empty state. (Watch mode, `npm test`, just waits instead of exiting.)
          //
          // History, kept because it is why the gate looks the way it does: an earlier
          // version of this comment said putting the flag on the script "keeps it
          // scoped to integration". That was false. Vitest checks for an empty match
          // per RUN, never per project, so with `test:all` as one `vitest run` a broken
          // unit `include` was masked by the integration files. Verified at the time:
          //
          //   npx vitest run                     → exit 0, "Test Files 1 passed"
          //   npx vitest run --passWithNoTests   → exit 0, identical
          //   npx vitest run --project unit      → exit 1
          //
          // So the merge gate DID report success while running zero unit tests, until
          // #99. Only a run of a project on its own makes its emptiness visible.
          //
          // ⚠ RESOLVED BY #99, FROM OUTSIDE THE CONFIG, BECAUSE IT HAS TO BE. A guard
          // inside a project cannot fire when that project collects nothing, so
          // `test:all` is `scripts/test-all.mjs`. It runs each project in its own
          // `vitest run` (through `test:run` and `test:integration`), always runs both,
          // fails if either fails, and fails if a project this config declares isn't in
          // its `RUNS` (since #125, via vitest's Node API; before, via `vitest list`, which
          // missed a project with no files). Verified by breaking each project's `include`
          // in turn: non-zero both times, 0 once restored.
          //
          // What it does NOT catch:
          //   - a PARTIAL drop (e.g. every `.tsx` test silently uncollected while other
          //     files still run). The structural include/exclude rule above guards
          //     that; a collected-vs-on-disk comparison was considered for #99 and
          //     deferred until a partial drop actually recurs.
          //   - collected files whose tests are ALL skipped (`describe.skip`,
          //     `it.skipIf`). Those count as collected; the check is zero FILES, not
          //     zero executed tests.

          // ⚠ SEQUENTIAL EXECUTION — the setting this split exists for, and the one
          // whose absence is silent.
          //
          // Vitest parallelises test FILES by default, and every integration file will
          // share one local database. Concurrent files mutating the same rows produce
          // order-dependent flakes that read like logic bugs in the code under test —
          // the plan flags this as M5, and it is the expensive kind of failure because
          // the first instinct is to debug the service rather than the runner.
          //
          // `fileParallelism: false` — WHAT #61 SPECIFIED, POSSIBLE SINCE VITEST 4. On
          // vitest 3.2.7 it could not be set on a project (it was in `NonProjectOptions`),
          // so this used `poolOptions.forks.singleFork` instead. Vitest 4 removed
          // `poolOptions` and allows pool options per project (official v4 migration
          // guide); `fileParallelism` is no longer in `NonProjectOptions`, and `false`
          // "will override `maxWorkers` option to `1`" (its type docs).
          //
          // ⚠ NOT THE GUIDE'S `singleFork` MAPPING. The guide maps `singleFork` to
          // `maxWorkers: 1, isolate: false`, which ALSO turns off per-file module
          // isolation. `singleFork` never did that (`isolate` defaulted to true), so the
          // suite has always run isolated. Only the sequencing is wanted, so only the
          // sequencing is set, and isolation stays what it was.
          //
          // Verified, not trusted, on each vitest major: two throwaway files appending
          // start/end markers to a shared log. Without sequencing they interleave (vitest
          // 3 observed `b-start, a-start, a-end, b-end`); with it they nest: `a-start,
          // a-end, b-start, b-end` (vitest 4.1.11, PR for #125). Deleted afterwards.
          fileParallelism: false,
        },
      },
    ],
  },
});
