#!/usr/bin/env bash
# Mechanical census of the e2e/ suite, used to verify/refute F5 and F6 in
# docs/audit/issue-2076/discrepancy-register.md.
#
# Read-only: counts files, greps for expect()/toHaveScreenshot usage, and
# looks for committed snapshot baseline directories. Does not execute any
# spec, start any server, or touch any database.
#
# Usage: run from the repo root of the worktree under audit:
#   bash docs/audit/issue-2076/evidence/e2e-census.sh
#
# Output is deterministic given the working tree contents at HEAD.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "== e2e-census =="
echo "repo_root: $REPO_ROOT"
echo "git_head: $(git rev-parse HEAD)"
echo "git_branch: $(git rev-parse --abbrev-ref HEAD)"
echo "generated_at_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

echo "-- total spec files under e2e/ --"
TOTAL_SPECS=$(find e2e -name '*.spec.ts' | wc -l | tr -d ' ')
echo "total_specs: $TOTAL_SPECS"
echo

echo "-- capture-*.spec.ts files and their expect() counts --"
for f in e2e/capture-*.spec.ts; do
  [ -e "$f" ] || continue
  count=$( (grep -o 'expect(' "$f" || true) | wc -l | tr -d ' ')
  echo "$f: expect_count=$count"
done
echo

echo "-- specs with zero expect() calls, all of e2e/ --"
ZERO_EXPECT_COUNT=0
for f in $(find e2e -name '*.spec.ts'); do
  count=$( (grep -o 'expect(' "$f" || true) | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    echo "ZERO_EXPECT: $f"
    ZERO_EXPECT_COUNT=$((ZERO_EXPECT_COUNT + 1))
  fi
done
echo "zero_expect_spec_count: $ZERO_EXPECT_COUNT"
echo

echo "-- specs using toHaveScreenshot --"
TOHAVESCREENSHOT_COUNT=$( (grep -rl 'toHaveScreenshot' e2e || true) 2>/dev/null | wc -l | tr -d ' ')
echo "tohavescreenshot_spec_count: $TOHAVESCREENSHOT_COUNT"
if [ "$TOHAVESCREENSHOT_COUNT" -gt 0 ]; then
  grep -rl 'toHaveScreenshot' e2e || true
fi
echo

echo "-- committed Playwright snapshot baseline directories (*-snapshots/) --"
SNAP_DIRS=$( (find . -type d -iname '*-snapshots' -not -path '*/node_modules/*' || true) 2>/dev/null | wc -l | tr -d ' ')
echo "snapshot_baseline_dir_count: $SNAP_DIRS"
find . -type d -iname '*-snapshots' -not -path '*/node_modules/*' 2>/dev/null || true
echo

echo "-- Udupi-only string references inside e2e/ (F6 signal) --"
(grep -ril 'udupi\|manipal\|malpe\|kaup' e2e || true) 2>/dev/null | sort || true
echo

echo "-- Bangalore string references inside e2e/ (F6 signal) --"
(grep -ril 'bangalore\|bengaluru' e2e || true) 2>/dev/null | sort || true
echo

echo "-- local fixture seed file city coverage (F6 signal) --"
if [ -f scripts/db/fixtures/discover-smoke-seed.sql ]; then
  echo "fixture_file: scripts/db/fixtures/discover-smoke-seed.sql"
  (grep -io "manipal\|malpe\|kaup\|bangalore\|bengaluru" scripts/db/fixtures/discover-smoke-seed.sql || true) | sort | uniq -c
else
  echo "fixture_file scripts/db/fixtures/discover-smoke-seed.sql NOT FOUND"
fi
echo

echo "== end census =="
