// `npm run test:all` — the merge gate (#99).
//
// Runs EACH vitest project in its own `vitest run`, because vitest's empty-match check
// is per-RUN: in one shared run, a project whose `include` matches nothing is masked by
// the other project's files and the gate exits 0. A separate run per project makes that
// check cover each one — a project collecting zero test FILES fails the gate.
//
// Both runs always execute, even when the first fails, so one gate run reports both
// suites. The gate fails if either run fails.
//
// What it still cannot see: a PARTIAL drop (some files silently uncollected while
// others run) and collected files whose tests are all skipped. Read the per-project
// counts when tests are added, moved or deleted.
//
// Sequential on purpose: two concurrent vitest processes share the results cache and
// would race writing it, for the saving of one startup.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createVitest } from "vitest/node";

// The projects the gate runs, each through its package script so the gate and the
// inner-loop scripts are one definition. RUNS must name exactly the projects
// `vitest.config.ts` declares (checked below against the resolved config): a declared
// project missing here FAILS the gate, even one whose `include` matches nothing, and
// so does an entry here that the config doesn't declare.
const RUNS = [
  { project: "unit", script: "test:run" },
  { project: "integration", script: "test:integration" },
];

// `shell: true` so `npm`/`npx` resolve on Windows as well as POSIX.
const sh = (command, options = {}) => spawnSync(command, { shell: true, ...options });

// Reports a spawn failure (the shell couldn't start) with its real error. Note the
// limit: with `shell: true` the direct child is the shell, so a signal or OOM kill of
// vitest further down usually arrives as an ordinary non-zero exit, not as `signal`.
const outcome = (result) => {
  if (result.error) return `could not start: ${result.error.message}`;
  if (result.signal) return `killed by ${result.signal}`;
  return `exit ${result.status}`;
};

// A filter or flag passed through `npm run test:all -- <args>` can't be honoured: it
// would apply to both runs, and a filter matching only one project's files makes the
// other run collect nothing and fail. Ignoring it silently would be worse — a narrowed
// request reporting a full green run. Refuse instead.
if (process.argv.length > 2) {
  console.error(
    `✖ test:all takes no arguments (got: ${process.argv.slice(2).join(" ")}).\n` +
      `  To narrow a run, use vitest directly: npx vitest run --project <${RUNS.map((run) => run.project).join("|")}> <filter>`,
  );
  process.exit(2);
}

// The gate reuses the inner-loop scripts, so it inherits whatever they say. Check that
// each one really runs `vitest run --project <its project>` and doesn't carry
// `--passWithNoTests`, which would let an empty project pass the gate again.
const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts ?? {};
const weakened = RUNS.filter(({ project, script }) => {
  const body = scripts[script] ?? "";
  return !body.includes("vitest run") || !body.includes(`--project ${project}`) || body.includes("passWithNoTests");
});
if (weakened.length > 0) {
  console.error(
    `✖ test:all: script(s) don't strictly run their project: ${weakened.map((run) => `${run.script} (${scripts[run.script] ?? "missing"})`).join(", ")}.\n` +
      "  Each must be `vitest run --project <name>` with no --passWithNoTests.",
  );
  process.exit(1);
}

// RUNS must match the projects the config DECLARES. Read from the resolved config
// through vitest's Node API, so a project whose `include` matches nothing is still
// seen (the `vitest list` check this replaced only saw projects that had files; that
// gap was deferred from #99 to the vitest 4 upgrade, #125). Resolving the config
// collects and runs no test, so this needs no database. ~200 ms.
let declared;
try {
  const vitest = await createVitest("test", { watch: false });
  declared = vitest.projects.map((project) => project.name);
  await vitest.close();
} catch (error) {
  console.error(`✖ test:all: could not resolve the vitest config (${error.message})`);
  process.exit(1);
}
const inRuns = new Set(RUNS.map((run) => run.project));
const missing = declared.filter((project) => !inRuns.has(project));
const unknown = [...inRuns].filter((project) => !declared.includes(project));
if (missing.length > 0 || unknown.length > 0) {
  if (missing.length > 0) {
    console.error(
      `✖ test:all: project(s) declared in vitest.config.ts but not in RUNS: ${missing.join(", ")}.\n` +
        "  Add them to RUNS in scripts/test-all.mjs, or the gate would never run them.",
    );
  }
  if (unknown.length > 0) {
    console.error(
      `✖ test:all: project(s) in RUNS that vitest.config.ts doesn't declare: ${unknown.join(", ")}.`,
    );
  }
  process.exit(1);
}

const failed = [];
for (const { project, script } of RUNS) {
  console.log(`\n▶ test:all — ${project}: npm run ${script}\n`);
  const result = sh(`npm run ${script}`, { stdio: "inherit" });
  if (result.error || result.status !== 0) failed.push(`${project} (${outcome(result)})`);
}

if (failed.length > 0) {
  console.error(`\n✖ test:all failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log(
  `\n✔ test:all: ${RUNS.map((run) => run.project).join(" and ")} each collected test files and passed.\n` +
    "  Check the per-project counts above: partial drops and all-skipped files aren't detected.",
);
