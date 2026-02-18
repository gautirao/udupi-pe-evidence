#!/usr/bin/env bash
# Smoke Test Script — Sprint 3 (updated 2026-02-18)
# Covers: local unit/build checks + production endpoint verification
# Exit code: 0 = all pass, 1 = any failure
#
# Usage:
#   ./scripts/smoke_test.sh                  # Local checks only
#   ./scripts/smoke_test.sh --prod           # Local + production checks
#   BACKEND_URL=https://... FRONTEND_URL=https://... ./scripts/smoke_test.sh --prod

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Production URLs (override via env vars or --prod flag defaults)
BACKEND_URL="${BACKEND_URL:-https://udupi-property-explorer.onrender.com}"
FRONTEND_URL="${FRONTEND_URL:-https://udupi-property-explorer.pages.dev}"

# Parse flags
RUN_PROD=false
for arg in "$@"; do
  [ "$arg" = "--prod" ] && RUN_PROD=true
done

# Track results
FAILURES=0
PASSED=0

# Helper functions
print_header() {
  echo ""
  echo "=========================================="
  echo "$1"
  echo "=========================================="
}

print_test() {
  echo -e "${YELLOW}[TEST]${NC} $1"
}

print_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  PASSED=$((PASSED + 1))
}

print_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  FAILURES=$((FAILURES + 1))
}

# Check prerequisites
print_header "Prerequisites Check"

if ! command -v node &> /dev/null; then
  print_fail "Node.js not found"
  exit 1
fi
print_pass "Node.js installed: $(node --version)"

if ! command -v npm &> /dev/null; then
  print_fail "npm not found"
  exit 1
fi
print_pass "npm installed: $(npm --version)"

if ! command -v mvn &> /dev/null; then
  print_fail "Maven not found"
  exit 1
fi
print_pass "Maven installed: $(mvn --version | head -1)"

if ! command -v java &> /dev/null; then
  print_fail "Java not found"
  exit 1
fi
print_pass "Java installed: $(java --version | head -1)"

# 1. Backend Health Check (if running)
print_header "1. Backend Health Check"
print_test "Checking if backend is running on localhost:8080"

if curl -f -s -o /dev/null http://localhost:8080/actuator/health 2>/dev/null; then
  print_pass "Backend is running and healthy"

  # Get detailed health info
  HEALTH_RESPONSE=$(curl -s http://localhost:8080/actuator/health)
  echo "Health response: $HEALTH_RESPONSE"
else
  print_fail "Backend is not running or not healthy. Start with: cd backend && mvn spring-boot:run"
  echo "⚠️  Continuing with remaining checks..."
fi

# 2. Backend Tests
print_header "2. Backend Tests"
print_test "Running all backend tests with Maven"

cd "$BACKEND_DIR"
if mvn test > /tmp/backend-test.log 2>&1; then
  # Use sed instead of grep -P for macOS compatibility
  TEST_COUNT=$(grep 'Tests run:' /tmp/backend-test.log | tail -1 | sed -E 's/.*Tests run: ([0-9]+).*/\1/')
  FAILURE_COUNT=$(grep 'Tests run:' /tmp/backend-test.log | tail -1 | sed -E 's/.*Failures: ([0-9]+).*/\1/')
  ERROR_COUNT=$(grep 'Tests run:' /tmp/backend-test.log | tail -1 | sed -E 's/.*Errors: ([0-9]+).*/\1/')

  print_pass "Backend tests completed"
  echo "  Tests: $TEST_COUNT, Failures: $FAILURE_COUNT, Errors: $ERROR_COUNT"

  if [ "$FAILURE_COUNT" != "0" ] || [ "$ERROR_COUNT" != "0" ]; then
    print_fail "Backend tests have failures or errors"
    echo "See /tmp/backend-test.log for details"
  fi
else
  print_fail "Backend tests failed to run"
  echo "See /tmp/backend-test.log for details"
fi

cd "$PROJECT_ROOT"

# 3. Frontend Tests
print_header "3. Frontend Tests"
print_test "Running frontend tests with Vitest"

if npm test > /tmp/frontend-test.log 2>&1; then
  TEST_SUMMARY=$(grep -E 'Test Files|Tests' /tmp/frontend-test.log | tail -2)
  print_pass "Frontend tests completed"
  echo "$TEST_SUMMARY"
else
  print_fail "Frontend tests failed"
  echo "See /tmp/frontend-test.log for details"
fi

# 4. Frontend Build
print_header "4. Frontend Build"
print_test "Building frontend for production"

if npm run build > /tmp/frontend-build.log 2>&1; then
  BUILD_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
  print_pass "Frontend build successful (size: $BUILD_SIZE)"
else
  print_fail "Frontend build failed"
  echo "See /tmp/frontend-build.log for details"
fi

# 5. Backend Build (without tests)
print_header "5. Backend Build"
print_test "Building backend JAR (without tests)"

cd "$BACKEND_DIR"
if mvn clean package -DskipTests > /tmp/backend-build.log 2>&1; then
  JAR_SIZE=$(ls -lh target/*.jar 2>/dev/null | awk '{print $5}' | head -1)
  print_pass "Backend build successful (JAR size: $JAR_SIZE)"
else
  print_fail "Backend build failed"
  echo "See /tmp/backend-build.log for details"
fi

cd "$PROJECT_ROOT"

# 6. API Endpoint Smoke Tests (if backend is running)
print_header "6. API Endpoint Tests"

if curl -f -s -o /dev/null http://localhost:8080/actuator/health 2>/dev/null; then
  print_test "Testing critical API endpoints"

  # Test public listings endpoint (no auth required)
  if curl -f -s -o /dev/null http://localhost:8080/api/listings 2>/dev/null; then
    print_pass "GET /api/listings - OK"
  else
    print_fail "GET /api/listings - Failed"
  fi

  # Test insights endpoint (no auth for public insights)
  if curl -f -s -o /dev/null http://localhost:8080/api/insights/avg-price-by-area 2>/dev/null; then
    print_pass "GET /api/insights/avg-price-by-area - OK"
  else
    print_fail "GET /api/insights/avg-price-by-area - Failed"
  fi

  # Test health endpoint
  if curl -f -s -o /dev/null http://localhost:8080/actuator/health 2>/dev/null; then
    print_pass "GET /actuator/health - OK"
  else
    print_fail "GET /actuator/health - Failed"
  fi
else
  echo "⚠️  Backend not running, skipping API endpoint tests"
fi

# 7. Database Migration Check
print_header "7. Database Migration Check"
print_test "Checking Flyway migration status"

cd "$BACKEND_DIR"
if mvn flyway:info > /tmp/flyway-info.log 2>&1; then
  MIGRATION_COUNT=$(grep -c "Success" /tmp/flyway-info.log || echo "0")
  print_pass "Flyway migrations OK (count: $MIGRATION_COUNT)"

  # Show latest migrations (look for V__ pattern)
  echo "Recent migrations:"
  grep -E "V[0-9]+" /tmp/flyway-info.log | tail -5 || echo "No migrations found in output"
else
  # Flyway info requires DB connection, which might not be available
  echo "⚠️  Flyway info check skipped (DB connection may not be available)"
fi

cd "$PROJECT_ROOT"

# 8. Dependency Security Check
print_header "8. Dependency Security Check"
print_test "Checking npm dependencies for known vulnerabilities"

if npm audit --production --audit-level=high > /tmp/npm-audit.log 2>&1; then
  print_pass "No high/critical npm vulnerabilities found"
else
  # npm audit returns non-zero if vulnerabilities found
  VULN_COUNT=$(grep -o '[0-9]* vulnerabilities' /tmp/npm-audit.log | head -1)
  echo "⚠️  Found vulnerabilities: $VULN_COUNT"
  echo "Run 'npm audit' for details"
fi

# 9. TypeScript Type Check
print_header "9. TypeScript Type Check"
print_test "Running TypeScript compiler check"

if npx tsc --noEmit > /tmp/tsc-check.log 2>&1; then
  print_pass "No TypeScript errors found"
else
  ERROR_COUNT=$(wc -l < /tmp/tsc-check.log)
  print_fail "TypeScript errors found (count: $ERROR_COUNT)"
  echo "See /tmp/tsc-check.log for details"
fi

# 10. ESLint Check
print_header "10. ESLint Check"
print_test "Running ESLint on frontend code"

if npm run lint > /tmp/eslint.log 2>&1; then
  print_pass "No ESLint errors"
else
  echo "⚠️  ESLint found issues"
  echo "Run 'npm run lint' for details"
fi

# ============================================================
# PRODUCTION CHECKS (only run with --prod flag)
# ============================================================

if [ "$RUN_PROD" = true ]; then

  print_header "11. Production — Backend Health"
  print_test "GET $BACKEND_URL/actuator/health"
  HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL/actuator/health")
  HEALTH_BODY=$(curl -s --max-time 10 "$BACKEND_URL/actuator/health" 2>/dev/null)
  if [ "$HEALTH_STATUS" = "200" ] && echo "$HEALTH_BODY" | grep -q '"UP"'; then
    print_pass "Backend UP — $HEALTH_BODY"
  else
    print_fail "Backend health check failed (HTTP $HEALTH_STATUS)"
  fi

  print_header "12. Production — Frontend Loads"
  print_test "GET $FRONTEND_URL"
  FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$FRONTEND_URL")
  if [ "$FRONTEND_STATUS" = "200" ]; then
    FRONTEND_SIZE=$(curl -s -o /dev/null -w "%{size_download}" --max-time 10 "$FRONTEND_URL")
    print_pass "Frontend loaded (HTTP 200, ${FRONTEND_SIZE} bytes)"
  else
    print_fail "Frontend load failed (HTTP $FRONTEND_STATUS)"
  fi

  print_header "13. Production — CORS Preflight (Allowed Origin)"
  print_test "OPTIONS $BACKEND_URL/api/listings from $FRONTEND_URL"
  CORS_ALLOWED=$(curl -sv -X OPTIONS \
    "$BACKEND_URL/api/listings" \
    -H "Origin: $FRONTEND_URL" \
    -H 'Access-Control-Request-Method: GET' \
    2>&1)
  CORS_STATUS=$(echo "$CORS_ALLOWED" | grep -oE "< HTTP/[0-9.]+ [0-9]+" | grep -oE "[0-9]+$" | head -1)
  CORS_ORIGIN=$(echo "$CORS_ALLOWED" | grep -i "< access-control-allow-origin:" | grep -v "^$" | head -1)
  if [ "$CORS_STATUS" = "200" ] && [ -n "$CORS_ORIGIN" ]; then
    print_pass "CORS preflight approved — $CORS_ORIGIN"
  else
    print_fail "CORS preflight failed (HTTP $CORS_STATUS, no access-control-allow-origin header)"
    echo "  Expected: HTTP 200 + access-control-allow-origin: $FRONTEND_URL"
  fi

  print_header "14. Production — CORS Preflight (Blocked Origin)"
  print_test "OPTIONS $BACKEND_URL/api/listings from https://attacker.com"
  CORS_BLOCKED=$(curl -sv -X OPTIONS \
    "$BACKEND_URL/api/listings" \
    -H 'Origin: https://attacker.com' \
    -H 'Access-Control-Request-Method: GET' \
    2>&1)
  CORS_BLOCKED_STATUS=$(echo "$CORS_BLOCKED" | grep -oE "< HTTP/[0-9.]+ [0-9]+" | grep -oE "[0-9]+$" | head -1)
  CORS_BLOCKED_ORIGIN=$(echo "$CORS_BLOCKED" | grep -i "< access-control-allow-origin:" | head -1)
  if [ "$CORS_BLOCKED_STATUS" = "403" ] && [ -z "$CORS_BLOCKED_ORIGIN" ]; then
    print_pass "Blocked origin correctly rejected (HTTP 403, no CORS headers)"
  else
    print_fail "Blocked origin not properly rejected (HTTP $CORS_BLOCKED_STATUS, origin header: '$CORS_BLOCKED_ORIGIN')"
  fi

  print_header "15. Production — Unauthenticated API (Should 401)"
  print_test "GET $BACKEND_URL/api/listings (no auth token)"
  UNAUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL/api/listings")
  if [ "$UNAUTH_STATUS" = "401" ]; then
    print_pass "Unauthenticated request correctly rejected (HTTP 401)"
  else
    print_fail "Unexpected response to unauthenticated request (HTTP $UNAUTH_STATUS, expected 401)"
  fi

  print_header "16. Production — Frontend Chunk Integrity"
  # Note: minification removes the literal string "react-leaflet" from chunks.
  # Use exported symbol names (MapContainer, useMap, TileLayer) to detect presence instead.
  HTML_CONTENT=$(curl -s --max-time 10 "$FRONTEND_URL")

  print_test "Verify vendor-react contains react-leaflet exports (HOT-4 fix)"
  VENDOR_REACT_FILE=$(echo "$HTML_CONTENT" | grep -oE 'assets/vendor-react-[^"]+\.js' | head -1)
  if [ -z "$VENDOR_REACT_FILE" ]; then
    print_fail "Could not find vendor-react chunk in HTML"
  else
    REACT_CHUNK_CONTENT=$(curl -s --max-time 30 "$FRONTEND_URL/$VENDOR_REACT_FILE")
    REACT_CHUNK_HAS_LEAFLET=$(echo "$REACT_CHUNK_CONTENT" | grep -cE "MapContainer|useMap|TileLayer" || true)
    if [ "$REACT_CHUNK_HAS_LEAFLET" -gt 0 ]; then
      print_pass "vendor-react ($VENDOR_REACT_FILE) contains react-leaflet exports (MapContainer/useMap/TileLayer) ✓"
    else
      print_fail "vendor-react does NOT contain react-leaflet exports — HOT-4 fix may not be deployed"
    fi
  fi

  print_test "Verify vendor-leaflet does NOT contain react-leaflet exports"
  VENDOR_LEAFLET_FILE=$(echo "$HTML_CONTENT" | grep -oE 'assets/vendor-leaflet-[^"]+\.js' | head -1)
  if [ -z "$VENDOR_LEAFLET_FILE" ]; then
    print_fail "Could not find vendor-leaflet chunk in HTML"
  else
    LEAFLET_CHUNK_HAS_REACT=$(curl -s --max-time 30 "$FRONTEND_URL/$VENDOR_LEAFLET_FILE" | grep -cE "MapContainer|useMap" || true)
    if [ "$LEAFLET_CHUNK_HAS_REACT" -eq 0 ]; then
      print_pass "vendor-leaflet ($VENDOR_LEAFLET_FILE) is clean — no react-leaflet exports ✓"
    else
      print_fail "vendor-leaflet contains react-leaflet exports — chunk split is incorrect"
    fi
  fi

  print_header "17. Production — Ingestion Endpoint Protection (Sprint 3 PR-1)"
  print_test "POST $BACKEND_URL/api/ingestion/ingest-posts — no API key (should 401)"
  INGEST_NO_KEY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST -H "Content-Type: application/json" -d '[]' \
    "$BACKEND_URL/api/ingestion/ingest-posts")
  if [ "$INGEST_NO_KEY" = "401" ]; then
    print_pass "Ingestion endpoint correctly rejects missing API key (HTTP 401)"
  else
    print_fail "Ingestion endpoint with no key returned HTTP $INGEST_NO_KEY (expected 401)"
  fi

  print_test "POST $BACKEND_URL/api/ingestion/ingest-posts — wrong API key (should 401)"
  INGEST_WRONG_KEY=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST -H "Content-Type: application/json" -H "X-Ingestion-Api-Key: wrong-key" \
    -d '[{"sourcePostId":"smoke-test","rawText":"test"}]' \
    "$BACKEND_URL/api/ingestion/ingest-posts")
  if [ "$INGEST_WRONG_KEY" = "401" ]; then
    print_pass "Ingestion endpoint correctly rejects wrong API key (HTTP 401)"
  else
    print_fail "Ingestion endpoint with wrong key returned HTTP $INGEST_WRONG_KEY (expected 401)"
  fi

else
  echo ""
  echo -e "${YELLOW}ℹ️  Production checks skipped. Run with --prod to include them.${NC}"
  echo "   Example: ./scripts/smoke_test.sh --prod"
fi

# Final Summary
print_header "Smoke Test Summary"

echo ""
echo "Total checks passed: $PASSED"
echo "Total checks failed: $FAILURES"
echo ""

if [ $FAILURES -eq 0 ]; then
  echo -e "${GREEN}✓ All smoke tests PASSED${NC}"
  exit 0
else
  echo -e "${RED}✗ Some smoke tests FAILED${NC}"
  echo ""
  echo "Log files saved to /tmp/:"
  echo "  - backend-test.log"
  echo "  - frontend-test.log"
  echo "  - frontend-build.log"
  echo "  - backend-build.log"
  echo "  - flyway-info.log"
  echo "  - npm-audit.log"
  echo "  - tsc-check.log"
  echo "  - eslint.log"
  exit 1
fi
