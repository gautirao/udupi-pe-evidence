#!/usr/bin/env bash
# scripts/dev/tests/check-migration-version-order.test.sh — #2686
#
# Proves scripts/db/check-migration-version-order.sh discriminates the real
# incident shape from an ordinary duplicate filename, using throwaway git
# repos under a temp directory only. Never touches the real repository, any
# real branch, or any real remote.
#
# T-INCIDENT is the load-bearing test: it reproduces exactly the scenario
# from the #2686 brief —
#   lane A starts from V141 -> chooses V142
#   lane B starts from the same base -> independently advances "main" first
#   fresh main is now above lane A's chosen number
#   -> guard MUST reject/force renumber
#
# Run:  bash scripts/dev/tests/check-migration-version-order.test.sh
# Exits 0 if all assertions pass, non-zero otherwise.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
GUARD="$REPO_ROOT/scripts/db/check-migration-version-order.sh"
NEXT_VERSION="$REPO_ROOT/scripts/db/next-migration-version.sh"
MIGRATION_SUBDIR="apps/api/src/main/resources/db/migration"

TOTAL=0
FAILED=0
ok() { TOTAL=$((TOTAL + 1)); echo "ok $TOTAL - $1"; }
not_ok() { TOTAL=$((TOTAL + 1)); FAILED=$((FAILED + 1)); echo "not ok $TOTAL - $1"; }
assert_exit_nonzero() {
  local label="$1" code="$2"
  if [[ "$code" -ne 0 ]]; then ok "$label"; else not_ok "$label (expected non-zero exit, got 0)"; fi
}
assert_exit_zero() {
  local label="$1" code="$2"
  if [[ "$code" -eq 0 ]]; then ok "$label"; else not_ok "$label (expected exit 0, got $code)"; fi
}
assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  if [[ "$haystack" == *"$needle"* ]]; then ok "$label"; else not_ok "$label (expected to find [$needle])"; fi
}

CLEANUP_DIRS=()
cleanup_all() {
  for d in "${CLEANUP_DIRS[@]:-}"; do
    [[ -n "$d" && -d "$d" ]] && rm -rf "$d"
  done
}
trap cleanup_all EXIT

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/migration-order-guard-test.XXXXXX")"
CLEANUP_DIRS+=("$WORKDIR")

git_quiet() { git -c user.email=test@example.com -c user.name=test "$@" >/dev/null 2>&1; }

add_migration() {
  # add_migration <repo-dir> <filename>
  local dir="$1" name="$2"
  mkdir -p "$dir/$MIGRATION_SUBDIR"
  echo "-- test fixture" > "$dir/$MIGRATION_SUBDIR/$name"
  git -C "$dir" add "$MIGRATION_SUBDIR/$name" >/dev/null
  git_quiet -C "$dir" commit -m "add $name"
}

run_guard() {
  # run_guard <repo-dir> [remote/branch] -> stdout+stderr captured, exit code in $GUARD_EXIT
  local dir="$1" ref="${2:-origin/main}"
  GUARD_OUTPUT="$(cd "$dir" && bash "$GUARD" "$ref" 2>&1)"
  GUARD_EXIT=$?
}

run_next_version() {
  # run_next_version <repo-dir> -> stdout+stderr captured, exit code in $NEXT_EXIT
  local dir="$1"
  NEXT_OUTPUT="$(cd "$dir" && bash "$NEXT_VERSION" origin/main 2>&1)"
  NEXT_EXIT=$?
}

# ===========================================================================
# Shared fixture: bare "origin", a "main" checkout with V141 already on it.
# ===========================================================================
ORIGIN="$WORKDIR/origin.git"
git init --quiet --bare "$ORIGIN"

MAIN="$WORKDIR/main"
git_quiet clone "$ORIGIN" "$MAIN"
git -C "$MAIN" checkout -b main --quiet 2>/dev/null || true
add_migration "$MAIN" "V141__base.sql"
git_quiet -C "$MAIN" push origin HEAD:main

# ===========================================================================
# T-INCIDENT (RED): lane A branches from V141, picks V142. Lane B — from the
# SAME base — independently lands V143 on main FIRST. Lane A's checkout still
# only knows about V142; fresh origin/main now carries V143. The guard must
# reject lane A's V142 as stale.
# ===========================================================================
LANE_A="$WORKDIR/lane-a"
git_quiet clone "$ORIGIN" "$LANE_A"
git -C "$LANE_A" checkout main --quiet
add_migration "$LANE_A" "V142__lane_a_feature.sql"
# Lane A does NOT push yet — it is mid-flight, exactly like a real PR branch.

LANE_B="$WORKDIR/lane-b"
git_quiet clone "$ORIGIN" "$LANE_B"
git -C "$LANE_B" checkout main --quiet
add_migration "$LANE_B" "V143__lane_b_feature.sql"
git_quiet -C "$LANE_B" push origin HEAD:main
# Fresh origin/main is now at V143 — ahead of lane A's stale-base V142 pick.

run_guard "$LANE_A"
assert_exit_nonzero "T-INCIDENT: guard rejects lane A's V142 once fresh main is at V143" "$GUARD_EXIT"
assert_contains "T-INCIDENT: failure output names the stale file" "$GUARD_OUTPUT" "V142__lane_a_feature.sql"
assert_contains "T-INCIDENT: failure output states fresh main's real highest version" "$GUARD_OUTPUT" "V143"
assert_contains "T-INCIDENT: failure output gives renumbering guidance" "$GUARD_OUTPUT" "Renumber"

# ===========================================================================
# T-RENUMBER (GREEN): lane A renumbers its migration above fresh main's
# current max and the SAME guard now passes — proving this isn't a permanent
# block, just an enforced re-check.
# ===========================================================================
rm -f "$LANE_A/$MIGRATION_SUBDIR/V142__lane_a_feature.sql"
git -C "$LANE_A" add -A >/dev/null
add_migration "$LANE_A" "V144__lane_a_feature_renumbered.sql"

run_guard "$LANE_A"
assert_exit_zero "T-RENUMBER: guard accepts lane A's V144 (above fresh main's V143)" "$GUARD_EXIT"

# ===========================================================================
# T-DUP: two files in the SAME branch declaring the same version are still
# caught (belt-and-braces alongside FlywayMigrationVersionUniquenessTest).
# ===========================================================================
LANE_C="$WORKDIR/lane-c"
git_quiet clone "$ORIGIN" "$LANE_C"
git -C "$LANE_C" checkout main --quiet
add_migration "$LANE_C" "V150__first.sql"
add_migration "$LANE_C" "V150__second.sql"

run_guard "$LANE_C"
assert_exit_nonzero "T-DUP: guard rejects two files declaring the same version" "$GUARD_EXIT"
assert_contains "T-DUP: failure output reports the duplicate version" "$GUARD_OUTPUT" "duplicate"

# ===========================================================================
# T-NOOP: a branch that adds no migration at all is a clean pass (no false
# positives on unrelated PRs).
# ===========================================================================
LANE_D="$WORKDIR/lane-d"
git_quiet clone "$ORIGIN" "$LANE_D"
git -C "$LANE_D" checkout main --quiet
mkdir -p "$LANE_D/apps/web/src"
echo "// no-op change" > "$LANE_D/apps/web/src/noop.ts"
git -C "$LANE_D" add apps/web/src/noop.ts >/dev/null
git_quiet -C "$LANE_D" commit -m "unrelated frontend change"

run_guard "$LANE_D"
assert_exit_zero "T-NOOP: a branch with no new migration files passes cleanly" "$GUARD_EXIT"

# ===========================================================================
# T-EQUAL: a NEW branch file reusing fresh main's exact max version, under a
# DIFFERENT filename, is still a rejected collision — not just a strictly
# lower version (code-reviewer MEDIUM-3).
# ===========================================================================
LANE_E="$WORKDIR/lane-e"
git_quiet clone "$ORIGIN" "$LANE_E"
git -C "$LANE_E" checkout main --quiet
# Fresh main's real highest at this point in the script is V150 (from T-DUP's
# push? No — T-DUP's LANE_C never pushed, so fresh main is still V141/V143
# from the T-INCIDENT block). Re-derive it defensively instead of assuming.
FRESH_MAX_BEFORE_E="$(cd "$LANE_E" && git ls-tree -r --name-only origin/main -- "$MIGRATION_SUBDIR" | xargs -n1 basename | grep -E '^V[0-9]+__' | sed -E 's/^V([0-9]+)__.*/\1/' | sort -n | tail -1)"
add_migration "$LANE_E" "V${FRESH_MAX_BEFORE_E}__collides_with_fresh_max_under_new_name.sql"

run_guard "$LANE_E"
assert_exit_nonzero "T-EQUAL: guard rejects a new file reusing fresh main's exact max version under a different filename" "$GUARD_EXIT"
assert_contains "T-EQUAL: failure output names the colliding file" "$GUARD_OUTPUT" "collides_with_fresh_max_under_new_name.sql"

# ===========================================================================
# T-LEADING-ZERO: V001 and V1 are the SAME Flyway version even though they
# differ as raw strings — the duplicate check must normalize (qa-fast HIGH-4).
# ===========================================================================
LANE_F="$WORKDIR/lane-f"
git_quiet clone "$ORIGIN" "$LANE_F"
git -C "$LANE_F" checkout main --quiet
add_migration "$LANE_F" "V200__first.sql"
add_migration "$LANE_F" "V0200__second_same_version_leading_zeros.sql"

run_guard "$LANE_F"
assert_exit_nonzero "T-LEADING-ZERO: guard rejects V200 and V0200 as the same duplicate version" "$GUARD_EXIT"
assert_contains "T-LEADING-ZERO: failure output reports the duplicate" "$GUARD_OUTPUT" "duplicate"

# ===========================================================================
# T-DOTTED: dotted-version ordering is NUMERIC, not lexicographic (qa-fast
# CRITICAL-1). A fresh main at V1.10 must reject a new V1.9 as stale — a
# naive string/lexicographic compare would wrongly treat "1.9" as greater
# than "1.10".
# ===========================================================================
DOTTED_ORIGIN="$WORKDIR/dotted-origin.git"
git init --quiet --bare "$DOTTED_ORIGIN"
DOTTED_MAIN="$WORKDIR/dotted-main"
git_quiet clone "$DOTTED_ORIGIN" "$DOTTED_MAIN"
git -C "$DOTTED_MAIN" checkout -b main --quiet 2>/dev/null || true
add_migration "$DOTTED_MAIN" "V1.9__base.sql"
git_quiet -C "$DOTTED_MAIN" push origin HEAD:main

DOTTED_LANE_B="$WORKDIR/dotted-lane-b"
git_quiet clone "$DOTTED_ORIGIN" "$DOTTED_LANE_B"
git -C "$DOTTED_LANE_B" checkout main --quiet
add_migration "$DOTTED_LANE_B" "V1.10__lane_b_advances_first.sql"
git_quiet -C "$DOTTED_LANE_B" push origin HEAD:main
# Fresh dotted-origin/main is now at V1.10.

DOTTED_LANE_A="$WORKDIR/dotted-lane-a"
git_quiet clone "$DOTTED_ORIGIN" "$DOTTED_LANE_A"
git -C "$DOTTED_LANE_A" checkout main --quiet
add_migration "$DOTTED_LANE_A" "V1.9.1__lane_a_stale_pick.sql"
# 1.9.1 < 1.10 numerically. A lexicographic compare of "1.9.1" vs "1.10"
# would wrongly say "1.9.1" > "1.10" (comparing the '9' vs '1' second chars).

run_guard "$DOTTED_LANE_A"
assert_exit_nonzero "T-DOTTED: guard numerically rejects V1.9.1 against fresh main's V1.10 (not lexicographic)" "$GUARD_EXIT"
assert_contains "T-DOTTED: failure output states fresh main's real dotted version" "$GUARD_OUTPUT" "V1.10"

# ===========================================================================
# T-FETCH-FAIL: a fetch failure must fail CLOSED (non-zero exit), never
# silently fall back to comparing against a stale/absent ref (code-reviewer
# BLOCKING-2 — the exact defect this test would have caught).
# ===========================================================================
LANE_G="$WORKDIR/lane-g"
git_quiet clone "$ORIGIN" "$LANE_G"
git -C "$LANE_G" checkout main --quiet
add_migration "$LANE_G" "V999__irrelevant.sql"

GUARD_OUTPUT="$(cd "$LANE_G" && bash "$GUARD" "nonexistent-remote/main" 2>&1)"
GUARD_EXIT=$?
assert_exit_nonzero "T-FETCH-FAIL: guard fails closed when the remote/branch cannot be fetched" "$GUARD_EXIT"

# ===========================================================================
# T-NEXT-VERSION: checkpoint 1 (advisory helper) reports the correct next
# free version against fresh main, and is a pure snapshot (exit 0, no
# mutation of the caller's repo).
# ===========================================================================
LANE_H="$WORKDIR/lane-h"
git_quiet clone "$ORIGIN" "$LANE_H"
git -C "$LANE_H" checkout main --quiet

run_next_version "$LANE_H"
assert_exit_zero "T-NEXT-VERSION: advisory helper exits 0 against a normal fresh main" "$NEXT_EXIT"
# Fresh $ORIGIN/main at this point in the script is V143 — T-INCIDENT's
# lane-b push (the only push to $ORIGIN after the initial V141 base) landed
# V143; nothing since has pushed to $ORIGIN (T-DUP/T-EQUAL only commit
# locally, to prove pre-merge rejection, and never push). Re-derived here
# rather than hard-assumed, to stay honest about which fixture state this
# depends on.
assert_contains "T-NEXT-VERSION: advisory helper names fresh main's current highest version (V143)" "$NEXT_OUTPUT" "V143"
NEXT_STDOUT_ONLY="$(cd "$LANE_H" && bash "$NEXT_VERSION" origin/main 2>/dev/null)"
assert_contains "T-NEXT-VERSION: stdout-only value is the bare next free version (144)" "$NEXT_STDOUT_ONLY" "144"

# ===========================================================================
# Summary
# ===========================================================================
echo ""
echo "1..$TOTAL"
if [[ "$FAILED" -gt 0 ]]; then
  echo "# FAILED: $FAILED of $TOTAL assertions"
  exit 1
fi
echo "# All $TOTAL assertions passed."
exit 0
