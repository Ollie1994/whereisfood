// Every tracked text file is free of the characters post-body.mjs refuses in posted text: raw
// control characters (all of C0 but tab, LF and CR) and the invisible ones it lists, with the
// same emoji exceptions (IS #430). On 2026-11-19 the Write and Edit tools turned an escape
// into the character itself four times, in a script's header, two regexes and a PR body, and
// no gate saw them (process-log row 806). Escape text written out (a backslash, `u` and four
// hex digits) is fine: only the characters themselves are refused.
//
// Does not catch: untracked files; a file Git would see as binary (it holds a NUL byte, and
// is skipped); invisible characters off post-body.mjs's list.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { refused } from "./post-body.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LF = String.fromCharCode(10);
const NUL = String.fromCharCode(0);

// A tracked file that must hold such a character, with the reason. Empty: none does.
const ALLOWED = new Map();

/** Each refused character in `text`, as { line, column, cp }; columns count characters. */
export function scanText(text) {
  const out = [];
  text.split(LF).forEach((line, i) => {
    const chars = [...line];
    chars.forEach((ch, k) => {
      if (refused(chars, k)) out.push({ line: i + 1, column: k + 1, cp: ch.codePointAt(0) });
    });
  });
  return out;
}

const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

/** The tracked files, read from the working tree, with the text ones scanned. */
function scanRepo() {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split(NUL).filter(Boolean);
  const found = [];
  let read = 0;
  for (const f of files) {
    const buf = readFileSync(join(ROOT, f));
    if (buf.includes(0)) continue;
    read++;
    if (ALLOWED.has(f)) continue;
    for (const p of scanText(buf.toString("utf8"))) found.push(`${f}:${p.line}:${p.column}: ${hex(p.cp)}`);
  }
  return { files: files.length, read, found };
}

describe("scanText", () => {
  const cps = (...xs) => xs.map((c) => String.fromCodePoint(c)).join("");
  it("finds a refused character by line and column", () => {
    expect(scanText(`ok${LF}ab${cps(0x00a0)}c`)).toEqual([{ line: 2, column: 3, cp: 0x00a0 }]);
    expect(scanText(`a${String.fromCharCode(1)}`)).toEqual([{ line: 1, column: 2, cp: 1 }]);
  });
  it("passes an emoji's joiners, a tab, CR and other non-ASCII text", () => {
    expect(scanText(`family ${cps(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)}, ${cps(0x2764, 0xfe0f)}`)).toEqual([]);
    expect(scanText(`a${String.fromCharCode(9)}b${String.fromCharCode(13)}${LF}Ställ in, café`)).toEqual([]);
  });
});

describe("the repo's tracked files", () => {
  const { files, read, found } = scanRepo();
  it("are read, so an empty scan can't pass", () => {
    expect(files).toBeGreaterThan(100);
    expect(read).toBeGreaterThan(100);
  });
  it("hold no character post-body.mjs refuses", () => {
    expect(found).toEqual([]);
  });
});
