# Sourced by claims.sh and sweep.sh (IS #200), so both read `git diff <rev>` the same
# way: one copy of the flags, the call and the untracked warning.

# The flags undo config that would change the text read: diff.noprefix and
# diff.mnemonicPrefix (explicit prefixes), diff.interHunkContext (context lines inside
# a hunk), and a textconv driver (converted text instead of the file's lines).
DIFF_FLAGS="-U0 --inter-hunk-context=0 --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/"

# git_diff <script> <root> <rev> <out> <err>: writes the diff to <out>,
# `package-lock.json` left out. git's stderr (e.g. autocrlf warnings) goes to <err>,
# a file the caller's trap removes, kept out of the diff text and shown only when the
# diff fails: a bad rev must not look like an empty, clean diff (exit 2).
git_diff() {
  [ $# -eq 5 ] && [ -n "$5" ] || { echo "git_diff: needs <script> <root> <rev> <out> <err>" >&2; exit 2; }
  # shellcheck disable=SC2086
  if ! git -C "$2" -c core.quotePath=false diff $DIFF_FLAGS "$3" \
      -- ':(top,exclude)package-lock.json' >"$4" 2>"$5"; then
    echo "$1: git diff $3 failed: $(cat "$5")" >&2
    exit 2
  fi
}

# warn_untracked <script> <root> <rev> <what>: when <rev> is compared with the working
# tree (not a range), names the untracked files the script can't read.
warn_untracked() {
  local untracked
  case "$3" in *..*) return ;; esac
  untracked=$(git -C "$2" ls-files --others --exclude-standard)
  [ -z "$untracked" ] || printf '%s: %s, untracked (commit or `git add -N` them):\n%s\n' "$1" "$4" "$untracked" >&2
}
