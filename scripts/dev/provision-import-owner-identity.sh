#!/usr/bin/env bash
# scripts/dev/provision-import-owner-identity.sh — #2307
#
# VERIFY-ONLY precondition check for issue #2304's Udupi import-owner identity
# (testdealer@example.com, expected auth.users.id
# e7b61f70-d087-44d8-a81d-7f8a057d2775 — the same id hardcoded in
# data/imports/udupi-properties-2304/import.sql and generate_sql.py).
#
# This script NEVER creates, updates, or rotates this identity's credentials.
# It looks the identity up BY ITS EXPECTED ID via the Supabase Auth admin
# API's get-a-single-user endpoint (GET /auth/v1/admin/users/<id>) and fails
# closed unless that id exists and its email matches exactly.
#
# WHY "GET BY ID", NOT "GET BY EMAIL" (#2307 code review cycle 2, BLOCKING-1):
#   An earlier revision of this script queried the admin *list* endpoint with
#   `?email=...`, modeled on provision-e2e-auth-identities.sh's
#   _lookup_user_id_by_email. That endpoint has no exact-email-match filter:
#   per supabase/auth#180 and the self-hosting Auth API reference, its `filter`
#   parameter (not `email`) does an ILIKE substring match against email OR
#   full_name, and an unrecognized `email` query param is simply ignored --
#   silently returning an unfiltered page of up to 50 users. Comparing against
#   `.[0]` of that page checks whichever account happens to be first in it,
#   not testdealer@example.com specifically -- exactly the wrong-record risk
#   this script exists to prevent. Since the id we need to confirm is already
#   known (hardcoded in import.sql), looking it up BY that id via the
#   get-a-user-by-id endpoint and checking the returned email is the only
#   exact, unambiguous check the Admin API actually supports. (This means
#   provision-e2e-auth-identities.sh's own `?email=` lookup has the same
#   latent bug, in the narrower 409-already-exists path where it needs a uid
#   to PUT against -- out of scope to fix here; not this script's file.)
#
# WHY VERIFY-ONLY (unlike scripts/dev/provision-e2e-auth-identities.sh's
# idempotent create-or-update-on-409 behaviour):
#   testdealer@example.com is a confirmed real, pre-existing dev-DB service
#   principal, not a disposable script-owned E2E fixture identity. Its id is
#   already baked into every row import.sql inserts. Creating or rotating it
#   here would either mint a second, different id under the same email
#   (breaking the very FK this precondition exists to protect), or silently
#   change a real account's password out from under whoever else uses it.
#   See docs/import-owner-identity-provisioning.md for the full rationale,
#   including why #1723's synthetic import-owner identity is an explicit,
#   documented, out-of-scope limitation (follow-up issue #2688).
#
# THE SECRET-HANDLING CONTRACT (same as provision-e2e-auth-identities.sh —
# read that script's header first; this script reuses the same shared
# helpers from lib/e2e-auth-common.sh rather than reinventing them):
#   IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY is supplied ONLY as an ephemeral
#   env var for a single invocation of this script. It is NEVER written to
#   disk, logged, or echoed.
#
# Usage:
#   IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY=<key> \
#     scripts/dev/provision-import-owner-identity.sh [--dry-run]
#
# Optional overrides (default to the known Udupi remote-dev project — the
# same project scripts/db/seed-remote-dev-udupi-listings.sh's PG_USER
# identity check pins to). NOTE: when this script is invoked BY that seed
# script, it force-derives and overrides both of these from its own
# already-validated PG_USER before calling this script — see its header
# comment ("2b") — precisely so a stray, independently-set value of either
# variable in an operator's shell can never point this check at a different
# project than the one about to be written to (#2307 code review cycle 2,
# HIGH-1). The defaults below apply only to a direct, standalone invocation.
#   IMPORT_OWNER_SUPABASE_PROJECT_REF   (default: elyqnysyqbqoxqqrpiir)
#   IMPORT_OWNER_SUPABASE_URL           (default: https://<ref>.supabase.co)
#
# Exit codes:
#   0 — identity confirmed present with the exact expected id and email.
#   1 — any guard, lookup, absence, or mismatch failure (fail closed).
#
# NOTE ON SCOPE: the identity this script verifies (email + expected id) is
# intentionally hardcoded below, not a flag or env var. Per #2307's approved
# plan, expanding this script's target identities beyond #2304's
# testdealer@example.com requires a new PLAN_REVIEW.
#
# NOTE ON --dry-run (#2307 code review cycle 2, BLOCKING-2): dry-run is an
# EXPLICIT CLI FLAG ONLY, deliberately with no environment-variable trigger.
# An earlier revision also honored IMPORT_OWNER_DRY_RUN=1 as ambient state --
# but this script is invoked automatically, as a safety-critical dependency,
# by scripts/db/seed-remote-dev-udupi-listings.sh. An operator who had
# legitimately exported that var in their shell to test this script standalone,
# and then later ran the seed script in that SAME shell without remembering to
# unset it, would see the guard silently report success (zero HTTP calls, exit
# 0) while verifying nothing -- defeating the entire point of a fail-closed
# guard via an easily-triggered, realistic mistake. Removing the env-var
# trigger entirely removes that ambient-state surface; there is no config to
# forget to clear.

set -euo pipefail

# --- Defend against xtrace leaking the service-role key into a transcript,
# whether inherited from a caller's `set -x`, SHELLOPTS, or BASH_XTRACEFD.
set +o xtrace
unset BASH_XTRACEFD 2>/dev/null || true
trap 'set +o xtrace 2>/dev/null || true' DEBUG

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/e2e-auth-common.sh
source "${SCRIPT_DIR}/lib/e2e-auth-common.sh"

# Fixed identity target — see "NOTE ON SCOPE" above. NEVER parameterized.
readonly EXPECTED_EMAIL="testdealer@example.com"
readonly EXPECTED_ID="e7b61f70-d087-44d8-a81d-7f8a057d2775"

readonly DEFAULT_PROJECT_REF="elyqnysyqbqoxqqrpiir"

# No env-var dry-run trigger — see "NOTE ON --dry-run" above. --dry-run below
# is the ONLY way to enable it.
DRY_RUN="false"

print_help() {
  cat <<EOF
Usage: IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY=<key> scripts/dev/provision-import-owner-identity.sh [--dry-run]

VERIFY-ONLY. Confirms issue #2304's import-owner identity (${EXPECTED_EMAIL},
expected auth.users.id ${EXPECTED_ID}) exists in the target Supabase project
via GET /auth/v1/admin/users/<id> (looked up BY that expected id — see the
script header for why, not by an email filter). Never creates, updates, or
rotates it.

Required environment variables:
  IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY   Ephemeral only — read for this
                                             invocation, NEVER written to
                                             disk, logged, or echoed.

Optional environment variables (default to the known Udupi remote-dev
project):
  IMPORT_OWNER_SUPABASE_PROJECT_REF   (default: ${DEFAULT_PROJECT_REF})
  IMPORT_OWNER_SUPABASE_URL           (default: https://${DEFAULT_PROJECT_REF}.supabase.co)

Options:
  --dry-run   Validate env vars/guards, print the plan, make ZERO HTTP calls.
              Exit 0 on success. CLI flag ONLY — there is deliberately no
              environment-variable equivalent (see script header).
  --help      Show this message.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="true" ;;
    --help|-h) print_help; exit 0 ;;
    *)
      echo "ERROR: unknown argument: $arg (see --help)" >&2
      exit 1
      ;;
  esac
done

echo ">>> provision-import-owner-identity.sh starting (dry-run=${DRY_RUN}, verify-only — never creates/updates/rotates credentials)"

# ---------------------------------------------------------------------------
# Guard 1 — required project values present (URL/ref default to the known
# Udupi remote-dev project so a caller only needs to supply the service-role
# key for the common case).
# ---------------------------------------------------------------------------

IMPORT_OWNER_SUPABASE_PROJECT_REF="${IMPORT_OWNER_SUPABASE_PROJECT_REF:-$DEFAULT_PROJECT_REF}"
IMPORT_OWNER_SUPABASE_URL="${IMPORT_OWNER_SUPABASE_URL:-https://${IMPORT_OWNER_SUPABASE_PROJECT_REF}.supabase.co}"

# ---------------------------------------------------------------------------
# Guard 2 — issuer/URL coherence: ref extracted from IMPORT_OWNER_SUPABASE_URL
# must equal IMPORT_OWNER_SUPABASE_PROJECT_REF (catches a copy-paste mismatch
# between the two before it silently verifies the wrong project).
# ---------------------------------------------------------------------------

if ! _e2e_auth_coherence_assert "$IMPORT_OWNER_SUPABASE_URL" "$IMPORT_OWNER_SUPABASE_PROJECT_REF" "IMPORT_OWNER_SUPABASE_URL vs IMPORT_OWNER_SUPABASE_PROJECT_REF"; then
  exit 1
fi
echo ">>> URL/ref coherence check passed (target ref: ${IMPORT_OWNER_SUPABASE_PROJECT_REF})."

# ---------------------------------------------------------------------------
# Guard 3 — service-role key present (never printed, never logged)
# ---------------------------------------------------------------------------

if [[ -z "${IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "ERROR: IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY is unset/empty. Supply it as an ephemeral env var for this invocation only — it is never read from any file by this script." >&2
  exit 1
fi
echo ">>> Service-role key present ($(_e2e_auth_mask "$IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY"))."

# ---------------------------------------------------------------------------
# Guard 4 — jq required for parsing the Admin API response.
# ---------------------------------------------------------------------------

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq not found on PATH. Install jq first." >&2
  exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
  cat <<EOF
>>> DRY RUN — no HTTP calls made. Plan:
    Target project ref:  ${IMPORT_OWNER_SUPABASE_PROJECT_REF}
    Target project URL:  ${IMPORT_OWNER_SUPABASE_URL}
    Would GET /auth/v1/admin/users/${EXPECTED_ID} (get-by-id, not a filter
    lookup) and require the response to exist (not 404) and its email to
    equal exactly: ${EXPECTED_EMAIL}
    Never creates, updates, or rotates this identity.
>>> DRY RUN OK.
EOF
  exit 0
fi

# ---------------------------------------------------------------------------
# _admin_api_call — the ONE place this script touches HTTP. Feeds the
# service-role key via `curl --config -` on stdin (never argv, never a temp
# file), same pattern as provision-e2e-auth-identities.sh's _admin_api_call,
# routed through the PATH-resolved wrapper so a test harness's mock curl can
# intercept the call.
# ---------------------------------------------------------------------------

_admin_api_call() {
  local method="$1" path="$2"
  local url="${IMPORT_OWNER_SUPABASE_URL%/}${path}"
  local cfg escaped_key escaped_url
  escaped_key="$(_e2e_auth_curl_config_escape "$IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY")"
  escaped_url="$(_e2e_auth_curl_config_escape "$url")"
  cfg="header = \"Authorization: Bearer ${escaped_key}\"
header = \"apikey: ${escaped_key}\"
request = \"${method}\"
url = \"${escaped_url}\"
silent
show-error
write-out = \"\\n%{http_code}\""
  printf '%s\n' "$cfg" | _e2e_auth_curl_wrapper --config -
}

_response_status() { printf '%s' "$1" | tail -n1; }
_response_body()   { printf '%s' "$1" | sed '$d'; }

echo ">>> Looking up id ${EXPECTED_ID} on ${IMPORT_OWNER_SUPABASE_PROJECT_REF} (verify-only, GET by id)..."

resp="$(_admin_api_call GET "/auth/v1/admin/users/${EXPECTED_ID}")"
status="$(_response_status "$resp")"
body="$(_response_body "$resp")"

if [[ "$status" == "404" ]]; then
  echo "ERROR: identity precondition FAILED. No auth.users row with id ${EXPECTED_ID} exists in ${IMPORT_OWNER_SUPABASE_PROJECT_REF} (HTTP 404). Applying data/imports/udupi-properties-2304/import.sql now would fail on profiles_user_id_fkey. This script does not create the identity — provision it via the Supabase dashboard/Auth admin API first (see docs/import-owner-identity-provisioning.md). Refusing to proceed." >&2
  exit 1
fi

if [[ "$status" != 2* ]]; then
  echo "ERROR: identity precondition FAILED. Lookup for id ${EXPECTED_ID} against ${IMPORT_OWNER_SUPABASE_PROJECT_REF} returned HTTP ${status} (expected 2xx or 404). Check IMPORT_OWNER_SUPABASE_URL/IMPORT_OWNER_SUPABASE_SERVICE_ROLE_KEY and that the target project is reachable. Refusing to proceed." >&2
  exit 1
fi

actual_id="$(printf '%s' "$body" | jq -r '.id // empty' 2>/dev/null || true)"
actual_email="$(printf '%s' "$body" | jq -r '.email // empty' 2>/dev/null || true)"

if [[ "$actual_id" != "$EXPECTED_ID" ]]; then
  echo "ERROR: identity precondition FAILED. The Admin API's response to a lookup for id ${EXPECTED_ID} did not echo that same id back (got '${actual_id:-<empty>}') — treating this as an unreliable/malformed response rather than trusting it. Refusing to proceed." >&2
  exit 1
fi

if [[ -z "$actual_email" || "$actual_email" != "$EXPECTED_EMAIL" ]]; then
  echo "ERROR: identity precondition FAILED. auth.users.id ${EXPECTED_ID} exists in ${IMPORT_OWNER_SUPABASE_PROJECT_REF} but its email (${actual_email:-<empty>}) does not match ${EXPECTED_EMAIL} — the id hardcoded in data/imports/udupi-properties-2304/import.sql may not be the identity you think it is. Do NOT proceed — resolve this before applying import.sql." >&2
  exit 1
fi

echo ">>> Identity precondition PASSED: id ${EXPECTED_ID} confirmed present in ${IMPORT_OWNER_SUPABASE_PROJECT_REF} with email ${EXPECTED_EMAIL}."
exit 0
