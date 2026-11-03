#!/usr/bin/env bash
# Lists the sweep's candidates before a review round (IS #200). Run from anywhere in
# the repo:
#
#   bash scripts/sweep.sh <rev> [--no-issues | --skip-issue <n>]... [file]...
#
# <rev>             as claims.sh takes it: a commit (compared with the working tree)
#                   or a range `A..B` (compared at B; `A..` is `A..HEAD`).
# --no-issues       don't read the open issue bodies (a replay of an old range, or no
#                   network). Without it, a failed `gh issue list` exits 2.
# --skip-issue <n>  leave issue #n out, e.g. the one the PR closes: its body is the
#                   change's spec and restates it.
# file              more text to search, e.g. the PR body or its draft.
#
# For each line `git diff <rev>` removes or adds, it looks for runs of RUN words (below)
# that the line shares with a place. The places are the tracked text files (at the
# working tree, or at B for a range; `package-lock.json` left out), the open issue
# bodies, and each file. It prints four lists (CLAUDE.md, "Review rounds", the sweep):
#   removed, still elsewhere  a removed line, and each place still holding a run of its
#                             words: a stale-copy candidate (step 2); and "moved to",
#                             the other files' added lines that hold one, if any;
#   removed, moved elsewhere  a removed line whose runs sit only on lines this diff
#                             adds in another file: a rule moved to a new owner;
#   removed, nowhere else     a removed line no place holds a run of: a dropped
#                             sentence, for the author to settle;
#   added, also elsewhere     an added line, and each other place holding a run of its
#                             words: a restatement candidate (step 3 makes a restated
#                             rule a pointer). Another line this diff adds counts too.
# A removed line whose runs sit only on lines this diff adds in its own file was
# edited, rewrapped or moved within it: it is counted on stderr, not listed. So is a
# line shorter than RUN words.
# Each place is `path:line` (where the run starts), `issue #N:line` or `file:line`.
#
# Words are compared lower-cased, with everything but ASCII letters, digits, `#` and
# non-ASCII bytes treated as a space, and a `#` standing alone (a comment or heading
# marker) dropped, so markdown, backticks, table pipes and comment markers don't
# count, and a run continues across line breaks inside a place (a rewrapped copy
# matches). A diff line's runs lie within that line.
#
# Lists, doesn't judge: the author settles each hit in the round's sweep record.
#
# Does not catch: a copy reworded so that no run of RUN words matches; a code
# pattern's other uses (sweep step 1 lists those by hand); a copy in a closed issue or
# PR, or in history (which stays as written); the PR body unless it is passed as a
# file; untracked files (it warns about them when <rev> is compared with the working
# tree); a file whose path holds a newline, a tab or `\001` (the place records split
# there, so its lines get wrong places), or another character `git diff` quotes (`"`,
# `\`, a control character: its diff path then differs from its place); and whether a
# hit is stale.
#
# Replayed on six copies the sweep missed (rows 375, 386, 391, 400, 410, 412; IS #200's
# PR records each range): it lists row 400's (plan lines restating a rewritten
# comment) and row 386's comment, not its call (a code pattern); not 375's (a version
# number in other words), 391's (a rewording), or 410's and 412's (a comment that
# contradicts the change rather than repeating it). RUN 6 keeps both hits; 8 loses
# 386's.
#
# Exit codes: 0 when the run worked, hits or not; 2 for no or an empty <rev>, `-h`,
# a bad <rev> or range end, an unreadable file, a `--skip-issue` without a number, a
# bad SWEEP_RUN or SWEEP_ISSUE_LIMIT, a failed `gh issue list` without --no-issues,
# more open issues than ISSUE_LIMIT (the read would be cut), or no git repository.

set -euo pipefail

# RUN: how many words in a row make a match. SWEEP_RUN overrides it, for replays.
RUN="${SWEEP_RUN:-6}"
# ISSUE_LIMIT: the most open issues read. One more is asked for, and getting it exits 2
# rather than search a cut list (CLAUDE.md's `max_rows` rule, for issues).
# SWEEP_ISSUE_LIMIT overrides it.
ISSUE_LIMIT="${SWEEP_ISSUE_LIMIT:-500}"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ $# -ge 1 ] || usage
case "$1" in -h|--help) usage ;; esac

rev="$1"; shift
[ -n "$rev" ] || { echo "sweep.sh: empty <rev> (did a git merge-base fail?)" >&2; exit 2; }
# No leading zero: `$((…))` reads `010` as octal, and `08` fails in it (probed).
positive() {
  case "$2" in ''|*[!0-9]*|0*) echo "sweep.sh: $1 must be a positive integer, not '$2'" >&2; exit 2 ;; esac
}
positive SWEEP_RUN "$RUN"
positive SWEEP_ISSUE_LIMIT "$ISSUE_LIMIT"

issues=1
skip=" "
files=()
while [ $# -gt 0 ]; do
  case "$1" in
    --no-issues) issues=0 ;;
    --skip-issue)
      case "${2:-}" in ''|*[!0-9]*|0*) echo "sweep.sh: --skip-issue needs an issue number, not '${2:-}'" >&2; exit 2 ;; esac
      skip="$skip$2 "; shift ;;
    *) [ -f "$1" ] && [ -r "$1" ] || { echo "sweep.sh: cannot read $1" >&2; exit 2; }
       files+=("$1") ;;
  esac
  shift
done
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "sweep.sh: not in a git repository" >&2; exit 2; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# The diff, read as claims.sh reads it: scripts/lib/diff.sh holds the flags and why.
# shellcheck source=lib/diff.sh
. "$(dirname "$0")/lib/diff.sh"
git_diff sweep.sh "$root" "$rev" "$tmp/diff" "$tmp/err"

# Where the places are read: the working tree, or the end of a range.
end=""
case "$rev" in
  *...*) end="${rev#*...}" ;;
  *..*)  end="${rev#*..}" ;;
esac
case "$rev" in
  *..*) [ -n "$end" ] || end=HEAD
        git -C "$root" rev-parse --verify --quiet "$end^{commit}" >/dev/null \
          || { echo "sweep.sh: bad range end $end" >&2; exit 2; } ;;
esac
warn_untracked sweep.sh "$root" "$rev" "not searched"

# Places, one record per line: `kind<TAB>place<TAB>line<TAB>text`, kind T (tracked
# file), I (issue) or F (file argument). `git grep -z -n -e ''` prints every line of
# every tracked text file (-I skips binaries) as `path<NUL>line<NUL>text`, with the
# path raw (`å.md`, where the default quotes it as `"\303\245.md"`), after `<end>:`
# when it reads a commit. `--no-column` and `--no-color` undo config that would add to
# it: `git -c grep.column=true grep -n` printed `path:line:col:text`, the column in
# the text (all probed in IS #200's PR, rounds 1-2). The NULs become `\001` before any
# awk reads them, since an awk other than gawk ends a string at a NUL; the one awk then
# strips `<end>:` (by bytes, in LC_ALL=C) and splits.
GREP="grep --no-color --no-column -z -I -n -e"
if [ -n "$end" ]; then
  # shellcheck disable=SC2086
  git -C "$root" $GREP '' "$end" -- ':(top,exclude)package-lock.json'
else
  # shellcheck disable=SC2086
  git -C "$root" $GREP '' -- ':(top,exclude)package-lock.json'
fi | tr '\000' '\001' \
  | SWEEP_PREFIX="${end:+$end:}" LC_ALL=C awk '
      { s = substr($0, length(ENVIRON["SWEEP_PREFIX"]) + 1)
        i = index(s, "\001"); j = index(substr(s, i + 1), "\001")
        print "T\t" substr(s, 1, i - 1) "\t" substr(s, i + 1, j - 1) "\t" substr(s, i + j + 1) }' >"$tmp/places"

nissues=0
if [ "$issues" = 1 ]; then
  if ! gh issue list --state open --limit "$((ISSUE_LIMIT + 1))" --json number,body \
      --jq '.[] | "\u0001\(.number)", .body' >"$tmp/issues" 2>"$tmp/err"; then
    echo "sweep.sh: gh issue list failed (use --no-issues to skip): $(cat "$tmp/err")" >&2
    exit 2
  fi
  SWEEP_SKIP="$skip" awk '
    /^\001/ { n = 0; read++; num = substr($0, 2); keep = (index(ENVIRON["SWEEP_SKIP"], " " num " ") == 0)
              if (keep) issues++; next }
    keep { n++; print "I\tissue #" num "\t" n "\t" $0 }
    END { print read + 0, issues + 0 > "/dev/stderr" }' "$tmp/issues" >>"$tmp/places" 2>"$tmp/nissues"
  read -r nread nissues <"$tmp/nissues"
  [ "$nread" -le "$ISSUE_LIMIT" ] || { echo "sweep.sh: more than $ISSUE_LIMIT open issues: the read would be cut (raise SWEEP_ISSUE_LIMIT)" >&2; exit 2; }
fi
# Through stdin, as claims.sh reads a file: awk reads an operand shaped like
# `name=value` as an assignment.
for f in ${files[@]+"${files[@]}"}; do
  SWEEP_NAME="$f" awk '{ print "F\t" ENVIRON["SWEEP_NAME"] "\t" NR "\t" $0 }' <"$f" >>"$tmp/places"
done

# The diff's lines, one record each: `R<TAB>path<TAB>line<TAB>text` for a removed
# line (its old path and line), `A<TAB>…` for an added one, and `N<TAB>old<TAB>new`
# for a renamed file, so a removed line's own file is known by its new name too.
awk '
  { sub(/\r$/, "") }
  /^diff --git / { header = 1; next }
  header && /^--- / { old = substr($0, 5); sub(/^a\//, "", old); sub(/\t$/, "", old); next }
  header && /^\+\+\+ / { new = substr($0, 5); sub(/^b\//, "", new); sub(/\t$/, "", new)
                         if (new == "/dev/null") new = old; if (old == "/dev/null") old = new
                         if (old != new) print "N\t" old "\t" new; next }
  /^@@ / { header = 0; split($2, o, ","); oline = substr(o[1], 2) + 0
           split($3, h, ","); nline = substr(h[1], 2) + 0; next }
  !header && /^-/ { print "R\t" old "\t" oline "\t" substr($0, 2); oline++; next }
  !header && /^\+/ { print "A\t" new "\t" nline "\t" substr($0, 2); nline++; next }
' "$tmp/diff" >"$tmp/lines"

# shellcheck disable=SC2016
LC_ALL=C SWEEP_RUN="$RUN" SWEEP_REV="$rev" SWEEP_ISSUES="$nissues" SWEEP_FILES="${#files[@]}" awk -F'\t' '
  function words(s, w,    t, n, i, m) {
    s = tolower(s); gsub(/\r/, "", s)
    gsub(/[^a-z0-9#\200-\377]+/, " ", s)
    n = split(s, t, " "); m = 0
    for (i = 1; i <= n; i++) if (t[i] !~ /^#+$/) w[++m] = t[i]
    return m
  }
  BEGIN { RUN = ENVIRON["SWEEP_RUN"] + 0 }
  # The diff: every run of RUN words in a line is a key to look for. (Not `FNR == NR`,
  # which an empty diff file would make true for the places.)
  FILENAME == ARGV[1] && $1 == "N" { renamed[$2] = $3; next }
  FILENAME == ARGV[1] {
    r++; kind[r] = $1; path[r] = $2; line[r] = $3
    text[r] = substr($0, length($1) + length($2) + length($3) + 4)
    if ($1 == "A") added[$2 SUBSEP $3]
    delete w; m = words(text[r], w); nk[r] = (m >= RUN) ? m - RUN + 1 : 0
    for (i = 1; i <= nk[r]; i++) {
      k = w[i]; for (j = 1; j < RUN; j++) k = k " " w[i + j]
      key[r, i] = k; want[k]
    }
    next
  }
  # The places: a window of the last RUN words, across lines, reset when the kind or
  # the place changes (a file argument named like a tracked file is a new place).
  ($1 SUBSEP $2) != cur { cur = $1 SUBSEP $2; c = 0; if ($1 == "T") ntracked++ }
  {
    delete w; m = words(substr($0, length($1) + length($2) + length($3) + 4), w)
    for (i = 1; i <= m; i++) {
      c++; bw[c % RUN] = w[i]; bl[c % RUN] = $3
      if (c < RUN) continue
      k = bw[(c - RUN + 1) % RUN]; for (j = 2; j <= RUN; j++) k = k " " bw[(c - RUN + j) % RUN]
      if (!(k in want)) continue
      loc = $1 SUBSEP $2 SUBSEP bl[(c - RUN + 1) % RUN] SUBSEP $3
      if ((k, loc) in got) continue
      got[k, loc]; hits[k] = hits[k] "\036" loc
    }
  }
  function onadded(p, a, b,    n) { for (n = a; n <= b; n++) if ((p, n) in added) return 1; return 0 }
  function show(n, rest) { return n > 8 ? rest " (+" n - 8 " more)" : rest }
  END {
    for (x = 1; x <= r; x++) {
      if (nk[x] == 0) { short[kind[x]]++; continue }
      delete L; delete M; ondiff = 0; out = ""; outside = 0; mout = ""; nm = 0
      own = (path[x] in renamed) ? renamed[path[x]] : path[x]
      for (i = 1; i <= nk[x]; i++) {
        n = split(hits[key[x, i]], h, "\036")
        for (j = 2; j <= n; j++) {
          split(h[j], p, SUBSEP)
          # p: kind, place, the run'"'"'s first line, its last line.
          if (kind[x] == "A" && p[1] == "T" && p[2] == path[x] && p[3] + 0 <= line[x] + 0 && p[4] + 0 >= line[x] + 0) continue
          # A run of a removed line that touches a line this diff adds: the line was
          # edited or moved. Judged per run, before the dedup: another run from the same
          # first line may lie outside the diff (IS #200, its PR, round 2).
          # In its own file (by its new name, if renamed) that is an edit; in another
          # file, a move, which is listed.
          if (kind[x] == "R" && p[1] == "T" && onadded(p[2], p[3] + 0, p[4] + 0)) {
            if (p[2] == own) { ondiff = 1; continue }
            if (!((p[2], p[3]) in M)) {
              M[p[2], p[3]]; nm++
              if (nm <= 8) mout = mout (nm > 1 ? ", " : "") p[2] ":" p[3]
            }
            continue
          }
          # One entry per place and first line: that is what is printed.
          shown = p[1] SUBSEP p[2] SUBSEP p[3]
          if (shown in L) continue
          L[shown]; outside++
          if (outside <= 8) out = out (outside > 1 ? ", " : "") p[2] ":" p[3]
        }
      }
      t = text[x]; sub(/^[ \t]+/, "", t)
      entry = path[x] ":" line[x] ": " t
      if (kind[x] == "R") {
        removed++
        # An edit in its own file outranks a move: a new line in another file that
        # repeats it shows up under "also elsewhere" instead.
        if (outside > 0) {
          still = still entry "\n    -> " show(outside, out) "\n"
          if (nm > 0) still = still "    moved to -> " show(nm, mout) "\n"
          nstill++
        }
        else if (ondiff) moved++
        else if (nm > 0) { away = away entry "\n    -> " show(nm, mout) "\n"; naway++ }
        else { nowhere = nowhere entry "\n"; nnow++ }
      } else {
        addedn++
        if (outside > 0) { also = also entry "\n    -> " show(outside, out) "\n"; nalso++ }
      }
    }
    printf "== removed, still elsewhere (%d)\n%s", nstill, still
    printf "== removed, moved elsewhere (%d)\n%s", naway, away
    printf "== removed, nowhere else (%d)\n%s", nnow, nowhere
    printf "== added, also elsewhere (%d)\n%s", nalso, also
    printf "sweep.sh: diff %s, runs of %d words: %d removed (%d still elsewhere, %d moved elsewhere, %d nowhere else, %d edited in place, %d shorter), %d added (%d also elsewhere, %d shorter); searched %d tracked files, %d issues, %d files\n", \
      ENVIRON["SWEEP_REV"], RUN, removed + short["R"], nstill + 0, naway + 0, nnow + 0, moved + 0, short["R"] + 0, \
      addedn + short["A"], nalso + 0, short["A"] + 0, ntracked + 0, ENVIRON["SWEEP_ISSUES"], ENVIRON["SWEEP_FILES"] > "/dev/stderr"
  }
' "$tmp/lines" "$tmp/places"
