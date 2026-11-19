// Posts an issue's or a PR's body from a file and reads it back (IS #403, the Phase 9
// retrospective's new action 1). GitHub doesn't always store what it's sent, and a body
// written by a script can be wrong before it's sent:
// - GitHub rewrites the text `\u0000`–`\u001F` to a backslash and a caret form (`\^@`, `\^A`
//   … `\^_`), all but `\u0009`, `\u000A`, `\u000B` and `\u000D`; it drops a raw NUL, and
//   stores raw 0x01–0x07 and 0x0E–0x1F as caret forms (`^A`). `\xNN`, `\0`, `\n`, `\t`,
//   the escape for U+2028 and `\u{0}` are kept, and so are raw 0x08, tab, 0x0B, 0x0C and
//   CR. Probed on probe PR #425 (2026-11-19) through `gh api -F body=@file` and through a
//   JSON body, with the same results, so the rewrite is GitHub's. Rows 746 and 747: the NUL probe's string
//   was stored as `\^@` in three PRs' and issues' text.
// - A body built by a shell can carry raw control characters: PRs #252 and #331 held a raw
//   backspace where `\b` was meant, which reads back exactly as sent (IS #403's sweep).
// - A fill script duplicated half of PR #398's body (row 735), and another inserted no round
//   sections into PRs #408 and #409 (row 769).
//
//   node scripts/post-body.mjs <issue-or-PR-number> <file> [--rounds]
//     Before posting, exits 1 if the file holds a raw control character other than tab, LF
//     or CR, the text of an escape GitHub rewrites (above), or a `## ` heading twice. With
//     --rounds (a PR), it also reads the process log's rows whose `Where` starts `PR #<n> /`
//     and whose `Caught by` starts `` `code-review` r<N> on PR #<n> ``, and exits 1 unless
//     the body holds `## Round <N>` exactly once for each such N and no other `## Round`
//     heading. Then it posts the file as the body (a JSON body through `gh api`), reads it
//     back, and exits 1 if the stored body differs from the file in anything but line
//     endings and blanks at the ends of lines or of the text. Exits 2 on bad arguments, an
//     unreadable file or log, or a failed `gh` call; 0 when the stored body matches.
//
// Does not catch: a wrong or stale statement (the claims check and the rounds read those); a
// body edited in the browser, or by `gh` without this script (CLAUDE.md's rule); a round
// section that is present but empty; an issue body's sections (no rows to count); a round
// recorded in the log in another form (rows before the log's review-form-from-row).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude", "process-log.md");

// Raw control characters GitHub drops or rewrites, and any other a shell may leave behind:
// all of C0 but tab, LF and CR.
const RAW_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
// The escape text GitHub rewrites (probe PR #425): \u0000–\u001F but 09, 0A, 0B, 0D.
const REWRITTEN_ESCAPE = /\\u00(?:0[0-8CEF]|1[0-9A-F])/i;

const lines = (text) => text.replace(/\r\n?/g, "\n").split("\n");
const show = (s) => s.replace(/[\u0000-\u001F]/g, (c) => `<0x${c.charCodeAt(0).toString(16).padStart(2, "0")}>`);

/** Each problem in the text to be posted, as "line N: what". */
export function textProblems(text) {
  const out = [];
  lines(text).forEach((line, i) => {
    if (RAW_CONTROL.test(line)) out.push(`line ${i + 1}: a raw control character: ${show(line).slice(0, 120)}`);
    const m = line.match(REWRITTEN_ESCAPE);
    if (m) out.push(`line ${i + 1}: GitHub rewrites the text ${m[0]}; write it as \\x${m[0].slice(4)} or in words`);
  });
  return out;
}

/** Each `## ` heading that appears more than once. */
export function repeatedHeadings(text) {
  const seen = new Map();
  for (const line of lines(text)) {
    if (!line.startsWith("## ")) continue;
    const h = line.trimEnd();
    seen.set(h, (seen.get(h) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([h, n]) => `"${h}" ${n} times`);
}

/** The round numbers the process log records for PR `pr`, sorted. */
export function roundsFromLog(logText, pr) {
  const rounds = new Set();
  for (const line of lines(logText)) {
    if (!/^\| \d+ \|/.test(line)) continue;
    // Escaped pipes are masked before splitting, as process-log.sh does.
    const cells = line.replace(/\\\|/g, "~").split("|").map((c) => c.trim());
    const where = cells[3] ?? "";
    const caught = cells[6] ?? "";
    if (!where.startsWith(`PR #${pr} /`)) continue;
    const m = caught.match(new RegExp(String.raw`^\`code-review\`\s+r(\d+) on PR #${pr}\b`));
    if (m) rounds.add(Number(m[1]));
  }
  return [...rounds].sort((a, b) => a - b);
}

/** Each way the body's `## Round N` headings differ from `rounds`. */
export function roundProblems(text, rounds) {
  const count = new Map();
  for (const line of lines(text)) {
    const m = line.match(/^## Round (\d+)\b/);
    if (m) count.set(Number(m[1]), (count.get(Number(m[1])) ?? 0) + 1);
  }
  const out = [];
  for (const r of rounds) {
    const n = count.get(r) ?? 0;
    if (n !== 1) out.push(`round ${r}: ${n} "## Round ${r}" headings, not 1`);
  }
  for (const r of count.keys()) if (!rounds.includes(r)) out.push(`round ${r}: a "## Round ${r}" heading, but the log has no such round`);
  return out;
}

/** The first line where the stored body differs from the sent one, or null. Line endings
 * and blanks at the ends of lines or of the text don't count. */
export function compareBodies(sent, stored) {
  const a = lines(sent.trimEnd()).map((l) => l.trimEnd());
  const b = lines((stored ?? "").trimEnd()).map((l) => l.trimEnd());
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { line: i + 1, sent: a[i] ?? "<none>", stored: b[i] ?? "<none>" };
  }
  return null;
}

function gh(args, input) {
  const r = spawnSync("gh", args, { input, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || r.error || "").toString().trim()}`);
  return r.stdout;
}

export function main(argv, { readLog = () => readFileSync(LOG, "utf8"), api = gh } = {}) {
  const roundsFlag = argv.includes("--rounds");
  const args = argv.filter((a) => a !== "--rounds");
  if (args.length !== 2 || !/^\d+$/.test(args[0])) {
    console.error("usage: node scripts/post-body.mjs <issue-or-PR-number> <file> [--rounds]");
    return 2;
  }
  const [n, file] = args;
  let text;
  try {
    text = readFileSync(file, "utf8").replace(/^﻿/, "");
  } catch (e) {
    console.error(`post-body: cannot read ${file}: ${e.message}`);
    return 2;
  }
  const problems = [...textProblems(text), ...repeatedHeadings(text).map((h) => `a repeated heading: ${h}`)];
  if (roundsFlag) {
    let log;
    try {
      log = readLog();
    } catch (e) {
      console.error(`post-body: cannot read the process log: ${e.message}`);
      return 2;
    }
    problems.push(...roundProblems(text, roundsFromLog(log, n)));
  }
  if (problems.length) {
    for (const p of problems) console.error(`post-body: ${p}`);
    console.error("post-body: nothing posted");
    return 1;
  }
  const repo = `repos/{owner}/{repo}/issues/${n}`;
  let stored;
  try {
    api(["api", "-X", "PATCH", repo, "--input", "-"], JSON.stringify({ body: text }));
    stored = JSON.parse(api(["api", repo])).body;
  } catch (e) {
    console.error(`post-body: ${e.message}`);
    return 2;
  }
  const diff = compareBodies(text, stored);
  if (diff) {
    console.error(`post-body: #${n}'s stored body differs at line ${diff.line}:`);
    console.error(`  sent:   ${show(diff.sent)}`);
    console.error(`  stored: ${show(diff.stored)}`);
    return 1;
  }
  console.log(`post-body: #${n} posted and read back${roundsFlag ? ", rounds checked" : ""}`);
  return 0;
}

// Run only when executed, not when a test imports it (closing-keywords.mjs's form).
const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
