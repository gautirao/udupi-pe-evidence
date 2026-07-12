#!/usr/bin/env bash
# Measurement 1: run a SINGLE EditListing.guard test with heap logging + a per-test
# timeout, to determine whether ONE render hangs/leaks (single-render loop) vs
# cumulative growth across the 5 tests. Default heap (NO max-old-space bump).
set -u
cd /Users/gouthamrao/projects/udupi-property-explorer || exit 2
O="docs/audit/evidence/issue-1825-slice3"
F="src/pages/broker/__tests__/EditListing.guard.test.tsx"
echo "START $(date +%T)"
# -t selects a single test; --logHeapUsage prints per-test heap; testTimeout bounds an
# async loop; pool=forks single fork; no coverage. Capture everything.
node node_modules/.bin/vitest run "$F" \
  -t "allows modern broker role to access EditListing" \
  --logHeapUsage --testTimeout=20000 --hookTimeout=20000 \
  --pool=forks --poolOptions.forks.singleFork=true --no-file-parallelism \
  > "$O/measure-single.txt" 2>&1
echo "EXIT $? $(date +%T)"
