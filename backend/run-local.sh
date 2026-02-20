#!/usr/bin/env bash
# run-local.sh — Start the Spring Boot backend for local development.
#
# Loads backend/.env into the shell environment (Spring Boot does not
# auto-load .env files), then launches the app via Maven.
#
# Usage (from repo root):   ./backend/run-local.sh
# Usage (from backend dir): ./run-local.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Create backend/.env with the required variables before running."
  exit 1
fi

echo ">>> Loading env from $ENV_FILE"
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

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
  echo "ERROR: Missing required variables in backend/.env:"
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
