#!/usr/bin/env bash
# scripts/e2e/auth-stack/create-users.sh - issue #2750 (local canonical auth stack, gate flow step 3).
#
# Creates the three role users in LOCAL GoTrue through the admin API (the per-run service_role JWT from mint-keys.mjs), with
# per-run GENERATED passwords on @e2e.test addresses, then seeds public.user_roles with the UNCHANGED e2e_seed_identity.
# Secrets stay in $AUTH_WORKDIR/creds.env (0600, `export NAME=value` lines); only NAMES and HTTP codes are printed. The
# service_role token and the request body travel in 0600 files / stdin, never on a command line.
#
# user_metadata.onboarding_completed=true models a seasoned account, which is what the hosted role accounts were: getRoleAwareDefaultLanding
# (apps/web/src/lib/authUtils.ts) sends a plain user created less than 2 minutes ago WITHOUT that flag to /onboarding instead of /discover,
# and these users are, by construction, brand new.
# Required env: AUTH_WORKDIR AUTH_GW_PORT AUTH_PG_PORT AUTH_PG_PASSWORD
set -euo pipefail
SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${AUTH_WORKDIR:?}" "${AUTH_GW_PORT:?}" "${AUTH_PG_PORT:?}" "${AUTH_PG_PASSWORD:?}"
export VITE_SUPABASE_URL="http://localhost:${AUTH_GW_PORT}"
VITE_SUPABASE_PUBLISHABLE_KEY="$(< "$AUTH_WORKDIR/anon.jwt")"; export VITE_SUPABASE_PUBLISHABLE_KEY
# shellcheck source=../../dev/lib/e2e-identity-seed.sh
source "$SD/../../dev/lib/e2e-identity-seed.sh"
export E2E_SEED_PG_HOST=localhost E2E_SEED_PG_PORT="$AUTH_PG_PORT" E2E_SEED_PG_PASSWORD="$AUTH_PG_PASSWORD"
umask 077
: > "$AUTH_WORKDIR/creds.env"
HDR="$AUTH_WORKDIR/admin-headers.txt"
{ printf 'Authorization: Bearer %s\n' "$(< "$AUTH_WORKDIR/service_role.jwt")"; printf 'apikey: %s\n' "$(< "$AUTH_WORKDIR/service_role.jwt")"; } > "$HDR"
mk() { # <ENVPREFIX> <local-part> <role>
  local pw email code
  pw="Pw-$(openssl rand -hex 12)"; email="$2@e2e.test"
  code="$(JQPW="$pw" jq -n --arg e "$email" '{email:$e,password:env.JQPW,email_confirm:true,user_metadata:{onboarding_completed:true}}' \
    | curl -s -o /dev/null -w '%{http_code}' -X POST "${VITE_SUPABASE_URL}/auth/v1/admin/users" \
        -H "@${HDR}" -H 'Content-Type: application/json' --data-binary @-)"
  echo "create-users: $1 admin-create http=$code"
  [ "$code" = "200" ] || return 1
  printf 'export %s_EMAIL=%s\nexport %s_PASSWORD=%s\n' "$1" "$email" "$1" "$pw" >> "$AUTH_WORKDIR/creds.env"
  e2e_seed_identity "$2" "$email" "$pw" "$3" required > /dev/null
}
mk ADMIN e2e-admin admin
mk BROKER e2e-broker broker
BROKER_UUID="$E2E_SEED_LAST_UUID"   # set by e2e_seed_identity inside mk (same shell); captured before the next mk overwrites it
mk SMOKE_USER e2e-smoke-user user
rm -f "$HDR"

# Canonical ownership seed for J10 / T17b (broker sees the T17 booking on /broker/bookings).
# A booking's broker is the listing's created_by (BookingService.createBooking: brokerId = listing.created_by, never the body), and
# GET /api/bookings/broker returns only the caller's own. The fixture listing T17 books (e2e00001-...-0001, seeded under the synthetic
# fixture broker a1b2c3d4-...) therefore can never appear for THIS run's generated broker, whose UUID is unknowable to a static seed.
# This hands that one listing to the run's broker, deterministically and in the disposable fixture only. It is the same kind of
# per-run identity fix-up as the user_roles rows e2e_seed_identity writes above; no grant is changed and no product code is involved.
BOOKED_FIXTURE_LISTING='e2e00001-0000-0000-0000-000000000001'
[[ "$BROKER_UUID" =~ ^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$ ]] || { echo "create-users: broker uuid not captured"; exit 1; }
owned="$(PGPASSWORD="$AUTH_PG_PASSWORD" psql -h localhost -p "$AUTH_PG_PORT" -U postgres -d postgres -X -q -tA -v ON_ERROR_STOP=1 \
  -v owner="$BROKER_UUID" -v lid="$BOOKED_FIXTURE_LISTING" <<'SQL'
UPDATE public.property_listings SET created_by = :'owner' WHERE id = :'lid' RETURNING id;
SQL
)" || { echo "create-users: booking-owner seed failed"; exit 1; }
[ "$(printf '%s\n' "$owned" | head -n 1)" = "$BOOKED_FIXTURE_LISTING" ] || { echo "create-users: booking-owner seed matched no row (fixture listing missing?)"; exit 1; }
echo "create-users: fixture listing for the booking journey now owned by the run's broker"
echo "create-users: credential env NAMES written: ADMIN_EMAIL ADMIN_PASSWORD BROKER_EMAIL BROKER_PASSWORD SMOKE_USER_EMAIL SMOKE_USER_PASSWORD"
