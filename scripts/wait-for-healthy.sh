#!/usr/bin/env bash
# wait-for-healthy.sh — Wait for the app's /api/health endpoint to report database.status=ok.
#
# Usage:
#   ./scripts/wait-for-healthy.sh [BASE_URL]
#   BASE_URL=https://localhost ./scripts/wait-for-healthy.sh
#
# The script polls /api/health every 2 seconds, timing out after 120 seconds.
# Requires SYSTEM_API_KEY env var (defaults to test-system-api-key).
# Works with both HTTP and HTTPS (--insecure for self-signed certs).
# Exit 0 on success, exit 1 on timeout.

set -euo pipefail

# Verify Docker Compose v2+ is available
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose v2+ required. Install: https://docs.docker.com/compose/install/"
  echo "  The legacy 'docker-compose' (v1) is not supported."
  exit 1
fi

BASE_URL="${1:-${BASE_URL:-https://localhost}}"
BASE_URL="${BASE_URL%/}"
API_KEY="${SYSTEM_API_KEY:-test-system-api-key}"
TIMEOUT="${HEALTH_TIMEOUT:-120}"
INTERVAL=2

echo "Waiting for ${BASE_URL}/api/health (timeout: ${TIMEOUT}s)..."

elapsed=0
while [ "$elapsed" -lt "$TIMEOUT" ]; do
  # Use --insecure for self-signed Caddy certs, --max-time to avoid hanging
  response=$(curl -s --insecure --max-time 5 \
    -H "X-API-Key: ${API_KEY}" \
    "${BASE_URL}/api/health" 2>/dev/null) || true

  # Check for database.status=ok in the JSON response
  if echo "$response" | grep -q '"status":"ok"'; then
    db_status=$(echo "$response" | grep -o '"database":{[^}]*}' | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$db_status" = "ok" ]; then
      echo "Health check passed — database.status=ok (${elapsed}s elapsed)"
      exit 0
    fi
  fi

  sleep "$INTERVAL"
  elapsed=$((elapsed + INTERVAL))
  printf "  ... %ds / %ds\n" "$elapsed" "$TIMEOUT"
done

echo "ERROR: Health check timed out after ${TIMEOUT}s"
echo "Last response: ${response:-<no response>}"
exit 1
