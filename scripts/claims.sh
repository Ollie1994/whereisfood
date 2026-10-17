#!/usr/bin/env bash
# Lists claims to check before a review round (IS #149). Run from anywhere in the repo:
#
#   bash scripts/claims.sh <rev> [file...]
#
# <rev>   anything `git diff` takes: a commit (compared with the working tree) or a
#         range such as `45071f9^1..6bb6c42`.
# file    more text to read whole, e.g. the PR-body file.
#
# Prints each line added in `git diff <rev>`, and each line of every given file, that
# contains one of WORDS below, as `path:line: text`; a count goes to stderr. Words
# that claim everything or claim a check was done are where the Phase 4 over-claims
# sat (rows 287, 304, 305, 307). The script lists them, it doesn't judge them: the
# author backs each hit with a command or rewords it (CLAUDE.md, "Review rounds").
#
# Words are matched whole and case-insensitively. `:`, `/`, `-` and `_` count as part
# of a word, so `test:all` or `all-in` don't match `all`.
#
# Skipped: `package-lock.json`, and `.claude/process-log.md`'s table rows (dated
# history; the log's prose is read).
#
# Does not catch: an over-claim without a listed word (row 284), wrong counts (rows
# 298-300), a claim on a line the diff doesn't add, untracked files (`git add -N`
# them first), and whether a listed claim is true.
#
# Exit codes: 0 when the run worked, hits or not; 2 for a bad <rev>, an unreadable
# file, or no git repository.

set -euo pipefail

# Settled by probes on six Phase 4 diffs (IS #149): each word below turned up there.
WORDS="every all only none never always clean verified checked confirmed works already"

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ $# -ge 1 ] || usage
case "$1" in -h|--help) usage ;; esac

rev="$1"; shift
for f in "$@"; do
  [ -f "$f" ] && [ -r "$f" ] || { echo "claims.sh: cannot read $f" >&2; exit 2; }
done
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "claims.sh: not in a git repository" >&2; exit 2; }

# A failed diff (bad rev) must not look like an empty, clean one.
if ! diff=$(git -C "$root" -c core.quotePath=false diff -U0 --no-color --no-ext-diff "$rev" \
    -- ':(top,exclude)package-lock.json' 2>&1); then
  echo "claims.sh: git diff $rev failed: $diff" >&2
  exit 2
fi

# One awk program for both inputs. Diff mode tracks the file from `+++ b/` and the
# line from each hunk header; file mode reads every line.
scan='
  function hit(path, n, text,    t, k, i, w) {
    seen++
    if (path ~ /(^|\/)\.claude\/process-log\.md$/ && text ~ /^\| [0-9]+ \|/) return
    t = tolower(text); gsub(/[^a-z0-9_:\/-]/, " ", t)
    k = split(t, w, " ")
    for (i = 1; i <= k; i++) {
      gsub(/^[:\/-]+|[:\/-]+$/, "", w[i])
      if (w[i] in W) { sub(/^[ \t]+/, "", text); print path ":" n ": " text; hits++; return }
    }
  }
  BEGIN { n = split(words, a, " "); for (i = 1; i <= n; i++) W[a[i]] }
  { sub(/\r$/, "") }
  mode == "file" { hit(name, FNR, $0); next }
  /^diff --git / { header = 1; next }
  # git ends the header with a tab when the path holds a space.
  header && /^\+\+\+ / { path = substr($0, 5); sub(/^b\//, "", path); sub(/\t$/, "", path); next }
  /^@@ / { header = 0; split($3, h, ","); line = substr(h[1], 2) + 0; next }
  !header && /^\+/ { hit(path, line, substr($0, 2)); line++ }
  END {
    printf "claims.sh: %s: %d hits in %d lines\n", (mode == "file" ? name : "diff " rev), hits + 0, seen + 0 > "/dev/stderr"
  }
'

{
  printf '%s\n' "$diff" | awk -v mode=diff -v rev="$rev" -v words="$WORDS" "$scan"
  for f in "$@"; do awk -v mode=file -v name="$f" -v words="$WORDS" "$scan" "$f"; done
}
