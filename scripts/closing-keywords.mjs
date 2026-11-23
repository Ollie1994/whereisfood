// Closing keywords: "fixes #348" in a commit message closes #348 once the commit lands on
// the default branch, `dev` (GitHub's "Linking a pull request to an issue"). PR #350's
// `365bdd9` said "the trial's fixes #348" and its merge closed #348 with none of its work
// done (process-log row 682; IS #368, the Phase 8 retrospective's new action).
//
//   git log -z --format='%H%n%B' <base>..<head> \
//     | PR_TITLE=… PR_BRANCH=… node scripts/closing-keywords.mjs
//     ci.yml's `secret-scan` job. Reads the NUL-separated records (a commit's SHA, a newline,
//     its message), and the merge commit GitHub will write: its message is "Merge pull request
//     #<n> from <owner>/<branch>", a blank line, then the PR's title (`62e6a5f`), so the
//     branch name and the title are read as that text, where a branch ending in a keyword and
//     a title starting with a reference meet (round 3 on PR #371). Both variables are
//     required and non-empty (GitHub gives every PR a title and a head branch), so a step
//     that stops passing one, or passes an expression that comes out empty, fails rather
//     than skipping it. Prints an `::error::` per line holding a closing reference and exits
//     1 on any; exits 2 when the input isn't such records or a variable is missing or empty.
//
//   node scripts/closing-keywords.mjs --lines <file>...
//     claims.sh. Prints each line of each file that holds a closing reference, as
//     `path:line: text` (`-` reads stdin, printed as `-`), and exits 0; exits 2 when a file
//     can't be read. A PR body's own
//     "Closes #n" is meant, so this lists them for the author to confirm, and fails nothing.
//
// The pattern over-matches on purpose: refusing too much costs a reworded message. From
// GitHub's page (read 2026-11-16): the keywords close, closes, closed, fix, fixes, fixed,
// resolve, resolves and resolved; "can be followed by colons or in uppercase"; the forms
// `#ISSUE-NUMBER` and `OWNER/REPOSITORY#ISSUE-NUMBER`. Not from the page: any case; any
// whitespace (newlines included), Markdown emphasis (`*`, `_`, `~`) or nothing around the
// keyword and before the reference; a reference in a Markdown link's text or in `<…>`;
// `GH-<n>`, GitHub's other issue autolink; and an issue or pull-request URL. A keyword with
// a letter or digit on either side isn't one ("prefixes #3", "fixups/foo#2"), and an owner
// name starts with a letter or digit, so "fix-up/foo#2" isn't one either. `_` doesn't bound
// it, so an italic keyword counts, and so does one ending a snake_case name ("auto_close"
// before an issue number): an over-match, kept for the italic one (round 2 on PR #371).
//
// Does not catch: a form GitHub reads that the page doesn't list; a keyword in a PR body
// (`--lines` lists those); a title changed after the run that read it, since ci.yml has no
// `edited` trigger (its header says why), though GitHub's merge commit carries the title as
// it is at merge. Nothing refuses a message at commit time: the commit-msg hook runs Gitleaks
// only (the owner's call, round 1 on PR #371). A red check is fixed on the PR's branch:
// recommit the commit it names (`git commit --amend` for the last one, or `git reset --soft`
// to before it and commit again) and force-push the branch, which the rulesets allow on any
// branch but `dev` and `main`. One that reaches `dev` anyway (a title edited after the run,
// or a message edited in GitHub's merge dialog) closes its issue there, and stays in every
// later PR into `main`'s range: a PR into `dev` adds its SHA to EXEMPT, with the reason. The
// SHA is the one `dev` holds, from `git log origin/main..origin/dev`: a rebase merge gives the
// commits new SHAs, so the one a PR's failed run named may not be it.
//
// It models the repository's merge settings as read on 2026-11-16 (`gh api repos/{owner}/
// {repo}`): a merge commit's title is "Merge pull request #<n> from <owner>/<branch>"
// (MERGE_MESSAGE) and its message the PR title (PR_TITLE); rebase merging keeps each
// commit's message; squash merging, which joins every message into one text this doesn't
// read, is off (the owner's call, round 4 on PR #371). A change to those settings changes
// what lands on `dev`, and needs this script read again.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { escapeData } from "./lib/workflow-command.mjs";

const KEYWORD = String.raw`(?<![A-Za-z0-9])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?![A-Za-z0-9])`;
const OWNER = String.raw`[A-Za-z0-9][\w.-]*`;
const REPO = String.raw`[\w.-]+`;
const REFERENCE = String.raw`(?:#\d|GH-\d|${OWNER}\/${REPO}#\d|https?:\/\/(?:www\.)?github\.com\/${OWNER}\/${REPO}\/(?:issues|pull)\/\d)`;
export const CLOSING = new RegExp(String.raw`${KEYWORD}[*_~]*:?[*_~\s]*[[<]?${REFERENCE}`, "gi");

// Commits on `dev` this check lets stay, each with why: those from before it, and any that
// reach `dev` past it (the header's way back). A PR into `main` reads `main..dev`, which
// holds them; they can't be reworded without rewriting `dev`. Before the check, `git log
// origin/main..origin/dev` with this pattern, 2026-11-16: 1 hit in 654 commits.
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

// Pure. Each closing reference in a text with the issue it names, as { line, ref, number },
// for post-body.mjs's --closes (IS #513). `REFERENCE` ends at the reference's first digit,
// so a match holds one ("fixes #12" matches as "fixes #1"); the digits after the match are
// read too, so `number` is the whole one. `number` is null for a reference to a repository
// other than `repo` ("owner/name", compared case-insensitively, as GitHub reads names).
export function closingNumbers(text, repo) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const here = repo.toLowerCase();
  const found = [];
  for (const match of text.matchAll(CLOSING)) {
    const end = match.index + match[0].length;
    const ref = match[0] + /^\d*/.exec(text.slice(end))[0];
    let line = starts.length;
    while (starts[line - 1] > match.index) line--;
    const url = /github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)$/i.exec(ref);
    const named = url ?? /([A-Za-z0-9][\w.-]*\/[\w.-]+)#(\d+)$/.exec(ref);
    const number = Number((named ?? /(\d+)$/.exec(ref)).at(-1));
    found.push({ line, ref: ref.trim(), number: named && named[1].toLowerCase() !== here ? null : number });
  }
  return found;
}

// Pure. `git log -z --format='%H%n%B'` output as [{ sha, message }], or { error }.
export function parseRecords(input) {
  const records = [];
  for (const rec of input.split("\0")) {
    if (rec === "") continue;
    const newline = rec.indexOf("\n");
    const sha = newline === -1 ? rec : rec.slice(0, newline);
    if (!/^[0-9a-f]{40}$/.test(sha)) return { error: `a record doesn't start with a commit SHA: ${JSON.stringify(rec.slice(0, 60))}` };
    records.push({ sha, message: newline === -1 ? "" : rec.slice(newline + 1) });
  }
  return { records };
}

// Pure. The lines the step prints, and its exit code. `pr` is required: { title, branch },
// both strings, as main() reads them from PR_TITLE and PR_BRANCH.
export function check(input, pr) {
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
  const branchAlone = closingRefs(`from ${pr.branch}`).length > 0;
  for (const ref of closingRefs(`from ${pr.branch}\n\n${pr.title}`)) {
    const [text, fix] =
      ref.line !== 1
        ? [`title ${ref.text}`, "retitle the PR"]
        : branchAlone
          ? [`branch ${pr.branch}`, "rename the branch"]
          : [`branch ${pr.branch}, then title ${pr.title}`, "rename the branch or retitle the PR"];
    lines.push(`::error::the merge commit's branch name and title close an issue on merge (${fix}): ${escapeData(text)}`);
  }
  const failed = lines.length > 0;
  lines.push(`${parsed.records.length} commits read, ${exempt} exempt, and the merge commit's branch and title; ${failed ? "reword each line above so no closing keyword comes before an issue reference" : "no closing reference"}`);
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
        text = readFileSync(file === "-" ? 0 : file, "utf8");
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
  const { PR_TITLE: title, PR_BRANCH: branch } = process.env;
  if (!title || !branch) {
    console.log("::error::closing-keywords: PR_TITLE and PR_BRANCH must both be set and non-empty");
    return 2;
  }
  const { lines, code } = check(input, { title, branch });
  for (const line of lines) console.log(line);
  return code;
}

// Run only when executed, not when a test imports it (controls-trigger.mjs's form). The
// path compare alone skipped `main` when run through a junction and exited 0, since Node
// resolves `import.meta.url` through it and `argv[1]` isn't (round 1 on PR #371).
const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
