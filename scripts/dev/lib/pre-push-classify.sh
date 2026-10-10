#!/usr/bin/env bash
# scripts/dev/lib/pre-push-classify.sh — #2592
#
# Pure, dependency-free classification logic for the pre-push E2E gate
# (.githooks/pre-push), split out into its own sourceable library so it can
# be unit-tested directly (scripts/dev/tests/pre-push-classify.test.sh)
# without simulating real git refs or running Playwright/npm.
#
# Responsibilities:
#   1. filter_code_changes / filter_guard_triggers — which changed paths are NOT
#      doc-only (drives whether the static E2E guards run at all).
#   2. classify_e2e_changes — which CODE changes are e2e/ files, so the hook can
#      report them as NOT executed by the hook instead of letting a green banner
#      imply they ran.
#
# Background (#2592): DOC_PATTERN used to classify the entire e2e/ directory as
# "documentation", so a diff touching ONLY e2e specs was judged doc-only and the
# whole gate was skipped. e2e/ is deliberately NOT a doc path (see below).
# #2750 PR-2 retired the `smoke` Playwright project and the basename allowlist
# that mirrored it; the hook runs static guards only, the gate runs the
# canonical suite.
# See scripts/dev/tests/pre-push-classify.test.sh for the regression coverage.

# DOC_PATTERN classifies a changed path as doc-only for the purpose of
# deciding whether to run the e2e gate at all.
#
# e2e/ is DELIBERATELY NOT in this list (#2592 fix (a)): a change confined
# entirely to e2e/**/*.spec.ts or e2e/canonical/**/*.canonical.ts is a change
# to the very thing this gate exists to protect, never documentation.
PRE_PUSH_DOC_PATTERN='^(docs/|README|CLAUDE|\.githooks/|\.claude/|\.github/|scripts/|.*\.md$)'

# filter_code_changes STDIN -> STDOUT
# Reads a newline-separated list of changed paths on stdin, prints only the
# ones NOT matching PRE_PUSH_DOC_PATTERN (i.e. the "code changes" the gate
# should act on).
filter_code_changes() {
  grep -Ev "$PRE_PUSH_DOC_PATTERN" | grep -v '^$' || true
}

# PRE_PUSH_E2E_GUARD_PATTERN: paths that change the E2E estate or the machinery that guards it. They
# sit under scripts/, .github/, .githooks/ (all "doc" by PRE_PUSH_DOC_PATTERN) yet MUST still run the
# static guards (#2750 P1): a push touching only scripts/e2e/**, ci.yml, playwright*.config.ts or
# package.json would otherwise skip the very checks that police them. Markdown stays doc-only.
PRE_PUSH_E2E_GUARD_PATTERN='^(e2e/|e2e-parity/|e2e/canonical/journey-matrix\.json$|scripts/e2e/|scripts/run-e2e-gate\.sh$|scripts/dev/lib/pre-push-classify\.sh$|docs/testing/e2e-retirement-manifest\.csv$|playwright[^/]*\.config\.ts$|\.github/workflows/|\.githooks/|package\.json$)'

# filter_guard_triggers STDIN -> STDOUT
# Reads changed paths on stdin and prints those that require the static E2E guards: every code change
# (filter_code_changes) plus every PRE_PUSH_E2E_GUARD_PATTERN path that is not a .md file, in input
# order, deduplicated. Empty output means a pure doc-only push (the hook then SKIPS).
filter_guard_triggers() {
  local f
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if ! [[ "$f" =~ $PRE_PUSH_DOC_PATTERN ]]; then
      echo "$f"
    elif [[ "$f" =~ $PRE_PUSH_E2E_GUARD_PATTERN && ! "$f" =~ \.md$ ]]; then
      echo "$f"
    fi
  done
  return 0
}

# classify_e2e_changes STDIN -> STDOUT
# Reads CODE changes on stdin and prints every changed path under e2e/ or e2e-parity/ - the files
# the pre-push hook does NOT execute (it runs static guards only; the gate runs the canonical suite).
classify_e2e_changes() {
  grep -E '^(e2e|e2e-parity)/' || true
}
