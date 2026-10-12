#!/usr/bin/env bash
# Tools for .claude/process-log.md (IS #142). Run from anywhere:
#
#   bash scripts/process-log.sh tally <column> [first-row] [last-row]
#   bash scripts/process-log.sh check [first-row]
#
# tally   Counts the values in one column of the ## Log table, optionally for a row
#         range. Columns: 4=Where 5=Artifact 7=Caught-by 8=Escaped 9=Cause 10=Fix.
# check   Flags problems a hand-written row can have, and exits 1 if it finds any:
#         - a row outside the ## Log table (it renders as plain text; row 272);
#         - a malformed row, where a raw | adds a cell (row 296), checked on EVERY row;
#         - an Artifact, Escaped or Cause value the log doesn't list, from first-row on
#           (rows 197-267 hold known Artifact drift, row 297, so use `check 268`).
#         The allowed values are read from the log's own Columns and Cause taxonomy
#         sections, never copied here, so the two can't drift apart. If those lists
#         can't be read cleanly (one empty, or two sharing a value because a section
#         ran on), check stops with exit 2 instead of passing everything.
#
# One copy of the row parsing for both commands: CRs are stripped (a CRLF checkout),
# and escaped pipes (\|) are masked before splitting, because GitHub renders them
# inside a cell but awk splits on them. The bracket form is needed because sed reads
# \| as alternation.
#
# Does not catch: a value that is in the list but wrong for the row (a
# misclassification). No mechanical check can see that.

set -euo pipefail

LOG="${PROCESS_LOG:-$(cd "$(dirname "$0")/.." && pwd)/.claude/process-log.md}"

plain() { tr -d '\r' < "$LOG"; }
masked() { plain | sed 's/[\]|/~/g'; }
rows() { masked | grep -E '^\| [0-9]+ \|' || true; }

# The backticked values of one paragraph, which ends at the first blank or
# whitespace-only line.
paragraph_values() { plain | sed -n "/$1/,/^[[:space:]]*\$/p" | grep -o '`[^`]*`' | tr -d '`' || true; }

tally() {
  local col="${1:?usage: tally <column> [first-row] [last-row]}"
  rows | awk -F'|' -v c="$col" -v lo="${2:-0}" -v hi="${3:-999999}" \
      '$2+0 >= lo && $2+0 <= hi {v = $c; gsub(/^ +| +$|`/, "", v); print v}' \
    | sort | uniq -c | sort -rn
}

check() {
  local art esc cau
  art=$(paragraph_values '^Values: `CLAUDE.md`' | paste -sd' ')
  esc=$(paragraph_values '^\*\*`Escaped`\*\*' | grep -vx 'Escaped' | paste -sd' ')
  cau=$(plain | sed -n '/^### Cause taxonomy/,/^---/p' | grep -oE '^\| `[a-z-]+`' | tr -d '|` ' | paste -sd' ' || true)
  masked | awk -F'|' -v from="${1:-0}" -v art="$art" -v esc="$esc" -v cau="$cau" '
    BEGIN {
      if (art == "" || esc == "" || cau == "") { print "check: could not read the allowed values (a list is empty)"; fatal = 2; exit }
      n = split(art, a, " "); for (i = 1; i <= n; i++) { A[a[i]]; seen[a[i]]++ }
      n = split(esc, e, " "); for (i = 1; i <= n; i++) { E[e[i]]; seen[e[i]]++ }
      n = split(cau, c, " "); for (i = 1; i <= n; i++) { C[c[i]]; seen[c[i]]++ }
      for (v in seen) if (seen[v] > 1) { print "check: \"" v "\" is in two value lists; a section was read past its end"; fatal = 2; exit }
    }
    /^## Log$/ { after_heading = 1; next }
    after_heading && !in_table && /^\| # \|/ { in_table = 1; next }
    in_table && !/^\|/ { in_table = 0; after_heading = 0 }
    /^\| [0-9]+ \|/ {
      r = $2 + 0
      if (!in_table) { print r ": outside the ## Log table"; bad = 1 }
      if (NF != 11) { print r ": malformed row, " NF - 2 " cells instead of 9 (a raw | in a cell?)"; bad = 1; next }
      if (r < from) next
      v = $5; gsub(/^ +| +$|`/, "", v); if (!(v in A)) { print r ": Artifact \"" v "\""; bad = 1 }
      v = $8; gsub(/^ +| +$|`/, "", v); if (!(v in E)) { print r ": Escaped \"" v "\""; bad = 1 }
      v = $9; gsub(/^ +| +$|`/, "", v); if (!(v in C)) { print r ": Cause \"" v "\""; bad = 1 }
    }
    # awk runs END even after `exit` in BEGIN, so END must keep the fatal status.
    END { exit fatal ? fatal : (bad ? 1 : 0) }'
}

case "${1:-}" in
  tally) shift; tally "$@" ;;
  check) shift; check "$@" ;;
  *) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2 ;;
esac
