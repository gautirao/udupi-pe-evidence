#!/usr/bin/env bash
# Sprint 1 Smoke Test Script
# Runs all critical checks to verify system health
# Exit code: 0 = all pass, 1 = any failure

set -e  # Exit on first failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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
