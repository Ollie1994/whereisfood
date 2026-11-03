#!/usr/bin/env bash
# Lists the sweep's candidates before a review round (IS #200). Run from anywhere in
# the repo:
#
#   bash scripts/sweep.sh <rev> [--no-issues] [file]...
#
# <rev>        as claims.sh takes it: a commit (compared with the working tree) or a
#              range `A..B` (compared at B; `A..` is `A..HEAD`).
# --no-issues  don't read the open issue bodies (a replay of an old range, or no
#              network). Without it, a failed `gh issue list` exits 2.
# file         more text to search, e.g. the PR body or its draft.
#
# For each line `git diff <rev>` removes or adds, it looks for runs of RUN words (below)
# that the line shares with a place. The places are the tracked text files (at the
# working tree, or at B for a range; `package-lock.json` left out), the open issue
# bodies, and each file. It prints three lists (CLAUDE.md, "Review rounds", the sweep):
#   removed, still elsewhere  a removed line, and each place still holding a run of its
#                             words: a stale-copy candidate (step 2);
#   removed, nowhere else     a removed line no place holds a run of: a dropped
#                             sentence, for the author to settle;
#   added, also elsewhere     an added line, and each other place holding a run of its
#                             words: a restatement candidate (step 3 makes a restated
#                             rule a pointer). Another line this diff adds counts too.
# A removed line whose runs sit only on lines this diff adds was edited, rewrapped or
# moved: it is counted on stderr, not listed. So is a line shorter than RUN words.
# Each place is `path:line` (where the run starts), `issue #N:line` or `file:line`.
#
# Words are compared lower-cased, with everything but ASCII letters, digits, `#` and
# non-ASCII bytes treated as a space, so markdown, backticks and table pipes don't
# count, and a run continues across line breaks inside a place (a rewrapped copy
# matches). A diff line's runs lie within that line.
#
# Lists, doesn't judge: the author settles each hit in the round's sweep record.
#
# Does not catch: a copy reworded so that no run of RUN words matches; a code
# pattern's other uses (sweep step 1 lists those by hand); a copy in a closed issue or
# PR, or in history (which stays as written); the PR body unless it is passed as a
# file; untracked files (it warns about them when <rev> is compared with the working
# tree); and whether a hit is stale.
#
# Replayed on six copies the sweep missed (rows 375, 386, 391, 400, 410, 412; IS #200's
# PR records each range): it lists row 400's (plan lines restating a rewritten
# comment) and row 386's comment, not its call (a code pattern); not 375's (a version
# number in other words), 391's (a rewording), or 410's and 412's (a comment that
# contradicts the change rather than repeating it). RUN 6 keeps both hits; 8 loses
# 386's.
#
# Exit codes: 0 when the run worked, hits or not; 2 for no or an empty <rev>, `-h`,
# a bad <rev>, an unreadable file, a failed `gh issue list` without --no-issues, or no
# git repository.

set -euo pipefail

# RUN: how many words in a row make a match. SWEEP_RUN overrides it, for replays.
RUN="${SWEEP_RUN:-6}"

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
[ $# -ge 1 ] || usage
case "$1" in -h|--help) usage ;; esac

rev="$1"; shift
[ -n "$rev" ] || { echo "sweep.sh: empty <rev> (did a git merge-base fail?)" >&2; exit 2; }
case "$RUN" in ''|*[!0-9]*|0) echo "sweep.sh: SWEEP_RUN must be a positive integer" >&2; exit 2 ;; esac

issues=1
files=()
for a in "$@"; do
  if [ "$a" = "--no-issues" ]; then issues=0; continue; fi
  [ -f "$a" ] && [ -r "$a" ] || { echo "sweep.sh: cannot read $a" >&2; exit 2; }
  files+=("$a")
done
root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "sweep.sh: not in a git repository" >&2; exit 2; }

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# The diff, read as claims.sh reads it (its comment says why each flag is there).
FLAGS="-U0 --inter-hunk-context=0 --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/"
# shellcheck disable=SC2086
if ! git -C "$root" -c core.quotePath=false diff $FLAGS "$rev" \
    -- ':(top,exclude)package-lock.json' >"$tmp/diff" 2>"$tmp/err"; then
  echo "sweep.sh: git diff $rev failed: $(cat "$tmp/err")" >&2
  exit 2
fi

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
  *) untracked=$(git -C "$root" ls-files --others --exclude-standard)
     [ -z "$untracked" ] || printf 'sweep.sh: not searched, untracked (commit or `git add -N` them):\n%s\n' "$untracked" >&2 ;;
esac

# Places, one record per line: `place<TAB>line<TAB>text`. `git grep -e ''` prints
# every line of every tracked text file (-I skips binaries) as `path:line:text`, after
# `<end>:` when it reads a commit. No tracked path holds a `:` (checked below).
if git -C "$root" ls-files | grep -q ':'; then
  echo "sweep.sh: a tracked path holds ':', which the place records can't split" >&2; exit 2
fi
{
  if [ -n "$end" ]; then
    git -C "$root" grep -I -n -e '' "$end" -- ':(top,exclude)package-lock.json' | cut -c$((${#end} + 2))-
  else
    git -C "$root" grep -I -n -e '' -- ':(top,exclude)package-lock.json'
  fi
} | awk '{ i = index($0, ":"); j = index(substr($0, i + 1), ":"); print substr($0, 1, i - 1) "\t" substr($0, i + 1, j - 1) "\t" substr($0, i + j + 1) }' >"$tmp/places"

nissues=0
if [ "$issues" = 1 ]; then
  if ! gh issue list --state open --limit 500 --json number,body \
      --jq '.[] | "\u0001\(.number)", .body' >"$tmp/issues" 2>"$tmp/err"; then
    echo "sweep.sh: gh issue list failed (use --no-issues to skip): $(cat "$tmp/err")" >&2
    exit 2
  fi
  awk '/^\001/ { place = "issue #" substr($0, 2); n = 0; issues++; next }
       { n++; print place "\t" n "\t" $0 }
       END { print issues + 0 > "/dev/stderr" }' "$tmp/issues" >>"$tmp/places" 2>"$tmp/nissues"
  nissues=$(cat "$tmp/nissues")
fi
for f in ${files[@]+"${files[@]}"}; do
  awk -v OFS='\t' '{ print FILENAME, FNR, $0 }' "$f" >>"$tmp/places"
done

# The diff's lines, one record each: `R<TAB>path<TAB>line<TAB>text` for a removed
# line (its old path and line), `A<TAB>…` for an added one.
awk '
  { sub(/\r$/, "") }
  /^diff --git / { header = 1; next }
  header && /^--- / { old = substr($0, 5); sub(/^a\//, "", old); sub(/\t$/, "", old); next }
  header && /^\+\+\+ / { new = substr($0, 5); sub(/^b\//, "", new); sub(/\t$/, "", new)
                         if (new == "/dev/null") new = old; if (old == "/dev/null") old = new; next }
  /^@@ / { header = 0; split($2, o, ","); oline = substr(o[1], 2) + 0
           split($3, h, ","); nline = substr(h[1], 2) + 0; next }
  !header && /^-/ { print "R\t" old "\t" oline "\t" substr($0, 2); oline++; next }
  !header && /^\+/ { print "A\t" new "\t" nline "\t" substr($0, 2); nline++; next }
' "$tmp/diff" >"$tmp/lines"

# shellcheck disable=SC2016
LC_ALL=C SWEEP_RUN="$RUN" SWEEP_REV="$rev" SWEEP_ISSUES="$nissues" SWEEP_FILES="${#files[@]}" awk -F'\t' '
  function words(s, w) {
    s = tolower(s); gsub(/\r/, "", s)
    gsub(/[^a-z0-9#\200-\377]+/, " ", s)
    return split(s, w, " ")
  }
  BEGIN { RUN = ENVIRON["SWEEP_RUN"] + 0 }
  # The diff: every run of RUN words in a line is a key to look for. (Not `FNR == NR`,
  # which an empty diff file would make true for the places.)
  FILENAME == ARGV[1] {
    r++; kind[r] = $1; path[r] = $2; line[r] = $3
    text[r] = substr($0, length($1) + length($2) + length($3) + 4)
    if ($1 == "A") added[$2 SUBSEP $3]
    m = words(text[r], w); nk[r] = (m >= RUN) ? m - RUN + 1 : 0
    for (i = 1; i <= nk[r]; i++) {
      k = w[i]; for (j = 1; j < RUN; j++) k = k " " w[i + j]
      key[r, i] = k; want[k]
    }
    next
  }
  # The places: a window of the last RUN words, across lines, reset per place.
  $1 != cur { cur = $1; c = 0; nplaces++; if ($1 !~ /^issue #/) nfiles++ }
  {
    m = words(substr($0, length($1) + length($2) + 3), w)
    for (i = 1; i <= m; i++) {
      c++; bw[c % RUN] = w[i]; bl[c % RUN] = $2
      if (c < RUN) continue
      k = bw[(c - RUN + 1) % RUN]; for (j = 2; j <= RUN; j++) k = k " " bw[(c - RUN + j) % RUN]
      if (!(k in want)) continue
      loc = cur SUBSEP bl[(c - RUN + 1) % RUN] SUBSEP $2
      if ((k, loc) in got) continue
      got[k, loc]; hits[k] = hits[k] "\036" loc
    }
  }
  function onadded(p, a, b,    n) { for (n = a; n <= b; n++) if ((p, n) in added) return 1; return 0 }
  function show(n, rest) { return n > 8 ? rest " (+" n - 8 " more)" : rest }
  END {
    for (x = 1; x <= r; x++) {
      if (nk[x] == 0) { short[kind[x]]++; continue }
      delete L; nl = 0; out = ""; outside = 0
      for (i = 1; i <= nk[x]; i++) {
        n = split(hits[key[x, i]], h, "\036")
        for (j = 2; j <= n; j++) {
          split(h[j], p, SUBSEP)
          if (kind[x] == "A" && p[1] == path[x] && p[2] + 0 <= line[x] + 0 && p[3] + 0 >= line[x] + 0) continue
          if (h[j] in L) continue
          L[h[j]]; nl++
          if (kind[x] == "R" && onadded(p[1], p[2] + 0, p[3] + 0)) continue
          outside++
          if (outside <= 8) out = out (outside > 1 ? ", " : "") p[1] ":" p[2]
        }
      }
      t = text[x]; sub(/^[ \t]+/, "", t)
      entry = path[x] ":" line[x] ": " t
      if (kind[x] == "R") {
        removed++
        if (nl == 0) { nowhere = nowhere entry "\n"; nnow++ }
        else if (outside == 0) moved++
        else { still = still entry "\n    -> " show(outside, out) "\n"; nstill++ }
      } else {
        addedn++
        if (outside > 0) { also = also entry "\n    -> " show(outside, out) "\n"; nalso++ }
      }
    }
    printf "== removed, still elsewhere (%d)\n%s", nstill, still
    printf "== removed, nowhere else (%d)\n%s", nnow, nowhere
    printf "== added, also elsewhere (%d)\n%s", nalso, also
    printf "sweep.sh: diff %s, runs of %d words: %d removed (%d still elsewhere, %d nowhere else, %d edited or moved, %d shorter), %d added (%d also elsewhere, %d shorter); searched %d tracked files, %d issues, %d files\n", \
      ENVIRON["SWEEP_REV"], RUN, removed + short["R"], nstill + 0, nnow + 0, moved + 0, short["R"] + 0, \
      addedn + short["A"], nalso + 0, short["A"] + 0, nfiles - ENVIRON["SWEEP_FILES"], ENVIRON["SWEEP_ISSUES"], ENVIRON["SWEEP_FILES"] > "/dev/stderr"
  }
' "$tmp/lines" "$tmp/places"
