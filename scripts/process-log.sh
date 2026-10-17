#!/usr/bin/env bash
# Tools for .claude/process-log.md (IS #142). Run from anywhere:
#
#   bash scripts/process-log.sh tally <column> [first-row] [last-row]
#   bash scripts/process-log.sh check
#
# tally   Counts the values in one column of the ## Log table, optionally for a row
#         range. Columns: 4=Where 5=Artifact 7=Caught-by 8=Escaped 9=Cause 10=Fix.
#         From row 315, a Caught by cell counts as its leading group.
# check   Checks every row of the log and exits 1 if it finds a problem:
#         - a numbered row outside the ## Log table (it renders as plain text; row 272);
#         - a line inside the table that isn't a well-formed numbered row (e.g. `|303 |`,
#           or the # cell missing), which tally would silently skip;
#         - a row number that isn't the previous one plus 1 (a duplicate, e.g. two
#           branches both adding the next row; out of order; or a gap);
#         - a malformed row, where a raw | adds a cell (row 296);
#         - an Artifact, Escaped or Cause value the log doesn't list. Rows 197-267's
#           Artifact values are exempt: known drift, recorded and not re-classified
#           (row 297). Every other cell is checked, on every row;
#         - from row 315 (IS #150), a Caught by cell that doesn't start with a listed
#           backticked group. Earlier rows are free text, kept as written.
#         The allowed values are read from the log's own Columns and Cause taxonomy
#         sections (the first match of each), never copied here. If the log can't be
#         read, or a list comes back empty, or two lists share a value (a section read
#         past its end), check stops with exit 2 instead of passing everything.
#
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
# The first row whose Caught by starts with a group (IS #150). The log's Columns
# section names the same row; earlier rows are free text and stay as written.
CAUGHT_FROM=315
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

tally() {
  local col="${1:?usage: tally <column> [first-row] [last-row]}"
  rows | awk -F'|' -v c="$col" -v lo="${2:-0}" -v hi="${3:-999999}" -v from="$CAUGHT_FROM" \
      '$2+0 >= lo && $2+0 <= hi {v = $c; sub(/^ +/, "", v)
        if (c == 7 && $2+0 >= from && match(v, /^`[^`]+`/)) v = substr(v, 2, RLENGTH - 2)
        gsub(/^ +| +$|`/, "", v); print v}' \
    | sort | uniq -c | sort -rn
}

check() {
  local art esc cau grp
  art=$(paragraph_values 'Values: `CLAUDE.md`' | words)
  esc=$( { paragraph_values '**`Escaped`**' | grep -vx 'Escaped' || true; } | words)
  cau=$(cause_values | words)
  grp=$(paragraph_values 'Groups: `' | words)
  masked | awk -F'|' -v art="$art" -v esc="$esc" -v cau="$cau" -v grp="$grp" \
      -v drift_lo=197 -v drift_hi=267 -v caught_from="$CAUGHT_FROM" '
    BEGIN {
      if (art == "" || esc == "" || cau == "" || grp == "") { print "check: could not read the allowed values (a list is empty)"; fatal = 2; exit }
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
      if (r >= caught_from) {
        v = $7; sub(/^ +/, "", v)
        if (!match(v, /^`[^`]+`/)) { print r ": Caught by has no leading group"; bad = 1 }
        else if (!(substr(v, 2, RLENGTH - 2) in G)) { print r ": Caught by group \"" substr(v, 2, RLENGTH - 2) "\""; bad = 1 }
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
