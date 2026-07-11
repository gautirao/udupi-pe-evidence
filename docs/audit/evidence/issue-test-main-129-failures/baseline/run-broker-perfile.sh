#!/usr/bin/env bash
# Run each src/pages/broker test file individually (heavy full-page renders OOM when batched).
# Usage: bash run-broker-perfile.sh <run-label>
set -u
cd /Users/gouthamrao/projects/udupi-property-explorer || exit 2
RUN="${1:-run-1}"
O="docs/audit/evidence/issue-test-main-129-failures/baseline/$RUN"
mkdir -p "$O"
VITEST="node node_modules/.bin/vitest run"
i=0
for f in src/pages/broker/__tests__/*.test.tsx; do
  i=$((i+1))
  base=$(basename "$f" .test.tsx)
  echo "=== BROKER FILE $i :: $f ==="
  $VITEST "$f" --reporter=json --outputFile="$O/batch-broker-$base.json" > "$O/batch-broker-$base.stdout.txt" 2>&1
  echo "BROKER $base EXIT $?"
done
echo "BROKER PERFILE DONE for $RUN"
