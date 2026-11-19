// post-body.mjs, which posts an issue's or PR's body, or a new comment, from a file and
// reads it back (IS #403).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compareBodies, main, repeatedHeadings, roundProblems, roundsFromLog, textProblems } from "./post-body.mjs";

const BS = "\\";
const row = (n, where, caught, miss = "A miss.") =>
  `| ${n} | 2026-11-19 | ${where} | \`process-log\` | ${miss} | ${caught} | \`pre-merge\` | \`imprecise-claim\` | A fix. |`;

describe("textProblems", () => {
  it("names a raw control character, but not tab, LF or CR", () => {
    expect(textProblems(`a${String.fromCharCode(8)}b`)).toEqual([expect.stringContaining("line 1, column 2: a raw control character")]);
    expect(textProblems("a\u0000b\nc\u001Fd")).toHaveLength(2);
    expect(textProblems(`a${String.fromCharCode(0x0b)}b${String.fromCharCode(0x0c)}c`)).toHaveLength(2);
    expect(textProblems("a\tb\r\nc\n")).toEqual([]);
  });
  const cps = (...xs) => xs.map((c) => String.fromCodePoint(c)).join("");
  const NAMES = [
    [0x00a0, "no-break space"], [0x00ad, "soft hyphen"], [0x200b, "zero-width space"], [0x200c, "zero-width non-joiner"],
    [0x200d, "zero-width joiner"], [0x200e, "left-to-right mark"], [0x200f, "right-to-left mark"], [0x2028, "line separator"],
    [0x2029, "paragraph separator"], [0x202a, "left-to-right embedding"], [0x202b, "right-to-left embedding"],
    [0x202c, "pop directional formatting"], [0x202d, "left-to-right override"], [0x202e, "right-to-left override"],
    [0x2060, "word joiner"], [0x2066, "left-to-right isolate"], [0x2067, "right-to-left isolate"], [0x2068, "first strong isolate"],
    [0x2069, "pop directional isolate"], [0xfe0f, "emoji presentation selector"], [0xfeff, "byte-order mark"],
  ];
  it("names each invisible character by code point, name, line and column, and marks it in the excerpt (probe PR #428)", () => {
    for (const [cp, name] of NAMES) {
      const hex = cp.toString(16).toUpperCase().padStart(4, "0");
      const [p, ...rest] = textProblems(`ok\nab${cps(cp)}c`);
      expect(rest, hex).toEqual([]);
      expect(p, hex).toContain(`line 2, column 3: an invisible character, U+${hex} (${name}): …ab<U+${hex}>c…`);
    }
  });
  it("counts columns in characters, so an emoji before it is one", () => {
    expect(textProblems(`${cps(0x1f916, 0x1f916, 0x00a0)}x`)).toEqual([expect.stringContaining("column 3:")]);
    expect(textProblems(`${cps(0x1f916)}${BS}u0001`)).toEqual([expect.stringContaining("column 2:")]);
  });
  it("keeps other non-ASCII text, and the joiners and selectors that build an emoji", () => {
    expect(textProblems("Ställ in, café, naïve, – … →")).toEqual([]);
    const kept = {
      family: cps(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467),
      "skin tone at a laptop": cps(0x1f469, 0x1f3fd, 0x200d, 0x1f4bb),
      "rainbow flag": cps(0x1f3f3, 0xfe0f, 0x200d, 0x1f308),
      "red heart": cps(0x2764, 0xfe0f),
      "check mark": cps(0x2714, 0xfe0f),
      "keycap 1": cps(0x31, 0xfe0f, 0x20e3),
    };
    for (const [name, s] of Object.entries(kept)) expect(textProblems(`a ${s} b`), name).toEqual([]);
  });
  it("refuses a joiner or selector that builds no emoji", () => {
    expect(textProblems(`a${cps(0x200d)}b`)).toHaveLength(1);
    expect(textProblems(`${cps(0x1f916, 0x200d)}b`)).toHaveLength(1);
    expect(textProblems(`a${cps(0x200d, 0x1f916)}`)).toHaveLength(1);
    expect(textProblems(`a${cps(0xfe0f)}`)).toHaveLength(1);
  });
  it("keeps U+FE0F after a digit, # or * only in a keycap", () => {
    expect(textProblems(`version 2${cps(0xfe0f)}`)).toHaveLength(1);
    expect(textProblems(`x #${cps(0xfe0f)} y`)).toHaveLength(1);
    expect(textProblems(`x ${cps(0x23, 0xfe0f, 0x20e3)} y`)).toEqual([]);
  });
  it("counts a raw control character's column in characters too", () => {
    expect(textProblems(`${cps(0x1f916, 0x1f916)}${String.fromCharCode(1)}`)).toEqual([expect.stringContaining("column 3: a raw control character")]);
  });
  it("marks only the refused characters in an excerpt, not an emoji's joiners", () => {
    const family = cps(0x1f468, 0x200d, 0x1f469);
    const [p] = textProblems(`${family} a${cps(0x00a0)}b`);
    expect(p).toContain(`…${family} a<U+00A0>b…`);
  });
  it("takes the escape's hex digits in either case", () => {
    expect(textProblems(`${BS}u000c`)).toHaveLength(1);
    expect(textProblems(`${BS}u000a`)).toEqual([]);
  });
  it("shows the character's place on a long line", () => {
    const [p] = textProblems(`${"x".repeat(200)}${String.fromCharCode(8)}y`);
    expect(p).toContain("column 201");
    expect(p).toContain("<0x08>");
  });
  it("names the escape text GitHub rewrites, and none it keeps (probe PR #425)", () => {
    for (const code of ["0000", "0001", "0008", "000C", "000E", "001F", "001f"]) {
      expect(textProblems(`x ${BS}u${code} y`), code).toEqual([expect.stringContaining(`${BS}u${code}`)]);
    }
    for (const kept of ["u0009", "u000A", "u000B", "u000D", "u0020", "x00", "0", "n", "u2028", "u{0}", "U0001"]) {
      expect(textProblems(`x ${BS}${kept} y`), kept).toEqual([]);
    }
  });
  it("names every escape on a line, and suggests the \\x form", () => {
    const ps = textProblems(`${BS}u0000 and ${BS}u0001`);
    expect(ps).toHaveLength(2);
    expect(ps[0]).toContain(`${BS}x00`);
  });
});

describe("repeatedHeadings", () => {
  it("names a ## heading that appears twice, and ignores other levels and text", () => {
    expect(repeatedHeadings("## What changed\ntext\n## What changed\n")).toEqual(['"## What changed" 2 times']);
    expect(repeatedHeadings("## A\n### A\n### A\n## B\nnot ## A\n")).toEqual([]);
  });
  it("counts a heading the same with trailing blanks, CRLF or a short indent", () => {
    expect(repeatedHeadings("## A \r\n## A\n")).toHaveLength(1);
    expect(repeatedHeadings("## A\n   ## A\n")).toHaveLength(1);
  });
  it("ignores headings inside a fence", () => {
    expect(repeatedHeadings("## A\n```md\n## A\n```\n~~~\n## A\n~~~\n")).toEqual([]);
  });
  it("reads a heading with a tab after ## or a closing run of #", () => {
    expect(repeatedHeadings("## A\n##\tA\n")).toHaveLength(1);
    expect(repeatedHeadings("## A\n## A ##\n")).toHaveLength(1);
  });
  it("opens no fence on a line of backticks with a backtick after them", () => {
    expect(repeatedHeadings("```` ``` ```` is a fence\n## A\n## A\n")).toEqual(['"## A" 2 times']);
  });
  it("ignores headings inside an HTML comment, and reads them again after it", () => {
    expect(repeatedHeadings("## A\n<!--\n## A\n-->\n")).toEqual([]);
    expect(repeatedHeadings("## A\n<!-- one line -->\n## A\n")).toHaveLength(1);
    expect(repeatedHeadings("<!--\nx\n-->\n## A\n## A\n")).toHaveLength(1);
  });
  it("takes <!--> and <!---> as whole comments", () => {
    expect(repeatedHeadings("<!-->\n## A\n## A\n")).toHaveLength(1);
    expect(repeatedHeadings("<!--->\n## A\n## A\n")).toHaveLength(1);
  });
  it("closes a fence only on the same character, at least as long, with no info string", () => {
    expect(repeatedHeadings("```md\n```js\n```\n## A\n## A\n")).toEqual(['"## A" 2 times']);
    expect(repeatedHeadings("```\n~~~\n## A\n```\n## A\n")).toEqual([]);
    expect(repeatedHeadings("````\n```\n## A\n```\n````\n## A\n")).toEqual([]);
  });
});

describe("roundsFromLog", () => {
  const log = [
    "| # | Date |",
    row(1, "PR #7 / IS #3", "`code-review` r1 on PR #7, full"),
    row(2, "PR #7 / IS #3", "`self` the claims check"),
    row(3, "PR #7 / IS #3", "`code-review` r2 on PR #7, scoped to `a..b`"),
    row(4, "PR #70 / IS #3", "`code-review` r3 on PR #70, full"),
    row(5, "PR #7 / IS #3", "`code-review` read-through of the plan"),
    row(6, "→ IS #7", "`code-review` r9 on PR #7, full"),
    row(7, "PR #7 / IS #3", "`code-review`  r3 \ton  PR #7, full"),
    row(8, "PR #7 / IS #3", "`code-review` r4 on PR #7, full", "A miss with a \\| in it."),
  ].join("\n");
  it("reads the rounds of that PR only, from code-review rows in the form", () => {
    expect(roundsFromLog(log, "7")).toEqual([1, 2, 3, 4]);
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
    expect(roundProblems(body(1, 2), [1, 2, 3])).toEqual([expect.stringContaining('round 3: 0 "## Round 3" headings, not 1')]);
    expect(roundProblems(body(1, 1, 2), [1, 2])).toEqual([expect.stringContaining('round 1: 2 "## Round 1" headings, not 1')]);
  });
  it("needs every round up to the log's highest, even one the log skips", () => {
    expect(roundProblems(body(1, 3), [1, 3])).toEqual([expect.stringContaining("round 2: 0")]);
  });
  it("allows the next round's heading once (a last round that found nothing), and no other", () => {
    expect(roundProblems(body(1, 2, 3), [1, 2])).toEqual([]);
    expect(roundProblems(body(1, 2, 3, 3), [1, 2])).toEqual(['round 3: 2 "## Round 3" headings, not 1']);
    expect(roundProblems(body(1, 2, 4), [1, 2])).toEqual([expect.stringContaining("round 4: a")]);
    expect(roundProblems(body(1, 2, 5, 9), [1, 2])).toHaveLength(2);
  });
  it("refuses Round 0 and a leading zero, and a round heading written with a tab past the top", () => {
    expect(roundProblems(body(0, 1), [1])).toEqual([expect.stringContaining('not in the form "## Round <N>" (N from 1): ## Round 0')]);
    expect(roundProblems("## Round 01\n", [1])).toHaveLength(2);
    expect(roundProblems("##\tRound 7\n", [])).toHaveLength(1);
  });
  it("doesn't take Round-up, Round trip or Round one-off for a round heading", () => {
    expect(roundProblems("## Round-up\n## Round trip probe\n## Round one-off fixes\n", [])).toEqual([]);
  });
  it("refuses a malformed round heading the earlier gate let through", () => {
    for (const h of ["## Round-1", "## Round #2", "## Round: 3"]) {
      expect(roundProblems(`${h}\n`, []), h).toEqual([expect.stringContaining("a round heading not in the form")]);
    }
  });
  it("refuses a round heading in another form, and doesn't count Round 10 as Round 1", () => {
    expect(roundProblems("## Round two\n## round 1\n", [])).toHaveLength(2);
    const ps = roundProblems(body(10), [10]);
    expect(ps).toContain('round 1: 0 "## Round 1" headings, not 1 (the log\'s rounds go to 10)');
    expect(ps.some((p) => p.startsWith("round 10"))).toBe(false);
    expect(roundProblems("### Round 1\n```\n## Round 1\n```\n", [])).toEqual([]);
  });
});

describe("compareBodies", () => {
  it("ignores line endings and blanks at the ends of lines and of the text", () => {
    expect(compareBodies("a\nb  \n\n", "a\r\nb\r\n")).toBeNull();
  });
  it("names the first line that differs, as GitHub's rewrite would make it", () => {
    expect(compareBodies(`a\nx ${BS}u0000\n`, `a\nx ${BS}^@\n`)).toEqual({ line: 2, sent: `x ${BS}u0000`, stored: `x ${BS}^@` });
  });
  it("counts a change to a non-ASCII space at a line's end", () => {
    const nbsp = String.fromCharCode(0xa0);
    expect(compareBodies(`a${nbsp}\n`, "a\n")).toEqual({ line: 1, sent: `a${nbsp}`, stored: "a" });
  });
  it("names a body cut short, and a null body", () => {
    expect(compareBodies("a\nb\n", "a\n")).toEqual({ line: 2, sent: "b", stored: "<none>" });
    expect(compareBodies("a", null)).toEqual({ line: 1, sent: "a", stored: "" });
  });
});

describe("main", () => {
  let dir;
  const file = (text) => {
    dir ??= mkdtempSync(join(tmpdir(), "post-body-"));
    const f = join(dir, `body-${Math.random().toString(36).slice(2)}.md`);
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
  // A fake `gh api`: a PATCH or POST stores the JSON body through `store`; a GET returns it.
  const fakeApi = (store = (b) => b) => {
    const calls = [];
    let body;
    const api = (args, input) => {
      calls.push(args);
      if (args.includes("PATCH") || args.includes("POST")) body = store(JSON.parse(input).body);
      return JSON.stringify({ id: 99, body });
    };
    return { api, calls };
  };

  it("posts a body and passes when it reads back the same", () => {
    quiet();
    const { api, calls } = fakeApi((b) => b.replace(/\n/g, "\r\n"));
    expect(main(["12", file("## A\ntext\n")], { api })).toBe(0);
    expect(calls).toEqual([
      ["api", "-X", "PATCH", "repos/{owner}/{repo}/issues/12", "--input", "-"],
      ["api", "repos/{owner}/{repo}/issues/12"],
    ]);
  });
  it("posts a comment and reads it back by its id", () => {
    quiet();
    const { api, calls } = fakeApi();
    expect(main(["--comment", "12", file("A record.\n")], { api })).toBe(0);
    expect(calls).toEqual([
      ["api", "-X", "POST", "repos/{owner}/{repo}/issues/12/comments", "--input", "-"],
      ["api", "repos/{owner}/{repo}/issues/comments/99"],
    ]);
  });
  it("edits a comment by its id and reads it back", () => {
    quiet();
    const { api, calls } = fakeApi();
    expect(main(["--edit-comment", "555", file("A record.\n")], { api })).toBe(0);
    expect(calls).toEqual([
      ["api", "-X", "PATCH", "repos/{owner}/{repo}/issues/comments/555", "--input", "-"],
      ["api", "repos/{owner}/{repo}/issues/comments/555"],
    ]);
  });
  it("names a comment it made but couldn't read back, or that differs", () => {
    quiet();
    const made = JSON.stringify({ id: 77, html_url: "https://example.test/c77", body: "x" });
    const failGet = (args) => {
      if (args.includes("POST")) return made;
      throw new Error("gh api failed");
    };
    expect(main(["--comment", "12", file("text\n")], { api: failGet })).toBe(2);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("comment 77 was made (https://example.test/c77); fix it with --edit-comment 77"));
    const { api } = fakeApi((b) => b.replace("text", "txet"));
    expect(main(["--comment", "12", file("text\n")], { api })).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("comment 99 was made"));
  });
  it("fails when GitHub stores something else, body or comment", () => {
    quiet();
    const { api } = fakeApi((b) => b.replace("text", "txet"));
    expect(main(["12", file("## A\ntext\n")], { api })).toBe(1);
    expect(main(["--comment", "12", file("text\n")], { api })).toBe(1);
  });
  it("posts nothing when the file has a problem", () => {
    quiet();
    const { api, calls } = fakeApi();
    expect(main(["12", file("## A\n## A\n")], { api })).toBe(1);
    expect(main(["12", file(`a${String.fromCharCode(8)}b`)], { api })).toBe(1);
    expect(main(["--comment", "12", file(`${BS}u0001`)], { api })).toBe(1);
    expect(calls).toEqual([]);
  });
  it("--check runs the checks and never calls gh", () => {
    quiet();
    const { api, calls } = fakeApi();
    expect(main(["--check", file("## A\ntext\n")], { api })).toBe(0);
    expect(main(["--check", file(`${String.fromCodePoint(0xfeff)}## A\ntext\n`)], { api }), "a BOM opening the file").toBe(0);
    expect(main(["--check", file(`## A\nte${String.fromCodePoint(0xfeff)}xt\n`)], { api }), "a BOM inside it").toBe(1);
    expect(main(["--check", file("## A\n## A\n")], { api })).toBe(1);
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
  it("reads the log PROCESS_LOG names, when --rounds runs", () => {
    quiet();
    const log = file([row(1, "PR #12 / IS #3", "`code-review` r1 on PR #12, full"), row(2, "PR #12 / IS #3", "`code-review` r2 on PR #12, full")].join("\n"));
    vi.stubEnv("PROCESS_LOG", log);
    try {
      const { api, calls } = fakeApi();
      expect(main(["12", file("## Round 1 (full)\n"), "--rounds"], { api })).toBe(1);
      expect(calls).toEqual([]);
      expect(main(["12", file("## Round 1 (full)\n## Round 2 (full)\n"), "--rounds"], { api })).toBe(0);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`rounds checked against ${log}`));
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("exits 2 on bad arguments, an unreadable file or log, and a failed gh call", () => {
    quiet();
    const { api, calls } = fakeApi();
    const f = file("text\n");
    for (const argv of [[], ["x", f], ["012", f], ["12", f, "--nope"], ["--check", "12", f], ["--check", f, "--rounds"], ["--comment", "12", f, "--rounds"], ["--edit-comment", "5", f, "--rounds"], ["--comment", "--check", f], ["--comment", "--edit-comment", "5", f]]) {
      expect(main(argv, { api }), argv.join(" ")).toBe(2);
    }
    expect(calls).toEqual([]);
    expect(main(["12", join(tmpdir(), "post-body-none", "missing.md")], { api })).toBe(2);
    expect(main(["12", f, "--rounds"], { api, readLog: () => { throw new Error("no log"); } })).toBe(2);
    expect(main(["12", f], { api: () => { throw new Error("gh api failed"); } })).toBe(2);
  });
});
