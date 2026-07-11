#!/usr/bin/env bash
# Batched vitest baseline runner for issue #1825 (avoids full-suite OOM).
# Usage: bash run-batches.sh <run-label>   e.g. run-1 | run-2
set -u
cd /Users/gouthamrao/projects/udupi-property-explorer || exit 2
RUN="${1:-run-1}"
OUT="docs/audit/evidence/issue-test-main-129-failures/baseline/$RUN"
mkdir -p "$OUT"
VITEST="node node_modules/.bin/vitest run"

# Batch name -> paths (each batch kept small to avoid heap OOM)
names=(discover-tests discover-panels map broker listing components-misc hooks lib pages-tests pages-broker-admin misc)
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
