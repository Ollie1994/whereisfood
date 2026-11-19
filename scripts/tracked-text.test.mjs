// Every tracked text file is free of the characters post-body.mjs refuses in posted text: raw
// control characters (all of C0 but tab, LF and CR) and the invisible ones it lists, with the
// same emoji exceptions, and one byte-order mark opening a file dropped as it drops one (IS
// #430). Why: process-log row 806. Escape text written out (a backslash, `u` and four hex
// digits) is fine: only the characters themselves are refused.
//
// Only Git's attributes excuse a file: one marked `-text` (or `binary`, or the legacy `-crlf`),
// read through `git ls-files --format`'s `%(eolattr)`, which prints `-text` for each and for
// `-text eol=lf`. Which mark to use, and why: `.gitattributes`' comment. `%(eolattr)` reads
// every attributes source Git does: a nested `.gitattributes`, an unstaged edit to one,
// `$GIT_DIR/info/attributes` and the user's `core.attributesFile` (probed on PR #433). CI's
// checkout has only the tracked `.gitattributes` files, so a local source can make a local run
// differ from CI's either way: a mark made only there skips a file CI fails, and a line there
// that sets `text` (`* text=auto`) outranks the tracked mark, so a marked file isn't excused
// locally (it printed `text=auto`, probed on PR #433). Every other regular tracked file must be
// valid UTF-8, and is scanned. Not Git's call from the content (`%(eolinfo:index)`): a bad byte
// with a NUL or a lone CR made it say `-text`, which hid the file, and a binary file that is
// valid UTF-8 was scanned (PR #431, round 5). An excused file that decodes as UTF-8 to
// something besides an opening byte-order mark, with nothing refused in it, is named, as a
// text file marked by mistake.
//
// Does not catch: untracked files; what an excused file holds, so a text file marked by mistake
// that holds a refused character is skipped with it; a binary pattern in `.gitattributes` that
// matches no tracked file, which excuses nothing until one does (not checked: the owner's call,
// IS #432); a symlink or submodule (by its mode in the index), skipped; a tracked file missing
// or not a regular file in the working tree, skipped, which includes one whose name isn't valid
// UTF-8 (Git's output is read as UTF-8, so a bad byte reads back as U+FFFD and the name isn't
// the file's; probed on PR #431, round 5); invisible characters off post-body.mjs's list.
// Fails falsely on: a text file whose `working-tree-encoding` isn't UTF-8, unless marked
// `-text` (as not valid UTF-8, or on each NUL a UTF-16 file without a byte-order mark decodes
// to); a marked file stored with Git LFS and checked out without it, whose pointer reads as
// text (an LFS line is `-text` too, probed on PR #433). `.gitattributes` sets neither.
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { codeName, lines, refused } from "./post-body.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);
const BOM = 0xfeff;
const REGULAR = new Set(["100644", "100755"]);

// A tracked file that must hold such a character: its path, the code points allowed in it,
// and the reason. An entry the file no longer needs, or with no reason, fails. Empty: no file
// needs one.
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

/** A file's bytes as UTF-8 text, an opening byte-order mark kept (so scanText drops exactly
 * one); throws on invalid UTF-8. */
export function decode(buf) {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);
}

/** `git ls-files -z --format='%(objectmode) %(eolattr)%x09%(path)'` output as
 * { path, mode, binary }, `binary` when Git's attributes, from any source, mark the path
 * `-text` (`binary` and `-crlf` included), each path once (a merge conflict lists one per stage). */
export function parseLsFiles(out) {
  const seen = new Map();
  for (const rec of out.split(NUL).filter(Boolean)) {
    // The first tab ends the fields: under -z Git doesn't quote a path, which may hold tabs.
    const tab = rec.indexOf(TAB);
    if (tab < 0) throw new Error(`git ls-files gave a record with no tab: ${rec}`);
    // The mode, then the attribute's words (`text eol=lf` holds a space).
    const [mode, ...attr] = rec.slice(0, tab).split(" ");
    const path = rec.slice(tab + 1);
    const prev = seen.get(path);
    // In a merge conflict, a regular stage wins over an earlier one that isn't. Git reads
    // attributes by path, so every stage gets the same one.
    if (!prev || (!REGULAR.has(prev.mode) && REGULAR.has(mode))) seen.set(path, { path, mode, binary: attr.includes("-text") });
  }
  return [...seen.values()];
}

/** A file's bytes, or null if `full` isn't a regular file here (missing, a directory, a
 * symlink: lstat doesn't follow one). */
export function readFile(full) {
  return lstatSync(full, { throwIfNoEntry: false })?.isFile() ? readFileSync(full) : null;
}

/** Scans tracked `files` ({ path, mode, binary, buf }) against `allowed`; returns the number
 * scanned and each finding. */
export function scanEntries(files, allowed) {
  const found = [];
  const seen = new Set();
  const skipped = new Map();
  const invalid = new Set();
  let scanned = 0;
  for (const { path, mode, binary, buf } of files) {
    if (!REGULAR.has(mode)) skipped.set(path, "is a symlink or submodule");
    else if (buf === null) skipped.set(path, "isn't a regular file here");
    if (skipped.has(path)) continue;
    let text = null;
    try {
      text = decode(buf);
    } catch {
      // Not UTF-8: excused only if marked, below.
    }
    // Only a -text mark excuses a file. One that reads as text with nothing refused in it, and
    // something besides an opening byte-order mark, is named: a text file marked by mistake.
    if (binary) {
      if (text !== null && text.slice(text.codePointAt(0) === BOM ? 1 : 0) !== "" && scanText(text).length === 0) found.push(`${path}: marked -text in Git's attributes, but reads as text`);
      skipped.set(path, "is marked -text");
      continue;
    }
    if (text === null) {
      found.push(`${path}: not valid UTF-8 (if it is binary, mark it -text in .gitattributes)`);
      invalid.add(path);
      continue;
    }
    scanned++;
    const ok = allowed.get(path)?.cps ?? [];
    for (const p of scanText(text)) {
      if (ok.includes(p.cp)) seen.add(`${path} ${p.cp}`);
      else found.push(`${path}:${p.line}:${p.column}: ${codeName(p.cp)}`);
    }
  }
  const tracked = new Set(files.map((f) => f.path));
  for (const [path, { cps, reason }] of allowed) {
    if (!reason) found.push(`${path}: on the allowlist with no reason`);
    if (!tracked.has(path)) found.push(`${path}: on the allowlist, but not a tracked file`);
    else if (skipped.has(path)) found.push(`${path}: on the allowlist, but it ${skipped.get(path)}, so it wasn't scanned`);
    else if (!invalid.has(path)) {
      for (const cp of cps) if (!seen.has(`${path} ${cp}`)) found.push(`${path}: allowed ${codeName(cp)}, but the file no longer holds it (a stale entry)`);
    }
  }
  return { scanned, found };
}

/** The tracked files, with their mode and mark from Git, read from the working tree. */
function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--format=%(objectmode) %(eolattr)%x09%(path)"], { cwd: ROOT, encoding: "utf8" });
  return parseLsFiles(out).map((f) => ({ ...f, buf: REGULAR.has(f.mode) ? readFile(join(ROOT, f.path)) : null }));
}

const cps = (...xs) => xs.map((c) => String.fromCodePoint(c)).join("");
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const utf8 = (s) => Buffer.from(s, "utf8");

describe("scanText", () => {
  it("finds a refused character by line and column", () => {
    expect(scanText(`ok${LF}ab${cps(0x00a0)}c`)).toEqual([{ line: 2, column: 3, cp: 0x00a0 }]);
    expect(scanText(`a${String.fromCharCode(1)}`)).toEqual([{ line: 1, column: 2, cp: 1 }]);
    expect(scanText(`a${NUL}b`)).toEqual([{ line: 1, column: 2, cp: 0 }]);
  });
  it("splits lines as post-body.mjs does, a lone CR included", () => {
    expect(scanText(`a${CR}b${cps(0x00a0)}`)).toEqual([{ line: 2, column: 2, cp: 0x00a0 }]);
  });
  it("passes an emoji's joiners, a tab, CRLF and other non-ASCII text", () => {
    expect(scanText(`family ${cps(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)}, ${cps(0x2764, 0xfe0f)}`)).toEqual([]);
    expect(scanText(`a${TAB}b${CR}${LF}Ställ in, café, åtta`)).toEqual([]);
  });
});

describe("decode and scanText together", () => {
  it("drops one byte-order mark opening the file, and refuses a second or one opening a later line", () => {
    expect(scanText(decode(utf8(`${cps(BOM)}a`)))).toEqual([]);
    expect(scanText(decode(utf8(`${cps(BOM, BOM)}a`)))).toEqual([{ line: 1, column: 1, cp: BOM }]);
    expect(scanText(decode(utf8(`a${LF}${cps(BOM)}b`)))).toEqual([{ line: 2, column: 1, cp: BOM }]);
    expect(scanText(decode(utf8(`te${cps(BOM)}xt`)))).toEqual([{ line: 1, column: 3, cp: BOM }]);
  });
  it("throws on invalid UTF-8", () => {
    expect(() => decode(Buffer.from([0x61, 0xa0, 0x62]))).toThrow();
  });
});

describe("parseLsFiles", () => {
  it("reads mode, the .gitattributes mark and path, each path once", () => {
    const out = [`100644 ${TAB}a.md`, `100644 -text${TAB}b.ico`, `120000 ${TAB}link`, `160000 ${TAB}sub`, `100644 ${TAB}a.md`, `100755 text eol=lf${TAB}x y.sh`, `100644 text=auto${TAB}t.txt`].join(NUL) + NUL;
    expect(parseLsFiles(out)).toEqual([
      { path: "a.md", mode: "100644", binary: false },
      { path: "b.ico", mode: "100644", binary: true },
      { path: "link", mode: "120000", binary: false },
      { path: "sub", mode: "160000", binary: false },
      { path: "x y.sh", mode: "100755", binary: false },
      { path: "t.txt", mode: "100644", binary: false },
    ]);
  });
  it("keeps a tab inside a path, and throws on a record with no tab", () => {
    expect(parseLsFiles(`100644 ${TAB}a${TAB}b.md${NUL}`)).toEqual([{ path: `a${TAB}b.md`, mode: "100644", binary: false }]);
    expect(() => parseLsFiles(`100644 a.md${NUL}`)).toThrow();
  });
  it("takes a regular stage over a base that wasn't one, in a merge conflict", () => {
    expect(parseLsFiles([`120000 ${TAB}m.md`, `100644 ${TAB}m.md`].join(NUL) + NUL)).toEqual([{ path: "m.md", mode: "100644", binary: false }]);
  });
});

describe("readFile", () => {
  it("reads a regular file, and gives null for a missing path or a directory", () => {
    expect(readFile(fileURLToPath(import.meta.url))).not.toBeNull();
    expect(readFile(join(ROOT, "no-such-file.control"))).toBeNull();
    expect(readFile(ROOT)).toBeNull();
  });
});

describe("scanEntries", () => {
  const file = (path, s, extra = {}) => ({ path, mode: "100644", binary: false, buf: s === null ? null : utf8(s), ...extra });
  const allow = (path, cpList, reason = "a test") => new Map([[path, { cps: cpList, reason }]]);
  it("names a refused character, and passes an allowed one", () => {
    expect(scanEntries([file("a.md", `x${cps(0x00a0)}`)], new Map()).found).toEqual(["a.md:1:2: U+00A0"]);
    expect(scanEntries([file("a.md", `x${cps(0x00a0)}`)], allow("a.md", [0xa0])).found).toEqual([]);
  });
  it("allows only the listed code points", () => {
    expect(scanEntries([file("a.md", `x${cps(0x00a0, 0x2028)}`)], allow("a.md", [0xa0])).found).toEqual(["a.md:1:3: U+2028"]);
  });
  it("skips a marked binary file, a symlink, a submodule and a missing file, and counts only what it scanned", () => {
    const ico = { path: "b.ico", mode: "100644", binary: true, buf: Buffer.from([0x00, 0xff, 0xfe, 0x80]) };
    const files = [file("a.md", "x"), ico, file("link", `x${cps(0x00a0)}`, { mode: "120000" }), file("sub", null, { mode: "160000" }), file("gone.md", null)];
    expect(scanEntries(files, new Map())).toEqual({ scanned: 1, found: [] });
  });
  it("skips a marked binary file that is valid UTF-8, its control bytes included", () => {
    const vector = file("v.bin", `ab${String.fromCharCode(1)}c${String.fromCharCode(2)} ${LF}`, { binary: true });
    expect(scanEntries([vector], new Map())).toEqual({ scanned: 0, found: [] });
  });
  it("reports an unmarked file that isn't valid UTF-8, whatever else it holds", () => {
    const cr = { path: "cr.md", mode: "100644", binary: false, buf: Buffer.concat([utf8(`line one${CR}caf`), Buffer.from([0xe9]), utf8(` ${cps(0x00a0)} x${LF}`)]) };
    const nul = { path: "nul.md", mode: "100644", binary: false, buf: Buffer.from([0x61, 0x62, 0x00, 0x63, 0xe9, 0x0a]) };
    expect(scanEntries([cr, nul], new Map()).found).toEqual(["cr.md: not valid UTF-8 (if it is binary, mark it -text in .gitattributes)", "nul.md: not valid UTF-8 (if it is binary, mark it -text in .gitattributes)"]);
  });
  it("scans an unmarked file that is valid UTF-8, a NUL and control bytes included", () => {
    const short = file("short.md", `ab${String.fromCharCode(1)}${cps(0x00a0)}`);
    expect(scanEntries([short], new Map())).toEqual({ scanned: 1, found: ["short.md:1:3: U+0001", "short.md:1:4: U+00A0"] });
    expect(scanEntries([file("nul.md", `a${NUL}b`)], new Map()).found).toEqual(["nul.md:1:2: U+0000"]);
  });
  it("names a marked file that reads as text with nothing refused, and skips one that holds a refused character", () => {
    expect(scanEntries([file("t.md", "plain text", { binary: true })], new Map())).toEqual({ scanned: 0, found: ["t.md: marked -text in Git's attributes, but reads as text"] });
    expect(scanEntries([file("t.md", `x${cps(0x00a0)}`, { binary: true })], new Map())).toEqual({ scanned: 0, found: [] });
  });
  it("doesn't name a marked file that is empty, or holds only a byte-order mark", () => {
    expect(scanEntries([file("e.ico", "", { binary: true })], new Map())).toEqual({ scanned: 0, found: [] });
    expect(scanEntries([file("m.ico", cps(BOM), { binary: true })], new Map())).toEqual({ scanned: 0, found: [] });
  });
  it("fails an allowlist entry that is stale, unscanned, untracked or has no reason, naming which", () => {
    expect(scanEntries([file("a.md", "x")], allow("a.md", [0xa0])).found).toEqual(["a.md: allowed U+00A0, but the file no longer holds it (a stale entry)"]);
    expect(scanEntries([file("a.md", null)], allow("a.md", [0xa0])).found).toEqual(["a.md: on the allowlist, but it isn't a regular file here, so it wasn't scanned"]);
    expect(scanEntries([file("a.md", "x")], allow("b.md", [0xa0])).found).toEqual(["b.md: on the allowlist, but not a tracked file"]);
    expect(scanEntries([file("a.md", `x${cps(0x00a0)}`)], allow("a.md", [0xa0], "")).found).toEqual(["a.md: on the allowlist with no reason"]);
    expect(scanEntries([file("a.md", `x${cps(0x00a0)}`, { binary: true })], allow("a.md", [0xa0])).found).toEqual(["a.md: on the allowlist, but it is marked -text, so it wasn't scanned"]);
  });
  it("reports invalid UTF-8 once", () => {
    const bad = { path: "b.md", mode: "100644", binary: false, buf: Buffer.from([0x61, 0xa0]) };
    expect(scanEntries([bad], allow("b.md", [0xa0]))).toEqual({ scanned: 0, found: ["b.md: not valid UTF-8 (if it is binary, mark it -text in .gitattributes)"] });
  });
});

describe("the repo's tracked files", () => {
  let files;
  let result;
  beforeAll(() => {
    files = trackedFiles();
    result = scanEntries(files, ALLOWED);
  });
  it("are listed and scanned, so an empty scan can't pass", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(result.scanned).toBeGreaterThan(100);
  });
  it("hold no character post-body.mjs refuses, and the allowlist holds no bad entry", () => {
    expect(result.found).toEqual([]);
  });
});
