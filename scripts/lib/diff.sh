# Sourced by claims.sh and sweep.sh (IS #200), so both read `git diff <rev>` the same
# way: one copy of the flags, the call and the untracked warning.

# The flags undo config that would change the text read: diff.noprefix and
# diff.mnemonicPrefix (explicit prefixes), diff.interHunkContext (context lines inside
# a hunk), and a textconv driver (converted text instead of the file's lines).
# `-c diff.renames=true` (in git_diff) undoes diff.renames: `copies` made a copied
# file's source read as removed, `false` a rename as a whole delete and add (probed
# in IS #200's PR, round 5).
DIFF_FLAGS="-U0 --inter-hunk-context=0 --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/"

# git_diff <script> <root> <rev> <out> <err>: writes the diff to <out>,
# `package-lock.json` left out. git's stderr (e.g. autocrlf warnings) goes to <err>,
# a file the caller's trap removes, kept out of the diff text and shown only when the
# diff fails: a bad rev must not look like an empty, clean diff (exit 2).
git_diff() {
  [ $# -eq 5 ] && [ -n "$1" ] && [ -n "$2" ] && [ -n "$3" ] && [ -n "$4" ] && [ -n "$5" ] \
    || { echo "git_diff: needs <script> <root> <rev> <out> <err>, none empty" >&2; exit 2; }
  # shellcheck disable=SC2086
  if ! git -C "$2" -c core.quotePath=false -c diff.renames=true diff $DIFF_FLAGS "$3" \
      -- ':(top,exclude)package-lock.json' >"$4" 2>"$5"; then
    echo "$1: git diff $3 failed: $(cat "$5")" >&2
    exit 2
  fi
}

# rev_end <root> <rev>: prints the commit whose side `git diff <rev>` reads as new, or
# nothing when that side is the working tree. `A..B` and `A...B` end at B (`A..` at
# HEAD); a form `git rev-parse` expands to one commit and an exclusion (`C^!`, `C^-`)
# ends at that commit (probed: both print `C ^C~1`, as `C~1..C` does).
rev_end() {
  local lines pos
  case "$2" in
    *...*) pos="${2#*...}"; echo "${pos:-HEAD}"; return ;;
    *..*)  pos="${2#*..}";  echo "${pos:-HEAD}"; return ;;
  esac
  lines=$(git -C "$1" rev-parse "$2" 2>/dev/null) || return 0
  case "$lines" in *^*) ;; *) return 0 ;; esac
  pos=$(printf '%s\n' "$lines" | grep -v '^\^' || true)
  [ -n "$pos" ] && [ "$(printf '%s\n' "$pos" | wc -l)" -eq 1 ] && echo "$pos"
  return 0
}

# warn_untracked <script> <root> <end> <what> [file]...: when <end> is empty (the
# working tree), names the untracked files the script can't read, less the files
# named after <what> (read as arguments).
warn_untracked() {
  local untracked f prefix
  [ -z "$3" ] || return 0
  untracked=$(git -C "$2" ls-files --others --exclude-standard)
  for f in "${@:5}"; do
    prefix=$(git -C "$(dirname "$f")" rev-parse --show-prefix 2>/dev/null) || continue
    untracked=$(printf '%s\n' "$untracked" | grep -vxF -- "$prefix$(basename "$f")" || true)
  done
  [ -z "$untracked" ] || printf '%s: %s, untracked (commit or `git add -N` them):\n%s\n' "$1" "$4" "$untracked" >&2
}
