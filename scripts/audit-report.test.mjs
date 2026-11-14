// audit-report.mjs, which reads npm audit's JSON report for ci.yml's `audit` job, run 3
// (IS #291). The fixtures are the cases its inline form was run on by hand in PR #339's
// rounds 1 to 3, plus round 3's: a count with no advisory, and a field whose `toString`
// isn't a function.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WARNING_LIMIT, readAdvisories, workflowLines } from "./audit-report.mjs";

const report = (total, vulnerabilities) => JSON.stringify({ metadata: { vulnerabilities: { total } }, vulnerabilities });
const advisory = (i, extra = {}) => ({ source: i, name: `p${i}`, title: `t${i}`, url: `https://example.invalid/${i}`, severity: "low", ...extra });
const many = (n) => report(n, Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, { via: [advisory(i)] }])));
const warnings = (lines) => lines.filter((line) => line.startsWith("::warning"));

describe("readAdvisories()", () => {
  it("fails on a report that isn't JSON", () => {
    expect(readAdvisories("not json").error).toMatch(/no vulnerability count/);
  });

  it("fails on a report with no count, as npm printed on an unreachable registry", () => {
    const json = JSON.stringify({ message: "request to http://127.0.0.1:9/… failed", error: { summary: "", detail: "" } });
    expect(readAdvisories(json).error).toMatch(/no vulnerability count/);
  });

  it("fails on a count that isn't an integer", () => {
    expect(readAdvisories(report("3", {})).error).toMatch(/no vulnerability count/);
  });

  it("reads a clean report as no advisories", () => {
    expect(readAdvisories(report(0, {}))).toEqual({ advisories: [] });
  });

  it("reads advisory objects in `via`, not the strings that name packages", () => {
    const json = report(3, {
      "typescript-eslint": { via: ["@typescript-eslint/parser"] },
      "@typescript-eslint/parser": { via: ["minimatch"] },
      minimatch: { via: [advisory(1, { name: "minimatch", title: "ReDoS", url: "https://github.com/advisories/GHSA-x", severity: "moderate" })] },
    });
    expect(readAdvisories(json)).toEqual({ advisories: ["moderate in minimatch: ReDoS (https://github.com/advisories/GHSA-x)"] });
  });

  it("lists an advisory once, the first copy, by URL", () => {
    const json = report(2, { a: { via: [advisory(1, { title: "first" })] }, b: { via: [advisory(1, { title: "second" })] } });
    expect(readAdvisories(json).advisories).toEqual(["low in p1: first (https://example.invalid/1)"]);
  });

  it("keeps apart advisories with no URL or source", () => {
    const json = report(2, { a: { via: [{ name: "a", title: "one", severity: "high" }] }, b: { via: [{ name: "b", title: "two", severity: "low" }] } });
    expect(readAdvisories(json).advisories).toEqual(["high in a: one (no URL)", "low in b: two (no URL)"]);
  });

  it("fails on a count with no advisory it can name", () => {
    expect(readAdvisories(report(2, { a: { via: ["b"] }, b: { via: ["a"] } })).error).toMatch(/can't name an advisory/);
  });

  it("skips malformed entries without throwing, and fails when nothing else names an advisory", () => {
    const malformed = { a: null, b: { via: { x: 1 } }, c: { via: "str" }, d: { via: [null, 3, ["x"]] } };
    expect(readAdvisories(report(4, malformed)).error).toMatch(/can't name an advisory/);
    expect(readAdvisories(report(1, "oops")).error).toMatch(/can't name an advisory/);
    expect(readAdvisories(report(5, { ...malformed, e: { via: [advisory(7)] } })).advisories).toEqual(["low in p7: t7 (https://example.invalid/7)"]);
  });

  it("doesn't throw on a field whose `toString` isn't a function", () => {
    const json = report(1, { a: { via: [advisory(1, { title: { toString: "x" }, severity: { valueOf: 1 } })] } });
    expect(readAdvisories(json).advisories).toEqual(['{"valueOf":1} in p1: {"toString":"x"} (https://example.invalid/1)']);
  });
});

describe("workflowLines()", () => {
  it("prints the log group and no warning for no advisories", () => {
    expect(workflowLines([])).toEqual(["::group::advisories (0)", "::endgroup::"]);
  });

  it("escapes a warning's `%`, CR and LF, and keeps a log line on one line", () => {
    const lines = workflowLines(["high in x: 50% bad\r\nline two (u)"]);
    expect(lines[1]).toBe("- high in x: 50% bad line two (u)");
    expect(warnings(lines)).toEqual([
      '::warning title=npm audit::high in x: 50%25 bad%0D%0Aline two (u): it needs an issue before this PR merges, unless it has one (CLAUDE.md, "Dependencies")',
    ]);
  });

  it(`warns on each of ${WARNING_LIMIT} advisories`, () => {
    const { advisories } = readAdvisories(many(WARNING_LIMIT));
    const lines = workflowLines(advisories);
    expect(warnings(lines)).toHaveLength(WARNING_LIMIT);
    expect(lines.filter((line) => line.startsWith("- "))).toHaveLength(WARNING_LIMIT);
    expect(lines.join("\n")).not.toMatch(/more advisories/);
  });

  for (const n of [WARNING_LIMIT + 1, WARNING_LIMIT + 2]) {
    it(`warns on ${WARNING_LIMIT - 1} of ${n} advisories and counts the rest, listing all in the log`, () => {
      const lines = workflowLines(readAdvisories(many(n)).advisories);
      const shown = warnings(lines);
      expect(shown).toHaveLength(WARNING_LIMIT);
      expect(shown.at(-1)).toMatch(new RegExp(`^::warning title=npm audit::and ${n - WARNING_LIMIT + 1} more advisories: `));
      expect(lines.filter((line) => line.startsWith("- "))).toHaveLength(n);
    });
  }
});

describe("node scripts/audit-report.mjs", () => {
  const script = fileURLToPath(new URL("./audit-report.mjs", import.meta.url));
  const run = (json) => {
    const dir = mkdtempSync(join(tmpdir(), "audit-report-"));
    try {
      const path = join(dir, "audit.json");
      writeFileSync(path, json);
      return spawnSync(process.execPath, [script, path], { encoding: "utf8" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("exits 0 and prints the warnings", () => {
    const result = run(many(1));
    expect(result.status).toBe(0);
    expect(warnings(result.stdout.trim().split("\n"))).toHaveLength(1);
  });

  it("exits 1 with an ::error:: when it can't tell", () => {
    for (const json of ["not json", report(2, { a: { via: ["b"] } })]) {
      const result = run(json);
      expect(result.status, json).toBe(1);
      expect(result.stdout, json).toMatch(/^::error::/);
    }
  });

  it("exits 2 with no argument", () => {
    expect(spawnSync(process.execPath, [script], { encoding: "utf8" }).status).toBe(2);
  });
});
