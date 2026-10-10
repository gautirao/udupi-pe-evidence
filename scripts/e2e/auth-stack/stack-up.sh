#!/usr/bin/env bash
# scripts/e2e/auth-stack/stack-up.sh - issue #2750 (local canonical auth stack, gate flow steps 1-3).
#
# Starts local GoTrue + PostgREST + an nginx gateway against an ALREADY RESTORED fixture container, on a per-run docker
# network. Nothing here touches a hosted or shared database: the only database is the disposable fixture container.
#
# SECRETS. Every generated secret lives in $AUTH_WORKDIR (a `mktemp -d` directory: 0700, outside the repo, removed by the
# caller's trap). Container secrets are handed over with `--env-file <0600 file>`, NEVER `-e NAME=value`: a `-e` value is
# visible to `docker inspect` and `ps`. This script never prints a key, token or password.
#
# Required env:
#   AUTH_WORKDIR        fresh `mktemp -d` directory
#   AUTH_PREFIX         container name prefix (e.g. e2e-2750-auth); containers are ${AUTH_PREFIX}-gotrue / -rest / -gw
#   AUTH_NET            docker network name (the caller created it and removes it)
#   AUTH_GW_PORT        host port of the gateway (bound to 127.0.0.1 only)
#   AUTH_PG_CONTAINER   the running fixture postgres container (attached to AUTH_NET here, alias ${AUTH_PREFIX}-pg)
#   AUTH_PG_PORT        host port of the fixture postgres (loopback)
#   AUTH_PG_PASSWORD    its superuser password
#   AUTH_SITE_URL       the FRONTEND origin (e.g. http://localhost:9383): GoTrue SITE_URL + redirect allow-list
# Optional: AUTH_GOTRUE_PORT / AUTH_REST_PORT  publish those on 127.0.0.1 for debugging (default: unpublished).
#
# Ordering matters and is enforced here, not by the caller:
#   mint keys -> snapshot the Flyway-only REFERENCE database -> apply the grants overlay (with its in-SQL fail-closed
#   assertions) -> GoTrue -> PostgREST -> gateway. FC-27c later compares REFERENCE vs OVERLAY.
set -euo pipefail
SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${AUTH_WORKDIR:?}" "${AUTH_PREFIX:?}" "${AUTH_NET:?}" "${AUTH_GW_PORT:?}" "${AUTH_PG_CONTAINER:?}" "${AUTH_PG_PORT:?}" "${AUTH_PG_PASSWORD:?}" "${AUTH_SITE_URL:?}"
ISSUER="http://localhost:${AUTH_GW_PORT}/auth/v1"
pgq() { PGPASSWORD="$AUTH_PG_PASSWORD" psql -h localhost -p "$AUTH_PG_PORT" -U postgres -X -v ON_ERROR_STOP=1 "$@"; }

# Images are pinned by digest in images.lock; refuse a line that is not.
img() {
  local l
  l="$(grep -E "^$1[:@]" "$SD/images.lock" | head -1)"
  case "$l" in *@sha256:*) printf '%s' "$l" ;; *) echo "stack-up: images.lock has no digest-pinned line for $1" >&2; return 1 ;; esac
}
GOTRUE_IMG="$(img supabase/gotrue)"; REST_IMG="$(img postgrest/postgrest)"; NGINX_IMG="$(img nginx)"
pub() { if [ -n "${1:-}" ]; then printf -- '-p\n127.0.0.1:%s:%s\n' "$1" "$2"; fi; }

umask 077
[ "$(stat -c '%a' "$AUTH_WORKDIR" 2> /dev/null || stat -f '%Lp' "$AUTH_WORKDIR")" = "700" ] || { echo "stack-up: AUTH_WORKDIR must be a 0700 directory (use mktemp -d)" >&2; exit 1; }

# 1. per-run keys (RS256 pair, anon / service_role JWTs, a foreign key for the negative tests) and generated secrets
node "$SD/mint-keys.mjs" "$AUTH_WORKDIR" "$ISSUER" --foreign
openssl rand -hex 16 > "$AUTH_WORKDIR/authenticator.pw"
openssl rand -hex 24 > "$AUTH_WORKDIR/gotrue-hs.secret"

# 2. the Flyway-only REFERENCE database: a template copy of the freshly restored fixture, taken BEFORE the overlay.
pgq -d template1 -qc "DROP DATABASE IF EXISTS fixture_reference"
pgq -d template1 -qc "CREATE DATABASE fixture_reference TEMPLATE postgres"

# 3. overlay (grants + auth.uid + V128 re-apply + fail-closed assertions) on the fixture DB
if ! pgq -d postgres -v authenticator_password="$(< "$AUTH_WORKDIR/authenticator.pw")" -f "$SD/fixture-grants-overlay.sql" > "$AUTH_WORKDIR/overlay.out" 2>&1; then
  echo "stack-up: grants overlay failed (a FC-27c assertion inside the overlay aborts the build):" >&2
  tail -5 "$AUTH_WORKDIR/overlay.out" >&2
  exit 1
fi

# 4. per-run network: the fixture container joins it under a fixed alias so GoTrue/PostgREST reach it by name
docker network connect --alias "${AUTH_PREFIX}-pg" "$AUTH_NET" "$AUTH_PG_CONTAINER" > /dev/null

# 5. GoTrue (its own `gotrue` DB in the same pg; GoTrue needs the `auth` schema to pre-exist)
[ -n "$(pgq -d template1 -tAc "SELECT 1 FROM pg_database WHERE datname='gotrue'")" ] || pgq -d template1 -qc "CREATE DATABASE gotrue"
pgq -d gotrue -qc "CREATE SCHEMA IF NOT EXISTS auth"
{
  printf 'GOTRUE_API_HOST=0.0.0.0\nPORT=9999\nAPI_EXTERNAL_URL=%s\nGOTRUE_DB_DRIVER=postgres\n' "$ISSUER"
  printf 'GOTRUE_DB_DATABASE_URL=postgres://postgres:%s@%s-pg:5432/gotrue?search_path=auth&sslmode=disable\n' "$AUTH_PG_PASSWORD" "$AUTH_PREFIX"
  printf 'GOTRUE_SITE_URL=%s\nGOTRUE_URI_ALLOW_LIST=%s\n' "$AUTH_SITE_URL" "$AUTH_SITE_URL"
  printf 'GOTRUE_JWT_SECRET=%s\n' "$(< "$AUTH_WORKDIR/gotrue-hs.secret")"
  printf 'GOTRUE_JWT_KEYS=%s\n' "$(< "$AUTH_WORKDIR/jwt_keys.json")"
  printf 'GOTRUE_JWT_ISSUER=%s\nGOTRUE_JWT_AUD=authenticated\nGOTRUE_JWT_EXP=3600\n' "$ISSUER"
  printf 'GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated\nGOTRUE_JWT_ADMIN_ROLES=service_role\n'
  printf 'GOTRUE_DISABLE_SIGNUP=false\nGOTRUE_EXTERNAL_EMAIL_ENABLED=true\nGOTRUE_MAILER_AUTOCONFIRM=true\nGOTRUE_RATE_LIMIT_EMAIL_SENT=1000\n'
} > "$AUTH_WORKDIR/gotrue.env"
docker rm -f "${AUTH_PREFIX}-gotrue" > /dev/null 2>&1 || true
# shellcheck disable=SC2046
docker run -d --name "${AUTH_PREFIX}-gotrue" --network "$AUTH_NET" --network-alias e2e-auth-gotrue \
  $(pub "${AUTH_GOTRUE_PORT:-}" 9999) --env-file "$AUTH_WORKDIR/gotrue.env" "$GOTRUE_IMG" > /dev/null

# 6. PostgREST (fixture DB as the unprivileged `authenticator`, verifies tokens with the public JWKS only)
{
  printf 'PGRST_DB_URI=postgres://authenticator:%s@%s-pg:5432/postgres\n' "$(< "$AUTH_WORKDIR/authenticator.pw")" "$AUTH_PREFIX"
  printf 'PGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_AUD=authenticated\n'
  printf 'PGRST_JWT_SECRET=%s\n' "$(< "$AUTH_WORKDIR/jwks.json")"
} > "$AUTH_WORKDIR/rest.env"
docker rm -f "${AUTH_PREFIX}-rest" > /dev/null 2>&1 || true
# shellcheck disable=SC2046
docker run -d --name "${AUTH_PREFIX}-rest" --network "$AUTH_NET" --network-alias e2e-auth-rest \
  $(pub "${AUTH_REST_PORT:-}" 3000) --env-file "$AUTH_WORKDIR/rest.env" "$REST_IMG" > /dev/null

# 7. gateway (CORS for loopback origins lives in nginx.conf)
docker rm -f "${AUTH_PREFIX}-gw" > /dev/null 2>&1 || true
docker run -d --name "${AUTH_PREFIX}-gw" --network "$AUTH_NET" -p "127.0.0.1:${AUTH_GW_PORT}:8000" \
  -v "$SD/nginx.conf:/etc/nginx/nginx.conf:ro" "$NGINX_IMG" > /dev/null

for _ in $(seq 1 60); do
  if curl -sf "http://localhost:${AUTH_GW_PORT}/auth/v1/health" > /dev/null 2>&1 \
     && curl -s -o /dev/null -w '%{http_code}' "http://localhost:${AUTH_GW_PORT}/rest/v1/" 2> /dev/null | grep -qE '^(200|401|404)$'; then
    echo "stack-up: gateway healthy on ${ISSUER}"
    exit 0
  fi
  sleep 2
done
echo "stack-up: gateway never became healthy" >&2
docker logs "${AUTH_PREFIX}-gotrue" 2>&1 | tail -5 >&2
exit 1
