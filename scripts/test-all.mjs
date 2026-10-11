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

// The declared projects, each run through its package script so the gate and the
// inner-loop scripts are one definition. A project that has test files but is missing
// here FAILS the gate (checked below against `vitest list`).
//
// ⚠ Known gap: a project whose `include` matches NOTHING doesn't appear in
// `vitest list` either, so an empty project that is also missing here goes unnoticed.
// Closing it needs the project names from the resolved config (vitest's Node API),
// deferred to the vitest 4 upgrade (#125), which changes that API.
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

// Every project that has test files must be in RUNS. `--filesOnly` lists files per
// project without collecting or running any test, so this needs no database.
const listing = sh("npx vitest list --filesOnly --json", {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (listing.error || listing.status !== 0) {
  console.error(
    `✖ test:all: could not list test files (${outcome(listing)})\n${listing.stdout ?? ""}${listing.stderr ?? ""}`,
  );
  process.exit(1);
}
let listed;
try {
  listed = new Set(JSON.parse(listing.stdout).map((entry) => entry.projectName));
} catch (error) {
  console.error(`✖ test:all: could not parse \`vitest list\` output (${error.message})`);
  process.exit(1);
}
const declared = new Set(RUNS.map((run) => run.project));
const undeclared = [...listed].filter((project) => !declared.has(project));
if (undeclared.length > 0) {
  console.error(
    `✖ test:all: project(s) with test files but not in RUNS: ${undeclared.join(", ")}.\n` +
      "  Add them to RUNS in scripts/test-all.mjs, or the gate would never run them.",
  );
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
