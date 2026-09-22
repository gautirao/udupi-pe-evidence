#!/usr/bin/env bash
# scripts/dev/lib/pre-push-classify.sh — #2592
#
# Pure, dependency-free classification logic for the pre-push E2E gate
# (.githooks/pre-push), split out into its own sourceable library so it can
# be unit-tested directly (scripts/dev/tests/pre-push-classify.test.sh)
# without simulating real git refs or running Playwright/npm.
#
# Two responsibilities:
#   1. filter_code_changes   — which changed paths are NOT doc-only (drives
#      whether the gate runs at all).
#   2. classify_e2e_coverage — of the CODE changes that are e2e/ files, which
#      ones the gate's default `smoke` project run will NOT actually collect,
#      so the hook can report them as an explicit SKIPPED line instead of
#      letting a green "e2e passed" banner imply full coverage.
#
# Background (#2592): the pre-push gate had two compounding defects:
#   (a) DOC_PATTERN classified the entire e2e/ directory as "documentation",
#       so a diff touching ONLY e2e specs was judged doc-only and the whole
#       gate was skipped — zero tests ran, with output that reads as if the
#       gate ran and found nothing to do.
#   (b) Even when the gate does run, it only ever invokes
#       `npm run test:e2e:local` with no --project flag, which
#       scripts/run-e2e-local.sh defaults to `--project=smoke` — a curated
#       ~7-spec allowlist out of 100+ specs under e2e/. A changed spec not on
#       that allowlist (a brand-new spec, a `journey`/`integration-ui`-only
#       spec, or anything under e2e/canonical/, which is an entirely separate
#       harness with its own build + config + DB fixture — see
#       playwright.canonical.config.ts) is silently never executed by the
#       gate, and the run still prints "e2e passed".
# See scripts/dev/tests/pre-push-classify.test.sh for the regression
# coverage, including a T-SYNC assertion that keeps SMOKE_SPEC_BASENAMES
# below from silently drifting out of sync with playwright.config.ts.

# DOC_PATTERN classifies a changed path as doc-only for the purpose of
# deciding whether to run the e2e gate at all.
#
# e2e/ is DELIBERATELY NOT in this list (#2592 fix (a)): a change confined
# entirely to e2e/**/*.spec.ts or e2e/canonical/**/*.canonical.ts is a change
# to the very thing this gate exists to protect, never documentation.
PRE_PUSH_DOC_PATTERN='^(docs/|README|CLAUDE|\.githooks/|\.claude/|\.github/|scripts/|.*\.md$)'

# Static allowlist of the *.spec.ts basenames the `smoke` Playwright project
# (playwright.config.ts, project name "smoke") actually collects via its own
# explicit testMatch array. Duplicated here — rather than queried live via
# `npx playwright test --project=smoke --list` at push time — to keep the
# git hook dependency-free and fast; scripts/dev/tests/pre-push-classify.test.sh
# T-SYNC parses playwright.config.ts's live testMatch array and fails the
# build the moment the two lists drift, so this duplication cannot go stale
# unnoticed.
SMOKE_SPEC_BASENAMES=(
  "quick-smoke.spec.ts"
  "broker-smoke.spec.ts"
  "broker-listing-quality.spec.ts"
  "broker-dashboard-v2.spec.ts"
  "admin-smoke.spec.ts"
  "discover-real-data-smoke.spec.ts"
  "discover-schools-canonical-2124.spec.ts"
)

# filter_code_changes STDIN -> STDOUT
# Reads a newline-separated list of changed paths on stdin, prints only the
# ones NOT matching PRE_PUSH_DOC_PATTERN (i.e. the "code changes" the gate
# should act on).
filter_code_changes() {
  grep -Ev "$PRE_PUSH_DOC_PATTERN" | grep -v '^$' || true
}

_is_smoke_spec_basename() {
  local base="$1" candidate
  for candidate in "${SMOKE_SPEC_BASENAMES[@]}"; do
    [[ "$base" == "$candidate" ]] && return 0
  done
  return 1
}

# classify_e2e_coverage STDIN -> STDOUT
# Reads a newline-separated list of CODE changes (already doc-filtered) on
# stdin, prints one line per changed e2e file the gate's default `smoke`
# project run will NOT collect:
#   - any e2e/canonical/**/*.canonical.ts file (a separate harness — its own
#     build, config, and Postgres/PostGIS fixture — never invoked by this
#     gate; run manually via `npm run test:e2e:canonical`)
#   - any e2e/**/*.spec.ts file whose basename is not in
#     SMOKE_SPEC_BASENAMES (e.g. a brand-new spec, or one that only belongs
#     to the `journey` / `integration-ui` / `full`-only projects)
#
# Supporting files that are neither *.spec.ts nor *.canonical.ts (helpers,
# global-setup, fixtures) are deliberately left unflagged here: the smoke
# run already exercises them transitively through whichever covered spec
# imports them, so flagging every helper edit would be a false positive,
# not a real gap.
classify_e2e_coverage() {
  local f base
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    case "$f" in
      e2e/canonical/*.canonical.ts)
        echo "$f"
        ;;
      e2e/*.spec.ts)
        base="$(basename "$f")"
        if ! _is_smoke_spec_basename "$base"; then
          echo "$f"
        fi
        ;;
    esac
  done
}
