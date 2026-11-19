// post-body.mjs, which posts an issue's or PR's body from a file and reads it back (IS #403).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareBodies, main, repeatedHeadings, roundProblems, roundsFromLog, textProblems } from "./post-body.mjs";

const BS = "\\";
const row = (n, where, caught) => `| ${n} | 2026-11-19 | ${where} | \`process-log\` | A miss. | ${caught} | \`pre-merge\` | \`imprecise-claim\` | A fix. |`;

describe("textProblems", () => {
  it("names a raw control character, but not tab, LF or CR", () => {
    expect(textProblems(`a${String.fromCharCode(8)}b`)).toEqual([expect.stringContaining("line 1: a raw control character")]);
    expect(textProblems("a\u0000b\nc\u001Fd")).toHaveLength(2);
    expect(textProblems("a\tb\r\nc\n")).toEqual([]);
  });
  it("names the escape text GitHub rewrites, and none it keeps (probe PR #425)", () => {
    for (const code of ["0000", "0001", "0008", "000C", "000E", "001F", "001f"]) {
      expect(textProblems(`x ${BS}u${code} y`), code).toEqual([expect.stringContaining(`${BS}u${code}`)]);
    }
    for (const kept of ["u0009", "u000A", "u000B", "u000D", "u0020", "x00", "0", "n", "u2028", "u{0}"]) {
      expect(textProblems(`x ${BS}${kept} y`), kept).toEqual([]);
    }
  });
  it("suggests the \\x form", () => {
    expect(textProblems(`${BS}u0000`)[0]).toContain(`${BS}x00`);
  });
});

describe("repeatedHeadings", () => {
  it("names a ## heading that appears twice, and ignores other levels and text", () => {
    expect(repeatedHeadings("## What changed\ntext\n## What changed\n")).toEqual(['"## What changed" 2 times']);
    expect(repeatedHeadings("## A\n### A\n### A\n## B\nnot ## A\n")).toEqual([]);
  });
  it("counts a heading the same with a trailing blank or CRLF", () => {
    expect(repeatedHeadings("## A \r\n## A\n")).toHaveLength(1);
  });
});

describe("roundsFromLog", () => {
  const log = [
    "| # | Date |",
    row(1, "PR #7 / IS #3", "`code-review` r1 on PR #7, full"),
    row(2, "PR #7 / IS #3", "`self` the claims check"),
    row(3, "PR #7 / IS #3", "`code-review` r2 on PR #7, scoped to `a..b`, with a \\| in it"),
    row(4, "PR #70 / IS #3", "`code-review` r3 on PR #70, full"),
    row(5, "PR #7 / IS #3", "`code-review` read-through of the plan"),
    row(6, "→ IS #7", "`code-review` r9 on PR #7, full"),
    row(7, "PR #7 / IS #3", "`code-review`  r3 on PR #7, full"),
  ].join("\n");
  it("reads the rounds of that PR only, from code-review rows in the form", () => {
    expect(roundsFromLog(log, "7")).toEqual([1, 2, 3]);
    expect(roundsFromLog(log, "70")).toEqual([3]);
    expect(roundsFromLog(log, "8")).toEqual([]);
  });
});

describe("roundProblems", () => {
  const body = (...ns) => ns.map((n) => `## Round ${n} (\`/code-review\`, full): found 1\n`).join("");
  it("passes one heading per round", () => {
    expect(roundProblems(body(1, 2, 3), [1, 2, 3])).toEqual([]);
  });
  it("names a missing round (row 769) and a repeated one (row 735)", () => {
    expect(roundProblems(body(1, 2), [1, 2, 3])).toEqual(['round 3: 0 "## Round 3" headings, not 1']);
    expect(roundProblems(body(1, 1, 2), [1, 2])).toEqual(['round 1: 2 "## Round 1" headings, not 1']);
  });
  it("names a round heading the log doesn't have", () => {
    expect(roundProblems(body(1, 2), [1])).toEqual(['round 2: a "## Round 2" heading, but the log has no such round']);
  });
  it("doesn't count Round 10 as Round 1, or a deeper heading", () => {
    expect(roundProblems(body(10) + "### Round 1\n", [10])).toEqual([]);
  });
});

describe("compareBodies", () => {
  it("ignores line endings and blanks at the ends of lines and of the text", () => {
    expect(compareBodies("a\nb  \n\n", "a\r\nb\r\n")).toBeNull();
  });
  it("names the first line that differs, as GitHub's rewrite would make it", () => {
    expect(compareBodies(`a\nx ${BS}u0000\n`, `a\nx ${BS}^@\n`)).toEqual({ line: 2, sent: `x ${BS}u0000`, stored: `x ${BS}^@` });
  });
  it("names a body cut short, and a null body", () => {
    expect(compareBodies("a\nb\n", "a\n")).toEqual({ line: 2, sent: "b", stored: "<none>" });
    expect(compareBodies("a", null)).toEqual({ line: 1, sent: "a", stored: "" });
  });
});

describe("main", () => {
  let dir;
  const file = (text) => {
    dir = mkdtempSync(join(tmpdir(), "post-body-"));
    const f = join(dir, "body.md");
    writeFileSync(f, text);
    return f;
  };
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
    vi.restoreAllMocks();
  });
  const quiet = () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  };
  // A fake `gh api`: a PATCH stores the JSON body, through `store`; a GET returns it.
  const fakeApi = (store = (b) => b) => {
    const calls = [];
    let body;
    const api = (args, input) => {
      calls.push(args);
      if (args.includes("PATCH")) body = store(JSON.parse(input).body);
      return JSON.stringify({ body });
    };
    return { api, calls };
  };

  it("posts the file and passes when it reads back the same", () => {
    quiet();
    const { api, calls } = fakeApi((b) => b.replace(/\n/g, "\r\n"));
    expect(main(["12", file("## A\ntext\n")], { api })).toBe(0);
    expect(calls[0]).toEqual(["api", "-X", "PATCH", "repos/{owner}/{repo}/issues/12", "--input", "-"]);
    expect(calls[1]).toEqual(["api", "repos/{owner}/{repo}/issues/12"]);
  });
  it("fails when GitHub stores something else", () => {
    quiet();
    const { api } = fakeApi((b) => b.replace("text", "txet"));
    expect(main(["12", file("## A\ntext\n")], { api })).toBe(1);
  });
  it("posts nothing when the file has a problem", () => {
    quiet();
    const { api, calls } = fakeApi();
    expect(main(["12", file("## A\n## A\n")], { api })).toBe(1);
    expect(main(["12", file(`a${String.fromCharCode(8)}b`)], { api })).toBe(1);
    expect(main(["12", file(`${BS}u0001`)], { api })).toBe(1);
    expect(calls).toEqual([]);
  });
  it("checks rounds against the log with --rounds, and only then", () => {
    quiet();
    const readLog = () => [row(1, "PR #12 / IS #3", "`code-review` r1 on PR #12, full"), row(2, "PR #12 / IS #3", "`code-review` r2 on PR #12, scoped")].join("\n");
    const { api, calls } = fakeApi();
    const f = file("## Round 1 (full)\n");
    expect(main(["12", f, "--rounds"], { api, readLog })).toBe(1);
    expect(calls).toEqual([]);
    expect(main(["12", f], { api, readLog })).toBe(0);
    expect(main(["12", file("## Round 1 (full)\n## Round 2 (scoped)\n"), "--rounds"], { api, readLog })).toBe(0);
  });
  it("exits 2 on bad arguments, an unreadable file or log, and a failed gh call", () => {
    quiet();
    const { api } = fakeApi();
    expect(main([], { api })).toBe(2);
    expect(main(["x", "f"], { api })).toBe(2);
    expect(main(["12", join(tmpdir(), "post-body-none", "missing.md")], { api })).toBe(2);
    const f = file("text\n");
    expect(main(["12", f, "--rounds"], { api, readLog: () => { throw new Error("no log"); } })).toBe(2);
    expect(main(["12", f], { api: () => { throw new Error("gh api failed"); } })).toBe(2);
  });
});
