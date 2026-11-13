// `node scripts/controls-trigger.mjs <baseRef>` — whether this PR runs the full schema
// controls (Phase 8 plan step 3, "Functions and scripts"; IS #287). CI's `controls` job
// (#288) calls it with `github.base_ref` on the PR's merge commit, checked out with
// `fetch-depth: 2`, and runs `node scripts/controls.mjs` in full when it prints `true`.
//
// Prints `true` or `false` on stdout, and on stderr each changed path that matched a
// trigger. Exit 0 either way; 1 when it can't tell which files the PR changed
// (`changedPaths` throws); 2 for a missing base ref. A caller reads anything but `true`
// or `false` on stdout as a failure: if the run-only-when-executed check below were ever
// false, the script would print nothing and exit 0.
//
// What it can't see: a change that alters what the controls test without touching a
// trigger path (a tool the controls run that no file imports, other than the `supabase`
// CLI, which the package files stand for; an import the guard doesn't follow, its header
// says which).

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Paths whose change runs the full set. An entry ending in `/` covers everything under
// it; any other entry is one file. Each is a repo-relative path with `/`, as git prints.
// `controls-trigger-coverage.test.mjs` fails when a test a control names reaches a file
// this list doesn't cover; `controls-trigger.test.mjs` has one case per entry and checks
// each exists.
// - The controls and their runner, this script, the workflow that runs them, and
//   `write-env-local.mjs`, which writes the `.env.local` their tests read: a PR that
//   changes how the full set runs also runs it (the workflow and this script: the owner's
//   call, round 3 on PR #283; `write-env-local.mjs`: round 1 on PR #316). `.env.example`
//   isn't one: that script reads only `NEXT_PUBLIC_PMTILES_URL` from it, which no file
//   the named tests reach reads (grep, round 2 on PR #316), and a value it refuses fails
//   `integration` and `build` on the same PR.
// - The schema, the seed and the local stack's config.
// - The tests the controls' `-- run:` lines name, their setup file, and every file those
//   reach (the guard's list).
// - `package.json` and `package-lock.json` stand for every bare package import, which the
//   guard doesn't follow, and for the `supabase` CLI, which sets the local stack (the
//   owner's call, round 2 on PR #283).
export const TRIGGERS = [
  "supabase/migrations/",
  "supabase/seed.sql",
  "supabase/config.toml",
  "tests/controls/",
  "scripts/controls.mjs",
  "scripts/controls-trigger.mjs",
  "scripts/write-env-local.mjs",
  ".github/workflows/ci.yml",
  "tests/integration/setup.ts",
  "tests/integration/helpers.ts",
  "tests/integration/db-trucks.test.ts",
  "tests/integration/rls.test.ts",
  "tests/integration/schema.test.ts",
  "vitest.config.ts",
  "src/lib/db/",
  "src/lib/supabase.ts",
  "src/lib/supabase-session.ts",
  "src/lib/database.types.ts",
  "src/lib/types.ts",
  "package.json",
  "package-lock.json",
];

// Pure. The TRIGGERS entry that covers `path`, or undefined.
export function triggerFor(path) {
  return TRIGGERS.find((entry) => (entry.endsWith("/") ? path.startsWith(entry) : path === entry));
}

// Pure. True for every PR into `main` (the plan's Q30), and for a PR that changes a path
// a TRIGGERS entry covers.
export function needsFullControls(paths, baseRef) {
  return baseRef === "main" || paths.some((path) => triggerFor(path) !== undefined);
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  // `error` is set when git couldn't start, and also when its output passed `maxBuffer`
  // (ENOBUFS), so the message names neither. A limit: `maxBuffer` is Node's default, 1 MiB,
  // so a PR whose path list is longer fails closed here (exit 1) rather than answering.
  if (result.error) throw new Error(`git ${args[0]} didn't complete: ${result.error.message}`);
  return result;
}

function failed(args, result) {
  const detail = (result.stderr || result.stdout || "").trim().split("\n")[0];
  return new Error(`git ${args.join(" ")} failed (exit ${result.status})${detail ? `: ${detail}` : ""}`);
}

// The files the PR changes: its merge commit (HEAD, what a `pull_request` run checks out)
// against the merge's first parent, the base branch's tip. A default checkout fetches
// depth 1, which has no parent, and a three-dot diff there finds no merge base; with
// `fetch-depth: 2` both parents are fetched (the plan, "Functions and scripts").
//
// Throws when it can't tell: HEAD has no first or no second parent (not a merge commit,
// so a diff against HEAD^1 would hold one commit's changes, not the PR's), or a git
// command fails. An empty list from a diff that succeeded is a PR with no net change.
//
// `--no-renames`, so a file moved out of a trigger path lists its old path too (a rename
// lists only the new one by default). `-z`, so a path git would quote or escape comes
// back as it is.
export function changedPaths(cwd = process.cwd()) {
  for (const parent of ["HEAD^1", "HEAD^2"]) {
    const args = ["rev-parse", "--verify", "--quiet", `${parent}^{commit}`];
    const result = git(args, cwd);
    // `--verify --quiet` exits 1 for a missing commit; anything else is git failing (not a
    // repository: 128).
    if (result.status === 1) {
      throw new Error(`${parent} is missing: the checkout needs the PR's merge commit and fetch-depth: 2`);
    }
    if (result.status !== 0) throw failed(args, result);
  }
  const args = ["diff", "--name-only", "--no-renames", "-z", "HEAD^1", "HEAD"];
  const result = git(args, cwd);
  if (result.status !== 0) throw failed(args, result);
  return result.stdout.split("\0").filter((path) => path !== "");
}

// Run only when executed, not when a test imports it: `import.meta.main` (Node v26.13.0:
// true when run, false when imported, IS #286's PR), and on a Node without it the entry
// script's path compared with this file's.
const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url);
if (isMain) {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error("usage: node scripts/controls-trigger.mjs <baseRef>, e.g. dev or main");
    process.exit(2);
  }
  let paths;
  try {
    paths = changedPaths();
  } catch (err) {
    // `::error::` makes GitHub Actions show it as an annotation; locally it's plain text.
    console.error(`::error::controls-trigger: ${err.message}`);
    process.exit(1);
  }
  if (baseRef === "main") console.error("controls-trigger: a PR into main runs the full set");
  for (const path of paths) {
    const entry = triggerFor(path);
    if (entry !== undefined) console.error(`controls-trigger: ${path} (${entry})`);
  }
  console.log(needsFullControls(paths, baseRef) ? "true" : "false");
}
