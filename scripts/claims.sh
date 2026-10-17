#!/usr/bin/env bash
# Lists claims to check before a review round (IS #149). Run from anywhere in the repo:
#
#   bash scripts/claims.sh <rev> [file | --was <old> <new>]...
#
# <rev>   anything `git diff` takes: a commit (compared with the working tree) or a
#         range. For a PR's first round use "$(git merge-base origin/dev HEAD)", not
#         `dev`: quoted, so in bash a failed merge-base gives an empty <rev>, exit 2.
# file    more text to read whole, e.g. the PR body in the first round.
# --was   read only what <new> adds to <old>, e.g. the PR body as last posted against
#         the body now, or an issue body before and after the sweep edited it.
#
# Prints each line added in `git diff <rev>`, each line of every whole file, and each
# line a `--was` pair adds, that contains one of WORDS below, as `path:line: text`; a
# count per input goes to stderr. Words that claim everything or claim a check was
# done are where the Phase 4 over-claims sat (rows 287, 304, 305, 307). The script
# lists them, it doesn't judge them: the author settles each hit (CLAUDE.md, "Review
# rounds").
#
# Words are matched whole and case-insensitively. `:` joins words, so `test:all`
# doesn't match `all`. A token that starts with `--` (after an opening quote,
# backtick or bracket) is a command-line flag and is skipped (`--all`). Otherwise
# `-`, `/`, `_` and other punctuation separate words, so `double-checked`,
# `checked/verified`, `_every_` and `(-only` match.
#
# Every added line is read, process-log rows included: an added row is this change's
# claim, not history. Only `package-lock.json` is skipped.
#
# Does not catch: an over-claim without a listed word (row 284), including other
# forms of a listed word ("verifies", "checks"); wrong counts (rows 298-300); a claim
# on a line the diff doesn't add; untracked files (it warns about them when <rev> is
# compared with the working tree: commit them or `git add -N` them); and whether a
# listed claim is true.
#
# Exit codes: 0 when the run worked, hits or not; 2 for no or an empty <rev>, `-h`,
# a bad <rev>, an unreadable file, a `--was` without two files, or no git repository.
# Piped into a reader that stops early (`| head`), it can exit 141 (SIGPIPE) after a
# good run.

set -euo pipefail

# Settled by probes on six Phase 4 diffs (IS #149): each word below turned up there,
# except "everything", kept with "everywhere" as a universal form of "every" (PR #153).
WORDS="every everything everywhere all only none never always clean verified checked confirmed works already"

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ $# -ge 1 ] || usage
case "$1" in -h|--help) usage ;; esac

rev="$1"; shift
[ -n "$rev" ] || { echo "claims.sh: empty <rev> (did a git merge-base fail?)" >&2; exit 2; }

# Walks the file arguments, calling $1 with `file <f>` or `pair <old> <new>`. Run once
# to check every argument before anything is printed, and once to scan.
walk() {
  local action="$1"; shift
  while [ $# -gt 0 ]; do
    if [ "$1" = "--was" ]; then
      [ $# -ge 3 ] || { echo "claims.sh: --was needs <old> <new>" >&2; exit 2; }
      "$action" pair "$2" "$3"; shift 3
    else
      "$action" file "$1"; shift
    fi
  done
}
readable() { [ -f "$1" ] && [ -r "$1" ] || { echo "claims.sh: cannot read $1" >&2; exit 2; }; }
check() { readable "$2"; [ "$1" = file ] || readable "$3"; }
walk check "$@"
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "claims.sh: not in a git repository" >&2; exit 2; }

# git's stderr (e.g. autocrlf warnings) is kept out of the diff text, and shown only
# when the diff fails: a bad rev must not look like an empty, clean diff. The flags
# undo config that would change the text read: diff.noprefix and diff.mnemonicPrefix
# (explicit prefixes), diff.interHunkContext (context lines inside a hunk), and a
# textconv driver (converted text instead of the file's lines).
FLAGS="-U0 --inter-hunk-context=0 --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/"
err=$(mktemp); trap 'rm -f "$err"' EXIT
# shellcheck disable=SC2086
if ! diff=$(git -C "$root" -c core.quotePath=false diff $FLAGS "$rev" \
    -- ':(top,exclude)package-lock.json' 2>"$err"); then
  echo "claims.sh: git diff $rev failed: $(cat "$err")" >&2
  exit 2
fi
case "$rev" in
  *..*) ;;
  *) untracked=$(git -C "$root" ls-files --others --exclude-standard)
     [ -z "$untracked" ] || printf 'claims.sh: not read, untracked (commit or `git add -N` them):\n%s\n' "$untracked" >&2 ;;
esac

# One awk program for every input. Diff mode tracks the file from `+++ b/` (or takes
# CLAIMS_PATH) and the line from each hunk header; file mode reads every line. Values
# reach awk through ENVIRON, because `-v` would turn the backslashes of a Windows path
# into escapes.
scan='
  function hit(path, n, text,    lc, k, i, j, m, w, p, t) {
    seen++
    lc = tolower(text)
    k = split(lc, w, /[ \t]+/)
    for (i = 1; i <= k; i++) {
      t = w[i]; sub(/^[`\047"(\[{]+/, "", t)
      if (t ~ /^--/) continue
      gsub(/[^a-z0-9:]/, " ", t)
      m = split(t, p, " ")
      for (j = 1; j <= m; j++) {
        gsub(/^:+|:+$/, "", p[j])
        if (p[j] in W) { sub(/^[ \t]+/, "", text); print path ":" n ": " text; hits++; return }
      }
    }
  }
  BEGIN {
    mode = ENVIRON["CLAIMS_MODE"]; name = ENVIRON["CLAIMS_NAME"]; fixed = ENVIRON["CLAIMS_PATH"]
    n = split(ENVIRON["CLAIMS_WORDS"], a, " "); for (i = 1; i <= n; i++) W[a[i]]
  }
  { sub(/\r$/, "") }
  mode == "file" { hit(name, FNR, $0); next }
  /^diff --git / { header = 1; next }
  # git ends the header with a tab when the path holds a space.
  header && /^\+\+\+ / { path = substr($0, 5); sub(/^b\//, "", path); sub(/\t$/, "", path); if (fixed != "") path = fixed; next }
  /^@@ / { header = 0; split($3, h, ","); line = substr(h[1], 2) + 0; next }
  !header && /^\+/ { hit(path, line, substr($0, 2)); line++; next }
  !header && /^ / { line++ }
  END { printf "claims.sh: %s: %d hits in %d lines\n", name, hits + 0, seen + 0 > "/dev/stderr" }
'
export CLAIMS_WORDS="$WORDS"

scan_arg() {
  if [ "$1" = file ]; then
    # Through stdin: awk reads an operand shaped like `name=value` as an assignment.
    CLAIMS_MODE=file CLAIMS_NAME="$2" awk "$scan" < "$2"
    return
  fi
  # --no-index exits 1 when the files differ; only higher codes are failures.
  local d rc=0
  # shellcheck disable=SC2086
  d=$(git diff --no-index $FLAGS -- "$2" "$3" 2>"$err") || rc=$?
  [ "$rc" -le 1 ] || { echo "claims.sh: git diff --no-index $2 $3 failed: $(cat "$err")" >&2; exit 2; }
  printf '%s\n' "$d" | CLAIMS_MODE=diff CLAIMS_NAME="$3 (since $2)" CLAIMS_PATH="$3" awk "$scan"
}

printf '%s\n' "$diff" | CLAIMS_MODE=diff CLAIMS_NAME="diff $rev" awk "$scan"
walk scan_arg "$@"
