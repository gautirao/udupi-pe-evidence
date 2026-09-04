#!/usr/bin/env bash
# scripts/dev/lib/e2e-identity-seed.sh — #2427
#
# THE canonical local-fixture identity seed. Every script that boots the backend
# against a freshly restored throwaway Postgres fixture must call this, because
# without it no authenticated request to that backend can succeed at all.
#
# Callers:
#   - scripts/dev/local-fixture-backend.sh  (#1981 interactive dev stack)
#   - scripts/run-e2e-local.sh              (#2422 pre-push E2E gate)
#
# WHY THIS EXISTS
# ---------------
# A restored fixture's public.user_roles holds exactly ONE row, and it is the
# wrong one: a synthetic fixture broker pinned to the literal UUID
# 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' (e2e-broker@example.com), seeded by
# scripts/db/fixtures/discover-smoke-seed.sql. There is no row for ANY account
# the suite actually authenticates as — those UUIDs are minted by the live
# Supabase auth provider and are unknowable to a static seed file.
#
# Nothing fills that gap at runtime either: the same seed deliberately drops
# V0.1's on_auth_user_created trigger (it reads NEW.email /
# NEW.raw_user_meta_data, columns this fixture's minimal auth.users stub does
# not have), so not even the default 'user' role is auto-assigned on login.
#
# DbRoleJwtAuthenticationConverter derives ALL ROLE_* authorities from that one
# table, keyed on the JWT's own subject, and CallerInfoResolver fails closed
# when none are present:
#
#     403 {"error":"Requires broker, dealer, user, or admin role"}
#     apps/api/src/main/java/com/example/realestate/security/CallerInfoResolver.java:83
#
# So a hosted-Supabase JWT can be perfectly VALID and still useless here. The
# account authenticates, the token verifies, and every role-gated request 403s.
# That is precisely how the pre-push E2E gate broke (#2427): e2e/global-setup.ts
# could not POST /api/listings, no fixture listing was ever created, and all
# seven broker dashboard / listing-quality specs failed downstream of it.
#
# This logic previously existed ONLY inside local-fixture-backend.sh (Step F for
# admin, Step F2 from #2221 for broker and smoke-user). run-e2e-local.sh shared
# no code with it and was never given the seed. Extracting it here means there
# is one seed path to keep correct instead of two to keep in sync.
#
# CONTRACT
# --------
# Inputs (exported by the caller before calling):
#   VITE_SUPABASE_URL              auth endpoint to obtain the account's UUID
#   VITE_SUPABASE_PUBLISHABLE_KEY  anon key for that endpoint
#   E2E_SEED_PG_HOST               fixture host (callers pass localhost)
#   E2E_SEED_PG_PORT               fixture port
#   E2E_SEED_PG_PASSWORD           fixture postgres superuser password
#
# Outputs (globals, set on every call):
#   E2E_SEED_LAST_UUID   the seeded account's UUID, or empty on skip/failure
#   E2E_SEED_LAST_TOKEN  that login's access token, or empty on skip/failure
#
# SAFETY
# ------
# E2E_SEED_PG_HOST is supplied by the caller and every caller passes localhost
# after its own fail-closed safety gate has proven the target is a container it
# just started. This library performs no host resolution of its own and has no
# code path that can reach a remote database.
#
# Passwords are passed to jq through the environment, never as argv, so they do
# not appear in `ps` output.

# Guard against double-sourcing: callers may source this alongside other libs.
if [[ -n "${_E2E_IDENTITY_SEED_SH_LOADED:-}" ]]; then
  return 0 2>/dev/null || true
fi
_E2E_IDENTITY_SEED_SH_LOADED=1

_E2E_SEED_UUID_REGEX='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

# ---------------------------------------------------------------------------
# e2e_seed_identity <label> <email> <password> <role> <requirement>
#
#   label        human name for log lines, e.g. "broker"
#   email        account to authenticate as; empty means "skip this identity"
#   password     that account's password; empty means "skip this identity"
#   role         public.user_roles.role value to grant: admin | broker | user
#   requirement  "required"    -> return 1 when the seed cannot be completed
#                "best-effort" -> warn and return 0; callers keep going
#
# Every step is individually guarded. Callers run under `set -euo pipefail`, and
# a bare curl/jq/psql failure here would otherwise abort fixture startup
# entirely — turning an optional credential into a hard dependency, which is
# exactly what a best-effort seed must never become.
# ---------------------------------------------------------------------------
e2e_seed_identity() {
  local label="$1" email="$2" password="$3" role="$4" requirement="$5"

  E2E_SEED_LAST_UUID=""
  E2E_SEED_LAST_TOKEN=""

  local fail_rc=0
  [[ "$requirement" == "required" ]] && fail_rc=1

  if [[ -z "$email" || -z "$password" ]]; then
    if [[ "$requirement" == "required" ]]; then
      echo "ERROR: ${label} credentials are required but absent." >&2
      return 1
    fi
    echo ">>> Skipping ${label} identity seed — no credentials configured."
    return 0
  fi

  echo ">>> Logging in to Supabase Auth as ${label} (${requirement})..."

  local login_body login_response uuid token
  export JQ_SEED_PASSWORD="$password"
  if ! login_body="$(jq -n --arg email "$email" '{email: $email, password: env.JQ_SEED_PASSWORD}')"; then
    unset JQ_SEED_PASSWORD
    echo ">>> WARNING: ${label} login-body construction failed — ${label} identity not seeded." >&2
    return "$fail_rc"
  fi
  unset JQ_SEED_PASSWORD

  if ! login_response="$(curl -sS -X POST "${VITE_SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "Content-Type: application/json" \
    -H "apikey: ${VITE_SUPABASE_PUBLISHABLE_KEY}" \
    -d "$login_body")"; then
    echo ">>> WARNING: ${label} login request failed (network/transport error) — ${label} identity not seeded." >&2
    return "$fail_rc"
  fi

  if ! uuid="$(printf '%s' "$login_response" | jq -r '.user.id // empty' 2>/dev/null)"; then
    echo ">>> WARNING: ${label} login response could not be parsed — ${label} identity not seeded." >&2
    return "$fail_rc"
  fi
  if ! token="$(printf '%s' "$login_response" | jq -r '.access_token // empty' 2>/dev/null)"; then
    echo ">>> WARNING: ${label} login response could not be parsed — ${label} identity not seeded." >&2
    return "$fail_rc"
  fi

  if [[ ! "$uuid" =~ $_E2E_SEED_UUID_REGEX || -z "$token" ]]; then
    echo ">>> WARNING: ${label} login failed (no valid user id / access token) — ${label} identity not seeded." >&2
    return "$fail_rc"
  fi

  # NOTE: this INSERT INTO auth.users does NOT fire V0.1's on_auth_user_created
  # trigger — discover-smoke-seed.sql dropped it during the fixture restore
  # (see the header above), which is what makes this minimal insert safe. No
  # implicit 'user' role is created as a side effect; only the explicit grant
  # below exists afterwards.
  if ! PGPASSWORD="$E2E_SEED_PG_PASSWORD" psql \
      -h "$E2E_SEED_PG_HOST" -p "$E2E_SEED_PG_PORT" -U postgres -d postgres \
      -v ON_ERROR_STOP=1 <<SQL
BEGIN;
INSERT INTO auth.users (id) VALUES ('${uuid}') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('${uuid}', '${role}') ON CONFLICT (user_id, role) DO NOTHING;
COMMIT;
SQL
  then
    echo ">>> WARNING: ${label} identity seed failed at the database step — ${label} identity not seeded." >&2
    return "$fail_rc"
  fi

  E2E_SEED_LAST_UUID="$uuid"
  E2E_SEED_LAST_TOKEN="$token"
  echo ">>> Local ${label} identity seeded (auth.users + user_roles '${role}')."
  return 0
}
