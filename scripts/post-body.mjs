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
//   node scripts/post-body.mjs <issue-number> <file>
//   node scripts/post-body.mjs <PR-number> <file> --closes <n,...|none> [--rounds]
//     Replaces the issue's or PR's body with the file. Whether the number is a PR is read
//     from its issue record after the text checks, before anything is posted (GitHub gives a
//     PR's a `pull_request` key): a PR's body needs --closes, and an issue's takes none (exit
//     2 otherwise, nothing posted).
//   node scripts/post-body.mjs --comment <issue-or-PR-number> <file>
//     Adds the file as a new comment. If anything fails after the comment is made, the
//     message names its id and URL, to fix with --edit-comment rather than post another.
//   node scripts/post-body.mjs --edit-comment <comment-id> <file>
//     Replaces an existing comment's text with the file.
//   node scripts/post-body.mjs --check <file> --closes <n,...|none>
//   node scripts/post-body.mjs --check <file> --issue
//     Runs the checks below and posts nothing: for a new PR with --closes, before `gh pr
//     create --body-file`, and for a new issue with --issue, before `gh issue create`; then
//     the first form, on the same file, reads it back. One of the two is required (exit 2
//     with neither or both), so a check that skips the closing rule says so. --check --issue
//     makes no `gh` call.
//
// The closing rule (IS #513, the Phase 10 retrospective's new action 1): on a PR's body and on
// --check --closes. A closing keyword before an issue reference in a PR body closes that issue when
// the PR merges into `dev`; three reached PR bodies in Phase 10 (process-log rows 932 and 954),
// caught only by the claims check, read after the post or run on a draft before the sentence
// existed. --closes lists the issues the PR closes, as numbers with no leading zero separated by
// commas, or `none`. Each match of closing-keywords.mjs's CLOSING, its number read whole
// (`closingNumbers`), must name a listed number in this repository: `#<n>`, `GH-<n>`,
// `<owner>/<name>#<n>` or an issue or pull URL, the owner and name compared case-insensitively with
// `gh repo view`'s, which is read only when the rule runs, so a private advisory fork reads its
// own. A reference to another repository fails even with its number listed (an over-match, as
// CLOSING over-matches), and so does a listed number no reference names (a "Closes #n" dropped
// while editing), any closing match to it counting as naming it (`closingProblems`' comment). Each
// fails before anything is posted (exit 1); a failed `gh repo view` is exit 2. --closes on a
// comment or --edit-comment, --issue outside --check, and a --closes value missing, empty, given
// twice, written `--closes=<list>` or with a leading zero are bad arguments (exit 2).
//
// The checks, before anything is posted (exit 1, nothing posted): a raw control character
// (all of C0 but tab, LF and CR); an invisible character (the no-break space, the soft
// hyphen, the zero-width space, non-joiner and joiner, the line and paragraph separators,
// the word joiner, the bidi marks, embeddings, overrides and isolates, the emoji
// presentation selector and the byte-order mark: INVISIBLE_NAMES lists them by code point;
// GitHub stores each unchanged, probe PR #428, so a read-back can't show them; kept are a
// joiner between two emoji, a U+FE0F after a pictograph or in a keycap, and a byte-order
// mark opening the file); the escape text GitHub rewrites (above); an ATX level-2
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
// Does not catch: for the closing rule, a dropped "Closes #n" whose number another closing match
// names (a quote, a fence, an over-matched form: `closingProblems`' comment), the PR's base and
// state (a PR into `main` closes nothing by keyword, as RUNBOOK's release steps say, and whether a
// keyword added to a merged PR's body closes its issue is unprobed; `--closes none` is RUNBOOK's
// rule for both, and a list there is checked against the body as on any PR, but nothing checks that
// it closes anything), a missing or extra --closes (a PR's body without it, an issue's with it)
// when the text checks already failed (those exit 1 first, before the lookup that tells a PR from
// an issue, so the next run names it), a listed number that is the wrong issue, a closing reference
// in a commit message (secret-scan's job), and a keyword GitHub reads that CLOSING doesn't match
// (its header's limit); a wrong or stale statement (the claims check and the rounds read those);
// text posted in the browser, or by `gh` without this script (CLAUDE.md's rule); a review comment
// on a PR's diff (it posts only issue and PR comments); invisible characters off the list, though
// GitHub keeps them too (probe PR #428: the text presentation selector U+FE0E, the narrow no-break
// space U+202F, a tag character U+E0041); a setext heading (text over `--`), which no heading check
// reads; a round heading with a number word past "ten"; a round section that is present but empty;
// a round recorded in the log in another form (rows before the log's review-form-from-row).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { closingNumbers } from "./closing-keywords.mjs";

// PROCESS_LOG overrides it, read when --rounds runs, as for process-log.sh, so a control can
// use a scratch copy; the success line names the log read.
const REPO_LOG = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude", "process-log.md");
const logPath = () => process.env.PROCESS_LOG || REPO_LOG;

// Raw control characters GitHub drops or rewrites, and any other a shell may leave behind:
// all of C0 but tab, LF and CR.
const isRawControl = (cp) => cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d;
// The escape text GitHub rewrites (probe PR #425): a lowercase \u, then 0000–001F but 0009,
// 000A, 000B and 000D, hex digits in either case.
const REWRITTEN_ESCAPE = /\\u00(?:0[0-8CEFcef]|1[0-9A-Fa-f])/g;
// Invisible characters GitHub stores unchanged, so no read-back shows them: each of the 21
// was posted to probe PR #428 between two letters and read back as sent (2026-11-19). A tool
// can leave them behind when an escape is written into a file (process-log row 806: four
// times). Listed by code point, so this source holds none of them.
const INVISIBLE_NAMES = new Map([
  [0x00a0, "no-break space"],
  [0x00ad, "soft hyphen"],
  [0x200b, "zero-width space"],
  [0x200c, "zero-width non-joiner"],
  [0x200d, "zero-width joiner"],
  [0x200e, "left-to-right mark"],
  [0x200f, "right-to-left mark"],
  [0x2028, "line separator"],
  [0x2029, "paragraph separator"],
  [0x202a, "left-to-right embedding"],
  [0x202b, "right-to-left embedding"],
  [0x202c, "pop directional formatting"],
  [0x202d, "left-to-right override"],
  [0x202e, "right-to-left override"],
  [0x2060, "word joiner"],
  [0x2066, "left-to-right isolate"],
  [0x2067, "right-to-left isolate"],
  [0x2068, "first strong isolate"],
  [0x2069, "pop directional isolate"],
  [0xfe0f, "emoji presentation selector"],
  [0xfeff, "byte-order mark"],
]);
const isPictographic = (ch) => ch !== undefined && /\p{Extended_Pictographic}/u.test(ch);
const isSkinTone = (ch) => ch !== undefined && ch.codePointAt(0) >= 0x1f3fb && ch.codePointAt(0) <= 0x1f3ff;
const KEYCAP_BASE = /^[0-9#*]$/;
/** Whether the invisible character at code point k of `chars` belongs to an emoji: a
 * zero-width joiner between two pictographs (the one before it may carry a skin tone or
 * U+FE0F: a family, a woman with a skin tone at a laptop, the rainbow flag), or a U+FE0F
 * right after a pictograph (a red heart, a check mark) or after a digit, `#` or `*` that a
 * keycap mark (U+20E3) follows. A U+FE0F after a skin tone is refused: no emoji has one
 * there (Unicode's emoji spec, UTS #51, puts the modifier last). */
function inEmoji(chars, k) {
  const cp = chars[k].codePointAt(0);
  if (cp === 0xfe0f) {
    if (k > 0 && KEYCAP_BASE.test(chars[k - 1])) return chars[k + 1]?.codePointAt(0) === 0x20e3;
    return isPictographic(chars[k - 1]);
  }
  if (cp !== 0x200d) return false;
  let j = k - 1;
  while (j >= 0 && (chars[j].codePointAt(0) === 0xfe0f || isSkinTone(chars[j]))) j--;
  return isPictographic(chars[j]) && isPictographic(chars[k + 1]);
}
/** Whether code point k of `chars` is one the checks refuse: a raw control character, or an
 * invisible one not part of an emoji. */
export const refused = (chars, k) => {
  const cp = chars[k].codePointAt(0);
  return isRawControl(cp) || (INVISIBLE_NAMES.has(cp) && !inEmoji(chars, k));
};

export const lines = (text) => text.replace(/\r\n?/g, "\n").split("\n");
export const codeName = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
const markOf = (cp) => (cp < 0x20 ? `<0x${cp.toString(16).padStart(2, "0")}>` : `<${codeName(cp)}>`);
/** An excerpt of `chars` around k, each character `bad` flags (worked out over the whole
 * line, so an emoji cut at the excerpt's edge isn't marked) shown as `<0xNN>` or `<U+XXXX>`. */
const around = (chars, bad, k) => {
  const from = Math.max(0, k - 30);
  return chars
    .slice(from, k + 30)
    .map((c, i) => (bad[from + i] ? markOf(c.codePointAt(0)) : c))
    .join("");
};
// For the read-back's sent and stored lines, where a difference must show whatever it is:
// every control, format or separator character and every default-ignorable one (Unicode's
// properties, so U+FE0E, U+202F, U+3000, the tag characters and the list are all in), the
// plain space aside. An emoji's own joiners and selectors are shown too, since a difference
// may be in them.
const INVISIBLE_ANY = /[\p{Cc}\p{Cf}\p{Z}\p{Default_Ignorable_Code_Point}]/u;
const anyInvisible = (c) => c !== " " && INVISIBLE_ANY.test(c);
const show = (s) => [...s].map((c) => (anyInvisible(c) ? markOf(c.codePointAt(0)) : c)).join("");

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
    // Columns count characters (code points), not UTF-16 units, so an emoji is one; `at`
    // maps a UTF-16 index to its character's index, built once per line.
    const chars = [...line];
    const bad = chars.map((_, k) => refused(chars, k));
    const at = [];
    let u = 0;
    chars.forEach((ch, k) => {
      at[u] = k;
      u += ch.length;
      if (!bad[k]) return;
      const cp = ch.codePointAt(0);
      const what = isRawControl(cp) ? "a raw control character" : `an invisible character, ${codeName(cp)} (${INVISIBLE_NAMES.get(cp)})`;
      out.push(`line ${i + 1}, column ${k + 1}: ${what}: …${around(chars, bad, k)}…`);
    });
    for (const m of line.matchAll(REWRITTEN_ESCAPE)) {
      out.push(`line ${i + 1}, column ${at[m.index] + 1}: GitHub rewrites the text ${m[0]}; write it as \\x${m[0].slice(4)} or in words`);
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
  "usage: node scripts/post-body.mjs <issue-number> <file>",
  "       node scripts/post-body.mjs <PR-number> <file> --closes <n,...|none> [--rounds]",
  "       node scripts/post-body.mjs --comment <issue-or-PR-number> <file>",
  "       node scripts/post-body.mjs --edit-comment <comment-id> <file>",
  "       node scripts/post-body.mjs --check <file> --closes <n,...|none>   (a new PR's body)",
  "       node scripts/post-body.mjs --check <file> --issue                 (a new issue's body)",
].join("\n");
const MODES = { "--comment": "comment", "--edit-comment": "edit-comment", "--check": "check" };
// --closes' value: issue numbers with no leading zero, separated by commas, or `none`.
const CLOSES_VALUE = /^(?:none|[1-9]\d*(?:,[1-9]\d*)*)$/;

/** The problems with a text's closing references against the numbers --closes lists
 * (IS #513): one to an unlisted number or another repository, and a listed number no
 * reference names. Any CLOSING match to a listed number counts as naming it, its over-matches
 * and a quoted or fenced one included: the owner's call on round 5 of PR #515, after rounds 3
 * to 5 found that parsing Markdown to count only the forms GitHub reads refused valid bodies
 * (an unclosed `<!--` in a code span, `<!-->`, a bold keyword). So a quoted "Closes #n" can
 * stand in for a dropped real one, and that issue stays open: a limit that fails safe, and
 * `closingIssuesReferences` shows it before the merge. */
export function closingProblems(text, listed, repo) {
  const problems = [];
  const named = new Set();
  for (const { line, ref, number } of closingNumbers(text, repo)) {
    if (number === null) problems.push(`line ${line}: "${ref}" closes an issue in another repository`);
    else if (!listed.has(number)) problems.push(`line ${line}: "${ref}" would close #${number}, which --closes doesn't list`);
    else named.add(number);
  }
  for (const n of listed) if (!named.has(n)) problems.push(`--closes lists #${n}, but no closing reference names it`);
  return problems;
}

export function main(argv, { readLog = () => readFileSync(logPath(), "utf8"), api = gh } = {}) {
  // --closes takes the next argument as its value; every other `--` argument is a flag.
  const flags = new Set();
  const args = [];
  let closes = null;
  let bad = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--closes") {
      const value = argv[++i];
      if (closes !== null || value === undefined || !CLOSES_VALUE.test(value)) bad = true;
      else closes = value === "none" ? new Set() : new Set(value.split(",").map(Number));
    } else if (argv[i].startsWith("--")) flags.add(argv[i]);
    else args.push(argv[i]);
  }
  const modeFlags = [...flags].filter((f) => f in MODES);
  const mode = modeFlags.length ? MODES[modeFlags[0]] : "body";
  bad ||=
    [...flags].some((f) => !(f in MODES) && f !== "--rounds" && f !== "--issue") ||
    modeFlags.length > 1 ||
    (flags.has("--rounds") && mode !== "body") ||
    (mode === "check" ? (closes !== null) === flags.has("--issue") : flags.has("--issue")) ||
    ((mode === "comment" || mode === "edit-comment") && closes !== null) ||
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
  // The closing rule (IS #513): on a PR's body, and on --check --closes. Whether <n> is a PR
  // comes from its issue record, which GitHub gives a `pull_request` key; the repository is
  // read only when the rule runs, so --check --issue makes no call.
  try {
    if (mode === "body") {
      const isPr = Boolean(JSON.parse(api(["api", `repos/{owner}/{repo}/issues/${n}`])).pull_request);
      if (isPr !== (closes !== null)) {
        console.error(
          isPr
            ? `post-body: #${n} is a pull request: name the issues its body closes with --closes <n,...|none>`
            : `post-body: #${n} is an issue, whose body closes nothing: drop --closes`,
        );
        console.error("post-body: nothing posted");
        return 2;
      }
    }
    if (closes !== null) {
      const repo = api(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
      const closing = closingProblems(text, closes, repo);
      if (closing.length) {
        for (const p of closing) console.error(`post-body: ${p}`);
        console.error("post-body: nothing posted");
        return 1;
      }
    }
  } catch (e) {
    console.error(`post-body: ${e.message}`);
    console.error("post-body: nothing posted");
    return 2;
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
