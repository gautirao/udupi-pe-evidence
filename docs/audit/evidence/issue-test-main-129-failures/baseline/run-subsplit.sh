#!/usr/bin/env bash
# Re-run the OOM'd pages-broker-admin batch as smaller sub-batches.
# Usage: bash run-subsplit.sh <run-label>
set -u
cd /Users/gouthamrao/projects/udupi-property-explorer || exit 2
RUN="${1:-run-1}"
O="docs/audit/evidence/issue-test-main-129-failures/baseline/$RUN"
mkdir -p "$O"
VITEST="node node_modules/.bin/vitest run"

names=(pages-broker pages-admin pages-mapdiscovery)
paths=("src/pages/broker" "src/pages/admin" "src/pages/MapDiscovery.test.tsx")
for i in "${!names[@]}"; do
  n="${names[$i]}"; p="${paths[$i]}"
  echo "=== SUBBATCH $n :: $p ==="
  $VITEST $p --reporter=json --outputFile="$O/batch-$n.json" > "$O/batch-$n.stdout.txt" 2>&1
  echo "SUBBATCH $n EXIT $?"
done
echo "SUBSPLIT DONE for $RUN"
