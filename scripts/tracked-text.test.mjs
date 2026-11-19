// Every tracked text file is free of the characters post-body.mjs refuses in posted text: raw
// control characters (all of C0 but tab, LF and CR) and the invisible ones it lists, with the
// same emoji exceptions, and a byte-order mark opening a file dropped as it drops one (IS
// #430). On 2026-11-19 the Write and Edit tools turned an escape into the character itself
// four times, in a script's header, two regexes and a PR body, and no gate saw them
// (process-log row 806). Escape text written out (a backslash, `u` and four hex digits) is
// fine: only the characters themselves are refused. A file that isn't valid UTF-8 (or UTF-16
// with a byte-order mark) is reported too, since decoding it would hide them.
//
// Does not catch: untracked files; a file holding a NUL byte that isn't UTF-16 with a
// byte-order mark (read as binary and skipped; Git's own test differs: it looks only at the
// first 8000 bytes and honours .gitattributes); a tracked entry that isn't a regular file
// here (deleted, a symlink, a submodule), which is skipped; invisible characters off
// post-body.mjs's list.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { codeName, lines, refused } from "./post-body.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NUL = String.fromCharCode(0);
const BOM = 0xfeff;

// A tracked file that must hold such a character: its path, the code points allowed in it,
// and the reason. An entry whose characters the file no longer holds fails as stale. Empty:
// no file needs one.
const ALLOWED = new Map();

/** Each refused character in `text`, as { line, column, cp }; lines split as post-body.mjs
 * splits them, columns count characters, and a byte-order mark opening the text is dropped. */
export function scanText(text) {
  const body = text.codePointAt(0) === BOM ? text.slice(1) : text;
  const out = [];
  lines(body).forEach((line, i) => {
    const chars = [...line];
    chars.forEach((ch, k) => {
      if (refused(chars, k)) out.push({ line: i + 1, column: k + 1, cp: ch.codePointAt(0) });
    });
  });
  return out;
}

/** A file's bytes as text: UTF-16 with its byte-order mark, else UTF-8; null for binary (a
 * NUL byte, no UTF-16 mark); throws on invalid UTF-8 or UTF-16. */
export function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le", { fatal: true }).decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be", { fatal: true }).decode(buf.subarray(2));
  if (buf.includes(0)) return null;
  return new TextDecoder("utf-8", { fatal: true }).decode(buf);
}

/** The tracked files, read from the working tree, with the text ones scanned. */
function scanRepo() {
  const files = execFileSync("git", ["ls-files", "-z", "--deduplicate"], { cwd: ROOT, encoding: "utf8" }).split(NUL).filter(Boolean);
  const found = [];
  const allowedSeen = new Set();
  let scanned = 0;
  for (const f of files) {
    const path = join(ROOT, f);
    if (!existsSync(path) || !lstatSync(path).isFile()) continue;
    let text;
    try {
      text = decode(readFileSync(path));
    } catch {
      found.push(`${f}: not valid UTF-8 or UTF-16`);
      continue;
    }
    if (text === null) continue;
    scanned++;
    const allowed = ALLOWED.get(f);
    for (const p of scanText(text)) {
      if (allowed?.cps.includes(p.cp)) {
        allowedSeen.add(`${f} ${p.cp}`);
        continue;
      }
      found.push(`${f}:${p.line}:${p.column}: ${codeName(p.cp)}`);
    }
  }
  for (const [f, { cps }] of ALLOWED) {
    for (const cp of cps) if (!allowedSeen.has(`${f} ${cp}`)) found.push(`${f}: allowed ${codeName(cp)}, but the file no longer holds it (a stale entry)`);
  }
  return { files: files.length, scanned, found };
}

describe("scanText", () => {
  const cps = (...xs) => xs.map((c) => String.fromCodePoint(c)).join("");
  const LF = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  it("finds a refused character by line and column", () => {
    expect(scanText(`ok${LF}ab${cps(0x00a0)}c`)).toEqual([{ line: 2, column: 3, cp: 0x00a0 }]);
    expect(scanText(`a${String.fromCharCode(1)}`)).toEqual([{ line: 1, column: 2, cp: 1 }]);
  });
  it("splits lines as post-body.mjs does, a lone CR included", () => {
    expect(scanText(`a${CR}b${cps(0x00a0)}`)).toEqual([{ line: 2, column: 2, cp: 0x00a0 }]);
  });
  it("passes an emoji's joiners, a tab, CRLF and other non-ASCII text", () => {
    expect(scanText(`family ${cps(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)}, ${cps(0x2764, 0xfe0f)}`)).toEqual([]);
    expect(scanText(`a${String.fromCharCode(9)}b${CR}${LF}Ställ in, café, åtta`)).toEqual([]);
  });
  it("drops a byte-order mark opening the text, and refuses one inside it", () => {
    expect(scanText(`${cps(BOM)}text`)).toEqual([]);
    expect(scanText(`te${cps(BOM)}xt`)).toEqual([{ line: 1, column: 3, cp: BOM }]);
  });
});

describe("decode", () => {
  it("reads UTF-8, and UTF-16 with its byte-order mark", () => {
    expect(decode(Buffer.from("ok", "utf8"))).toBe("ok");
    expect(decode(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("ok", "utf16le")]))).toBe("ok");
    const be = Buffer.from("ok", "utf16le").swap16();
    expect(decode(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toBe("ok");
  });
  it("returns null for a NUL byte with no UTF-16 mark, and throws on invalid UTF-8", () => {
    expect(decode(Buffer.from([0x61, 0x00, 0x62]))).toBeNull();
    expect(() => decode(Buffer.from([0x61, 0xa0, 0x62]))).toThrow();
  });
});

describe("the repo's tracked files", () => {
  let result;
  beforeAll(() => {
    result = scanRepo();
  });
  it("are listed and scanned, so an empty scan can't pass", () => {
    expect(result.files).toBeGreaterThan(100);
    expect(result.scanned).toBeGreaterThan(100);
  });
  it("hold no character post-body.mjs refuses, and the allowlist holds no stale entry", () => {
    expect(result.found).toEqual([]);
  });
});
