#!/usr/bin/env bash
# Issue #2304 Slice 1 — reproducible validation of the Udupi import artefacts.
#
# Brings up an ephemeral postgis/postgis:15-3.4 container, applies EVERY Flyway migration from
# backend/src/main/resources/db/migration, then area-seed.sql + import.sql, and asserts the
# contract the PR claims. Committed alongside the artefacts because this container run is the
# ONLY proof mechanism for a data-import PR (no application code changes, so no unit/E2E test
# can cover it) — a reviewer must be able to re-run it rather than take the numbers on trust.
#
#   Usage:  bash data/imports/udupi-properties-2304/validate.sh
#   Exit :  0 = every assertion passed, 1 = at least one FAILed (or a step errored)
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
#   1. backend/src/test/resources/db/test-stubs/beforeMigrate.sql — the same Supabase auth
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
MIG="$REPO/backend/src/main/resources/db/migration"
STUBS="$REPO/backend/src/test/resources/db/test-stubs/beforeMigrate.sql"
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

echo "### 2. seed identity (environment prep — see header)"
run -q -c "INSERT INTO auth.users (id, email) VALUES ('$UUID','$SEED_EMAIL')
           ON CONFLICT (id) DO NOTHING;" >/dev/null || exit 1

echo "### 3. apply area-seed.sql + import.sql (pass 1)"
run -q -f - < "$IMP/area-seed.sql" || exit 1
run -q -f - < "$IMP/import.sql"    || exit 1

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
python3 "$IMP/pii_residuals.py" --dir "$IMP" || echo "  -> FAIL (residuals found)"

echo "### 10. PII detector regression fixture"
python3 "$IMP/test_pii_filter.py" || echo "  -> FAIL (detector regression)"

echo
echo "done. container '$CT' left running for inspection; docker rm -f $CT to remove."
