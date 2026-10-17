#!/usr/bin/env bash
# Tools for .claude/process-log.md (IS #142). Run from anywhere:
#
#   bash scripts/process-log.sh tally <column> [first-row] [last-row]
#   bash scripts/process-log.sh check
#
# tally   Counts the values in one column of the ## Log table, optionally for a row
#         range. Columns: 4=Where 5=Artifact 7=Caught-by 8=Escaped 9=Cause 10=Fix.
#         From the row on the Columns line "Grouped from row: N", a Caught by cell
#         counts as its leading group; tally 7 stops (exit 2) without a usable line.
# check   Checks every row of the log and exits 1 if it finds a problem:
#         - a numbered row outside the ## Log table (it renders as plain text; row 272);
#         - a line inside the table that isn't a well-formed numbered row (e.g. `|303 |`,
#           or the # cell missing), which tally would silently skip;
#         - a row number that isn't the previous one plus 1 (a duplicate, e.g. two
#           branches both adding the next row; out of order; or a gap);
#         - a malformed row, where a raw | adds a cell (row 296);
#         - an Artifact, Escaped or Cause value the log doesn't list. Rows 197-267's
#           Artifact values are exempt: known drift, recorded and not re-classified
#           (row 297). Every other Artifact value, and every Escaped and Cause value,
#           is checked on every row;
#         - from the row the Columns section names (IS #150), a Caught by cell that
#           doesn't start with a listed backticked group, and a listed group on the
#           row just before it (the boundary set too high). Earlier rows are free
#           text, kept as written.
#         The allowed values, and that row number, are read from the log's own Columns
#         and Cause taxonomy sections (the first match of each), never copied here. The
#         groups and the row number come from their own anchored lines inside Columns
#         ("Groups:", "Grouped from row:"), so a re-wrapped paragraph, the definitions
#         under them or a quote elsewhere in the log can't change them. If the log
#         can't be read, a list comes back empty, the row number is missing or past
#         the highest row + 1, or two lists share a value (a section read past its end),
#         check stops with exit 2 instead of passing everything.
#
# The Caught by group is extracted in one place (GROUP_FN), used by both commands.
# One copy of the row parsing for both commands: CRs are stripped (a CRLF checkout),
# and escaped pipes (\|) are masked before splitting, because GitHub renders them
# inside a cell but awk splits on them. The bracket form is needed because sed reads
# \| as alternation.
#
# Does not catch: a value that is in its list but wrong for the row (a
# misclassification), and anything outside the table rows (prose, detail entries).
# No mechanical check can see the first.

set -euo pipefail

LOG="${PROCESS_LOG:-$(cd "$(dirname "$0")/.." && pwd)/.claude/process-log.md}"
[ -r "$LOG" ] || { echo "process-log.sh: cannot read $LOG" >&2; exit 2; }

plain() { tr -d '\r' < "$LOG"; }
masked() { plain | sed 's/[\]|/~/g'; }
rows() { masked | grep -E '^\| [0-9]+ \|' || true; }

# The backticked values of the FIRST paragraph whose line starts with $1 (a literal
# prefix, not a regex). The paragraph ends at the first blank or whitespace-only line.
paragraph_values() {
  plain | awk -v s="$1" 'on && /^[[:space:]]*$/ { exit } !on && index($0, s) == 1 { on = 1 } on' \
    | grep -o '`[^`]*`' | tr -d '`' || true
}
# The first-column values of the FIRST "### Cause taxonomy" table.
cause_values() {
  plain | awk 'on && /^---/ { exit } !on && /^### Cause taxonomy/ { on = 1 } on' \
    | grep -oE '^\| `[a-z-]+`' | tr -d '|` ' || true
}
words() { paste -sd' ' - || true; }
# The ### Columns section, up to the Cause taxonomy.
columns() { plain | awk '/^### Cause taxonomy/ { exit } /^### Columns/ { on = 1 } on'; }
# The backticked values on the Columns line that starts with "Groups: `" (that line only).
group_values() { columns | grep -m1 '^Groups: `' | grep -o '`[^`]*`' | tr -d '`' || true; }
# The first row whose Caught by starts with a group: the Columns line "Grouped from
# row: N". Empty unless N is a number from 1 to the highest row number + 1, so a typo
# past the end can't switch the group check off. (check also catches a boundary one
# off either way: the row before it must have no group, the row at it must have one.)
caught_from() {
  local n max
  n=$(columns | sed -n 's/^Grouped from row: \([0-9][0-9]*\)$/\1/p' | head -n 1)
  max=$(rows | awk -F'|' '$2 + 0 > m { m = $2 + 0 } END { print m + 0 }')
  [ -n "$n" ] && [ "$n" -ge 1 ] && [ "$n" -le $((max + 1)) ] && echo "$n" || true
}
# A Caught by cell's leading backticked group, or "" if it has none.
GROUP_FN='function group(v) { sub(/^[ \t]+/, "", v); return match(v, /^`[^`]+`/) ? substr(v, 2, RLENGTH - 2) : "" }'

tally_usage() { echo "tally: $1 (usage: tally <column 2-10> [first-row] [last-row])" >&2; exit 2; }
tally() {
  local col="${1:-}" from=""
  case "$col" in ''|*[!0-9]*) tally_usage "<column> must be a number, not \"$col\"" ;; esac
  col=$((10#$col))
  [ "$col" -ge 2 ] && [ "$col" -le 10 ] || tally_usage "<column> $col is not a table column"
  for b in "${2:-0}" "${3:-0}"; do
    case "$b" in ''|*[!0-9]*) tally_usage "row bounds must be numbers, not \"$b\"" ;; esac
  done
  if [ "$col" -eq 7 ]; then
    from=$(caught_from)
    [ -n "$from" ] || { echo 'tally: no usable "Grouped from row: N" line in the log'"'"'s Columns section' >&2; exit 2; }
  fi
  # from is set only for column 7, so it is the one test for grouping.
  rows | awk -F'|' -v c="$col" -v lo="${2:-0}" -v hi="${3:-999999}" -v from="$from" "$GROUP_FN"'
      $2+0 >= lo && $2+0 <= hi {v = $c
        if (from != "" && $2+0 >= from + 0) { g = group(v); if (g != "") v = g }
        gsub(/^ +| +$|`/, "", v); print v}' \
    | sort | uniq -c | sort -rn
}

check() {
  local art esc cau grp from
  art=$(paragraph_values 'Values: `CLAUDE.md`' | words)
  esc=$( { paragraph_values '**`Escaped`**' | grep -vx 'Escaped' || true; } | words)
  cau=$(cause_values | words)
  grp=$(group_values | words)
  from=$(caught_from)
  masked | awk -F'|' -v art="$art" -v esc="$esc" -v cau="$cau" -v grp="$grp" \
      -v drift_lo=197 -v drift_hi=267 -v caught_from="$from" "$GROUP_FN"'
    BEGIN {
      if (art == "" || esc == "" || cau == "" || grp == "" || caught_from == "") { print "check: could not read the allowed values (a list is empty, or the \"Grouped from row:\" line is missing or past the highest row + 1)"; fatal = 2; exit }
      n = split(art, a, " "); for (i = 1; i <= n; i++) { A[a[i]]; seen[a[i]]++ }
      n = split(esc, e, " "); for (i = 1; i <= n; i++) { E[e[i]]; seen[e[i]]++ }
      n = split(cau, c, " "); for (i = 1; i <= n; i++) { C[c[i]]; seen[c[i]]++ }
      n = split(grp, g, " "); for (i = 1; i <= n; i++) { G[g[i]]; seen[g[i]]++ }
      for (v in seen) if (seen[v] > 1) { print "check: \"" v "\" is in two value lists; a section was read past its end"; fatal = 2; exit }
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
      v = $5; gsub(/^ +| +$|`/, "", v); if (!(v in A) && !(r >= drift_lo && r <= drift_hi)) { print r ": Artifact \"" v "\""; bad = 1 }
      v = $8; gsub(/^ +| +$|`/, "", v); if (!(v in E)) { print r ": Escaped \"" v "\""; bad = 1 }
      v = $9; gsub(/^ +| +$|`/, "", v); if (!(v in C)) { print r ": Cause \"" v "\""; bad = 1 }
      if (r >= caught_from + 0) {
        v = group($7)
        if (v == "") { print r ": Caught by has no leading group"; bad = 1 }
        else if (!(v in G)) { print r ": Caught by group \"" v "\""; bad = 1 }
      } else if (r == caught_from - 1 && (group($7) in G)) {
        # A boundary set too high would exempt grouped rows without a word.
        print r ": Caught by has a group, but \"Grouped from row:\" says " caught_from; bad = 1
      }
    }
    # awk runs END even after `exit` in BEGIN, so END must keep the fatal status.
    END { exit fatal ? fatal : (bad ? 1 : 0) }'
}

case "${1:-}" in
  tally) shift; tally "$@" ;;
  check) shift; check "$@" ;;
  *) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
esac
