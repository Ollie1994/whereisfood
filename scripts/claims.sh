#!/usr/bin/env bash
# Lists claims to check before a review round (IS #149). Run from anywhere in the repo:
#
#   bash scripts/claims.sh <rev> [file...]
#
# <rev>   anything `git diff` takes: a commit (compared with the working tree) or a
#         range. For a PR's first round use `$(git merge-base dev HEAD)`, not `dev`.
# file    more text to read whole, e.g. the PR-body file.
#
# Prints each line added in `git diff <rev>`, and each line of every given file, that
# contains one of WORDS below, as `path:line: text`; a count goes to stderr. Words
# that claim everything or claim a check was done are where the Phase 4 over-claims
# sat (rows 287, 304, 305, 307). The script lists them, it doesn't judge them: the
# author settles each hit (CLAUDE.md, "Review rounds").
#
# Words are matched whole and case-insensitively. `:` joins words, so `test:all`
# doesn't match `all`. A token that starts with `-` is a command-line flag and is
# skipped (`--all`). Otherwise `-`, `/` and `_` separate words, so `double-checked`,
# `checked/verified` and `_every_` match.
#
# Every added line is read, process-log rows included: an added row is this change's
# claim, not history. Only `package-lock.json` is skipped.
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

# git's stderr (e.g. autocrlf warnings) is kept out of the diff text, and shown only
# when the diff fails: a bad rev must not look like an empty, clean diff. The explicit
# prefixes override diff.noprefix and diff.mnemonicPrefix.
err=$(mktemp); trap 'rm -f "$err"' EXIT
if ! diff=$(git -C "$root" -c core.quotePath=false diff -U0 --no-color --no-ext-diff \
    --src-prefix=a/ --dst-prefix=b/ "$rev" -- ':(top,exclude)package-lock.json' 2>"$err"); then
  echo "claims.sh: git diff $rev failed: $(cat "$err")" >&2
  exit 2
fi

# One awk program for both inputs. Diff mode tracks the file from `+++ b/` and the
# line from each hunk header; file mode reads every line. Values reach awk through
# ENVIRON, because `-v` would turn the backslashes of a Windows path into escapes.
scan='
  function hit(path, n, text,    t, k, i, j, m, w, p) {
    seen++
    t = tolower(text); gsub(/[^a-z0-9:-]/, " ", t)
    k = split(t, w, " ")
    for (i = 1; i <= k; i++) {
      if (w[i] ~ /^-/) continue
      m = split(w[i], p, "-")
      for (j = 1; j <= m; j++) {
        gsub(/^:+|:+$/, "", p[j])
        if (p[j] in W) { sub(/^[ \t]+/, "", text); print path ":" n ": " text; hits++; return }
      }
    }
  }
  BEGIN {
    mode = ENVIRON["CLAIMS_MODE"]; name = ENVIRON["CLAIMS_NAME"]
    n = split(ENVIRON["CLAIMS_WORDS"], a, " "); for (i = 1; i <= n; i++) W[a[i]]
  }
  { sub(/\r$/, "") }
  mode == "file" { hit(name, FNR, $0); next }
  /^diff --git / { header = 1; next }
  # git ends the header with a tab when the path holds a space.
  header && /^\+\+\+ / { path = substr($0, 5); sub(/^b\//, "", path); sub(/\t$/, "", path); next }
  /^@@ / { header = 0; split($3, h, ","); line = substr(h[1], 2) + 0; next }
  !header && /^\+/ { hit(path, line, substr($0, 2)); line++ }
  END { printf "claims.sh: %s: %d hits in %d lines\n", name, hits + 0, seen + 0 > "/dev/stderr" }
'

export CLAIMS_WORDS="$WORDS"
printf '%s\n' "$diff" | CLAIMS_MODE=diff CLAIMS_NAME="diff $rev" awk "$scan"
for f in "$@"; do CLAIMS_MODE=file CLAIMS_NAME="$f" awk "$scan" "$f"; done
