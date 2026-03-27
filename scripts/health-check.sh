#!/usr/bin/env bash
# health-check.sh — Local health check for GuessWhatIsNext
# Usage: ./scripts/health-check.sh <base_url> <system_api_key>
# Example: ./scripts/health-check.sh http://localhost:3000 gwn-dev-system-key

set -euo pipefail

BASE_URL="${1:?Usage: $0 <base_url> <system_api_key>}"
API_KEY="${2:?Usage: $0 <base_url> <system_api_key>}"

# Strip trailing slash
BASE_URL="${BASE_URL%/}"

PASS=0
FAIL=0
EXIT_CODE=0

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  GREEN='' RED='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

pass() {
  PASS=$((PASS + 1))
  printf "${GREEN}  ✓ PASS${RESET} %s\n" "$1"
}

fail() {
  FAIL=$((FAIL + 1))
  EXIT_CODE=1
  printf "${RED}  ✗ FAIL${RESET} %s\n" "$1"
  [ -n "${2:-}" ] && printf "         %s\n" "$2"
}

section() {
  printf "\n${BOLD}${CYAN}━━ %s${RESET}\n" "$1"
}

# ── Health endpoint ──────────────────────────────────────────────────────────
section "Health Endpoint"

set +e
START_MS=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
HEALTH_RESPONSE=$(curl -s -w '\n%{http_code}' --max-time 10 \
  -H "X-API-Key: $API_KEY" \
  "$BASE_URL/api/health")
CURL_EXIT=$?
END_MS=$(date +%s%3N 2>/dev/null || python3 -c 'import time; print(int(time.time()*1000))')
ELAPSED=$((END_MS - START_MS))
set -e

if [ $CURL_EXIT -ne 0 ]; then
  fail "Health endpoint reachable" "Connection failed (curl exit $CURL_EXIT)"
else
  HEALTH_HTTP=$(echo "$HEALTH_RESPONSE" | tail -1)
  HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

  if [ "$HEALTH_HTTP" = "200" ]; then
    pass "Health endpoint reachable (HTTP $HEALTH_HTTP, ${ELAPSED}ms)"
  else
    fail "Health endpoint reachable" "HTTP $HEALTH_HTTP"
  fi

  # Check status field
  HEALTH_STATUS=$(echo "$HEALTH_BODY" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$HEALTH_STATUS" = "ok" ]; then
    pass "Health status: $HEALTH_STATUS"
  elif [ "$HEALTH_STATUS" = "degraded" ]; then
    printf "${YELLOW}  ⚠ WARN${RESET} Health status: degraded\n"
  else
    fail "Health status" "Got: ${HEALTH_STATUS:-empty}"
  fi

  # Check response time
  if [ "$ELAPSED" -le 5000 ]; then
    pass "Response time: ${ELAPSED}ms (≤5000ms)"
  else
    fail "Response time" "${ELAPSED}ms exceeds 5000ms threshold"
  fi
fi

# ── Auth flow ────────────────────────────────────────────────────────────────
section "Auth Flow (register → login → fetch scores)"

USERNAME="hc_test_$(date +%s)"
PASSWORD="healthcheck_pass_123"

# Register
set +e
REG_RESPONSE=$(curl -s -w '\n%{http_code}' --max-time 10 \
  -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
set -e
REG_HTTP=$(echo "$REG_RESPONSE" | tail -1)
REG_BODY=$(echo "$REG_RESPONSE" | sed '$d')

if [ "$REG_HTTP" = "201" ]; then
  pass "Register user ($USERNAME)"
  REG_TOKEN=$(echo "$REG_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
  fail "Register user" "HTTP $REG_HTTP"
  REG_TOKEN=""
fi

# Login
set +e
LOGIN_RESPONSE=$(curl -s -w '\n%{http_code}' --max-time 10 \
  -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
set -e
LOGIN_HTTP=$(echo "$LOGIN_RESPONSE" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$LOGIN_HTTP" = "200" ]; then
  pass "Login user"
  TOKEN=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
else
  fail "Login user" "HTTP $LOGIN_HTTP"
  TOKEN="$REG_TOKEN"
fi

# Fetch scores (use whichever token we have)
if [ -n "$TOKEN" ]; then
  set +e
  SCORES_RESPONSE=$(curl -s -w '\n%{http_code}' --max-time 10 \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/scores/me")
  set -e
  SCORES_HTTP=$(echo "$SCORES_RESPONSE" | tail -1)

  if [ "$SCORES_HTTP" = "200" ]; then
    pass "Fetch scores (GET /api/scores/me)"
  else
    fail "Fetch scores" "HTTP $SCORES_HTTP"
  fi
else
  fail "Fetch scores" "No auth token available"
fi

# ── Puzzles endpoint ─────────────────────────────────────────────────────────
section "Puzzles Endpoint"

if [ -n "$TOKEN" ]; then
  set +e
  PZ_RESPONSE=$(curl -s -w '\n%{http_code}' --max-time 10 \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE_URL/api/puzzles")
  set -e
  PZ_HTTP=$(echo "$PZ_RESPONSE" | tail -1)
  PZ_BODY=$(echo "$PZ_RESPONSE" | sed '$d')

  if [ "$PZ_HTTP" = "200" ]; then
    pass "Puzzles endpoint (HTTP $PZ_HTTP)"
  else
    fail "Puzzles endpoint" "HTTP $PZ_HTTP"
  fi

  # Verify it returns JSON array
  if echo "$PZ_BODY" | grep -q '^\['; then
    PUZZLE_COUNT=$(echo "$PZ_BODY" | grep -o '"id"' | wc -l)
    pass "Puzzles returns JSON array ($PUZZLE_COUNT puzzles)"
  else
    fail "Puzzles response format" "Expected JSON array"
  fi
else
  fail "Puzzles endpoint" "No auth token available"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
printf "\n${BOLD}━━ Summary${RESET}\n"
printf "  ${GREEN}Passed: $PASS${RESET}  ${RED}Failed: $FAIL${RESET}\n"

if [ $EXIT_CODE -eq 0 ]; then
  printf "\n${GREEN}${BOLD}All checks passed ✓${RESET}\n"
else
  printf "\n${RED}${BOLD}Some checks failed ✗${RESET}\n"
fi

exit $EXIT_CODE
