// closing-keywords.mjs, which fails ci.yml's `secret-scan` job when a PR's commit message, or
// the merge commit's branch name and title, holds a closing keyword before an issue
// reference, and lists those in a PR body for claims.sh (IS #368).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXEMPT, check, closingNumbers, closingRefs, parseRecords } from "./closing-keywords.mjs";

const SCRIPT = fileURLToPath(new URL("./closing-keywords.mjs", import.meta.url));
const SHA = "a".repeat(40);
const EXEMPT_SHA = [...EXEMPT.keys()][0];
const record = (sha, message) => `${sha}\n${message}\0`;
// The parent's own PR_TITLE and PR_BRANCH (CI sets them in the step that runs the script, not
// here) are dropped, so only `env` sets them; by default they hold PR's title and branch.
const PR = { title: "A title", branch: "phase-9/a-branch" };
const run = (args, input, env = { PR_TITLE: PR.title, PR_BRANCH: PR.branch }) => {
  const base = { ...process.env };
  delete base.PR_TITLE;
  delete base.PR_BRANCH;
  return spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: "utf8", env: { ...base, ...env } });
};

describe("closingRefs()", () => {
  it.each(["close", "closes", "closed", "fix", "fixes", "fixed", "resolve", "resolves", "resolved"])(
    "finds the keyword %s before #n",
    (keyword) => {
      expect(closingRefs(`the trial's ${keyword} #348`)).toEqual([{ line: 1, text: `the trial's ${keyword} #348` }]);
    },
  );

  it.each([
    ["upper case", "CLOSES #10"],
    ["mixed case", "Fixes #10"],
    ["a colon", "Closes: #10"],
    ["upper case and a colon", "CLOSES: #10"],
    ["no space", "fixes#10"],
    ["another repository", "Fixes octo-org/octo-repo#100"],
    ["an issue URL", "resolves https://github.com/Ollie1994/whereisfood/issues/300"],
    ["a pull request URL", "closes https://github.com/Ollie1994/whereisfood/pull/369"],
    ["GitHub's GH- autolink", "Fixes GH-348"],
    ["a bold keyword", "**Fixes** #12"],
    ["an italic keyword and reference", "_fixes #12_"],
    ["a bold keyword with a colon", "**Closes:** #12"],
    ["a Markdown link's text", "Fixes [#12](https://github.com/a/b/issues/12)"],
    ["an angle-bracket autolink", "Fixes <https://github.com/a/b/issues/12>"],
    ["a keyword ending a snake_case name, an over-match kept for italics", "auto_close #4"],
  ])("finds %s", (_, text) => {
    expect(closingRefs(text)).toHaveLength(1);
  });

  it.each([
    ["a keyword inside a word", "prefixes #3 and suffixed #4"],
    ["a word that starts with a keyword and runs into a reference", "see fixups/foo#2 and closedgh-5"],
    ["a hyphenated or dotted word that starts with a keyword", "the fix-up/foo#2 branch, closed-loop/x#1, fixes.md/foo#3"],
    ["a keyword with no reference", "round 1's fixes, then #348's"],
    ["a reference before the keyword", "#361 closed"],
    ["a number with no #", "fixes 348"],
  ])("ignores %s", (_, text) => {
    expect(closingRefs(text)).toEqual([]);
  });

  it("numbers a reference by the line its keyword is on, across a line break", () => {
    expect(closingRefs("subject\n\nthe trial's fixes\n#348 and more")).toEqual([{ line: 3, text: "the trial's fixes" }]);
  });

  it("lists a line once however many references it holds, and reads CRLF lines", () => {
    expect(closingRefs("Resolves #10, resolves #123\r\nfine\r\ncloses #4")).toEqual([
      { line: 1, text: "Resolves #10, resolves #123" },
      { line: 3, text: "closes #4" },
    ]);
  });
});

describe("parseRecords()", () => {
  it("reads git's NUL-separated records", () => {
    expect(parseRecords(record(SHA, "one\n") + record("b".repeat(40), ""))).toEqual({
      records: [
        { sha: SHA, message: "one\n" },
        { sha: "b".repeat(40), message: "" },
      ],
    });
  });

  it("reads no input as no records, as an empty range gives", () => {
    expect(parseRecords("")).toEqual({ records: [] });
  });

  it("refuses a record that doesn't start with a SHA", () => {
    expect(parseRecords("not a sha\nmessage\0").error).toMatch(/doesn't start with a commit SHA/);
  });

  it("refuses a record that starts with a newline, which git's -z output doesn't hold", () => {
    expect(parseRecords(`\n${SHA}\nmessage\0`).error).toMatch(/doesn't start with a commit SHA/);
  });
});

describe("check()", () => {
  it("fails on a commit's closing reference, naming the commit and line", () => {
    const { lines, code } = check(record(SHA, "subject\n\nthe trial's fixes #348\n"), PR);
    expect(code).toBe(1);
    expect(lines[0]).toBe("::error::commit aaaaaaa closes an issue on merge, line 3: the trial's fixes #348");
  });

  it("passes an exempt commit, and fails the same text under another SHA", () => {
    const message = "re-scan is #349, the trial's fixes #348.\n";
    expect(check(record(EXEMPT_SHA, message), PR).code).toBe(0);
    expect(check(record(SHA, message), PR).code).toBe(1);
  });

  it("fails on the title", () => {
    const { lines, code } = check("", { title: "Closes #99999 probe", branch: "phase-9/x" });
    expect(code).toBe(1);
    expect(lines[0]).toMatch(/^::error::the merge commit's branch name and title close an issue on merge .*: title Closes #99999 probe$/);
  });

  // Round 3 on PR #371: GitHub's merge commit joins them as "…from <owner>/<branch>", a
  // blank line, then the title.
  it("fails on a branch ending in a keyword with a title starting with a reference", () => {
    const { lines, code } = check("", { title: "#401 follow-up", branch: "phase-9/fix" });
    expect(code).toBe(1);
    expect(lines[0]).toMatch(/\(rename the branch or retitle the PR\): branch phase-9\/fix, then title #401 follow-up$/);
    expect(check("", { title: "the #401 follow-up", branch: "phase-9/fix" }).code).toBe(0);
  });

  it("names the branch alone when the reference is wholly in it", () => {
    const { lines, code } = check("", { title: "Some title", branch: "phase-9/fix#12" });
    expect(code).toBe(1);
    expect(lines[0]).toMatch(/\(rename the branch\): branch phase-9\/fix#12$/);
  });

  it("passes clean commits and a clean title", () => {
    expect(check(record(SHA, "docs: round 1's fixes (PR #369 / IS #301)\n"), { title: "The Phase 8 retrospective", branch: "phase-8/retrospective" })).toEqual({
      lines: ["1 commits read, 0 exempt, and the merge commit's branch and title; no closing reference"],
      code: 0,
    });
  });

  it("escapes a workflow command's data", () => {
    expect(check(record(SHA, "fixes #1 at 100%\n"), PR).lines[0]).toMatch(/at 100%25$/);
  });

  it("exits 2 on input that isn't git's records", () => {
    expect(check("garbage", PR).code).toBe(2);
  });
});

describe("the command line", () => {
  it("exits 1 on stdin with a closing reference, 0 without", () => {
    expect(run([], record(SHA, "fixes #99999\n")).status).toBe(1);
    expect(run([], record(SHA, "fine\n")).status).toBe(0);
  });

  it("reads the title from PR_TITLE and the branch from PR_BRANCH", () => {
    const result = run([], "", { PR_TITLE: "closes #99999", PR_BRANCH: "x" });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/title closes #99999/);
    expect(run([], "", { PR_TITLE: "#99999 x", PR_BRANCH: "y/fixes" }).stdout).toMatch(/branch y\/fixes, then title #99999 x/);
  });

  it("exits 2 when PR_TITLE or PR_BRANCH is unset or empty, so a step that drops one fails", () => {
    expect(run([], record(SHA, "fine\n"), { PR_BRANCH: "x" }).status).toBe(2);
    expect(run([], record(SHA, "fine\n"), { PR_TITLE: "x" }).status).toBe(2);
    expect(run([], record(SHA, "fine\n"), { PR_TITLE: "x", PR_BRANCH: "" }).status).toBe(2);
    expect(run([], record(SHA, "fine\n"), { PR_TITLE: "", PR_BRANCH: "x" }).status).toBe(2);
  });

  it("exits 2 on unreadable input", () => {
    expect(run([], "not a record").status).toBe(2);
  });

  it("--lines lists a file's closing references and exits 0; exits 2 on a missing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "closing-"));
    try {
      const body = join(dir, "body.md");
      writeFileSync(body, "Closes #1. More.\n\nnothing here\n");
      const result = run(["--lines", body]);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(`${body}:1: Closes #1. More.\n`);
      expect(run(["--lines", join(dir, "missing.md")]).status).toBe(2);
      expect(run(["--lines", "-"], "x\nfixes #2\n").stdout).toBe("-:2: fixes #2\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Round 1 on PR #371: a path compare alone skipped the check through a link, since Node
  // resolves import.meta.url through it. A junction on Windows, a symlink elsewhere.
  it("runs its check when reached through a linked folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "closing-link-"));
    try {
      const link = join(dir, "scripts");
      symlinkSync(dirname(SCRIPT), link, "junction");
      const result = spawnSync(process.execPath, [join(link, "closing-keywords.mjs")], {
        input: record(SHA, "fixes #99999\n"),
        encoding: "utf8",
        env: { ...process.env, PR_TITLE: PR.title, PR_BRANCH: PR.branch },
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toMatch(/closes an issue on merge/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an unknown argument", () => {
    expect(run(["--nope"]).status).toBe(2);
  });
});

// closingNumbers, for post-body.mjs's --closes (IS #513): each reference form, read whole.
describe("closingNumbers", () => {
  const REPO = "Ollie1994/whereisfood";
  const read = (text) => closingNumbers(text, REPO).map(({ line, number }) => [line, number]);
  it("reads #n, GH-n, owner/name#n and the issue, pull and www. URLs, each number whole", () => {
    expect(read("Closes #511.")).toEqual([[1, 511]]);
    expect(read("Fixes GH-77")).toEqual([[1, 77]]);
    expect(read("Resolves Ollie1994/whereisfood#123")).toEqual([[1, 123]]);
    expect(read("Fixes https://github.com/Ollie1994/whereisfood/issues/44")).toEqual([[1, 44]]);
    expect(read("Fixes https://github.com/Ollie1994/whereisfood/pull/33")).toEqual([[1, 33]]);
    expect(read("Fixes https://www.github.com/Ollie1994/whereisfood/issues/22")).toEqual([[1, 22]]);
    expect(read("Closes [#910](https://example.test)")).toEqual([[1, 910]]);
  });
  it("gives null for another repository, by name or URL, and compares this one's in any case", () => {
    expect(read("Closes other/repo#5")).toEqual([[1, null]]);
    expect(read("Fixes https://github.com/other/repo/pull/5")).toEqual([[1, null]]);
    expect(read("Fixes OLLIE1994/WhereIsFood#5")).toEqual([[1, 5]]);
  });
  it("gives each reference alone as `target`, the keyword and what follows it cut", () => {
    const target = (text) => closingNumbers(text, REPO).map((r) => r.target);
    expect(target("Closes #511.")).toEqual(["#511"]);
    expect(target("Fixes: GH-77")).toEqual(["GH-77"]);
    expect(target("Resolves Ollie1994/whereisfood#5")).toEqual(["Ollie1994/whereisfood#5"]);
    expect(target("Fixes https://github.com/Ollie1994/whereisfood/issues/44")).toEqual(["https://github.com/Ollie1994/whereisfood/issues/44"]);
    expect(target("Closes [#910](x) and Closes <#911>")).toEqual(["#910", "#911"]);
    expect(target("Closes\n#7")).toEqual(["#7"]);
  });
  it("reads a keyword joined to the owner by an underscore as this repository's", () => {
    expect(read("fixes_Ollie1994/whereisfood#5")).toEqual([[1, 5]]);
  });
  it("counts lines at LF, CRLF and a lone CR, as closingRefs does, and joins a split reference", () => {
    expect(read("a\nb\r\nc\rFixes #12")).toEqual([[4, 12]]);
    expect(closingRefs("a\nb\r\nc\rFixes #12")).toEqual([{ line: 4, text: "Fixes #12" }]);
    expect(closingNumbers("Closes\n#7", REPO)[0].ref).toBe("Closes #7");
  });
});
