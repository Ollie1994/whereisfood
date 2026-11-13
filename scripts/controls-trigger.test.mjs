import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { TRIGGERS, changedPaths, needsFullControls, triggerFor } from "./controls-trigger.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// One changed path per TRIGGERS entry, written out here rather than derived from the list,
// so removing an entry turns its case red.
const TRIGGER_CASES = [
  "supabase/migrations/0001_baseline.sql",
  "supabase/seed.sql",
  "supabase/config.toml",
  "tests/controls/check-dropped.sql",
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
  "src/lib/db/trucks.ts",
  "src/lib/supabase.ts",
  "src/lib/supabase-session.ts",
  "src/lib/database.types.ts",
  "src/lib/types.ts",
  "package.json",
  "package-lock.json",
];

describe("needsFullControls", () => {
  it.each(TRIGGER_CASES)("is true for a PR into dev that changes %s", (path) => {
    expect(needsFullControls(["README.md", path], "dev")).toBe(true);
  });

  it("has a case above for every TRIGGERS entry", () => {
    expect(TRIGGERS.filter((entry) => !TRIGGER_CASES.some((path) => triggerFor(path) === entry))).toEqual([]);
  });

  it("is true for every PR into main, even with no change", () => {
    expect(needsFullControls([], "main")).toBe(true);
    expect(needsFullControls(["src/components/Map.tsx"], "main")).toBe(true);
  });

  it.each([
    "src/components/Map.tsx",
    "src/components/admin/TruckForm.tsx",
    "src/lib/dbx/a.ts",
    "src/lib/db.ts",
    "src/package.json",
    "tests/integration/api-live.test.ts",
  ])("is false for a PR into dev that changes only %s", (path) => {
    expect(needsFullControls([path], "dev")).toBe(false);
  });

  it("is false for a PR into dev with no change", () => {
    expect(needsFullControls([], "dev")).toBe(false);
  });
});

describe("TRIGGERS", () => {
  // A misspelt entry would never match, and no other check reads the entries no test
  // imports (the config, the seed, the workflow).
  it.each(TRIGGERS)("%s exists in the repository", (entry) => {
    const path = join(ROOT, entry);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).isDirectory()).toBe(entry.endsWith("/"));
  });
});

describe("changedPaths", () => {
  const dirs = [];
  // Every `GIT_*` variable is removed while these run, and restored after: git obeys
  // `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` over `cwd`, so with them inherited
  // (as a git hook's child gets them) the scratch repositories' commits land in the
  // repository they name. With `GIT_DIR` and `GIT_WORK_TREE` set to a throwaway clone,
  // 5 of these cases failed and the clone's branch gained commit "A"; with
  // `GIT_INDEX_FILE` set to another folder, `git add` wrote its index there (IS #287's PR).
  const saved = {};
  beforeAll(() => {
    for (const key of Object.keys(process.env).filter((k) => k.startsWith("GIT_"))) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    delete process.env.GIT_CEILING_DIRECTORIES;
  });
  afterAll(() => Object.assign(process.env, saved));

  // A scratch repository, kept from the user's and the system's git config (an empty
  // global file), with a fixed identity.
  function repo() {
    const dir = mkdtempSync(join(tmpdir(), "controls-trigger-"));
    dirs.push(dir);
    const globalConfig = join(dir, ".gitconfig-empty");
    writeFileSync(globalConfig, "");
    mkdirSync(join(dir, "r"));
    const cwd = join(dir, "r");
    const env = {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@example.invalid",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@example.invalid",
    };
    const run = (...args) => {
      const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
      if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    };
    const write = (path, text) => {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), text);
    };
    const commit = (message) => {
      run("add", "-A");
      run("commit", "-q", "-m", message);
    };
    run("init", "-q", "-b", "main");
    write("a.txt", "a\n");
    commit("A");
    return { cwd, run, write, commit };
  }

  it("throws in a repository with one commit, with no HEAD^1", () => {
    const { cwd } = repo();
    expect(() => changedPaths(cwd)).toThrow(/^HEAD\^1 is missing/);
  });

  it("throws when HEAD isn't a merge commit, with no HEAD^2", () => {
    const { cwd, write, commit } = repo();
    write("b.txt", "b\n");
    commit("B");
    expect(() => changedPaths(cwd)).toThrow(/^HEAD\^2 is missing/);
  });

  it("throws when git fails, outside any repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "controls-trigger-norepo-"));
    dirs.push(dir);
    // So git doesn't find a repository in a folder above the temp folder.
    process.env.GIT_CEILING_DIRECTORIES = dirname(dir);
    expect(() => changedPaths(dir)).toThrow(/^git rev-parse .* failed \(exit 128\)/);
  });

  it("returns [] for a merge with no net change", () => {
    const { cwd, run, write, commit } = repo();
    run("switch", "-q", "-c", "pr");
    write("a.txt", "changed\n");
    commit("change");
    write("a.txt", "a\n");
    commit("revert");
    run("switch", "-q", "main");
    run("merge", "-q", "--no-ff", "-m", "merge", "pr");
    expect(changedPaths(cwd)).toEqual([]);
  });

  it("lists the PR's paths against the base, a rename's old path and odd names included", () => {
    const { cwd, run, write, commit } = repo();
    write("supabase/migrations/0002_x.sql", "select 1;\n".repeat(20));
    commit("base");
    run("switch", "-q", "-c", "pr");
    mkdirSync(join(cwd, "old"));
    renameSync(join(cwd, "supabase/migrations/0002_x.sql"), join(cwd, "old/0002_x.sql"));
    write("dir with space/ö.txt", "x\n");
    commit("pr");
    run("switch", "-q", "main");
    // The base moves on too: its change isn't the PR's.
    write("base-only.txt", "x\n");
    commit("base moves");
    run("merge", "-q", "--no-ff", "-m", "merge", "pr");
    expect(changedPaths(cwd).sort()).toEqual(["dir with space/ö.txt", "old/0002_x.sql", "supabase/migrations/0002_x.sql"]);
  });
});
