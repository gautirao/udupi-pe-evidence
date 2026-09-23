#!/usr/bin/env bash
# Issue #2304 Slice 1 — reproducible validation of the Udupi import artefacts.
#
# Brings up an ephemeral postgis/postgis:15-3.4 container, applies EVERY Flyway migration from
# apps/api/src/main/resources/db/migration, then area-seed.sql + import.sql, and asserts the
# contract the PR claims. Committed alongside the artefacts because this container run is the
# ONLY proof mechanism for a data-import PR (no application code changes, so no unit/E2E test
# can cover it) — a reviewer must be able to re-run it rather than take the numbers on trust.
#
# KNOWN FAILURE (tracked in #2690, cross-referenced with #2580 item 7 -- not this file's concern
# to fix): applying import.sql against the CURRENT migration set now trips a later-added trigger
# (assert_commercial_subtype_projected, issue #2520) on one already-merged listing (99acres id
# Y92487718, property_type='commercial') whose listing_commercial_space_details.commercial_subtype
# was left NULL by generate_sql.py instead of 'SHOP'. This is a latent data defect in the
# already-merged #2304 import.sql itself, unrelated to whatever else this script is being run to
# validate (e.g. #2307's import-owner identity precondition, added below) -- see #2690 before
# assuming a FAIL here means your change broke something. Fixing it requires editing
# generate_sql.py + regenerating import.sql, which is out of scope for most changes to this file
# and needs its own review.
#
#   Usage:  bash data/imports/udupi-properties-2304/validate.sh
#   Exit :  0 = every assertion passed
#           1 = at least one FAILed (or a step errored) for a reason OTHER than the known #2690
#               blocker above -- treat this as a real problem
#           2 = every assertion up to and including this file's own #2307 logic (steps 1a/1b)
#               PASSED, but the known, already-tracked #2690 blocker was then hit exactly as
#               documented -- NOT a real problem with whatever this run is validating, but not a
#               clean 0 either (see step 3's own output for detail)
#   Needs:  docker, python3.  Does not modify the working tree; leaves no state behind except
#           the named container (removed on the next run; `docker rm -f udupi2304-validate`).
#
# EXIT STATUS IS AUTHORITATIVE. The assertions below emit PASS/FAIL as psql result columns, so
# an earlier revision of this script exited 0 even when an assertion said FAIL — as the PR's
# sole proof mechanism, that made a failing run indistinguishable from a passing one. The whole
# transcript is now teed to a log and scanned for FAIL at the end.
#
# Two things are applied that are NOT part of the import artefacts, and both are disclosed
# rather than hidden:
#   1. apps/api/src/test/resources/db/test-stubs/beforeMigrate.sql — the same Supabase auth
#      stubs every Testcontainers IT applies (V0.1/V10 reference auth.users, auth.uid(), the
#      authenticated/anon/service_role roles and the supabase_realtime publication).
#   2. An auth.users row for the import's seed identity. public.profiles.user_id is
#      `REFERENCES auth.users(id) ON DELETE CASCADE`, so import.sql's synthetic seed profile
#      needs a backing auth identity; on Supabase that account is provisioned through the Auth
#      admin API, NOT by a data import, so import.sql deliberately does not create it.
#
# PII COVERAGE CAVEAT. Step 9 runs pii_residuals.py with its SHAPE layer only. The row-keyed
# name layer and the literal-canary layer both need a pre-sanitisation copy of the artefacts,
# which is deliberately NOT committed — that copy is the unsanitised data. So the committed,
# re-runnable proof does not exercise those two layers; the step's own output says so. To run
# all three layers, supply the uncommitted baseline:
#   python3 pii_residuals.py --dir . --baseline <pre-sanitisation-dir> --canary-file <literals>
#   python3 test_pii_filter.py --baseline <pre-sanitisation-dir>
set -uo pipefail

export PYTHONDONTWRITEBYTECODE=1   # keep __pycache__/ out of the committed import directory

# Re-exec with the whole transcript teed to a log, so the final FAIL scan sees every line.
if [ "${_V2304_TEED:-}" != "1" ]; then
  export _V2304_TEED=1
  LOG="$(mktemp -t udupi2304-validate.XXXXXX)"
  bash "${BASH_SOURCE[0]}" "$@" 2>&1 | tee "$LOG"
  rc=${PIPESTATUS[0]}
  echo
  # rc==2 is this file's own signal (set at step 3 below) that it hit EXACTLY the known,
  # already-tracked #2690 blocker after everything up to that point passed. It still only counts
  # as the distinct "known blocker" exit if NOTHING before it reported FAIL -- a real regression
  # in steps 1a/1b (this issue's own logic) must still surface as exit 1, not be masked by rc==2.
  if [ "$rc" -eq 2 ]; then
    if LC_ALL=C tr -d '\r' < "$LOG" | LC_ALL=C fgrep -q 'FAIL'; then
      echo "VALIDATE: FAIL (an assertion reported FAIL before the known #2690 blocker was reached — see transcript above)"; rm -f "$LOG"; exit 1
    fi
    echo "VALIDATE: BLOCKED_BY_KNOWN_ISSUE (#2690) -- everything this run's own logic asserts (steps 1a/1b) PASSED; the rest is blocked by a separate, pre-existing, already-tracked defect. See transcript above and step 3's own note."
    rm -f "$LOG"
    exit 2
  fi
  if [ "$rc" -ne 0 ]; then
    echo "VALIDATE: FAIL (a step exited $rc)"; rm -f "$LOG"; exit 1
  fi
  if LC_ALL=C tr -d '\r' < "$LOG" | LC_ALL=C fgrep -q 'FAIL'; then
    echo "VALIDATE: FAIL (an assertion reported FAIL — see transcript above)"; rm -f "$LOG"; exit 1
  fi
  echo "VALIDATE: PASS (no step errored, no assertion reported FAIL)"
  rm -f "$LOG"
  exit 0
fi

IMP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$IMP/../../.." && pwd)"
# NOTE (#2307): these two paths were "backend/..." until this fix. The repo has since moved to
# the apps/api/ monorepo layout -- "backend/" no longer exists anywhere in the tree -- so this
# script could not have located the migrations/stubs it depends on. Corrected as part of #2307
# since this script is the vehicle for that issue's own repro (discovered while extending it).
MIG="$REPO/apps/api/src/main/resources/db/migration"
STUBS="$REPO/apps/api/src/test/resources/db/test-stubs/beforeMigrate.sql"
WORK="$(mktemp -d)"
CT=udupi2304-validate
PW=validate
# Must track import.sql's owner. #2309 repointed the import from the synthetic
# housing-import-udupi@seed.local identity to testdealer@example.com; leaving the old pair here
# makes step 3 die on profiles_user_id_fkey rather than on anything this script is testing.
UUID=e7b61f70-d087-44d8-a81d-7f8a057d2775
SEED_EMAIL=testdealer@example.com

trap 'rm -rf "$WORK"' EXIT
run() { docker exec -i -e PGPASSWORD=$PW "$CT" psql -v ON_ERROR_STOP=1 -U postgres -d app "$@"; }

echo "### 0. container"
docker rm -f "$CT" >/dev/null 2>&1
docker run -d --name "$CT" -e POSTGRES_PASSWORD=$PW -e POSTGRES_DB=app \
  postgis/postgis:15-3.4 >/dev/null || exit 1
# The image runs a TEMPORARY server for initdb then restarts; waiting on pg_isready alone
# races that restart, so wait for the post-init banner first.
for _ in $(seq 1 120); do
  docker logs "$CT" 2>&1 | grep -q "PostgreSQL init process complete" && break; sleep 1
done
for _ in $(seq 1 120); do
  docker exec "$CT" pg_isready -U postgres -d app >/dev/null 2>&1 && break; sleep 1
done
sleep 2
docker exec "$CT" pg_isready -U postgres -d app || exit 1

echo "### 1. migrations"
run -q -f - < "$STUBS" >/dev/null || exit 1
# V60/V61 self-heal a failed prior attempt via flyway_schema_history. We apply the migrations
# with psql rather than the Flyway CLI, so create the standard history table empty — those
# DELETEs then match 0 rows exactly as they would on a clean Flyway run.
run -q -c "CREATE TABLE IF NOT EXISTS public.flyway_schema_history (
  installed_rank integer PRIMARY KEY, version varchar(50), description varchar(200),
  type varchar(20), script varchar(1000), checksum integer, installed_by varchar(100),
  installed_on timestamp DEFAULT now(), execution_time integer, success boolean);" >/dev/null
python3 - "$MIG" "$WORK/mig" <<'PY'
import os, re, sys
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
key = lambda f: tuple(int(x) for x in re.match(r'^V([\d.]+)__', f).group(1).split('.'))
files = sorted(os.listdir(src), key=key)
for i, f in enumerate(files):
    # application.yml sets concurrently_keyword="CONCURRENTLY "; the ITs blank it so V73's
    # index creation can run inside a transaction. Same here.
    t = open(os.path.join(src, f), errors='replace').read().replace('${concurrently_keyword}', '')
    open(os.path.join(dst, f'{i:04d}_{f}'), 'w').write(t)
print(f'  expanded {len(files)} migrations')
PY
for f in "$WORK"/mig/*.sql; do
  if ! run -q -f - < "$f" >/dev/null; then echo "  MIGRATION FAILED: $(basename "$f")"; exit 1; fi
done
echo "  all migrations applied"

echo "### 1a. RED (#2307) -- import.sql fails on profiles_user_id_fkey when the import-owner identity is absent"
# No auth.users row exists yet at this point: migrations just applied, and beforeMigrate.sql's
# stub (independently re-verified by reading it directly) pre-seeds no row for either identity.
# import.sql's very first statement after BEGIN is the profiles INSERT that references
# auth.users(id), so this must fail immediately on profiles_user_id_fkey and the whole
# transaction must roll back -- 0 listings inserted, not a partial apply.
RED_ERR="$(mktemp)"
if run -q -f - < "$IMP/import.sql" >/dev/null 2>"$RED_ERR"; then
  echo "  RED CHECK FAILED: import.sql applied successfully with NO import-owner identity present -- expected a profiles_user_id_fkey violation. Either the FK is not enforced, or a prior step left the identity behind."
  echo "  -> FAIL"
else
  if LC_ALL=C fgrep -q 'profiles_user_id_fkey' "$RED_ERR"; then
    echo "  RED: import.sql correctly failed on profiles_user_id_fkey with the identity absent."
  else
    echo "  RED CHECK FAILED: import.sql failed, but NOT on profiles_user_id_fkey -- this repro is invalid until the failure is genuinely the FK, not something else. Real error:"
    cat "$RED_ERR"
    echo "  -> FAIL"
  fi
fi
rm -f "$RED_ERR"
run <<SQL
\echo '--- RED: 0 listings inserted after the failed apply (expect the transaction rolled back)'
SELECT count(*) AS listings, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM property_listings WHERE created_by='$UUID';
SQL

echo "### 1b. fail-closed checks (#2307) -- provision-import-owner-identity.sh and its wiring into"
echo "         seed-remote-dev-udupi-listings.sh. Mocked Admin API + mocked psql: no live Supabase"
echo "         project exists to call for real (same structural constraint documented in"
echo "         scripts/dev/tests/provision-e2e-auth-identities.test.sh), and this repro's Postgres"
echo "         container has no GoTrue Admin API to exercise -- only the raw auth.users table used"
echo "         by 1a/2/3's real FK/trigger proof above. The mocked psql additionally proves the"
echo "         guard aborts BEFORE any DB call is attempted, not just that the script exits non-zero."
echo "         Code-review cycle 2 additions: the mock now asserts on the REQUESTED URL/query (not"
echo "         just the mocked response body), a project-ref-divergence attempt, ignoring an"
echo "         env-var dry-run trigger, and a generic (non-404) HTTP-error branch."
FC_MOCKBIN="$(mktemp -d)"
# The mock now simulates the get-BY-ID endpoint (GET /auth/v1/admin/users/<id>), matching the
# script's real query since code review cycle 2 -- a single-object response, or HTTP 404 for
# "absent" (there is no list-based "users:[]" shape for a get-by-id call). It also logs every
# requested URL so a test can assert the script queried the right endpoint, not just that it
# produced the right verdict for a given canned body.
cat > "$FC_MOCKBIN/curl" <<'CURLMOCK'
#!/usr/bin/env bash
CFG="$(cat)"   # consume --config stdin
URL="$(printf '%s\n' "$CFG" | sed -n 's/^url = "\(.*\)"$/\1/p' | head -n1)"
printf '%s\n' "$URL" >> "${CURL_URL_LOG:-/dev/null}"
printf '%s' "${MOCK_LOOKUP_BODY:-{}}"
printf '\n%s' "${MOCK_LOOKUP_STATUS:-200}"
CURLMOCK
chmod +x "$FC_MOCKBIN/curl"
cat > "$FC_MOCKBIN/psql" <<'PSQLMOCK'
#!/usr/bin/env bash
echo "PSQL_CALLED: $*" >> "${PSQL_CALL_LOG:-/dev/null}"
# Consume stdin if any was piped (e.g. a future `-f -` invocation) so a caller relying on stdin
# being drained never blocks on this mock -- a real psql would consume it too.
if [ ! -t 0 ]; then cat >/dev/null; fi
exit 0
PSQLMOCK
chmod +x "$FC_MOCKBIN/psql"

FC_FAIL=0
EXPECTED_ID_URL_SUFFIX="/auth/v1/admin/users/${UUID}"
MATCH_BODY='{"id":"'"$UUID"'","email":"testdealer@example.com"}'
MISMATCH_BODY='{"id":"'"$UUID"'","email":"someoneelse@example.com"}'

run_provision_with_mock() {
  # $1=MOCK_LOOKUP_STATUS $2=MOCK_LOOKUP_BODY $3=url-log-path $4...=extra env assignments
  #
  # NOTE: extra assignments arrive via "$@" (a function's positional params after an
  # expansion), so they CANNOT be written directly as a literal command-prefix
  # ("VAR=val "$@"" -- bash's assignment-prefix recognition is a parse-time-only syntax
  # rule and never applies to words produced by expansion, so that form would instead
  # try to literally EXECUTE "VAR=val" as a command and fail with "command not found").
  # Routing them through the `env` builtin/external is what actually sets them.
  #
  # "${@+"$@"}", not a bare "$@", because most call sites here pass ZERO extra args --
  # under this file's own `set -u`, a bare "$@" with zero positional params can raise
  # "unbound variable" on bash < 4.4 (this repo's own e2e-auth-common.sh already avoids
  # other bash-3.2-specific pitfalls for the same reason: macOS ships 3.2 as /bin/bash).
  # "${@+"$@"}" expands to nothing when empty and to "$@" unchanged otherwise.
  local status="$1" body="$2" urllog="$3"; shift 3
  PATH="$FC_MOCKBIN:$PATH" MOCK_LOOKUP_STATUS="$status" MOCK_LOOKUP_BODY="$body" CURL_URL_LOG="$urllog" \
    IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY=fake env ${@+"$@"} \
    bash "$REPO/scripts/dev/provision-import-owner-identity.sh"
}

URLLOG1="$(mktemp)"
FC_OUT1="$(run_provision_with_mock 404 '{}' "$URLLOG1" 2>&1)"; FC_RC1=$?
if [ "$FC_RC1" -ne 0 ] && printf '%s' "$FC_OUT1" | LC_ALL=C fgrep -q 'No auth.users row with id'; then
  echo "  PASS: absent identity (HTTP 404) -> provision-import-owner-identity.sh exits non-zero with an actionable message"
else
  echo "  FAIL: absent-identity check (rc=$FC_RC1): $FC_OUT1"; FC_FAIL=1
fi
if LC_ALL=C fgrep -q "$EXPECTED_ID_URL_SUFFIX" "$URLLOG1" && ! LC_ALL=C fgrep -q 'email=' "$URLLOG1"; then
  echo "  PASS: absent-identity check queried GET .../admin/users/<id> (get-by-id), NOT ?email="
else
  echo "  FAIL: absent-identity check queried the wrong endpoint -- requested URL(s): $(cat "$URLLOG1")"; FC_FAIL=1
fi
rm -f "$URLLOG1"

URLLOG2="$(mktemp)"
FC_OUT2="$(run_provision_with_mock 200 "$MISMATCH_BODY" "$URLLOG2" 2>&1)"; FC_RC2=$?
if [ "$FC_RC2" -ne 0 ] && printf '%s' "$FC_OUT2" | LC_ALL=C fgrep -q 'does not match'; then
  echo "  PASS: email mismatch (id exists under a different email) -> exits non-zero, names the mismatch"
else
  echo "  FAIL: email-mismatch check (rc=$FC_RC2): $FC_OUT2"; FC_FAIL=1
fi
rm -f "$URLLOG2"

URLLOG3="$(mktemp)"
FC_OUT3="$(run_provision_with_mock 200 "$MATCH_BODY" "$URLLOG3" 2>&1)"; FC_RC3=$?
if [ "$FC_RC3" -eq 0 ]; then
  echo "  PASS: matching identity -> provision-import-owner-identity.sh exits 0"
else
  echo "  FAIL: matching-identity check should exit 0 (rc=$FC_RC3): $FC_OUT3"; FC_FAIL=1
fi
if LC_ALL=C fgrep -q "$EXPECTED_ID_URL_SUFFIX" "$URLLOG3" && ! LC_ALL=C fgrep -q 'email=' "$URLLOG3"; then
  echo "  PASS: matching-identity check also queried GET .../admin/users/<id>, NOT ?email="
else
  echo "  FAIL: matching-identity check queried the wrong endpoint -- requested URL(s): $(cat "$URLLOG3")"; FC_FAIL=1
fi
rm -f "$URLLOG3"

URLLOG_HTTP500="$(mktemp)"
FC_OUT_HTTP500="$(run_provision_with_mock 500 '{"error":"internal"}' "$URLLOG_HTTP500" 2>&1)"; FC_RC_HTTP500=$?
if [ "$FC_RC_HTTP500" -ne 0 ] && printf '%s' "$FC_OUT_HTTP500" | LC_ALL=C fgrep -q 'returned HTTP 500' \
   && ! printf '%s' "$FC_OUT_HTTP500" | LC_ALL=C fgrep -q 'No auth.users row with id'; then
  echo "  PASS: generic HTTP error (500, not 404) -> exits non-zero with a generic-failure message, not misreported as absence"
else
  echo "  FAIL: generic-HTTP-error check (rc=$FC_RC_HTTP500): $FC_OUT_HTTP500"; FC_FAIL=1
fi
rm -f "$URLLOG_HTTP500"

# Defensive branch coverage: the Admin API responds (HTTP 200) to a request for OUR id with a
# body claiming a DIFFERENT id -- an untrustworthy/malformed response the script must not accept
# on faith. This exact fixture used to be repurposed for the email-mismatch case above in the
# earlier by-email design; the by-id rewrite (cycle 2) left this specific branch uncovered.
ID_MISMATCH_BODY='{"id":"99999999-9999-9999-9999-999999999999","email":"testdealer@example.com"}'
URLLOG_IDMISMATCH="$(mktemp)"
FC_OUT_IDMISMATCH="$(run_provision_with_mock 200 "$ID_MISMATCH_BODY" "$URLLOG_IDMISMATCH" 2>&1)"; FC_RC_IDMISMATCH=$?
if [ "$FC_RC_IDMISMATCH" -ne 0 ] && printf '%s' "$FC_OUT_IDMISMATCH" | LC_ALL=C fgrep -q 'did not echo that same id back'; then
  echo "  PASS: response echoes back a DIFFERENT id than requested -> exits non-zero, treated as untrustworthy"
else
  echo "  FAIL: id-echo-mismatch check (rc=$FC_RC_IDMISMATCH): $FC_OUT_IDMISMATCH"; FC_FAIL=1
fi
rm -f "$URLLOG_IDMISMATCH"

# IMPORT_OWNER_DRY_RUN=1 must be IGNORED (no env-var dry-run trigger, CLI flag only) -- an
# absent-identity mock must still fail closed even with that var set in the environment.
URLLOG_ENVDRYRUN="$(mktemp)"
FC_OUT_ENVDRYRUN="$(run_provision_with_mock 404 '{}' "$URLLOG_ENVDRYRUN" IMPORT_OWNER_DRY_RUN=1 2>&1)"; FC_RC_ENVDRYRUN=$?
if [ "$FC_RC_ENVDRYRUN" -ne 0 ] && printf '%s' "$FC_OUT_ENVDRYRUN" | LC_ALL=C fgrep -q 'dry-run=false'; then
  echo "  PASS: IMPORT_OWNER_DRY_RUN=1 in the environment is ignored -- still fails closed on an absent identity"
else
  echo "  FAIL: IMPORT_OWNER_DRY_RUN=1 should be ignored (rc=$FC_RC_ENVDRYRUN): $FC_OUT_ENVDRYRUN"; FC_FAIL=1
fi
rm -f "$URLLOG_ENVDRYRUN"

run_seed_with_mock() {
  # $1=MOCK_LOOKUP_STATUS $2=MOCK_LOOKUP_BODY $3=psql-log-path $4...=extra env assignments
  # (see run_provision_with_mock's NOTE above for why this goes through `env`, and for
  # why "${@+"$@"}" rather than a bare "$@".)
  #
  # REMOTE_DEV_DB_HOST/_PORT/_NAME are pinned to a local, unreachable target -- NOT the
  # real shared remote-dev pooler -- so that if the mocked psql on PATH were ever
  # absent/unexecutable (e.g. a noexec tmp mount), a "should reach psql" arm fails fast
  # and locally instead of silently attempting a real network connection to shared
  # infrastructure. REMOTE_DEV_DB_USER is deliberately left at its default: it must stay
  # exactly "postgres.elyqnysyqbqoxqqrpiir" for the EXPECTED_DEV_PG_USER guard (and this
  # file's own HIGH-1 divergence test, which asserts on that exact derived ref) to mean
  # anything.
  local status="$1" body="$2" psqllog="$3"; shift 3
  PATH="$FC_MOCKBIN:$PATH" MOCK_LOOKUP_STATUS="$status" MOCK_LOOKUP_BODY="$body" PSQL_CALL_LOG="$psqllog" \
    ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED=true TARGET_ENV=remote-dev REMOTE_DEV_DB_PASSWORD=fake-test-password \
    REMOTE_DEV_DB_HOST=127.0.0.1 REMOTE_DEV_DB_PORT=1 REMOTE_DEV_DB_NAME=nonexistent_test_db \
    IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY=fake env ${@+"$@"} \
    bash "$REPO/scripts/db/seed-remote-dev-udupi-listings.sh"
}

PSQL_LOG_ABSENT="$(mktemp)"; SEED_LOG_ABSENT="$(mktemp)"
run_seed_with_mock 404 '{}' "$PSQL_LOG_ABSENT" >"$SEED_LOG_ABSENT" 2>&1; FC_RC4=$?
if [ "$FC_RC4" -ne 0 ] && [ ! -s "$PSQL_LOG_ABSENT" ]; then
  echo "  PASS: seed-remote-dev-udupi-listings.sh aborts before psql when identity is absent"
else
  echo "  FAIL: seed script should abort before psql on absent identity (rc=$FC_RC4, psql-log-bytes=$(wc -c < "$PSQL_LOG_ABSENT")): $(cat "$SEED_LOG_ABSENT")"; FC_FAIL=1
fi
rm -f "$PSQL_LOG_ABSENT" "$SEED_LOG_ABSENT"

PSQL_LOG_MISMATCH="$(mktemp)"; SEED_LOG_MISMATCH="$(mktemp)"
run_seed_with_mock 200 "$MISMATCH_BODY" "$PSQL_LOG_MISMATCH" >"$SEED_LOG_MISMATCH" 2>&1; FC_RC5=$?
if [ "$FC_RC5" -ne 0 ] && [ ! -s "$PSQL_LOG_MISMATCH" ]; then
  echo "  PASS: seed-remote-dev-udupi-listings.sh aborts before psql when identity email mismatches"
else
  echo "  FAIL: seed script should abort before psql on email mismatch (rc=$FC_RC5, psql-log-bytes=$(wc -c < "$PSQL_LOG_MISMATCH")): $(cat "$SEED_LOG_MISMATCH")"; FC_FAIL=1
fi
rm -f "$PSQL_LOG_MISMATCH" "$SEED_LOG_MISMATCH"

PSQL_LOG_MATCH="$(mktemp)"; SEED_LOG_MATCH="$(mktemp)"
run_seed_with_mock 200 "$MATCH_BODY" "$PSQL_LOG_MATCH" >"$SEED_LOG_MATCH" 2>&1; FC_RC6=$?
if [ "$FC_RC6" -eq 0 ] && [ -s "$PSQL_LOG_MATCH" ]; then
  echo "  PASS: seed-remote-dev-udupi-listings.sh proceeds to (mocked) psql when identity matches (guard is not overly strict)"
else
  echo "  FAIL: seed script should proceed to psql when identity matches (rc=$FC_RC6, psql-log-bytes=$(wc -c < "$PSQL_LOG_MATCH")): $(cat "$SEED_LOG_MATCH")"; FC_FAIL=1
fi
rm -f "$PSQL_LOG_MATCH" "$SEED_LOG_MATCH"

# HIGH-1 regression test: a caller-supplied IMPORT_OWNER_SUPABASE_PROJECT_REF/_URL pointing at a
# DIFFERENT project must have NO effect -- the seed script must force-derive both from its own
# validated PG_USER and query ONLY that project, never the attacker/misconfigured override.
URLLOG_DIVERGE="$(mktemp)"; PSQL_LOG_DIVERGE="$(mktemp)"; SEED_LOG_DIVERGE="$(mktemp)"
PATH="$FC_MOCKBIN:$PATH" MOCK_LOOKUP_STATUS=200 MOCK_LOOKUP_BODY="$MATCH_BODY" CURL_URL_LOG="$URLLOG_DIVERGE" \
  PSQL_CALL_LOG="$PSQL_LOG_DIVERGE" \
  ALLOW_REMOTE_DEV_UDUPI_LISTINGS_SEED=true TARGET_ENV=remote-dev REMOTE_DEV_DB_PASSWORD=fake-test-password \
  REMOTE_DEV_DB_HOST=127.0.0.1 REMOTE_DEV_DB_PORT=1 REMOTE_DEV_DB_NAME=nonexistent_test_db \
  IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY=fake \
  IMPORT_OWNER_SUPABASE_PROJECT_REF=attacker-controlled-project \
  IMPORT_OWNER_SUPABASE_URL=https://attacker-controlled-project.supabase.co \
  bash "$REPO/scripts/db/seed-remote-dev-udupi-listings.sh" >"$SEED_LOG_DIVERGE" 2>&1; FC_RC7=$?
if [ "$FC_RC7" -eq 0 ] && LC_ALL=C fgrep -q 'elyqnysyqbqoxqqrpiir' "$URLLOG_DIVERGE" \
   && ! LC_ALL=C fgrep -q 'attacker-controlled-project' "$URLLOG_DIVERGE"; then
  echo "  PASS: a pre-set IMPORT_OWNER_SUPABASE_PROJECT_REF/_URL override has NO effect -- the guard queried the PG_USER-derived project, not the override"
else
  echo "  FAIL: project-ref divergence was not rejected (rc=$FC_RC7) -- requested URL(s): $(cat "$URLLOG_DIVERGE"), seed log: $(cat "$SEED_LOG_DIVERGE")"; FC_FAIL=1
fi
rm -f "$URLLOG_DIVERGE" "$PSQL_LOG_DIVERGE" "$SEED_LOG_DIVERGE"

rm -rf "$FC_MOCKBIN"
if [ "$FC_FAIL" -eq 0 ]; then echo "  -> PASS (fail-closed checks section)"; else echo "  -> FAIL (fail-closed checks section)"; fi

echo "### 2. GREEN (#2307) -- seed the import-owner identity, standing in for a real verify script"
echo "         confirming it present with the correct id (this container has no GoTrue Admin API"
echo "         for 1b's script to call for real; 1a/1b above already prove the FK/trigger and the"
echo "         verify script's own logic independently)."
run -q -c "INSERT INTO auth.users (id, email) VALUES ('$UUID','$SEED_EMAIL')
           ON CONFLICT (id) DO NOTHING;" >/dev/null || exit 1

echo "### 3. GREEN (#2307) -- apply area-seed.sql + import.sql now that the identity is present (pass 1)"
echo "     NOTE: if this step fails on assert_commercial_subtype_projected for listing"
echo "     15bd7df2-b578-6405-ca23-8f39f794d572 (99acres Y92487718), that is the known,"
echo "     pre-existing, separately-tracked #2690 (cross-ref #2580 item 7) defect (see header) --"
echo "     not a regression in whatever this run is validating. It means the identity"
echo "     precondition itself is fine; #1a/#1b above already isolate and prove that claim. This"
echo "     script distinguishes that EXACT known signature from any other failure here (see the"
echo "     0/1/2 exit-code contract in the header) rather than treating every failure at this"
echo "     point alike."
run -q -f - < "$IMP/area-seed.sql" || exit 1
GREEN_ERR="$(mktemp)"
if ! run -q -f - < "$IMP/import.sql" >/dev/null 2>"$GREEN_ERR"; then
  if LC_ALL=C fgrep -q 'assert_commercial_subtype_projected' "$GREEN_ERR" \
     && LC_ALL=C fgrep -q '15bd7df2-b578-6405-ca23-8f39f794d572' "$GREEN_ERR"; then
    echo "  KNOWN_BLOCKER (#2690, cross-ref #2580 item 7): import.sql failed on exactly the"
    echo "  already-documented assert_commercial_subtype_projected trigger for listing"
    echo "  15bd7df2-b578-6405-ca23-8f39f794d572 (99acres Y92487718). This is NOT a #2307"
    echo "  regression -- #2307's own logic (steps 1a RED + 1b fail-closed) has ALREADY PASSED"
    echo "  above, independent of this. Steps 4-10 below depend on this apply having succeeded"
    echo "  and cannot produce a meaningful signal while it hasn't, so they are skipped."
    rm -f "$GREEN_ERR"
    exit 2
  fi
  echo "  GREEN CHECK FAILED: import.sql failed on an UNEXPECTED error (not the known #2690"
  echo "  signature) -- this may be a real regression. Real error:"
  cat "$GREEN_ERR"
  rm -f "$GREEN_ERR"
  exit 1
fi
rm -f "$GREEN_ERR"

echo "### 4. assertions"
run <<SQL
\echo '--- A1 imported listing count (expect 104)'
SELECT count(*) AS listings, CASE WHEN count(*)=104 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM property_listings WHERE created_by='$UUID';

\echo '--- A2 COMMERCIAL listings JOIN listing_commercial_space_details (expect 11=11, 0 missing)'
SELECT count(*) AS commercial_listings,
       count(d.listing_id) AS detail_rows,
       count(*)-count(d.listing_id) AS listings_without_detail,
       CASE WHEN count(*)=11 AND count(*)=count(d.listing_id) THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM property_listings l
LEFT JOIN listing_commercial_space_details d ON d.listing_id=l.id
WHERE l.created_by='$UUID' AND l.listing_family='COMMERCIAL';

\echo '--- A2b detail rows attached to a NON-commercial imported listing (expect 0)'
SELECT count(*) AS orphans, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM listing_commercial_space_details d JOIN property_listings l ON l.id=d.listing_id
WHERE l.created_by='$UUID' AND l.listing_family<>'COMMERCIAL';

\echo '--- A3 commercial_subtype == ListingController#resolveCommercialSubtype(property_type)'
SELECT l.property_type, d.commercial_subtype, count(*) AS rows
FROM property_listings l JOIN listing_commercial_space_details d ON d.listing_id=l.id
WHERE l.created_by='$UUID' GROUP BY 1,2 ORDER BY 1;
SELECT count(*) AS mismatches, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM property_listings l JOIN listing_commercial_space_details d ON d.listing_id=l.id
WHERE l.created_by='$UUID'
  AND (d.commercial_subtype IS DISTINCT FROM CASE l.property_type
         WHEN 'commercial_building' THEN 'BUILDING' WHEN 'warehouse' THEN 'WAREHOUSE'
         WHEN 'commercial_land' THEN 'LAND' WHEN 'commercial' THEN 'SHOP' END
    OR d.commercial_subtype NOT IN ('SHOP','OFFICE','BUILDING','WAREHOUSE','LAND'));

\echo '--- A3b flat property_listings columns == detail row columns (round-trip precondition)'
SELECT count(*) AS flat_vs_detail_diffs, CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM property_listings l JOIN listing_commercial_space_details d ON d.listing_id=l.id
WHERE l.created_by='$UUID'
  AND (l.commercial_subtype IS DISTINCT FROM d.commercial_subtype
    OR l.floor_number      IS DISTINCT FROM d.floor_number
    OR l.total_floors      IS DISTINCT FROM d.total_floors
    OR l.furnishing_status IS DISTINCT FROM d.furnishing_status
    OR l.washrooms         IS DISTINCT FROM d.washrooms
    OR l.parking_count     IS DISTINCT FROM d.parking_count
    OR l.road_frontage_ft  IS DISTINCT FROM d.road_frontage_ft
    OR l.commercial_usage  IS DISTINCT FROM d.commercial_usage);

\echo '--- A5 V117 provenance (expect 104 RESOLVED/CANONICAL_KEY, 0 anything else)'
SELECT count(*) FILTER (WHERE area_resolution_status='RESOLVED'
                          AND area_resolution_method='CANONICAL_KEY') AS resolved_canonical,
       count(*) FILTER (WHERE area_resolution_status IS DISTINCT FROM 'RESOLVED'
                           OR area_resolution_method IS DISTINCT FROM 'CANONICAL_KEY') AS other,
       CASE WHEN count(*) FILTER (WHERE area_resolution_status='RESOLVED'
                                    AND area_resolution_method='CANONICAL_KEY')=104
             AND count(*)=104 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM property_listings WHERE created_by='$UUID';

\echo '--- A5b every imported area_key resolves to an ACTIVE row in public.areas'
-- V117 defines CANONICAL_KEY as an exact match on the ACTIVE areas.area_key, so the lifecycle
-- filter is part of the claim being made: a key matching only a MERGED or INACTIVE area
-- (areas.lifecycle_status, V116) would not be a canonical resolution.
SELECT count(*) AS unmatched_active_area_keys,
       CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM property_listings l
LEFT JOIN areas a ON a.area_key=l.area_key AND a.lifecycle_status='ACTIVE'
WHERE l.created_by='$UUID' AND a.area_key IS NULL;
SQL

echo "### 5. A4 round-trip through the live typed path"
run <<SQL
-- Replays exactly what CommercialSpaceDetailRepository#upsertFromListing runs on an edit:
-- same INSERT ... ON CONFLICT (listing_id) DO UPDATE SET col = EXCLUDED.col, no COALESCE, with
-- every value sourced from the FLAT property_listings columns (what
-- ListingCrudService#refreshTypedProjections passes). Byte-identical before/after == an app
-- edit is a no-op rather than a data wipe.
DROP TABLE IF EXISTS rt_before;
CREATE TABLE rt_before AS
  SELECT d.* FROM listing_commercial_space_details d
  JOIN property_listings l ON l.id=d.listing_id WHERE l.created_by='$UUID';

INSERT INTO listing_commercial_space_details
    (listing_id, commercial_subtype, floor_number, total_floors, furnishing_status,
     washrooms, parking_count, road_frontage_ft, commercial_usage)
SELECT l.id, l.commercial_subtype, l.floor_number, l.total_floors, l.furnishing_status,
       l.washrooms, l.parking_count, l.road_frontage_ft, l.commercial_usage
FROM property_listings l WHERE l.created_by='$UUID' AND l.listing_family='COMMERCIAL'
ON CONFLICT (listing_id) DO UPDATE SET
    commercial_subtype=EXCLUDED.commercial_subtype, floor_number=EXCLUDED.floor_number,
    total_floors=EXCLUDED.total_floors,           furnishing_status=EXCLUDED.furnishing_status,
    washrooms=EXCLUDED.washrooms,                 parking_count=EXCLUDED.parking_count,
    road_frontage_ft=EXCLUDED.road_frontage_ft,   commercial_usage=EXCLUDED.commercial_usage;

\echo '--- A4 symmetric difference before vs after (expect 0 / 0 over 11 rows)'
WITH after_rows AS (
  SELECT d.* FROM listing_commercial_space_details d
  JOIN property_listings l ON l.id=d.listing_id WHERE l.created_by='$UUID')
SELECT (SELECT count(*) FROM (SELECT * FROM rt_before EXCEPT ALL SELECT * FROM after_rows) a) AS lost,
       (SELECT count(*) FROM (SELECT * FROM after_rows EXCEPT ALL SELECT * FROM rt_before) b) AS gained,
       (SELECT count(*) FROM after_rows) AS rows,
       CASE WHEN (SELECT count(*) FROM (SELECT * FROM rt_before EXCEPT ALL SELECT * FROM after_rows) a)=0
             AND (SELECT count(*) FROM (SELECT * FROM after_rows EXCEPT ALL SELECT * FROM rt_before) b)=0
             AND (SELECT count(*) FROM after_rows)=11 THEN 'PASS' ELSE 'FAIL' END AS verdict;

\echo '--- A4-control the SAME replay DOES wipe a row whose flat columns are NULL (proves A4 has teeth)'
DROP TABLE IF EXISTS rt_ctl;
CREATE TABLE rt_ctl AS SELECT id FROM property_listings
  WHERE created_by='$UUID' AND listing_family='COMMERCIAL' AND total_floors IS NOT NULL LIMIT 1;
UPDATE property_listings SET commercial_subtype=NULL, total_floors=NULL WHERE id IN (SELECT id FROM rt_ctl);
INSERT INTO listing_commercial_space_details (listing_id, commercial_subtype, total_floors)
SELECT l.id, l.commercial_subtype, l.total_floors FROM property_listings l WHERE l.id IN (SELECT id FROM rt_ctl)
ON CONFLICT (listing_id) DO UPDATE SET
    commercial_subtype=EXCLUDED.commercial_subtype, total_floors=EXCLUDED.total_floors;
SELECT d.listing_id, d.commercial_subtype, d.total_floors,
       CASE WHEN d.commercial_subtype IS NULL AND d.total_floors IS NULL
            THEN 'PASS (control wiped as predicted)'
            ELSE 'FAIL (control survived -> A4 would be vacuous)' END AS verdict
FROM listing_commercial_space_details d WHERE d.listing_id IN (SELECT id FROM rt_ctl);
DROP TABLE rt_before; DROP TABLE rt_ctl;
SQL

echo "### 6. A7 rollback (the control above left mutated state; rollback clears everything)"
run -q -f - < "$IMP/rollback.sql" || exit 1
run <<SQL
\echo '--- A7 residual rows for this import (expect 0 everywhere)'
SELECT (SELECT count(*) FROM property_listings WHERE created_by='$UUID'
          OR parsed_data->>'importIssue'='2304')                       AS listings,
       (SELECT count(*) FROM listing_images WHERE storage_path LIKE 'external:%') AS images,
       (SELECT count(*) FROM listing_commercial_space_details)         AS commercial_details,
       (SELECT count(*) FROM profiles WHERE user_id='$UUID')           AS profiles,
       CASE WHEN (SELECT count(*) FROM property_listings WHERE created_by='$UUID')=0
             AND (SELECT count(*) FROM listing_images WHERE storage_path LIKE 'external:%')=0
             AND (SELECT count(*) FROM listing_commercial_space_details)=0
             AND (SELECT count(*) FROM profiles WHERE user_id='$UUID')=0
            THEN 'PASS' ELSE 'FAIL' END AS verdict;
SQL
echo "  (listing_commercial_space_details needs no explicit DELETE: its listing_id PK is"
echo "   REFERENCES property_listings(id) ON DELETE CASCADE — the 0 above is that cascade.)"

echo "### 7. A6 idempotency — apply twice from the clean post-rollback state"
run -q -f - < "$IMP/area-seed.sql" || exit 1
run -q -f - < "$IMP/import.sql"    || exit 1
run -q -f - < "$IMP/area-seed.sql" || exit 1
run -q -f - < "$IMP/import.sql"    || exit 1
run <<SQL
\echo '--- A6 counts after TWO applies (expect 104 / 260 / 11 / 1)'
SELECT (SELECT count(*) FROM property_listings WHERE created_by='$UUID') AS listings,
       (SELECT count(*) FROM listing_images i JOIN property_listings l ON l.id=i.listing_id
          WHERE l.created_by='$UUID')                                    AS images,
       (SELECT count(*) FROM listing_commercial_space_details)           AS commercial_details,
       (SELECT count(*) FROM profiles WHERE user_id='$UUID')             AS profiles,
       CASE WHEN (SELECT count(*) FROM property_listings WHERE created_by='$UUID')=104
             AND (SELECT count(*) FROM listing_images i JOIN property_listings l ON l.id=i.listing_id
                    WHERE l.created_by='$UUID')=260
             AND (SELECT count(*) FROM listing_commercial_space_details)=11
             AND (SELECT count(*) FROM profiles WHERE user_id='$UUID')=1
            THEN 'PASS (second apply added 0 rows)' ELSE 'FAIL' END AS verdict;
SQL

echo "### 8. A10 committed SQL == generator output (no hand-edited drift)"
python3 - "$IMP" "$WORK/regen" <<'PY'
import hashlib, os, shutil, subprocess, sys
imp, work = sys.argv[1], sys.argv[2]
files = ("import.sql", "area-seed.sql", "rollback.sql")

# Run the generator in a THROWAWAY copy, never in the repo. After the C1 fix generate_sql.py
# writes next to itself, so running it in place would overwrite the very artefact whose drift
# is being measured — on real drift the old check printed DRIFT having already destroyed the
# evidence, and contradicted this script's promise not to touch the working tree.
shutil.rmtree(work, ignore_errors=True)
os.makedirs(work)
for f in os.listdir(imp):
    src = os.path.join(imp, f)
    if os.path.isfile(src):
        shutil.copy(src, work)

sha = lambda d, f: hashlib.sha256(open(os.path.join(d, f), 'rb').read()).hexdigest()
committed = {f: sha(imp, f) for f in files}
r = subprocess.run([sys.executable, os.path.join(work, "generate_sql.py")],
                   capture_output=True, text=True)
if r.returncode != 0:
    print("  generator failed:", r.stderr.strip()[-400:])
regenerated = {f: sha(work, f) for f in files}
for f in files:
    print(f"  {f}: {'SAME' if committed[f]==regenerated[f] else 'DRIFT'}  {regenerated[f]}")
print("  ->", "PASS" if committed == regenerated and r.returncode == 0 else "FAIL")

# The working tree must be byte-identical to how we found it.
untouched = all(sha(imp, f) == committed[f] for f in files)
print(f"  committed artefacts left untouched: {untouched}",
      "" if untouched else "-> FAIL")
PY

echo "### 9. A11 fail-closed PII residuals sweep over every committed artefact"
# Exit 1 and exit 2 mean different things and must not be reported as the same thing. An earlier
# revision ran `... || echo "  -> FAIL (residuals found)"`, and `||` fires on ANY non-zero — so a
# coverage-floor failure (exit 2: the sweep examined nothing, e.g. a moved or mistyped $IMP) was
# announced as a residuals finding. That sends a reader hunting for PII that was never reported,
# and hides the real fault, which is that the gate did not run. Both branches still print the
# literal FAIL, which is what the transcript scan at the top of this script matches on.
# Status alone is still not enough to name the failure: Python exits 1 on an unhandled
# exception too, so a CRASHED gate would be announced as "residuals found" with no findings
# above it — narrower than the bug this replaced, identical in shape. The verdict marker is the
# discriminator: the gate prints a PII_RESIDUALS: line on every path it completes, and on none
# where it dies. Require both the marker and exit 1 before claiming residuals.
_pii_out="$(mktemp)"
python3 "$IMP/pii_residuals.py" --dir "$IMP" > "$_pii_out" 2>&1; _pii_rc=$?
cat "$_pii_out"
if [ "$_pii_rc" -eq 0 ]; then
  :
elif [ "$_pii_rc" -eq 1 ] && LC_ALL=C grep -qF 'PII_RESIDUALS:' "$_pii_out"; then
  echo "  -> FAIL (residuals found — see the findings listed above)"
else
  # Do NOT claim "no verdict line" here. The coverage-floor path DOES print a PII_RESIDUALS:
  # line (to stderr, folded in above), it just exits 2 rather than 1 — so an earlier wording
  # asserting the line was absent was false for the commonest case reaching this branch. In a
  # script whose subject is a gate that described itself incorrectly, that is not a detail to
  # leave wrong. Say only what is known: no residuals verdict at exit 1.
  echo "  -> FAIL (no residuals verdict, exit $_pii_rc — coverage floor, usage error or crash; see the output above for which. NOT a residuals finding)"
fi
rm -f "$_pii_out"

echo "### 10. PII detector regression fixture"
# Symmetric with step 9, for the same reason: `||` fires on ANY non-zero, so a CRASHED fixture
# and a genuine detector regression were announced identically — the exact conflation step 9
# removed, left standing in the step that validates the detector this work is about. The fixture
# prints a PII_FILTER_SELFTEST: line on every path it completes and on none where it dies, so
# that marker is the discriminator. It fails closed either way; what was wrong was the NAME it
# gave the failure, which sends a reader hunting for a regression that never happened.
_fx_out="$(mktemp)"
python3 "$IMP/test_pii_filter.py" > "$_fx_out" 2>&1; _fx_rc=$?
cat "$_fx_out"
if [ "$_fx_rc" -eq 0 ]; then
  :
elif [ "$_fx_rc" -eq 1 ] && LC_ALL=C grep -qF 'PII_FILTER_SELFTEST:' "$_fx_out"; then
  echo "  -> FAIL (detector regression — see the failing cases above)"
else
  echo "  -> FAIL (fixture did not complete, exit $_fx_rc — crash or usage error, NOT a detector regression)"
fi
rm -f "$_fx_out"

echo
echo "done. container '$CT' left running for inspection; docker rm -f $CT to remove."
