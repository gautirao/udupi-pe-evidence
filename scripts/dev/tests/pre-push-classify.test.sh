#!/usr/bin/env bash
# scripts/dev/tests/pre-push-classify.test.sh — #2592
#
# Minimal, dependency-free bash assertion harness (same style as
# scripts/dev/tests/remote-db-safety.test.sh) covering:
#   - scripts/dev/lib/pre-push-classify.sh (filter_code_changes /
#     filter_guard_triggers / classify_e2e_changes as pure functions)
#   - T-NOSMOKE: playwright.config.ts declares no `smoke` project (retired, #2750 PR-2)
#   - T-INTEG: .githooks/pre-push itself (#2750 contract: static guards only,
#     never claims e2e passed, PREPUSH_E2E=gate opt-in), run end-to-end against
#     a synthetic local git repo with stubbed `node` and `npm` on PATH (never a
#     real guard/Playwright/browser run).
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
# T-LIB — filter_code_changes() / classify_e2e_changes() as pure functions,
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
OUT2="$(printf '%s\n' "e2e/example-feature.spec.ts" | filter_code_changes)"
assert_eq "T2: an e2e/ spec file is classified as a code change, not doc" "$OUT2" "e2e/example-feature.spec.ts"

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

# T5-T10 (smoke-allowlist coverage classifier) were removed with the retired `smoke` project (#2750 PR-2);
# T-NOSMOKE below asserts the project and its library mirror stay gone.

# T10b (#2750): classify_e2e_changes lists every changed e2e/ and e2e-parity/ path, in order, and nothing else.
BATCH2=$'e2e/canonical/x.canonical.ts\nscripts/run-e2e-gate.sh\ne2e-parity/p.spec.ts\ne2e/helpers.ts\napps/web/src/a.ts'
OUT10B="$(printf '%s\n' "$BATCH2" | classify_e2e_changes)"
EXPECTED10B=$'e2e/canonical/x.canonical.ts\ne2e-parity/p.spec.ts\ne2e/helpers.ts'
assert_eq "T10b: classify_e2e_changes lists exactly the e2e/ + e2e-parity/ paths" "$OUT10B" "$EXPECTED10B"
assert_eq "T10c: classify_e2e_changes prints nothing when no e2e path changed" \
  "$(printf '%s\n' "apps/web/src/a.ts" | classify_e2e_changes)" ""

# T10d (#2750 P1): filter_guard_triggers must select every E2E-estate/machinery path even though
# scripts/, .github/, .githooks/ are "doc" for filter_code_changes.
for trig in \
  scripts/e2e/check-e2e-estate.mjs scripts/e2e/gen-e2e-inventory.py \
  .github/workflows/ci.yml .githooks/pre-push \
  playwright.config.ts playwright.canonical.config.ts playwright.parity.config.ts \
  docs/testing/e2e-retirement-manifest.csv scripts/run-e2e-gate.sh scripts/dev/lib/pre-push-classify.sh \
  e2e/canonical/journey-matrix.json \
  package.json e2e/canonical/x.canonical.ts e2e-parity/p.spec.ts e2e/helpers.ts apps/web/src/a.ts; do
  assert_eq "T10d: guards are triggered by $trig" "$(printf '%s\n' "$trig" | filter_guard_triggers)" "$trig"
done
# T10e: pure docs and unrelated scripts stay doc-only (SKIP preserved).
for doc in docs/foo.md README.md .claude/bar.md e2e/README.md scripts/e2e/README.md \
  scripts/dev/tests/baz.test.sh docs/testing/e2e-journey-matrix.md .github/pull_request_template.md; do
  assert_eq "T10e: $doc alone does not trigger the guards" "$(printf '%s\n' "$doc" | filter_guard_triggers)" ""
done
# T10f: mixed batch keeps only the triggers, in order.
assert_eq "T10f: mixed batch keeps exactly the trigger paths" \
  "$(printf '%s\n' docs/a.md scripts/e2e/x.mjs scripts/dev/y.sh package.json | filter_guard_triggers)" \
  $'scripts/e2e/x.mjs\npackage.json'

# ===========================================================================
# T-NOSMOKE (#2750 PR-2) - the `smoke` Playwright project is retired. The legacy config must declare
# no smoke project, and the library must no longer carry the allowlist mirror or its classifier.
# ===========================================================================

NOSMOKE_CFG="$(grep -E "name: *'(smoke|udupi-canonical-smoke)'" "$REPO_ROOT/playwright.config.ts" || true)"
assert_eq "T-NOSMOKE: playwright.config.ts declares no smoke / udupi-canonical-smoke project" "$NOSMOKE_CFG" ""
assert_eq "T-NOSMOKE: SMOKE_SPEC_BASENAMES is no longer defined by the library" "${SMOKE_SPEC_BASENAMES+set}" ""
declare -F classify_e2e_coverage >/dev/null 2>&1
assert_false "T-NOSMOKE: classify_e2e_coverage is no longer defined by the library" "$?"

# ===========================================================================
# T-INTEG - .githooks/pre-push run end-to-end against a synthetic local git
# repo (two real commits, no real push/network), with `node` and `npm`
# stubbed on PATH so no real guard/Playwright/browser/backend ever starts.
# #2750 contract under test:
#   - doc-only diff            -> SKIPPED, nothing invoked
#   - code diff                -> both static guards invoked, "static guards PASSED - NOT the E2E gate"
#   - a failing guard          -> push BLOCKED (non-zero), no PASSED line
#   - PREPUSH_E2E=gate         -> `npm run test:e2e:gate` invoked, and a failing gate blocks
#   - never prints "e2e passed", never runs test:e2e:local / the smoke suite
# ===========================================================================

MOCKBIN="$(mktemp -d)"
CLEANUP_DIRS+=("$MOCKBIN")
NPM_LOG=""
NODE_LOG=""

cat > "$MOCKBIN/npm" <<'EOF'
#!/usr/bin/env bash
# Records the exact args; never runs a real suite. Exit code: NPM_MOCK_EXIT_CODE.
echo "$*" >> "${NPM_LOG:?NPM_LOG not set}"
echo "[mock npm] $*"
exit "${NPM_MOCK_EXIT_CODE:-0}"
EOF
cat > "$MOCKBIN/node" <<'EOF'
#!/usr/bin/env bash
# Records which guard script was invoked (basename + args). A guard whose basename contains
# $NODE_FAIL_ON fails with exit 1.
echo "$(basename "$1") ${*:2}" >> "${NODE_LOG:?NODE_LOG not set}"
if [[ -n "${NODE_FAIL_ON:-}" && "$1" == *"$NODE_FAIL_ON"* ]]; then
  echo "[mock node] $(basename "$1") FAILED"
  exit 1
fi
echo "[mock node] $(basename "$1") ok"
exit 0
EOF
chmod +x "$MOCKBIN/npm" "$MOCKBIN/node"

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
  # Args: sandbox base_sha head_sha ; extra env via the caller's environment
  local sandbox="$1" base_sha="$2" head_sha="$3"
  (
    cd "$sandbox"
    printf 'refs/heads/main %s refs/heads/main %s\n' "$head_sha" "$base_sha" \
      | env PATH="$MOCKBIN:$ORIG_PATH" NPM_LOG="$NPM_LOG" NODE_LOG="$NODE_LOG" \
            bash .githooks/pre-push
  )
}

commit_file() { # sandbox relpath
  (
    cd "$1"
    mkdir -p "$(dirname "$2")"
    echo "x" >> "$2"
    git add -A
    git commit -q -m "touch $2"
  )
}

fresh_logs() { NPM_LOG="$(mktemp)"; NODE_LOG="$(mktemp)"; : > "$NPM_LOG"; : > "$NODE_LOG"; }

# T11: an e2e-only diff is CODE. Both static guards run, the output says PASSED + NOT the E2E gate,
# never "e2e passed", and no E2E suite (npm) is run by default.
SB11="$(new_hook_sandbox)"; BASE11="$(cd "$SB11" && git rev-parse HEAD)"
commit_file "$SB11" e2e/example-feature.spec.ts
HEAD11="$(cd "$SB11" && git rev-parse HEAD)"
fresh_logs
LOG11="$(mktemp)"
NPM_MOCK_EXIT_CODE=0 run_hook "$SB11" "$BASE11" "$HEAD11" > "$LOG11" 2>&1
RC11=$?
OUT11="$(cat "$LOG11")"
assert_true "T11: hook exits 0 for an e2e-only diff when both static guards pass" "$RC11"
assert_not_contains "T11: output does NOT claim a doc-only skip for an e2e-only diff" "$OUT11" "doc-only"
assert_contains "T11: output states the static guards PASSED and that this is NOT the E2E gate" \
  "$OUT11" "[pre-push] E2E static guards PASSED — this is NOT the E2E gate. Run: npm run test:e2e:gate"
assert_not_contains "T11: output never says 'e2e passed'" "$(printf '%s' "$OUT11" | tr 'A-Z' 'a-z')" "e2e passed"
assert_contains "T11: the changed e2e file is named as NOT executed by the hook" "$OUT11" "e2e/example-feature.spec.ts"
assert_contains "T11: the estate guard was invoked" "$(cat "$NODE_LOG")" "check-e2e-estate.mjs"
assert_contains "T11: the journey static phase was invoked" "$(cat "$NODE_LOG")" "check-canonical-journeys.mjs --phase=static"
assert_eq "T11: no npm command (no smoke suite, no gate) is run by default" "$(cat "$NPM_LOG")" ""

# T12: a pure doc-only diff is still explicitly SKIPPED and nothing at all is invoked.
SB12="$(new_hook_sandbox)"; BASE12="$(cd "$SB12" && git rev-parse HEAD)"
commit_file "$SB12" docs/notes.md
HEAD12="$(cd "$SB12" && git rev-parse HEAD)"
fresh_logs
LOG12="$(mktemp)"
NPM_MOCK_EXIT_CODE=0 run_hook "$SB12" "$BASE12" "$HEAD12" > "$LOG12" 2>&1
RC12=$?
OUT12="$(cat "$LOG12")"
assert_true "T12: hook exits 0 for a genuine doc-only diff" "$RC12"
assert_contains "T12: doc-only diff is explicitly reported SKIPPED" "$OUT12" "SKIPPED"
assert_eq "T12: no guard is invoked for a doc-only diff" "$(cat "$NODE_LOG")" ""
assert_eq "T12: npm is never invoked for a doc-only diff" "$(cat "$NPM_LOG")" ""

# T13: a canonical-only diff behaves like any code diff: guards run, the file is named as not executed.
SB13="$(new_hook_sandbox)"; BASE13="$(cd "$SB13" && git rev-parse HEAD)"
commit_file "$SB13" e2e/canonical/booking-request.canonical.ts
HEAD13="$(cd "$SB13" && git rev-parse HEAD)"
fresh_logs
LOG13="$(mktemp)"
NPM_MOCK_EXIT_CODE=0 run_hook "$SB13" "$BASE13" "$HEAD13" > "$LOG13" 2>&1
RC13=$?
OUT13="$(cat "$LOG13")"
assert_true "T13: hook exits 0 for a canonical-only diff when the guards pass" "$RC13"
assert_contains "T13: the canonical file is named as NOT executed by this hook" "$OUT13" "e2e/canonical/booking-request.canonical.ts"
assert_contains "T13: the output points at the real gate" "$OUT13" "npm run test:e2e:gate"

# T14: a failing static guard BLOCKS the push, and no PASSED line is printed.
for failing in check-e2e-estate check-canonical-journeys; do
  SB14="$(new_hook_sandbox)"; BASE14="$(cd "$SB14" && git rev-parse HEAD)"
  commit_file "$SB14" e2e/discover-new.spec.ts
  HEAD14="$(cd "$SB14" && git rev-parse HEAD)"
  fresh_logs
  LOG14="$(mktemp)"
  NODE_FAIL_ON="$failing" NPM_MOCK_EXIT_CODE=0 run_hook "$SB14" "$BASE14" "$HEAD14" > "$LOG14" 2>&1
  RC14=$?
  OUT14="$(cat "$LOG14")"
  assert_false "T14: hook exits non-zero when $failing fails" "$RC14"
  assert_contains "T14: output says BLOCKED when $failing fails" "$OUT14" "BLOCKED"
  assert_not_contains "T14: no 'static guards PASSED' line when $failing fails" "$OUT14" "static guards PASSED"
done

# T15: PREPUSH_E2E=gate opts in to the real gate (npm run test:e2e:gate), never test:e2e:local.
SB15="$(new_hook_sandbox)"; BASE15="$(cd "$SB15" && git rev-parse HEAD)"
commit_file "$SB15" e2e/canonical/booking-request.canonical.ts
HEAD15="$(cd "$SB15" && git rev-parse HEAD)"
fresh_logs
LOG15="$(mktemp)"
PREPUSH_E2E=gate NPM_MOCK_EXIT_CODE=0 run_hook "$SB15" "$BASE15" "$HEAD15" > "$LOG15" 2>&1
RC15=$?
OUT15="$(cat "$LOG15")"
assert_true "T15: hook exits 0 when the opted-in gate passes" "$RC15"
assert_contains "T15: the opt-in runs npm run test:e2e:gate" "$(cat "$NPM_LOG")" "run test:e2e:gate"
assert_not_contains "T15: the legacy runner test:e2e:local is never invoked" "$(cat "$NPM_LOG")" "test:e2e:local"
assert_not_contains "T15: output never says 'e2e passed'" "$(printf '%s' "$OUT15" | tr 'A-Z' 'a-z')" "e2e passed"

# T16: a failing opted-in gate BLOCKS the push.
SB16="$(new_hook_sandbox)"; BASE16="$(cd "$SB16" && git rev-parse HEAD)"
commit_file "$SB16" e2e/canonical/booking-request.canonical.ts
HEAD16="$(cd "$SB16" && git rev-parse HEAD)"
fresh_logs
LOG16="$(mktemp)"
PREPUSH_E2E=gate NPM_MOCK_EXIT_CODE=1 run_hook "$SB16" "$BASE16" "$HEAD16" > "$LOG16" 2>&1
RC16=$?
OUT16="$(cat "$LOG16")"
assert_false "T16: hook exits non-zero when the opted-in gate fails" "$RC16"
assert_contains "T16: output says the push is BLOCKED" "$OUT16" "BLOCKED"

# T17 (#2750 P1): the hook itself runs, and a failing guard BLOCKS, for pushes that touch ONLY
# estate machinery living under scripts/, .github/, .githooks/, or root config.
for trig in scripts/e2e/check-e2e-estate.mjs .github/workflows/ci.yml playwright.config.ts package.json .githooks/commit-msg; do
  SB17="$(new_hook_sandbox)"; BASE17="$(cd "$SB17" && git rev-parse HEAD)"
  commit_file "$SB17" "$trig"
  HEAD17="$(cd "$SB17" && git rev-parse HEAD)"
  fresh_logs
  LOG17="$(mktemp)"
  NPM_MOCK_EXIT_CODE=0 run_hook "$SB17" "$BASE17" "$HEAD17" > "$LOG17" 2>&1
  RC17=$?
  OUT17="$(cat "$LOG17")"
  assert_true "T17: hook exits 0 for a $trig-only diff when the guards pass" "$RC17"
  assert_not_contains "T17: a $trig-only diff is not reported SKIPPED" "$OUT17" "SKIPPED"
  assert_contains "T17: estate guard ran for $trig-only diff" "$(cat "$NODE_LOG")" "check-e2e-estate.mjs"
  assert_contains "T17: journey static phase ran for $trig-only diff" "$(cat "$NODE_LOG")" "check-canonical-journeys.mjs --phase=static"
  fresh_logs
  LOG17B="$(mktemp)"
  NODE_FAIL_ON="check-e2e-estate" NPM_MOCK_EXIT_CODE=0 run_hook "$SB17" "$BASE17" "$HEAD17" > "$LOG17B" 2>&1
  RC17B=$?
  assert_false "T17: a failing estate guard BLOCKS a $trig-only push" "$RC17B"
  assert_contains "T17: BLOCKED is printed for a $trig-only push" "$(cat "$LOG17B")" "BLOCKED"
done

# T18: markdown under scripts/ stays doc-only, and mixed doc + scripts/e2e change still runs the guards.
SB18="$(new_hook_sandbox)"; BASE18="$(cd "$SB18" && git rev-parse HEAD)"
commit_file "$SB18" scripts/e2e/README.md
HEAD18="$(cd "$SB18" && git rev-parse HEAD)"
fresh_logs
LOG18="$(mktemp)"
run_hook "$SB18" "$BASE18" "$HEAD18" > "$LOG18" 2>&1
assert_contains "T18: scripts/e2e/README.md alone is SKIPPED" "$(cat "$LOG18")" "SKIPPED"
assert_eq "T18: no guard runs for scripts/e2e/README.md alone" "$(cat "$NODE_LOG")" ""

# T19 (#2750 review): a multi-ref push evaluates EVERY ref. A leading branch deletion and a leading
# doc-only ref must not end the hook before a later code ref is checked.
SB19="$(new_hook_sandbox)"; BASE19="$(cd "$SB19" && git rev-parse HEAD)"
commit_file "$SB19" e2e/discover-new.spec.ts
HEAD19="$(cd "$SB19" && git rev-parse HEAD)"
ZERO="0000000000000000000000000000000000000000"
fresh_logs
LOG19="$(mktemp)"
(
  cd "$SB19"
  printf 'refs/heads/gone %s refs/heads/gone %s\nrefs/heads/main %s refs/heads/main %s\n' "$ZERO" "$BASE19" "$HEAD19" "$BASE19" \
    | env PATH="$MOCKBIN:$ORIG_PATH" NPM_LOG="$NPM_LOG" NODE_LOG="$NODE_LOG" NODE_FAIL_ON="check-e2e-estate" bash .githooks/pre-push
) > "$LOG19" 2>&1
RC19=$?
assert_false "T19: a deletion ref before a code ref does not skip the guards (failing guard still blocks)" "$RC19"
assert_contains "T19: the guards ran for the second ref" "$(cat "$NODE_LOG")" "check-e2e-estate.mjs"

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
