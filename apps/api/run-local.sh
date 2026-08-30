#!/usr/bin/env bash
# run-local.sh — Start the Spring Boot backend for local development.
#
# Loads apps/api/.env into the shell environment (Spring Boot does not
# auto-load .env files), then launches the app via Maven.
#
# Usage (from repo root):   ./apps/api/run-local.sh
# Usage (from backend dir): ./run-local.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Create apps/api/.env with the required variables before running."
  exit 1
fi

if [[ "${SKIP_BACKEND_ENV_LOAD:-false}" != "true" ]]; then
  # A caller (e.g. scripts/dev-worktree-stack.sh, scripts/run-e2e-local.sh) may
  # already have exported SERVER_PORT and/or CORS_ALLOWED_ORIGINS to assign this
  # worktree its own port/origin. apps/api/.env commonly also defines both, and
  # `source` always wins over an existing exported value — so without this, the
  # caller's assignment is silently clobbered by apps/api/.env's hardcoded value
  # (#2078 for SERVER_PORT; #2285 for CORS_ALLOWED_ORIGINS). Preserve both and
  # restore them after the source.
  CALLER_SERVER_PORT="${SERVER_PORT:-}"
  CALLER_CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-}"

  # ── Load ALL variables from .env into the shell environment ──────────────────
  # set -a exports every variable defined by source, including any new ones
  # added to .env. Spring Boot picks them all up automatically.
  echo ">>> Loading env from $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a

  if [[ -n "$CALLER_SERVER_PORT" ]]; then
    SERVER_PORT="$CALLER_SERVER_PORT"
    export SERVER_PORT
    echo ">>> SERVER_PORT overridden by caller: $SERVER_PORT (apps/api/.env value ignored)"
  fi

  if [[ -n "$CALLER_CORS_ALLOWED_ORIGINS" ]]; then
    CORS_ALLOWED_ORIGINS="$CALLER_CORS_ALLOWED_ORIGINS"
    export CORS_ALLOWED_ORIGINS
    echo ">>> CORS_ALLOWED_ORIGINS overridden by caller: $CORS_ALLOWED_ORIGINS (apps/api/.env value ignored)"
  fi

  # ── Print a summary of what was loaded (sensitive values masked) ─────────────
  echo ""
  echo ">>> Variables loaded from .env:"
  SENSITIVE_KEYS=(PASSWORD KEY SECRET TOKEN DSN)
  while IFS='=' read -r KEY _; do
    # Skip blank lines and comments
    [[ -z "$KEY" || "$KEY" == \#* ]] && continue
    KEY="${KEY// /}"  # trim whitespace
    VALUE="${!KEY:-}"
    # Mask sensitive values (use tr for bash 3.2 compat — macOS default)
    KEY_UPPER="$(echo "$KEY" | tr '[:lower:]' '[:upper:]')"
    MASKED=false
    for S in "${SENSITIVE_KEYS[@]}"; do
      if [[ "$KEY_UPPER" == *"$S"* ]]; then
        echo "    $KEY=***"
        MASKED=true
        break
      fi
    done
    if [[ "$MASKED" == false ]]; then
      echo "    $KEY=$VALUE"
    fi
  done < "$ENV_FILE"
else
  echo ">>> SKIP_BACKEND_ENV_LOAD=true — not loading $ENV_FILE; using caller-supplied environment."
  echo ""
  echo ">>> Using caller-supplied environment (SKIP_BACKEND_ENV_LOAD=true)"
fi

# ── Validate required variables (no defaults in application.yml) ─────────────
echo ""
echo ">>> Checking required variables..."
REQUIRED_VARS=(
  SUPABASE_DB_HOST
  SUPABASE_DB_USER
  SUPABASE_DB_PASSWORD
  SUPABASE_PROJECT_REF
  AI_API_KEY
)
MISSING=()
for VAR in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    MISSING+=("$VAR")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "ERROR: Missing required variables in apps/api/.env:"
  for VAR in "${MISSING[@]}"; do
    echo "  - $VAR"
  done
  exit 1
fi

echo ">>> All required variables present."
echo ">>> Starting Spring Boot on port ${SERVER_PORT:-8085}..."
echo ""

cd "$SCRIPT_DIR"
mvn -DskipTests spring-boot:run
