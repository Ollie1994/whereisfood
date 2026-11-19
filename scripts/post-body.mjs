// Posts an issue's or a PR's body, or a new comment, from a file and reads it back (IS #403,
// the Phase 9 retrospective's new action 1). GitHub doesn't always store what it's sent, and
// a body written by a script can be wrong before it's sent:
// - GitHub rewrites the text `\u0000`–`\u001F` to a backslash and a caret form (`\^@`, `\^A`
//   … `\^_`), all but `\u0009`, `\u000A`, `\u000B` and `\u000D`; it drops a raw NUL, and
//   stores raw 0x01–0x07 and 0x0E–0x1F as caret forms (`^A`). `\xNN`, `\0`, `\n`, `\t`,
//   the escape for U+2028 and `\u{0}` are kept, and so are raw 0x08, tab, 0x0B, 0x0C and
//   CR. Probed on probe PR #425 (2026-11-19) through `gh api -F body=@file` and through a
//   JSON body, with the same results, so the rewrite is GitHub's. Only a lowercase `\u` was
//   probed. Rows 746 and 747: the NUL probe's string was stored as `\^@` in three PRs' and
//   issues' text.
// - A body built by a shell can carry raw control characters: PRs #252 and #331 held a raw
//   backspace where `\b` was meant, which reads back exactly as sent (IS #403's sweep, row
//   801).
// - A fill script duplicated half of PR #398's body (row 735), and another inserted no round
//   sections into PRs #408 and #409 (row 769).
//
//   node scripts/post-body.mjs <issue-or-PR-number> <file> [--rounds]
//     Replaces the issue's or PR's body with the file.
//   node scripts/post-body.mjs --comment <issue-or-PR-number> <file>
//     Adds the file as a new comment. If anything fails after the comment is made, the
//     message names its id and URL, to fix with --edit-comment rather than post another.
//   node scripts/post-body.mjs --edit-comment <comment-id> <file>
//     Replaces an existing comment's text with the file.
//   node scripts/post-body.mjs --check <file>
//     Runs the checks below and posts nothing: for a new issue or PR, before `gh issue create`
//     or `gh pr create --body-file`; then the first form, on the same file, reads it back.
//
// The checks, before anything is posted (exit 1, nothing posted): a raw control character
// (all of C0 but tab, LF and CR); an invisible character (the no-break space, the zero-width
// space, non-joiner and joiner, the line and paragraph separators, the word joiner and the
// byte-order mark, by code point in INVISIBLE_NAMES; GitHub stores each unchanged, probe PR
// #428, so a read-back can't show them; a joiner between two emoji, and a byte-order mark
// opening the file, are kept); the escape text GitHub rewrites (above); an ATX level-2
// heading twice (`##` then blanks, a closing run of `#` dropped). Lines inside a fenced code
// block (``` with no backtick after it on the line, or ~~~; closed only by a fence of the same
// character, at least as long, with nothing after it) or an HTML comment (a line starting
// `<!--`, to the line holding `-->`; `<!-->` is a whole one) are not headings. With --rounds
// (a PR body), it reads the process log's rows (the file PROCESS_LOG names, else
// .claude/process-log.md) whose `Where` starts `PR #<n> /` and whose `Caught by` starts
// `` `code-review` r<N> on PR #<n> `` (blanks collapsed, as process-log.sh's check does), and
// needs `## Round <k>` exactly once for each k from 1 to the highest such N; the next round's
// heading, for a last round that found nothing and so has no row, may appear once, and no
// other. A round heading (one starting "round", any case, unless a word that isn't a number
// word follows: `## Round-up`, `## Round trip`) not in the form `## Round <k>`, k from 1
// with no leading zero, fails: `## Round two`, `## round 1`, `## Round-1`, `## Round 01`.
// Then it posts the text as a JSON body through `gh api`, reads the stored copy back,
// and exits 1 if it differs from the file in anything but line endings and spaces or tabs at
// the ends of lines or of the text. Exits 2 on bad arguments (a number with a leading zero
// among them), an unreadable file or log, or a failed `gh` call; 0 when all is well.
//
// Does not catch: a wrong or stale statement (the claims check and the rounds read those); text
// posted in the browser, or by `gh` without this script (CLAUDE.md's rule); a review comment
// on a PR's diff (it posts only issue and PR comments); a setext heading (text over `--`),
// which no heading check reads; a round heading with a number word past "ten"; a round
// section that is present but empty; a round recorded in the log in another form (rows
// before the log's review-form-from-row).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// PROCESS_LOG overrides it, read when --rounds runs, as for process-log.sh, so a control can
// use a scratch copy; the success line names the log read.
const REPO_LOG = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude", "process-log.md");
const logPath = () => process.env.PROCESS_LOG || REPO_LOG;

// Raw control characters GitHub drops or rewrites, and any other a shell may leave behind:
// all of C0 but tab, LF and CR.
const RAW_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
// The escape text GitHub rewrites (probe PR #425): a lowercase \u, then 0000–001F but 0009,
// 000A, 000B and 000D, hex digits in either case.
const REWRITTEN_ESCAPE = /\\u00(?:0[0-8CEFcef]|1[0-9A-Fa-f])/g;
// Invisible characters GitHub stores unchanged (probe PR #428), so no read-back shows them,
// and a tool can leave behind: PR #426's header, BOM regex and body each got one when an
// escape was written into a file (IS #427). Built from code points, so this source holds
// none of them.
const INVISIBLE_NAMES = new Map([
  [0x00a0, "no-break space"],
  [0x200b, "zero-width space"],
  [0x200c, "zero-width non-joiner"],
  [0x200d, "zero-width joiner"],
  [0x2028, "line separator"],
  [0x2029, "paragraph separator"],
  [0x2060, "word joiner"],
  [0xfeff, "byte-order mark"],
]);
const INVISIBLE = new RegExp(`[${[...INVISIBLE_NAMES.keys()].map((cp) => String.fromCodePoint(cp)).join("")}]`, "gu");
const ZWJ = String.fromCodePoint(0x200d);
// A zero-width joiner between two emoji builds one emoji (a family, a flag), so it stays.
const inEmoji = (line, i) => line[i] === ZWJ && /\p{Extended_Pictographic}\uFE0F?$/u.test(line.slice(0, i)) && /^\p{Extended_Pictographic}/u.test(line.slice(i + 1));

const lines = (text) => text.replace(/\r\n?/g, "\n").split("\n");
const codeName = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
const show = (s) =>
  s.replace(/[\u0000-\u001F]/g, (c) => `<0x${c.charCodeAt(0).toString(16).padStart(2, "0")}>`).replace(INVISIBLE, (c) => `<${codeName(c.codePointAt(0))}>`);
const around = (line, i) => show(line.slice(Math.max(0, i - 30), i + 30));

/** Whether the text after a `<!--` ends the comment: `-->` in it, or `>` or `->` at once
 * (`<!-->` and `<!--->` are whole comments in CommonMark). */
const commentEnds = (rest) => rest.startsWith(">") || rest.startsWith("->") || rest.includes("-->");

/** The lines outside fenced code blocks and HTML comments, each with its 1-based number. A
 * fence opens on ``` (with no backtick after it on the line) or ~~~, three or more, up to
 * three spaces in, and closes only on the same character, at least as many, with nothing but
 * blanks after (CommonMark's fenced code blocks). A comment runs from `<!--` to `-->`. */
function unfenced(text) {
  const out = [];
  let fence = null;
  let comment = false;
  lines(text).forEach((line, i) => {
    if (comment) {
      if (line.includes("-->")) comment = false;
      return;
    }
    if (fence === null) {
      const open = line.match(/^ {0,3}(`{3,})[^`]*$/) ?? line.match(/^ {0,3}(~{3,})/);
      if (open) fence = open[1];
      else if (/^ {0,3}<!--/.test(line) && !commentEnds(line.slice(line.indexOf("<!--") + 4))) comment = true;
      else out.push({ line, n: i + 1 });
      return;
    }
    const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
    if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
  });
  return out;
}

/** A level-2 heading's text (blanks after `##`, a closing run of `#` dropped), or null. */
function h2(line) {
  const m = line.match(/^ {0,3}##(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/);
  return m ? (m[1] ?? "") : null;
}

/** Each problem in the text to be posted, as "line N, column C: what". */
export function textProblems(text) {
  const out = [];
  lines(text).forEach((line, i) => {
    for (const m of line.matchAll(RAW_CONTROL)) {
      out.push(`line ${i + 1}, column ${m.index + 1}: a raw control character: …${around(line, m.index)}…`);
    }
    for (const m of line.matchAll(INVISIBLE)) {
      if (inEmoji(line, m.index)) continue;
      const cp = m[0].codePointAt(0);
      out.push(`line ${i + 1}, column ${m.index + 1}: an invisible character, ${codeName(cp)} (${INVISIBLE_NAMES.get(cp)}): …${around(line, m.index)}…`);
    }
    for (const m of line.matchAll(REWRITTEN_ESCAPE)) {
      out.push(`line ${i + 1}, column ${m.index + 1}: GitHub rewrites the text ${m[0]}; write it as \\x${m[0].slice(4)} or in words`);
    }
  });
  return out;
}

/** Each `## ` heading, outside fences, that appears more than once. */
export function repeatedHeadings(text) {
  const seen = new Map();
  for (const { line } of unfenced(text)) {
    const h = h2(line);
    if (h === null) continue;
    seen.set(h, (seen.get(h) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([h, n]) => `"## ${h}" ${n} times`);
}

/** The round numbers the process log records for PR `pr`, sorted. */
export function roundsFromLog(logText, pr) {
  const rounds = new Set();
  for (const line of lines(logText)) {
    if (!/^\| \d+ \|/.test(line)) continue;
    // Escaped pipes are masked before splitting, as process-log.sh does.
    const cells = line.replace(/\\\|/g, "~").split("|").map((c) => c.trim());
    const where = cells[3] ?? "";
    const caught = (cells[6] ?? "").replace(/[ \t]+/g, " ");
    if (!where.startsWith(`PR #${pr} /`)) continue;
    const m = caught.match(new RegExp(String.raw`^\`code-review\` r(\d+) on PR #${pr}\b`));
    if (m) rounds.add(Number(m[1]));
  }
  return [...rounds].sort((a, b) => a - b);
}

/** Whether a heading's text is a round heading, well formed or not: it starts with "round"
 * (any case), unless a word follows that isn't a number word ("Round-up", "Round trip",
 * "Round one-off"). "Round-1", "Round #2", "Round two" and "round 1" are round headings. */
function isRoundHeading(h) {
  const m = h.match(/^round\b(.*)$/i);
  if (!m) return false;
  if (/^-[a-z]/i.test(m[1])) return false;
  const word = m[1].match(/^[ \t]+([a-z][a-z-]*)/i);
  return !word || /^(?:one|two|three|four|five|six|seven|eight|nine|ten)$/i.test(word[1]);
}

/** Each way the body's round headings differ from the rounds the log records. */
export function roundProblems(text, rounds) {
  const count = new Map();
  const out = [];
  for (const { line, n } of unfenced(text)) {
    const h = h2(line);
    if (h === null || !isRoundHeading(h)) continue;
    // The form: "Round", a space, a number from 1 with no leading zero, then a word boundary.
    const m = h.match(/^Round ([1-9]\d*)\b/);
    if (!m) {
      out.push(`line ${n}: a round heading not in the form "## Round <N>" (N from 1): ${line.trim()}`);
      continue;
    }
    count.set(Number(m[1]), (count.get(Number(m[1])) ?? 0) + 1);
  }
  const top = Math.max(0, ...rounds);
  for (let k = 1; k <= top; k++) {
    if ((count.get(k) ?? 0) !== 1) out.push(`round ${k}: ${count.get(k) ?? 0} "## Round ${k}" headings, not 1 (the log's rounds go to ${top})`);
  }
  for (const [k, c] of count) {
    if (k === top + 1 && c > 1) out.push(`round ${k}: ${c} "## Round ${k}" headings, not 1`);
    if (k > top + 1) out.push(`round ${k}: a "## Round ${k}" heading, but the log's rounds go to ${top}; only round ${top + 1} may follow`);
  }
  return out;
}

/** The first line where the stored text differs from the sent one, or null. Line endings and
 * blanks at the ends of lines or of the text don't count. */
export function compareBodies(sent, stored) {
  // Only ASCII blanks: trimEnd() would also drop U+00A0, U+2028 and the like. A loop, not
  // /[ \t]+$/, which backtracks over a long run of blanks inside the text.
  const cut = (s, blanks) => {
    let i = s.length;
    while (i > 0 && blanks.includes(s[i - 1])) i--;
    return s.slice(0, i);
  };
  const trim = (t) => lines(cut(t, " \t\r\n")).map((l) => cut(l, " \t"));
  const a = trim(sent);
  const b = trim(stored ?? "");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { line: i + 1, sent: a[i] ?? "<none>", stored: b[i] ?? "<none>" };
  }
  return null;
}

function gh(args, input) {
  const r = spawnSync("gh", args, { input, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 4).join(" ")} failed: ${(r.stderr || r.error || "").toString().trim()}`);
  return r.stdout;
}

const USAGE = [
  "usage: node scripts/post-body.mjs <issue-or-PR-number> <file> [--rounds]",
  "       node scripts/post-body.mjs --comment <issue-or-PR-number> <file>",
  "       node scripts/post-body.mjs --edit-comment <comment-id> <file>",
  "       node scripts/post-body.mjs --check <file>",
].join("\n");
const MODES = { "--comment": "comment", "--edit-comment": "edit-comment", "--check": "check" };

export function main(argv, { readLog = () => readFileSync(logPath(), "utf8"), api = gh } = {}) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const args = argv.filter((a) => !a.startsWith("--"));
  const modeFlags = [...flags].filter((f) => f in MODES);
  const mode = modeFlags.length ? MODES[modeFlags[0]] : "body";
  const bad =
    [...flags].some((f) => !(f in MODES) && f !== "--rounds") ||
    modeFlags.length > 1 ||
    (flags.has("--rounds") && mode !== "body") ||
    (mode === "check" ? args.length !== 1 : args.length !== 2 || !/^[1-9]\d*$/.test(args[0]));
  if (bad) {
    console.error(USAGE);
    return 2;
  }
  const [n, file] = mode === "check" ? [null, args[0]] : args;
  let text;
  try {
    text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch (e) {
    console.error(`post-body: cannot read ${file}: ${e.message}`);
    return 2;
  }
  const problems = [...textProblems(text), ...repeatedHeadings(text).map((h) => `a repeated heading: ${h}`)];
  if (flags.has("--rounds")) {
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
  if (mode === "check") {
    console.log(`post-body: ${file} passes the checks (nothing posted)`);
    return 0;
  }
  const json = JSON.stringify({ body: text });
  let stored;
  let made = null;
  // A comment made but not read back is named, so it is fixed with --edit-comment and not
  // posted a second time.
  const madeNote = () =>
    made && console.error(`post-body: comment ${made.id} was made (${made.html_url}); fix it with --edit-comment ${made.id} <file>`);
  try {
    if (mode === "comment") {
      made = JSON.parse(api(["api", "-X", "POST", `repos/{owner}/{repo}/issues/${n}/comments`, "--input", "-"], json));
      stored = JSON.parse(api(["api", `repos/{owner}/{repo}/issues/comments/${made.id}`])).body;
    } else if (mode === "edit-comment") {
      api(["api", "-X", "PATCH", `repos/{owner}/{repo}/issues/comments/${n}`, "--input", "-"], json);
      stored = JSON.parse(api(["api", `repos/{owner}/{repo}/issues/comments/${n}`])).body;
    } else {
      api(["api", "-X", "PATCH", `repos/{owner}/{repo}/issues/${n}`, "--input", "-"], json);
      stored = JSON.parse(api(["api", `repos/{owner}/{repo}/issues/${n}`])).body;
    }
  } catch (e) {
    console.error(`post-body: ${e.message}`);
    madeNote();
    return 2;
  }
  const what = { comment: `the new comment on #${n}`, "edit-comment": `comment ${n}`, body: `#${n}'s body` }[mode];
  const diff = compareBodies(text, stored);
  if (diff) {
    console.error(`post-body: ${what} as stored differs at line ${diff.line}:`);
    console.error(`  sent:   ${show(diff.sent)}`);
    console.error(`  stored: ${show(diff.stored)}`);
    madeNote();
    return 1;
  }
  console.log(`post-body: ${what} posted and read back${flags.has("--rounds") ? `, rounds checked against ${logPath()}` : ""}`);
  return 0;
}

// Run only when executed, not when a test imports it (closing-keywords.mjs's form).
const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
