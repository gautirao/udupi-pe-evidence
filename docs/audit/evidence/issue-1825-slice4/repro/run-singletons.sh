#!/usr/bin/env bash
# Reproduce the 4 Cluster-C singleton failures in isolation (Slice 4).
set -u
cd /Users/gouthamrao/projects/udupi-property-explorer || exit 2
O="docs/audit/evidence/issue-1825-slice4/repro"
mkdir -p "$O"
VITEST="node node_modules/.bin/vitest run"
files=(
  "src/lib/listingFieldConfig.test.ts"
  "src/lib/routeAccess.test.ts"
  "src/lib/map/areaMarkerBucketing.test.ts"
  "src/pages/__tests__/LandingPage.test.tsx"
)
for f in "${files[@]}"; do
  base=$(basename "$f" | sed 's/\.[^.]*$//')
  echo "=== $f ==="
  $VITEST "$f" > "$O/$base.stdout.txt" 2>&1
  echo "$f EXIT $?"
done
echo "SINGLETON REPRO DONE"
