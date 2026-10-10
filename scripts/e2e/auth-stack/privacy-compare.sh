#!/usr/bin/env bash
# scripts/e2e/auth-stack/privacy-compare.sh - issue #2750 FC-27c: REFERENCE (Flyway-only) vs OVERLAY column privileges.
# Env: AUTH_PG_PORT AUTH_PG_PASSWORD [REF_DB=fixture_reference] [OVERLAY_DB=postgres]
#      The snapshot SQL is always privacy-snapshot.sql next to this script (no override; PRIVACY_SNAPSHOT_SQL is ignored here
#      and refused by scripts/run-e2e-gate.sh).
# Exit 0 only if (0) each snapshot passes the POSITIVE CONTROL (it really holds the section-A probe lines and the
# property_listings.total_columns= line: a snapshot of two failed/empty psql runs is identical and must NOT pass),
# (1) the reference itself shows the revoked columns NOT reachable (the migrations' intended state),
# (2) sections A,B,C,E are byte-identical between the two databases. Never widens anything; read-only. Fail-closed.
set -uo pipefail
SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${AUTH_PG_PORT:?}" "${AUTH_PG_PASSWORD:?}"
REF_DB="${REF_DB:-fixture_reference}"; OVERLAY_DB="${OVERLAY_DB:-postgres}"
SNAP_SQL="$SD/privacy-snapshot.sql"   # FIXED relative to this script: no env override can swap in a different snapshot SQL (CR r2 cycle2 LOW-E)
# ON_ERROR_STOP: a SQL error inside the snapshot must make psql exit non-zero (exit 2 below), never print a partial snapshot.
snap() { PGPASSWORD="$AUTH_PG_PASSWORD" psql -h localhost -p "$AUTH_PG_PORT" -U postgres -d "$1" -X -q -v ON_ERROR_STOP=1 -f "$SNAP_SQL"; }
REF="$(snap "$REF_DB")" || { echo "privacy-compare: reference snapshot failed" >&2; exit 2; }
OVL="$(snap "$OVERLAY_DB")" || { echo "privacy-compare: overlay snapshot failed" >&2; exit 2; }
cut_d() { printf '%s\n' "$1" | sed '/^== D\./,$d'; }
# POSITIVE CONTROL. Section A must hold exactly 16 lines (2 roles x 2 columns x 4 privileges), every one `=false`, and the
# snapshot must carry its property_listings.total_columns=<n> line. Without this, an empty/erroring pair of snapshots would be
# byte-identical and both "no revoked column readable" checks below would pass vacuously.
positive_control() { # <label> <snapshot-text>; prints a line, returns 0 when the snapshot is the real thing
  local label="$1" snap_text="$2" a_false a_any tc
  a_false="$(printf '%s\n' "$snap_text" | grep -cE '^(anon|authenticated)\.contact_(phone|info)\.(SELECT|INSERT|UPDATE|REFERENCES)=false$')"
  a_any="$(printf '%s\n' "$snap_text" | grep -cE '^(anon|authenticated)\.contact_(phone|info)\.(SELECT|INSERT|UPDATE|REFERENCES)=')"
  tc="$(printf '%s\n' "$snap_text" | grep -cE '^property_listings\.total_columns=[0-9]+$')"
  if [ "$a_false" -eq 16 ] && [ "$a_any" -eq 16 ] && [ "$tc" -eq 1 ]; then
    echo "PASS positive control ($label): 16 section-A contact_*=false lines and a property_listings.total_columns= line present"; return 0
  fi
  echo "FAIL positive control ($label): section-A =false lines=$a_false (all section-A lines=$a_any, expected 16/16) total_columns lines=$tc (expected 1) - the snapshot is empty or incomplete, so an equality check on it proves nothing"
  return 1
}
echo "----- REFERENCE ($REF_DB), sections A,B,C,E -----"; cut_d "$REF"
echo "----- OVERLAY ($OVERLAY_DB), sections A,B,C,E -----"; cut_d "$OVL"
echo "----- informational section D (expected to differ: RLS, not table grants, protects the staging tables) -----"
echo "[reference]"; printf '%s\n' "$REF" | sed -n '/^== D\./,$p'; echo "[overlay]"; printf '%s\n' "$OVL" | sed -n '/^== D\./,$p'
echo "----- checks -----"
rc=0
positive_control "reference $REF_DB" "$REF" || rc=1
positive_control "overlay $OVERLAY_DB" "$OVL" || rc=1
if printf '%s\n' "$REF" | grep -E '^(anon|authenticated)\.contact_(phone|info)\.(SELECT|INSERT|UPDATE)=true$' >/dev/null; then
  echo "FAIL reference itself exposes a revoked column (definition of the baseline is broken)"; rc=1
else echo "PASS reference: no SELECT/INSERT/UPDATE on contact_phone/contact_info for anon/authenticated (migrations' intended state)"; fi
if printf '%s\n' "$OVL" | grep -E '^(anon|authenticated)\.contact_(phone|info)\.(SELECT|INSERT|UPDATE)=true$' >/dev/null; then
  echo "FAIL OVERLAY exposes a revoked column -> SPIKE_FAIL"; rc=1
else echo "PASS overlay: no SELECT/INSERT/UPDATE on contact_phone/contact_info for anon/authenticated"; fi
if [ "$(cut_d "$REF")" = "$(cut_d "$OVL")" ]; then echo "PASS reference == overlay (sections A,B,C,E byte-identical)"; else
  echo "FAIL reference != overlay:"; diff <(cut_d "$REF") <(cut_d "$OVL"); rc=1; fi
echo "privacy-compare exit=$rc"; exit $rc
