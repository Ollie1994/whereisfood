# Sourced by pre-commit and commit-msg (IS #292): their Gitleaks call and checks, kept
# once. Not a hook: githooks(5) lists the names git runs, and this isn't one. "Before Git
# invokes a hook, it changes its working directory to … the root of the working tree"
# (githooks(5)), so the paths below are relative to it.

# Runs gitleaks with its arguments and the hooks' flags; its exit status is gitleaks'.
# --config .gitleaks.toml: Gitleaks reads GITLEAKS_CONFIG and GITLEAKS_CONFIG_TOML before
# the repo's file (`gitleaks git --help`, 8.30.1); with GITLEAKS_CONFIG_TOML set to an
# allow-all config and no --config, a staged flagged value passed (exit 0).
# --ignore-gitleaks-allow: without it, an inline `gitleaks:allow` comment let a staged
# flagged value through (exit 0); with it, the hook refused it.
# --redact: on a refused commit, the output printed REDACTED and held no copy of the value.
run_gitleaks() {
  gitleaks "$@" --config .gitleaks.toml --redact --no-banner --verbose --ignore-gitleaks-allow
}

# $1: the caller's name (a hook, or ci.yml's secret-scan), for the messages. Exits 1 when
# gitleaks isn't on the PATH, or when a root `.gitleaksignore` exists: Gitleaks reads one even
# untracked, and `-i` pointed at an empty folder or a missing file didn't stop it (a
# fingerprint there let a staged flagged value through, exit 0). `CLAUDE.md`
# ("Secrets") bans the file.
gitleaks_preflight() {
  if ! command -v gitleaks >/dev/null 2>&1; then
    echo "$1: gitleaks not found on PATH; install it (README, \"Getting started\")," >&2
    echo "or, if this shell started before the install, open a new one. Refused." >&2
    exit 1
  fi
  if [ -e .gitleaksignore ]; then
    echo "$1: .gitleaksignore exists; CLAUDE.md (\"Secrets\") bans it. An exception is a" >&2
    echo ".gitleaks.toml allowlist entry naming why. Refused." >&2
    exit 1
  fi
}
