#!/usr/bin/env bash
# Tools for .claude/process-log.md (IS #142, #150, #155). Run from anywhere:
#
#   bash scripts/process-log.sh add <file>
#   bash scripts/process-log.sh tally <column> [first-row] [last-row]
#   bash scripts/process-log.sh check
#
# add     Adds one row from <file>, one `Field: value` line per field (blank lines are
#         skipped): Date (optional, today if left out), Where, Artifact, Miss, Caught by,
#         Escaped, Cause, Fix. Artifact, Escaped and Cause may be bare or backticked;
#         a Caught by that doesn't start with a backtick gets its first word backticked
#         as the group. Raw pipes are escaped. The row takes the next number and goes
#         directly after the table's last row, with the file's line endings. It is
#         written only if `check` passes on the result, so a bad value, an over-cap
#         cell, a missing, unknown, repeated or multi-line field all leave the log
#         unchanged (exit 1). add refuses to run on a log that already fails check.
# tally   Counts the values in one column of the ## Log table, optionally for a row
#         range. Columns: 4=Where 5=Artifact 7=Caught-by 8=Escaped 9=Cause 10=Fix.
#         From the values block's caught-by-from-row, a Caught by cell counts as its
#         leading group; tally 7 needs a usable values block (exit 2 without one).
# check   Checks every row of the log and exits 1 if it finds a problem:
#         - a numbered row outside the ## Log table (it renders as plain text; row 272);
#         - a line inside the table that isn't a well-formed numbered row (e.g. `|303 |`,
#           or the # cell missing), which tally would silently skip;
#         - a row number that isn't the previous one plus 1 (a duplicate, e.g. two
#           branches both adding the next row; out of order; or a gap);
#         - a malformed row, where a raw | adds a cell (row 296);
#         - an Artifact, Escaped or Cause value the block doesn't list. The block's
#           artifact-drift-rows are exempt from the Artifact list (row 297);
#         - from caught-by-from-row (IS #150), a Caught by cell that doesn't start with
#           a listed backticked group, and a listed group on the row just before it
#           (the boundary set too high);
#         - from cap-from-row (IS #155), a Miss over cap-miss or a Fix over cap-fix
#           characters (escaped pipes count as one);
#         - a Cause in the taxonomy table that the block's cause line lacks, or the
#           reverse.
#         Every value comes from the log's values block (the first ```values fence in
#         its Columns section), never copied here. A missing block, a missing or empty
#         key, a row number that isn't a number from 1 to the highest row + 1, an
#         unreadable Cause table, or two lists sharing a value: check stops with exit 2
#         instead of passing everything.
#
# One copy of the row parsing for all three commands: CRs are stripped (a CRLF
# checkout), and escaped pipes (\|) are masked before splitting, because GitHub renders
# them inside a cell but awk splits on them. The bracket form is needed because sed
# reads \| as alternation. The Caught by group is extracted in one place (GROUP_FN),
# and characters are counted in one place (CHARS_FN).
#
# Does not catch: a value that is in its list but wrong for the row (a
# misclassification), a Miss that is short but vague, and anything outside the table
# rows (prose). No mechanical check can see the first two.

set -euo pipefail
# awk counts bytes in the C locale and characters in a UTF-8 one, so the cap would
# depend on the machine. Fix the locale, and count characters in CHARS_FN instead.
export LC_ALL=C

LOG="${PROCESS_LOG:-$(cd "$(dirname "$0")/.." && pwd)/.claude/process-log.md}"
[ -r "$LOG" ] || { echo "process-log.sh: cannot read $LOG" >&2; exit 2; }

die2() { echo "process-log.sh: $1" >&2; exit 2; }
plain() { tr -d '\r' < "$LOG"; }
masked() { plain | sed 's/[\]|/~/g'; }
rows() { masked | grep -E '^\| [0-9]+ \|' || true; }
max_row() { rows | awk -F'|' '$2 + 0 > m { m = $2 + 0 } END { print m + 0 }'; }
words() { paste -sd' ' - || true; }

# The lines of the first ```values fence inside ### Columns. (`|| true`: awk's early
# exit makes tr's write fail with SIGPIPE, which pipefail would report.)
values() {
  plain | awk '/^### Cause taxonomy/ { exit } /^### Columns/ { cols = 1 }
    cols && !on && /^```values[ \t]*$/ { on = 1; next } on && /^```[ \t]*$/ { exit } on' || true
}
# One key's value from the block (the first line for it), or "".
value() { values | awk -v k="$1:" 'index($0, k) == 1 { v = substr($0, length(k) + 1); gsub(/^[ \t]+|[ \t]+$/, "", v); print v; exit }' || true; }
# The first-column values of the FIRST "### Cause taxonomy" table.
cause_values() {
  plain | awk 'on && /^---/ { exit } !on && /^### Cause taxonomy/ { on = 1 } on' \
    | grep -oE '^\| `[a-z-]+`' | tr -d '|` ' || true
}

# Reads every key of the values block into the variables below, or stops with exit 2.
# Must run in the main shell (not inside $(...)), so die2 ends the script.
load_values() {
  ART=$(value artifact); ESC=$(value escaped); CAU=$(value cause); GRP=$(value caught-by)
  FROM=$(value caught-by-from-row); DRIFT=$(value artifact-drift-rows)
  CAP_FROM=$(value cap-from-row); CAP_MISS=$(value cap-miss); CAP_FIX=$(value cap-fix)
  [ -n "$(values)" ] || die2 "no \`\`\`values block in the log's Columns section"
  local k v max
  for k in artifact:ART escaped:ESC cause:CAU caught-by:GRP caught-by-from-row:FROM \
      artifact-drift-rows:DRIFT cap-from-row:CAP_FROM cap-miss:CAP_MISS cap-fix:CAP_FIX; do
    v="${k#*:}"; [ -n "${!v}" ] || die2 "the values block has no usable \"${k%%:*}:\" line"
  done
  max=$(max_row)
  for k in caught-by-from-row:FROM cap-from-row:CAP_FROM; do
    v="${k#*:}"; v="${!v}"
    case "$v" in *[!0-9]*) die2 "\"${k%%:*}: $v\" is not a row number" ;; esac
    [ "$v" -ge 1 ] && [ "$v" -le $((max + 1)) ] || die2 "\"${k%%:*}: $v\" is past the highest row + 1 ($((max + 1)))"
  done
  case "$CAP_MISS$CAP_FIX" in *[!0-9]*) die2 "cap-miss and cap-fix must be numbers" ;; esac
  case "$DRIFT" in [0-9]*-[0-9]*) ;; *) die2 "\"artifact-drift-rows: $DRIFT\" is not a range like 197-267" ;; esac
}

# A Caught by cell's leading backticked group, or "" if it has none.
GROUP_FN='function group(v) { sub(/^[ \t]+/, "", v); return match(v, /^`[^`]+`/) ? substr(v, 2, RLENGTH - 2) : "" }'
# Characters in a UTF-8 string, counted as bytes that don't continue a character.
CHARS_FN='function chars(s) { gsub(/[\200-\277]/, "", s); return length(s) }'

tally_usage() { echo "tally: $1 (usage: tally <column 2-10> [first-row] [last-row])" >&2; exit 2; }
tally() {
  local col="${1:-}" from=""
  case "$col" in ''|*[!0-9]*) tally_usage "<column> must be a number, not \"$col\"" ;; esac
  col=$((10#$col))
  [ "$col" -ge 2 ] && [ "$col" -le 10 ] || tally_usage "<column> $col is not a table column"
  for b in "${2:-0}" "${3:-0}"; do
    case "$b" in ''|*[!0-9]*) tally_usage "row bounds must be numbers, not \"$b\"" ;; esac
  done
  if [ "$col" -eq 7 ]; then load_values; from="$FROM"; fi
  # from is set only for column 7, so it is the one test for grouping.
  rows | awk -F'|' -v c="$col" -v lo="${2:-0}" -v hi="${3:-999999}" -v from="$from" "$GROUP_FN"'
      $2+0 >= lo && $2+0 <= hi {v = $c
        if (from != "" && $2+0 >= from + 0) { g = group(v); if (g != "") v = g }
        gsub(/^ +| +$|`/, "", v); print v}' \
    | sort | uniq -c | sort -rn
}

check() {
  load_values
  local tab
  tab=$(cause_values | words)
  [ -n "$tab" ] || die2 "could not read the Cause taxonomy table"
  masked | awk -F'|' -v art="$ART" -v esc="$ESC" -v cau="$CAU" -v grp="$GRP" -v tab="$tab" \
      -v drift_lo="${DRIFT%-*}" -v drift_hi="${DRIFT#*-}" -v caught_from="$FROM" \
      -v cap_from="$CAP_FROM" -v cap_miss="$CAP_MISS" -v cap_fix="$CAP_FIX" "$GROUP_FN $CHARS_FN"'
    function cell(v) { gsub(/^ +| +$/, "", v); return v }
    BEGIN {
      n = split(art, a, " "); for (i = 1; i <= n; i++) { A[a[i]]; seen[a[i]]++ }
      n = split(esc, e, " "); for (i = 1; i <= n; i++) { E[e[i]]; seen[e[i]]++ }
      n = split(cau, c, " "); for (i = 1; i <= n; i++) { C[c[i]]; seen[c[i]]++ }
      n = split(grp, g, " "); for (i = 1; i <= n; i++) { G[g[i]]; seen[g[i]]++ }
      for (v in seen) if (seen[v] > 1) { print "check: \"" v "\" is in two value lists"; fatal = 2; exit }
      n = split(tab, t, " "); for (i = 1; i <= n; i++) T[t[i]]
      for (v in C) if (!(v in T)) { print "check: cause \"" v "\" is on the values block'"'"'s cause line but not in the Cause taxonomy table"; bad = 1 }
      for (v in T) if (!(v in C)) { print "check: cause \"" v "\" is in the Cause taxonomy table but not on the values block'"'"'s cause line"; bad = 1 }
    }
    /^## Log$/ { after_heading = 1; next }
    after_heading && !in_table && /^\| # \|/ { in_table = 1; next }
    in_table && !/^\|/ { in_table = 0; after_heading = 0 }
    in_table && /^\|[-:| ]+$/ { next }
    in_table && !/^\| [0-9]+ \|/ { print "line " NR ": a table line that is not a numbered row"; bad = 1; next }
    /^\| [0-9]+ \|/ {
      r = $2 + 0
      if (!in_table) { print r ": outside the ## Log table"; bad = 1 }
      else { if (prev && r != prev + 1) { print r ": follows row " prev " (expected " prev + 1 ")"; bad = 1 } prev = r }
      if (NF != 11) { print r ": malformed row, " NF - 2 " cells instead of 9 (a raw | in a cell?)"; bad = 1; next }
      v = $5; gsub(/^ +| +$|`/, "", v); if (!(v in A) && !(r >= drift_lo + 0 && r <= drift_hi + 0)) { print r ": Artifact \"" v "\""; bad = 1 }
      v = $8; gsub(/^ +| +$|`/, "", v); if (!(v in E)) { print r ": Escaped \"" v "\""; bad = 1 }
      v = $9; gsub(/^ +| +$|`/, "", v); if (!(v in C)) { print r ": Cause \"" v "\""; bad = 1 }
      if (r >= caught_from + 0) {
        v = group($7)
        if (v == "") { print r ": Caught by has no leading group"; bad = 1 }
        else if (!(v in G)) { print r ": Caught by group \"" v "\""; bad = 1 }
      } else if (r == caught_from - 1 && (group($7) in G)) {
        # A boundary set too high would exempt grouped rows without a word.
        print r ": Caught by has a group, but caught-by-from-row says " caught_from; bad = 1
      }
      if (r >= cap_from + 0) {
        m = chars(cell($6)); if (m > cap_miss + 0) { print r ": Miss is " m " characters, over cap-miss (" cap_miss ")"; bad = 1 }
        m = chars(cell($10)); if (m > cap_fix + 0) { print r ": Fix is " m " characters, over cap-fix (" cap_fix ")"; bad = 1 }
      }
    }
    # awk runs END even after `exit` in BEGIN, so END must keep the fatal status.
    END { exit fatal ? fatal : (bad ? 1 : 0) }'
}

# Prints the row built from the field file $1 with number $2, or reports and exits 1.
build_row() {
  awk -v n="$2" -v today="$(date +%Y-%m-%d)" '
    function err(m) { print "add: " m > "/dev/stderr"; bad = 1 }
    function esc(v) { gsub(/\\\|/, "\001", v); gsub(/\|/, "\\|", v); gsub(/\001/, "\\|", v); return v }
    function tick(v) { gsub(/`/, "", v); return "`" v "`" }
    BEGIN { split("Date|Where|Artifact|Miss|Caught by|Escaped|Cause|Fix", names, "|"); for (i in names) K[names[i]] }
    { sub(/\r$/, "") }
    /^[ \t]*$/ { next }
    match($0, /^[A-Za-z][A-Za-z ]*:/) {
      k = substr($0, 1, RLENGTH - 1); v = substr($0, RLENGTH + 1); gsub(/^[ \t]+|[ \t]+$/, "", v)
      if (!(k in K)) { err("line " NR ": unknown field \"" k "\""); next }
      if (k in F) { err("line " NR ": \"" k "\" given twice"); next }
      if (v == "") { err("line " NR ": \"" k "\" is empty"); next }
      F[k] = v; next
    }
    { err("line " NR " is not a \"Field: value\" line (a field spread over several lines?)") }
    END {
      for (i = 2; i <= 8; i++) if (!(names[i] in F)) err("missing field \"" names[i] "\"")
      d = ("Date" in F) ? F["Date"] : today
      if (d !~ /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/) err("Date \"" d "\" is not YYYY-MM-DD")
      if (bad) exit 1
      c = F["Caught by"]
      if (c !~ /^`/ && match(c, /^[a-z-]+/)) c = "`" substr(c, 1, RLENGTH) "`" substr(c, RLENGTH + 1)
      printf "| %s | %s | %s | %s | %s | %s | %s | %s | %s |\n", n, d, esc(F["Where"]), tick(F["Artifact"]),
        esc(F["Miss"]), esc(c), tick(F["Escaped"]), tick(F["Cause"]), esc(F["Fix"])
    }' "$1"
}

add() {
  local file="${1:-}" out rc=0 n row line cr=""
  [ -n "$file" ] && [ -f "$file" ] && [ -r "$file" ] || die2 "add: cannot read the row file \"$file\" (usage: add <file>)"
  out=$(check 2>&1) || rc=$?
  [ "$rc" -eq 0 ] || { printf '%s\n' "$out" >&2; echo "add: the log already fails check (exit $rc); fix that first" >&2; exit "$rc"; }
  n=$(( $(max_row) + 1 ))
  row=$(build_row "$file" "$n") || exit 1
  line=$(plain | awk -v m="$((n - 1))" 'index($0, "| " m " |") == 1 { l = NR } END { print l + 0 }')
  [ "$line" -gt 0 ] || die2 "add: could not find row $((n - 1)) in the log"
  # Not grep: Git Bash's grep drops each \r too, so it would never find one.
  if ! tr -d '\r' < "$LOG" | cmp -s - "$LOG"; then cr=$'\r'; fi
  # TMP is global so the EXIT trap can still see it. head and tail copy bytes as they
  # are; awk would not here (Git Bash's gawk reads in text mode and drops each \r).
  TMP=$(mktemp); trap 'rm -f "${TMP:-}"' EXIT
  { head -n "$line" "$LOG"; printf '%s%s\n' "$row" "$cr"; tail -n +"$((line + 1))" "$LOG"; } > "$TMP"
  rc=0; out=$(PROCESS_LOG="$TMP" bash "$0" check 2>&1) || rc=$?
  [ "$rc" -eq 0 ] || { printf '%s\n' "$out" >&2; echo "add: row $n not added; the log is unchanged" >&2; exit "$rc"; }
  cat "$TMP" > "$LOG"
  echo "add: row $n added"
}

case "${1:-}" in
  add) shift; add "$@" ;;
  tally) shift; tally "$@" ;;
  check) shift; check "$@" ;;
  *) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
esac
