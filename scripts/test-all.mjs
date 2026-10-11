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
// Sequential on purpose: two concurrent vitest processes share the results cache and
// would race writing it, for the saving of one startup.

import { spawnSync } from "node:child_process";

// ⚠ EVERY project in `vitest.config.ts` must be listed here. A project missing from
// this list is never run by the merge gate — the same silent-skip class #99 closes.
// `unit` reuses `test:run` so the inner-loop script and the gate stay one definition.
const RUNS = [
  { project: "unit", command: "npm run test:run" },
  { project: "integration", command: "npx vitest run --project integration" },
];

const failed = [];
for (const { project, command } of RUNS) {
  console.log(`\n▶ test:all — ${project}: ${command}\n`);
  // `shell: true` so `npm`/`npx` resolve on Windows as well as POSIX.
  const { status } = spawnSync(command, { shell: true, stdio: "inherit" });
  if (status !== 0) failed.push(`${project} (exit ${status ?? "killed"})`);
}

if (failed.length > 0) {
  console.error(`\n✖ test:all failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("\n✔ test:all: every project ran and passed");
