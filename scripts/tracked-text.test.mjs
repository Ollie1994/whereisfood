// Every tracked text file is free of the characters post-body.mjs refuses in posted text: raw
// control characters (all of C0 but tab, LF and CR) and the invisible ones it lists, with the
// same emoji exceptions, and one byte-order mark opening a file dropped as it drops one (IS
// #430). Why: process-log row 806. Escape text written out (a backslash, `u` and four hex
// digits) is fine: only the characters themselves are refused. A file with no NUL byte that
// isn't valid UTF-8, or one marked UTF-16 that isn't valid UTF-16, is reported too, since
// decoding it would hide them.
//
// Does not catch: untracked files; a file holding a NUL byte that isn't marked UTF-16 (read
// as binary and skipped; Git's own test differs: it looks only at the first 8000 bytes and
// honours .gitattributes), a UTF-32 file among them; a tracked entry that isn't a regular file
// here (deleted, a symlink, a submodule), which is skipped; invisible characters off
// post-body.mjs's list.
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { codeName, lines, refused } from "./post-body.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NUL = String.fromCharCode(0);
const BOM = 0xfeff;

// A tracked file that must hold such a character: its path, the code points allowed in it,
// and the reason. An entry the file no longer needs fails. Empty: no file needs one.
const ALLOWED = new Map();

/** Each refused character in `text`, as { line, column, cp }; lines split as post-body.mjs
 * splits them, columns count characters, and one byte-order mark opening the text dropped. */
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

// The decoders keep a byte-order mark (ignoreBOM), so scanText drops exactly one, as
// post-body.mjs does, and a second is refused.
const decoder = (label) => new TextDecoder(label, { fatal: true, ignoreBOM: true });

/** A file's bytes as text, its opening byte-order mark kept: UTF-16 by its mark, else UTF-8;
 * null for binary (a NUL byte and no UTF-16 mark, or a UTF-32 mark); throws on invalid text. */
export function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe && buf[2] === 0 && buf[3] === 0) return null;
  if (buf[0] === 0xff && buf[1] === 0xfe) return decoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return decoder("utf-16be").decode(buf);
  if (buf.includes(0)) return null;
  return decoder("utf-8").decode(buf);
}

/** Scans `entries` ({ path, buf }, buf null for one that isn't a regular file here) against
 * `allowed`; returns the number scanned and each finding. */
export function scanEntries(entries, allowed) {
  const found = [];
  const seen = new Set();
  const unscanned = new Map();
  let scanned = 0;
  for (const { path, buf } of entries) {
    if (buf === null) {
      unscanned.set(path, "isn't a regular file here");
      continue;
    }
    let text;
    try {
      text = decode(buf);
    } catch {
      found.push(`${path}: not valid UTF-8 or UTF-16`);
      unscanned.set(path, "isn't valid text");
      continue;
    }
    if (text === null) {
      unscanned.set(path, "is read as binary");
      continue;
    }
    scanned++;
    const ok = allowed.get(path)?.cps ?? [];
    for (const p of scanText(text)) {
      if (ok.includes(p.cp)) seen.add(`${path} ${p.cp}`);
      else found.push(`${path}:${p.line}:${p.column}: ${codeName(p.cp)}`);
    }
  }
  for (const [path, { cps }] of allowed) {
    if (unscanned.has(path)) {
      if (unscanned.get(path) !== "isn't valid text") found.push(`${path}: on the allowlist, but it ${unscanned.get(path)}, so it wasn't scanned`);
      continue;
    }
    for (const cp of cps) if (!seen.has(`${path} ${cp}`)) found.push(`${path}: allowed ${codeName(cp)}, but the file no longer holds it (a stale entry)`);
  }
  return { scanned, found };
}

/** One entry: the file's bytes, or null if `full` isn't a regular file (missing, a directory,
 * a symlink, which lstat doesn't follow). */
export function readEntry(path, full) {
  return { path, buf: lstatSync(full, { throwIfNoEntry: false })?.isFile() ? readFileSync(full) : null };
}

/** The tracked files, read from the working tree. */
function trackedEntries() {
  const files = execFileSync("git", ["ls-files", "-z", "--deduplicate"], { cwd: ROOT, encoding: "utf8" }).split(NUL).filter(Boolean);
  return files.map((path) => readEntry(path, join(ROOT, path)));
}

const cps = (...xs) => xs.map((c) => String.fromCodePoint(c)).join("");
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const utf8 = (s) => Buffer.from(s, "utf8");

describe("scanText", () => {
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
});

describe("decode and scanText together", () => {
  const le = (s) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, "utf16le")]);
  const be = (s) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(s, "utf16le").swap16()]);
  it("reads UTF-8, and UTF-16 by its mark", () => {
    expect(scanText(decode(utf8("ok")))).toEqual([]);
    expect(scanText(decode(le("ok")))).toEqual([]);
    expect(scanText(decode(be("ok")))).toEqual([]);
    expect(scanText(decode(le(`a${cps(0x00a0)}`)))).toEqual([{ line: 1, column: 2, cp: 0x00a0 }]);
  });
  it("drops one opening byte-order mark and refuses a second, in UTF-8 and UTF-16", () => {
    expect(scanText(decode(utf8(`${cps(BOM)}a`)))).toEqual([]);
    expect(scanText(decode(utf8(`${cps(BOM, BOM)}a`)))).toEqual([{ line: 1, column: 1, cp: BOM }]);
    expect(scanText(decode(le(`${cps(BOM)}a`)))).toEqual([{ line: 1, column: 1, cp: BOM }]);
    expect(scanText(decode(utf8(`te${cps(BOM)}xt`)))).toEqual([{ line: 1, column: 3, cp: BOM }]);
  });
  it("returns null for binary, a UTF-32 mark included, and throws on invalid text", () => {
    expect(decode(Buffer.from([0x61, 0x00, 0x62]))).toBeNull();
    expect(decode(Buffer.from([0xff, 0xfe, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00]))).toBeNull();
    expect(() => decode(Buffer.from([0x61, 0xa0, 0x62]))).toThrow();
    expect(() => decode(Buffer.from([0xff, 0xfe, 0x61, 0x00, 0x62]))).toThrow();
    expect(() => decode(Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0x61, 0x00]))).toThrow();
  });
});

describe("scanEntries", () => {
  const entry = (path, s) => ({ path, buf: s === null ? null : utf8(s) });
  const allow = (path, ...cpList) => new Map([[path, { cps: cpList, reason: "a test" }]]);
  it("names a refused character, and passes an allowed one", () => {
    expect(scanEntries([entry("a.md", `x${cps(0x00a0)}`)], new Map()).found).toEqual(["a.md:1:2: U+00A0"]);
    expect(scanEntries([entry("a.md", `x${cps(0x00a0)}`)], allow("a.md", 0xa0)).found).toEqual([]);
  });
  it("allows only the listed code points", () => {
    expect(scanEntries([entry("a.md", `x${cps(0x00a0, 0x2028)}`)], allow("a.md", 0xa0)).found).toEqual(["a.md:1:3: U+2028"]);
  });
  it("fails a stale entry, naming the cause", () => {
    expect(scanEntries([entry("a.md", "x")], allow("a.md", 0xa0)).found).toEqual(["a.md: allowed U+00A0, but the file no longer holds it (a stale entry)"]);
    expect(scanEntries([entry("a.md", null)], allow("a.md", 0xa0)).found).toEqual(["a.md: on the allowlist, but it isn't a regular file here, so it wasn't scanned"]);
  });
  it("reports invalid text once, and counts only what it scanned", () => {
    const bad = { path: "b.md", buf: Buffer.from([0x61, 0xa0]) };
    expect(scanEntries([bad], allow("b.md", 0xa0))).toEqual({ scanned: 0, found: ["b.md: not valid UTF-8 or UTF-16"] });
    expect(scanEntries([entry("a.md", "x"), entry("c.md", null)], new Map()).scanned).toBe(1);
  });
});

describe("readEntry", () => {
  it("reads a regular file, and gives null for a missing path or a directory", () => {
    expect(readEntry("p", fileURLToPath(import.meta.url)).buf).not.toBeNull();
    expect(readEntry("p", join(ROOT, "no-such-file.control")).buf).toBeNull();
    expect(readEntry("p", ROOT).buf).toBeNull();
  });
});

describe("the repo's tracked files", () => {
  let entries;
  let result;
  beforeAll(() => {
    entries = trackedEntries();
    result = scanEntries(entries, ALLOWED);
  });
  it("are listed and scanned, so an empty scan can't pass", () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(result.scanned).toBeGreaterThan(100);
  });
  it("hold no character post-body.mjs refuses, and the allowlist holds no stale entry", () => {
    expect(result.found).toEqual([]);
  });
});
