#!/usr/bin/env bash
# Deprecated compatibility wrapper.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "setup-github.sh is deprecated; forwarding to deploy.sh --skip-provision"
exec "$SCRIPT_DIR/deploy.sh" --skip-provision "$@"
