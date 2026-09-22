#!/usr/bin/env bash
# scripts/dev/tests/pre-push-classify.test.sh — #2592
#
# Minimal, dependency-free bash assertion harness (same style as
# scripts/dev/tests/remote-db-safety.test.sh) covering:
#   - scripts/dev/lib/pre-push-classify.sh (filter_code_changes /
#     classify_e2e_coverage as pure functions)
#   - T-SYNC: SMOKE_SPEC_BASENAMES never silently drifts from
#     playwright.config.ts's live `smoke` project testMatch array
#   - T-INTEG: .githooks/pre-push itself, run end-to-end against a synthetic
#     local git repo with two real commits and a stubbed `npm` on PATH (never
#     a real Playwright/browser run) — proves the negative control from
#     #2592: an e2e-only diff no longer produces the old
#     "Doc-only changes — skipping e2e" vacuous-pass banner.
#
# Run:  bash scripts/dev/tests/pre-push-classify.test.sh
# Exits 0 if all assertions pass, non-zero otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ORIG_PATH="$PATH"

TOTAL=0
FAILED=0

ok() { TOTAL=$((TOTAL + 1)); echo "ok $TOTAL - $1"; }
not_ok() { TOTAL=$((TOTAL + 1)); FAILED=$((FAILED + 1)); echo "not ok $TOTAL - $1"; }
assert_true() { if [[ "$2" -eq 0 ]]; then ok "$1"; else not_ok "$1"; fi; }
assert_false() { if [[ "$2" -ne 0 ]]; then ok "$1"; else not_ok "$1"; fi; }
assert_eq() { if [[ "$2" == "$3" ]]; then ok "$1"; else not_ok "$1 (expected [$3], got [$2])"; fi; }
assert_contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else not_ok "$1 (expected to find [$3])"; fi; }
assert_not_contains() { if [[ "$2" != *"$3"* ]]; then ok "$1"; else not_ok "$1 (unexpectedly found [$3])"; fi; }

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

# ===========================================================================
# T-LIB — filter_code_changes() / classify_e2e_coverage() as pure functions,
# sourced directly (no subprocess, no git repo needed).
# ===========================================================================

# shellcheck source=../lib/pre-push-classify.sh
source "$REPO_ROOT/scripts/dev/lib/pre-push-classify.sh"

# T1: a pure doc-only changeset is filtered down to nothing.
DOC_ONLY=$'docs/foo.md\nREADME.md\n.claude/bar.md\nscripts/dev/tests/baz.test.sh\n.githooks/pre-push'
OUT1="$(printf '%s\n' "$DOC_ONLY" | filter_code_changes)"
assert_eq "T1: a pure doc-only changeset filters to empty" "$OUT1" ""

# T2 (#2592 fix (a), regression for the original defect): an e2e-only spec
# change is CODE, not doc — this is the exact input that used to trigger the
# old "Doc-only changes — skipping e2e" vacuous skip.
OUT2="$(printf '%s\n' "e2e/broker-smoke.spec.ts" | filter_code_changes)"
assert_eq "T2: an e2e/ spec file is classified as a code change, not doc" "$OUT2" "e2e/broker-smoke.spec.ts"

# T3: a mixed doc + e2e changeset keeps only the e2e file.
MIXED=$'README.md\ne2e/discover-1738-regression.spec.ts\ndocs/notes.md'
OUT3="$(printf '%s\n' "$MIXED" | filter_code_changes)"
assert_eq "T3: mixed doc + e2e changeset keeps only the e2e file" "$OUT3" "e2e/discover-1738-regression.spec.ts"

# T4: a genuinely doc-only e2e README edit still filters out (e2e/README.md
# matches the trailing '.*\.md$' arm of PRE_PUSH_DOC_PATTERN — the pattern
# still recognises real docs wherever they live, it just no longer treats
# the whole e2e/ tree as docs).
OUT4="$(printf '%s\n' "e2e/README.md" | filter_code_changes)"
assert_eq "T4: an e2e/README.md edit is still doc-only" "$OUT4" ""

# T5: e2e/broker-smoke.spec.ts (in SMOKE_SPEC_BASENAMES) is covered by the
# smoke run — classify_e2e_coverage reports nothing for it.
OUT5="$(printf '%s\n' "e2e/broker-smoke.spec.ts" | classify_e2e_coverage)"
assert_eq "T5: a smoke-allowlisted spec is reported as covered (no output)" "$OUT5" ""

# T6 (#2592 fix (b)): a spec NOT in the smoke allowlist is reported uncovered.
OUT6="$(printf '%s\n' "e2e/discover-1738-regression.spec.ts" | classify_e2e_coverage)"
assert_eq "T6: a non-smoke spec is reported as uncovered" "$OUT6" "e2e/discover-1738-regression.spec.ts"

# T7: a canonical-harness file is always reported uncovered — it is a
# separate build/config/DB-fixture harness the default smoke run can never
# collect, regardless of any future change to SMOKE_SPEC_BASENAMES.
OUT7="$(printf '%s\n' "e2e/canonical/booking-request.canonical.ts" | classify_e2e_coverage)"
assert_eq "T7: a canonical-harness file is reported as uncovered" "$OUT7" "e2e/canonical/booking-request.canonical.ts"

# T8: a journey-only spec (not in the smoke allowlist) is reported uncovered.
OUT8="$(printf '%s\n' "e2e/journey/booking-journey.spec.ts" | classify_e2e_coverage)"
assert_eq "T8: a journey-project-only spec is reported as uncovered" "$OUT8" "e2e/journey/booking-journey.spec.ts"

# T9: a supporting (non-spec, non-canonical) e2e file is NOT flagged — the
# smoke run exercises it transitively via whichever spec imports it, so
# flagging every helper edit would be a false positive.
OUT9="$(printf '%s\n' "e2e/helpers.ts" | classify_e2e_coverage)"
assert_eq "T9: a supporting e2e helper file is not flagged as uncovered" "$OUT9" ""

# T10: a mixed batch reports exactly the uncovered subset, one per line, in
# input order.
BATCH=$'e2e/broker-smoke.spec.ts\ne2e/discover-1738-regression.spec.ts\ne2e/canonical/booking-request.canonical.ts\ne2e/helpers.ts'
OUT10="$(printf '%s\n' "$BATCH" | classify_e2e_coverage)"
EXPECTED10=$'e2e/discover-1738-regression.spec.ts\ne2e/canonical/booking-request.canonical.ts'
assert_eq "T10: a mixed batch reports exactly the uncovered subset" "$OUT10" "$EXPECTED10"

# ===========================================================================
# T-SYNC — SMOKE_SPEC_BASENAMES must never silently drift from
# playwright.config.ts's live `smoke` project testMatch array. Extracts the
# real array from the config file and compares it, sorted, against the
# library's static copy.
# ===========================================================================

LIVE_SMOKE_BASENAMES="$(
  awk "/name: .smoke.,/{flag=1} flag{print} flag && /\],/{exit}" "$REPO_ROOT/playwright.config.ts" \
    | grep -oE "[a-zA-Z0-9._-]+\.spec\.ts" \
    | sort
)"
LIB_SMOKE_BASENAMES="$(printf '%s\n' "${SMOKE_SPEC_BASENAMES[@]}" | sort)"
assert_eq "T-SYNC: SMOKE_SPEC_BASENAMES matches playwright.config.ts's live smoke testMatch array" \
  "$LIB_SMOKE_BASENAMES" "$LIVE_SMOKE_BASENAMES"

# ===========================================================================
# T-INTEG — .githooks/pre-push run end-to-end against a synthetic local git
# repo (two real commits, no real push/network), with `npm` stubbed on PATH
# so no real Playwright/browser/backend ever starts. Proves the negative
# control: a pure e2e-only diff no longer produces the old vacuous
# "Doc-only changes — skipping e2e" pass.
# ===========================================================================

MOCKBIN="$(mktemp -d)"
CLEANUP_DIRS+=("$MOCKBIN")
NPM_INVOKED_SENTINEL=""

cat > "$MOCKBIN/npm" <<'EOF'
#!/usr/bin/env bash
# Records that the gate actually reached `npm run test:e2e:local` — never
# runs a real Playwright suite. Exit code is controlled by
# NPM_MOCK_EXIT_CODE so tests can exercise both the PASSED and FAILED paths.
: > "${NPM_INVOKED_SENTINEL:?NPM_INVOKED_SENTINEL not set}"
echo "[mock npm] $*"
exit "${NPM_MOCK_EXIT_CODE:-0}"
EOF
chmod +x "$MOCKBIN/npm"

new_hook_sandbox() {
  local sb
  sb="$(mktemp -d)"
  CLEANUP_DIRS+=("$sb")
  git init -q "$sb"
  (
    cd "$sb"
    git config user.email "test@example.com"
    git config user.name "Test"
    git checkout -q -b main
    mkdir -p .githooks scripts/dev/lib e2e docs
    cp "$REPO_ROOT/.githooks/pre-push" .githooks/pre-push
    cp "$REPO_ROOT/scripts/dev/lib/pre-push-classify.sh" scripts/dev/lib/pre-push-classify.sh
    chmod +x .githooks/pre-push
    echo "base" > README.md
    git add -A
    git commit -q -m "base commit"
  )
  echo "$sb"
}

run_hook() {
  # Args: sandbox base_sha head_sha
  local sandbox="$1" base_sha="$2" head_sha="$3"
  (
    cd "$sandbox"
    printf 'refs/heads/main %s refs/heads/main %s\n' "$head_sha" "$base_sha" \
      | env PATH="$MOCKBIN:$ORIG_PATH" \
            NPM_INVOKED_SENTINEL="$NPM_INVOKED_SENTINEL" \
            bash .githooks/pre-push
  )
}

# T11 (negative control, #2592): an e2e-only diff must NOT be classified as
# doc-only — the whole point of this issue.
SB11="$(new_hook_sandbox)"
BASE11="$(cd "$SB11" && git rev-parse HEAD)"
(
  cd "$SB11"
  echo "test('x', () => {})" > e2e/broker-smoke.spec.ts
  git add -A
  git commit -q -m "touch e2e smoke spec only"
)
HEAD11="$(cd "$SB11" && git rev-parse HEAD)"
NPM_INVOKED_SENTINEL="$(mktemp -u)"
LOG11="$(mktemp)"
NPM_MOCK_EXIT_CODE=0 run_hook "$SB11" "$BASE11" "$HEAD11" > "$LOG11" 2>&1
RC11=$?
LOG11_CONTENT="$(cat "$LOG11")"

assert_true "T11: gate exits 0 for a covered e2e-only diff with npm mocked to succeed" "$RC11"
assert_not_contains "T11: gate output does NOT claim doc-only skip for an e2e-only diff" \
  "$LOG11_CONTENT" "Doc-only changes"
if [[ -e "$NPM_INVOKED_SENTINEL" ]]; then
  ok "T11: npm run test:e2e:local IS actually invoked for the e2e-only diff"
else
  not_ok "T11: npm run test:e2e:local IS actually invoked for the e2e-only diff"
fi

# T12: a pure doc-only diff is still explicitly reported SKIPPED, and npm is
# never invoked — the one case where skipping is correct.
SB12="$(new_hook_sandbox)"
BASE12="$(cd "$SB12" && git rev-parse HEAD)"
(
  cd "$SB12"
  echo "more docs" >> docs/notes.md
  git add -A
  git commit -q -m "docs only"
)
HEAD12="$(cd "$SB12" && git rev-parse HEAD)"
NPM_INVOKED_SENTINEL="$(mktemp -u)"
LOG12="$(mktemp)"
NPM_MOCK_EXIT_CODE=0 run_hook "$SB12" "$BASE12" "$HEAD12" > "$LOG12" 2>&1
RC12=$?
LOG12_CONTENT="$(cat "$LOG12")"

assert_true "T12: gate exits 0 for a genuine doc-only diff" "$RC12"
assert_contains "T12: doc-only diff is explicitly reported SKIPPED" "$LOG12_CONTENT" "SKIPPED"
if [[ ! -e "$NPM_INVOKED_SENTINEL" ]]; then
  ok "T12: npm is never invoked for a genuine doc-only diff"
else
  not_ok "T12: npm is never invoked for a genuine doc-only diff"
fi

# T13 (#2592 fix (b)): a diff touching a spec OUTSIDE the smoke allowlist
# (e.g. e2e/canonical/**) still runs the smoke suite (code_changes is
# non-empty) but explicitly reports the uncovered file as SKIPPED —
# distinguishable from the "e2e passed" banner, never silently folded into it.
SB13="$(new_hook_sandbox)"
BASE13="$(cd "$SB13" && git rev-parse HEAD)"
(
  cd "$SB13"
  mkdir -p e2e/canonical
  echo "test('x', () => {})" > e2e/canonical/booking-request.canonical.ts
  git add -A
  git commit -q -m "touch canonical spec only"
)
HEAD13="$(cd "$SB13" && git rev-parse HEAD)"
NPM_INVOKED_SENTINEL="$(mktemp -u)"
LOG13="$(mktemp)"
NPM_MOCK_EXIT_CODE=0 run_hook "$SB13" "$BASE13" "$HEAD13" > "$LOG13" 2>&1
RC13=$?
LOG13_CONTENT="$(cat "$LOG13")"

assert_true "T13: gate exits 0 for a canonical-only diff with npm mocked to succeed" "$RC13"
assert_contains "T13: the uncovered canonical file is explicitly named SKIPPED" \
  "$LOG13_CONTENT" "e2e/canonical/booking-request.canonical.ts"
assert_contains "T13: SKIPPED section is distinguishable from the smoke PASSED banner" \
  "$LOG13_CONTENT" "SKIPPED"
if [[ -e "$NPM_INVOKED_SENTINEL" ]]; then
  ok "T13: the smoke suite still runs (code_changes non-empty) alongside the SKIPPED report"
else
  not_ok "T13: the smoke suite still runs (code_changes non-empty) alongside the SKIPPED report"
fi

# T14: FAILED is distinguishable from both PASSED and SKIPPED — a real e2e
# failure (mocked) propagates as a non-zero exit and no "e2e passed" banner.
SB14="$(new_hook_sandbox)"
BASE14="$(cd "$SB14" && git rev-parse HEAD)"
(
  cd "$SB14"
  echo "test('x', () => {})" > e2e/broker-smoke.spec.ts
  git add -A
  git commit -q -m "touch e2e smoke spec only"
)
HEAD14="$(cd "$SB14" && git rev-parse HEAD)"
NPM_INVOKED_SENTINEL="$(mktemp -u)"
LOG14="$(mktemp)"
NPM_MOCK_EXIT_CODE=1 run_hook "$SB14" "$BASE14" "$HEAD14" > "$LOG14" 2>&1
RC14=$?
LOG14_CONTENT="$(cat "$LOG14")"

assert_false "T14: gate exits non-zero when the e2e run fails" "$RC14"
assert_not_contains "T14: no 'e2e passed' banner on a failed run" "$LOG14_CONTENT" "e2e passed"

# ===========================================================================
# Summary
# ===========================================================================

echo ""
echo "1..$TOTAL"
if [[ $FAILED -eq 0 ]]; then
  echo "# All $TOTAL assertions passed."
  exit 0
else
  echo "# $FAILED of $TOTAL assertions FAILED."
  exit 1
fi
