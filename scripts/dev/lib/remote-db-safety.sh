#!/usr/bin/env bash
# scripts/dev/lib/remote-db-safety.sh — #2569
#
# Shared safety guard for local backend startup. Before this existed,
# apps/api/run-local.sh sourced apps/api/.env (which commonly points
# SUPABASE_DB_HOST at the shared hosted Supabase pooler) and invoked
# `mvn spring-boot:run` with no check that the resulting connection target was
# actually local. A developer running run-local.sh directly (not through one
# of the disposable-fixture wrapper scripts) had every Flyway migration and
# every write silently land on the shared remote database.
#
# validate_localhost_only() fails closed: it refuses to proceed unless
# SUPABASE_DB_HOST is a loopback address, or the caller has deliberately set
# BOTH ALLOW_REMOTE_DB=true and ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true. Two
# independent flags, not one, so a single inherited or copy-pasted env var
# (e.g. from a shared shell profile) can never silently authorize a remote
# connection.
#
# print_backend_startup_banner() logs (to stderr, sanitized — never a
# password or full connection string) which host/port this backend is about
# to connect to and whether Flyway migrations / scheduled jobs are enabled,
# so a misconfigured environment is visible before Spring Boot starts rather
# than discovered later from its effects.
#
# Usage (source, don't execute):
#   source "$REPO_ROOT/scripts/dev/lib/remote-db-safety.sh"
#   validate_localhost_only || exit 1
#   print_backend_startup_banner

# _remote_db_safety_is_loopback HOST — true (exit 0) if HOST is a loopback
# address: exactly "localhost", "::1"/"[::1]", or a dotted-quad in 127.0.0.0/8.
#
# Deliberately a string/pattern match, never a DNS resolution: resolving a
# hostname is itself a network call, and a fail-closed safety check must
# never depend on one succeeding (or on trusting whatever it returns).
_remote_db_safety_is_loopback() {
  local host="$1"
  if [[ "$host" == "localhost" || "$host" == "::1" || "$host" == "[::1]" ]]; then
    return 0
  fi
  if [[ "$host" =~ ^127\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    return 0
  fi
  return 1
}

# validate_localhost_only — see file header. Reads SUPABASE_DB_HOST,
# ALLOW_REMOTE_DB, ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE from the environment.
# Returns 0 to proceed, 1 to refuse (caller must exit).
validate_localhost_only() {
  local host="${SUPABASE_DB_HOST:-}"

  if _remote_db_safety_is_loopback "$host"; then
    return 0
  fi

  if [[ "${ALLOW_REMOTE_DB:-}" == "true" && "${ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE:-}" == "true" ]]; then
    echo ">>> WARNING: ALLOW_REMOTE_DB=true and ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true — proceeding against a NON-LOOPBACK database host (${host:-<unset>})." >&2
    echo ">>> This is a deliberate override. Every write this backend makes (including Flyway migrations, if enabled) will land on that host." >&2
    return 0
  fi

  {
    echo ""
    echo "############################################################"
    echo "# REFUSING TO START: SUPABASE_DB_HOST is not a loopback address"
    echo "############################################################"
    echo "#"
    echo "# SUPABASE_DB_HOST=${host:-<unset>}"
    echo "#"
    echo "# This backend is being started via a local-dev script that must never"
    echo "# connect to a remote/shared database by accident (issue #2569)."
    echo "#"
    echo "# To intentionally connect to a remote host, set BOTH of:"
    echo "#   ALLOW_REMOTE_DB=true"
    echo "#   ALLOW_REMOTE_DB_ACKNOWLEDGED_UNSAFE=true"
    echo "#"
    echo "# Both flags are required so a single inherited or copy-pasted variable"
    echo "# can never silently authorize a remote connection."
    echo "############################################################"
    echo ""
  } >&2
  return 1
}

# print_backend_startup_banner — logs (stderr, sanitized) which host/port this
# backend is about to connect to and whether Flyway/scheduling are enabled.
# Never prints SUPABASE_DB_PASSWORD or any other credential.
#
# Flyway and scheduling both default to enabled when their override env vars
# are unset — SPRING_FLYWAY_ENABLED unset is Spring Boot's own "on" default,
# and SPRING_TASK_SCHEDULING_ENABLED unset leaves SchedulingSuppressionConfig's
# @ConditionalOnProperty(havingValue = "false") inactive, so @Scheduled jobs
# run exactly as in production (see SchedulingSuppressionConfig, issue #2114).
print_backend_startup_banner() {
  local host="${SUPABASE_DB_HOST:-<unset>}"
  local port="${SUPABASE_DB_PORT:-<default>}"
  local flyway="${SPRING_FLYWAY_ENABLED:-true (default)}"
  local scheduling="${SPRING_TASK_SCHEDULING_ENABLED:-true (default)}"

  {
    echo ""
    echo ">>> Backend startup summary:"
    echo ">>>   Database host     : ${host}"
    echo ">>>   Database port     : ${port}"
    echo ">>>   Flyway migrations : ${flyway}"
    echo ">>>   Scheduled jobs    : ${scheduling}"
    echo ""
  } >&2
}
