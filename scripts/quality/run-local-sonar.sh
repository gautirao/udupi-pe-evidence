#!/usr/bin/env bash
# Runs backend + frontend coverage, then scans the repo against a locally running
# SonarQube instance (http://localhost:9000) via the sonar-scanner-cli Docker image.
# See docs/dev/code-quality-sonar.md for full setup instructions.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "ERROR: SONAR_TOKEN is not set." >&2
  echo "Generate a token in SonarQube (My Account > Security) and export it:" >&2
  echo "  export SONAR_TOKEN=<token-from-local-sonarqube>" >&2
  exit 1
fi

SONAR_HOST_URL="${SONAR_HOST_URL:-http://host.docker.internal:9000}"

echo "==> Backend: mvn test (JaCoCo report)"
mvn -f "$ROOT_DIR/backend/pom.xml" -q clean test

if [[ ! -f "$ROOT_DIR/backend/target/site/jacoco/jacoco.xml" ]]; then
  echo "ERROR: backend/target/site/jacoco/jacoco.xml was not generated." >&2
  echo "Check that org.jacoco:jacoco-maven-plugin is bound in backend/pom.xml." >&2
  exit 1
fi

echo "==> Frontend: npm test -- --coverage"
(cd "$ROOT_DIR" && npm test -- --coverage)

if [[ ! -f "$ROOT_DIR/coverage/lcov.info" ]]; then
  echo "ERROR: coverage/lcov.info was not generated." >&2
  echo "Check that @vitest/coverage-v8 is installed and vitest.config.ts has a coverage block." >&2
  exit 1
fi

echo "==> Running sonar-scanner via Docker against $SONAR_HOST_URL"
docker run --rm \
  -e SONAR_HOST_URL="$SONAR_HOST_URL" \
  -e SONAR_TOKEN="$SONAR_TOKEN" \
  -v "$ROOT_DIR:/usr/src" \
  -v "$HOME/.sonar/cache:/opt/sonar-scanner/.sonar/cache" \
  sonarsource/sonar-scanner-cli

echo "==> Done. View results at ${SONAR_HOST_URL/host.docker.internal/localhost}/dashboard?id=udupi-property-explorer"
