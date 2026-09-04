#!/usr/bin/env bash
# Verifies the return-code contract of e2e_seed_identity under `set -euo pipefail`,
# including the `required` path that only local-fixture-backend.sh exercises.
#
# Repo-relative so any reviewer can reproduce it from a clean checkout:
#   bash docs/pr-evidence/issue-2427/verify-seed-lib.sh
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"
source scripts/dev/lib/e2e-identity-seed.sh

rc=0; e2e_seed_identity admin "" "" admin required || rc=$?
echo "RESULT required + absent creds -> rc=$rc (expect 1)"

rc=0; e2e_seed_identity broker "" "" broker best-effort || rc=$?
echo "RESULT best-effort + absent creds -> rc=$rc (expect 0)"

echo "RESULT last-uuid=[${E2E_SEED_LAST_UUID}] last-token=[${E2E_SEED_LAST_TOKEN}] (expect both empty)"

# An unreachable auth host must not abort the caller under errexit in best-effort mode.
rc=0
VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PUBLISHABLE_KEY="x" \
E2E_SEED_PG_HOST=localhost E2E_SEED_PG_PORT=1 E2E_SEED_PG_PASSWORD=x \
  e2e_seed_identity broker "a@b.test" "pw" broker best-effort || rc=$?
echo "RESULT best-effort + unreachable auth host -> rc=$rc (expect 0, script still alive)"

rc=0
VITE_SUPABASE_URL="http://127.0.0.1:1" VITE_SUPABASE_PUBLISHABLE_KEY="x" \
E2E_SEED_PG_HOST=localhost E2E_SEED_PG_PORT=1 E2E_SEED_PG_PASSWORD=x \
  e2e_seed_identity admin "a@b.test" "pw" admin required || rc=$?
echo "RESULT required + unreachable auth host -> rc=$rc (expect 1)"

source scripts/dev/lib/e2e-identity-seed.sh
echo "RESULT double-source guard survived, script still running"
echo "ALL CHECKS EXECUTED"
