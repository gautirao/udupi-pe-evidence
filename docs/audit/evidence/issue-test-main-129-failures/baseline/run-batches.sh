#!/usr/bin/env bash
# Batched vitest baseline runner for issue #1825 (avoids full-suite OOM).
# Usage: bash run-batches.sh <run-label>   e.g. run-1 | run-2
#
# Issue #1953 PV8: this script hardcoded a `cd` to the MAIN repo checkout, so
# running it unmodified from a worktree silently tested the WRONG TREE and
# reported green for code that was never executed. REPO_ROOT now overrides
# the target tree; the default is unchanged, so existing callers (main-repo
# CI/local runs with no REPO_ROOT set) behave exactly as before.
set -u
REPO_ROOT="${REPO_ROOT:-/Users/gouthamrao/projects/udupi-property-explorer}"
cd "$REPO_ROOT" || exit 2
RUN="${1:-run-1}"
OUT="docs/audit/evidence/issue-test-main-129-failures/baseline/$RUN"
mkdir -p "$OUT"
VITEST="node node_modules/.bin/vitest run"

# Batch name -> paths (each batch kept small to avoid heap OOM)
# Issue #1953 PV8: added `features-discover` — no prior batch globbed
# src/features/discover/**, which is where the #1953 context facade (and its
# unit tests) live; without this batch those tests would silently never run.
# Issue #1953 F4: added `tests-discover`. Same defect class as PV8 — NO batch
# matched the top-level tests/ directory, so six files never ran at all:
#   GuidedEntryPanel.summary.test.tsx, useDiscoverUrlState.scope.test.ts,
#   panels-parity.test.tsx, map-layer-derivation.test.ts,
#   marker-popover-1738-gating.test.ts, marker-popover-1798-group-results-gating.test.ts
# useDiscoverUrlState.scope.test.ts covers the very hook the #1953 facade
# migration touches and had apparently never been exercised by this runner.
names=(discover-tests discover-panels map broker listing components-misc hooks lib pages-tests pages-broker-admin misc features-discover tests-discover)
paths=(
  "src/components/discover/__tests__"
  "src/components/discover/panels"
  "src/components/map"
  "src/components/broker"
  "src/components/listing"
  "src/components/area src/components/auth src/components/dealer src/components/insights src/components/layout src/components/notifications src/components/poi src/components/trust src/components/ui"
  "src/hooks"
  "src/lib"
  "src/pages/__tests__"
  "src/pages/broker src/pages/admin src/pages/MapDiscovery.test.tsx"
  "src/utils src/__tests__ src/test"
  "src/features/discover"
  "tests/discover"
)

# Issue #1713 D8 step 0: same defect class as PV8/F4 above, found empirically
# (vitest 4.1.11 `list --filesOnly`, unfiltered discovery vs. the union of all
# 13 batches' filters, each multi-path batch split into separate positional
# args since vitest filters are per-arg filename substrings) — a THIRD set of
# 16 test files matched NO batch and would silently never run:
#   src/components/HomepageFilterPanel.test.tsx, src/components/RouteErrorBoundary.test.tsx
#   src/components/discover/DiscoverMapCountBadge.test.tsx
#   src/components/discover/cityLaunchPreview/__tests__/ (3 files)
#   src/components/discover/navigation/__tests__/ (6 files)
#   src/shared/map/__tests__/ (3 files), src/shared/map/zoomPolicy.issue1823.test.ts
# No filter collisions were found (union had no duplicate matches). The 3
# batches below were verified to match exactly this 16-file set, no more and
# no less, before being added.
names+=(components-top-level discover-navigation shared-map)
paths+=(
  "src/components/HomepageFilterPanel.test.tsx src/components/RouteErrorBoundary.test.tsx"
  "src/components/discover/DiscoverMapCountBadge.test.tsx src/components/discover/cityLaunchPreview/__tests__ src/components/discover/navigation/__tests__"
  "src/shared/map/__tests__ src/shared/map/zoomPolicy.issue1823.test.ts"
)

SUMMARY="$OUT/_batch-summary.txt"
: > "$SUMMARY"
for i in "${!names[@]}"; do
  n="${names[$i]}"; p="${paths[$i]}"
  echo "=== BATCH $n :: $p ===" | tee -a "$SUMMARY"
  $VITEST $p --reporter=json --outputFile="$OUT/batch-$n.json" > "$OUT/batch-$n.stdout.txt" 2>&1
  code=$?
  echo "BATCH $n EXIT $code" | tee -a "$SUMMARY"
done
echo "ALL BATCHES DONE for $RUN" | tee -a "$SUMMARY"
