// Closing keywords: "fixes #348" in a commit message closes #348 once the commit lands on
// the default branch, `dev` (GitHub's "Linking a pull request to an issue"). PR #350's
// `365bdd9` said "the trial's fixes #348" and its merge closed #348 with none of its work
// done (process-log row 682; IS #368, the Phase 8 retrospective's new action).
//
//   git log -z --format='%H%n%B' <base>..<head> | node scripts/closing-keywords.mjs
//     ci.yml's `secret-scan` job. Reads the NUL-separated records (a commit's SHA, a newline,
//     its message) and, from PR_TITLE when it is set, the PR's title: GitHub's merge commit
//     carries the title as its message's second paragraph (`62e6a5f`: "Merge pull request
//     #367 from …", then the title). Prints an `::error::` per line holding a closing
//     reference and exits 1 on any; exits 2 when the input isn't such records.
//
//   node scripts/closing-keywords.mjs --lines <file>...
//     claims.sh. Prints each line of each file that holds a closing reference, as
//     `path:line: text`, and exits 0; exits 2 when a file can't be read. A PR body's own
//     "Closes #n" is meant, so this lists them for the author to confirm, and fails nothing.
//
// The pattern over-matches on purpose: refusing too much costs a reworded message. From
// GitHub's page (read 2026-11-16): the keywords close, closes, closed, fix, fixes, fixed,
// resolve, resolves and resolved; "can be followed by colons or in uppercase"; the forms
// `#ISSUE-NUMBER` and `OWNER/REPOSITORY#ISSUE-NUMBER`. Not from the page: any case, any
// whitespace (newlines included) or none between the keyword and the reference, and an
// issue or pull-request URL. A keyword inside a word ("prefixes #3") isn't one.
//
// Does not catch: a form GitHub reads that the page doesn't list; a keyword in a PR body
// (`--lines` lists those); a title or message changed after the run that read it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const KEYWORD = String.raw`\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b`;
const NAME = String.raw`[\w.-]+`;
const REFERENCE = String.raw`(?:#\d|${NAME}\/${NAME}#\d|https?:\/\/(?:www\.)?github\.com\/${NAME}\/${NAME}\/(?:issues|pull)\/\d)`;
export const CLOSING = new RegExp(String.raw`${KEYWORD}:?\s*${REFERENCE}`, "gi");

// Commits already on `dev` before this check, each with why it may stay. A PR into `main`
// reads `main..dev`, which holds them; they can't be reworded without rewriting `dev`.
// `git log origin/main..origin/dev` with this pattern, 2026-11-16: 1 hit in 654 commits.
export const EXEMPT = new Map([
  ["365bdd968443c746a3eb98d2e93f3f99cb08d203", "row 682: closed #348 on PR #350's merge; #348 was reopened and closed by PR #351"],
]);

// Pure. Each closing reference in a text, as { line, text }, one per line holding one. A
// reference split across lines is found on the line its keyword starts.
export function closingRefs(text) {
  const lines = text.split(/\r?\n/);
  const starts = [];
  for (let i = 0, at = 0; i < lines.length; i++) {
    starts.push(at);
    at += lines[i].length + (text.startsWith("\r\n", at + lines[i].length) ? 2 : 1);
  }
  const found = new Map();
  for (const match of text.matchAll(CLOSING)) {
    let i = starts.length - 1;
    while (starts[i] > match.index) i--;
    if (!found.has(i)) found.set(i, { line: i + 1, text: lines[i].trim() });
  }
  return [...found.values()];
}

// Pure. `git log -z --format='%H%n%B'` output as [{ sha, message }], or { error }.
export function parseRecords(input) {
  const records = [];
  for (const raw of input.split("\0")) {
    const rec = raw.replace(/^\n/, "");
    if (rec === "") continue;
    const newline = rec.indexOf("\n");
    const sha = newline === -1 ? rec : rec.slice(0, newline);
    if (!/^[0-9a-f]{40}$/.test(sha)) return { error: `a record doesn't start with a commit SHA: ${JSON.stringify(rec.slice(0, 60))}` };
    records.push({ sha, message: newline === -1 ? "" : rec.slice(newline + 1) });
  }
  return { records };
}

// Workflow-command data escaping (GitHub's docs, "Workflow commands"): `%`, CR and LF.
const escapeData = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

// Pure. The lines the step prints, and its exit code.
export function check(input, title) {
  const parsed = parseRecords(input);
  if (parsed.error) return { lines: [`::error::closing-keywords: ${escapeData(parsed.error)}`], code: 2 };
  const lines = [];
  let exempt = 0;
  for (const { sha, message } of parsed.records) {
    if (EXEMPT.has(sha)) {
      exempt++;
      continue;
    }
    for (const ref of closingRefs(message)) {
      lines.push(`::error::commit ${sha.slice(0, 7)} closes an issue on merge, line ${ref.line}: ${escapeData(ref.text)}`);
    }
  }
  if (title !== undefined) {
    for (const ref of closingRefs(title)) lines.push(`::error::the PR title closes an issue on merge (the merge commit carries it): ${escapeData(ref.text)}`);
  }
  const failed = lines.length > 0;
  lines.push(`${parsed.records.length} commits read, ${exempt} exempt${title === undefined ? "" : ", and the title"}; ${failed ? "reword each line above so no closing keyword comes before an issue reference" : "no closing reference"}`);
  return { lines, code: failed ? 1 : 0 };
}

function main(argv) {
  if (argv[0] === "--lines") {
    if (argv.length < 2) {
      console.error("closing-keywords: --lines needs a file");
      return 2;
    }
    for (const file of argv.slice(1)) {
      let text;
      try {
        text = readFileSync(file, "utf8");
      } catch (e) {
        console.error(`closing-keywords: cannot read ${file}: ${e.message}`);
        return 2;
      }
      for (const ref of closingRefs(text)) console.log(`${file}:${ref.line}: ${ref.text}`);
    }
    return 0;
  }
  if (argv.length > 0) {
    console.error("usage: git log -z --format='%H%n%B' <range> | node scripts/closing-keywords.mjs");
    console.error("       node scripts/closing-keywords.mjs --lines <file>...");
    return 2;
  }
  let input;
  try {
    input = readFileSync(0, "utf8");
  } catch (e) {
    console.log(`::error::closing-keywords: cannot read stdin: ${escapeData(e.message)}`);
    return 2;
  }
  const { lines, code } = check(input, process.env.PR_TITLE);
  for (const line of lines) console.log(line);
  return code;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) process.exitCode = main(process.argv.slice(2));
