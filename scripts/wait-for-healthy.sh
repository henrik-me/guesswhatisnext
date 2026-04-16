#!/usr/bin/env bash
# wait-for-healthy.sh — Wait for the app's /api/health endpoint to report checks.database.status=ok.
#
# Usage:
#   ./scripts/wait-for-healthy.sh [BASE_URL]
#   BASE_URL=https://localhost ./scripts/wait-for-healthy.sh
#
# The script polls /api/health every 2 seconds, timing out after 120 seconds.
# Uses SYSTEM_API_KEY env var if set; otherwise defaults to test-system-api-key.
# Works with both HTTP and HTTPS (--insecure for self-signed certs).
# Exit 0 on success, exit 1 on timeout.

set -euo pipefail

BASE_URL="${1:-${BASE_URL:-https://localhost}}"
BASE_URL="${BASE_URL%/}"
API_KEY="${SYSTEM_API_KEY:-test-system-api-key}"
TIMEOUT="${HEALTH_TIMEOUT:-120}"
INTERVAL=2

echo "Waiting for ${BASE_URL}/api/health (timeout: ${TIMEOUT}s)..."

elapsed=0
while [ "$elapsed" -lt "$TIMEOUT" ]; do
  # Use --insecure for self-signed Caddy certs, --max-time to avoid hanging.
  # Capture both response body and HTTP status so auth failures can fail fast.
  curl_output=$(curl -s --insecure --max-time 5 \
    -H "X-API-Key: ${API_KEY}" \
    -w '\n%{http_code}' \
    "${BASE_URL}/api/health" 2>/dev/null) || true

  http_code=$(printf '%s\n' "$curl_output" | tail -n1)
  response=$(printf '%s\n' "$curl_output" | sed '$d')

  if [ -z "$http_code" ]; then
    http_code="000"
  fi

  case "$http_code" in
    200)
      # Check for database.status=ok in the JSON response
      if echo "$response" | grep -q '"status":"ok"'; then
        db_status=$(echo "$response" | grep -o '"database":{[^}]*}' | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ "$db_status" = "ok" ]; then
          echo "Health check passed — database.status=ok (${elapsed}s elapsed)"
          exit 0
        fi
      fi
      ;;
    401|403)
      echo "ERROR: Health check failed with HTTP ${http_code} from ${BASE_URL}/api/health"
      echo "Check that SYSTEM_API_KEY is set correctly and accepted by the server."
      echo "Last response: ${response:-<no response>}"
      exit 1
      ;;
  esac

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
  printf "  ... %ds / %ds\n" "$elapsed" "$TIMEOUT"
done

echo "ERROR: Health check timed out after ${TIMEOUT}s"
echo "Last response: ${response:-<no response>}"
exit 1
