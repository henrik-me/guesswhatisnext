#!/usr/bin/env bash
# GitHub + Azure setup for GuessWhatIsNext CI/CD
# Run once after Azure resources are provisioned with infra/deploy.sh
#
# Prerequisites:
#   - Azure CLI logged in (az login)
#   - GitHub CLI logged in (gh auth login)
#   - infra/deploy.sh has been run successfully
#
# Usage: ./infra/setup-github.sh

set -euo pipefail

REPO="henrik-me/guesswhatisnext"
RESOURCE_GROUP="gwn-rg"

echo "=== GitHub CI/CD Setup for $REPO ==="
echo ""

# ─── 1. Create Azure service principal ────────────────────────────────────────

echo "→ Step 1: Azure service principal"
SUBSCRIPTION_ID=$(az account show --query id -o tsv)

echo "  Creating service principal 'gwn-github-actions'..."
SP_JSON=$(az ad sp create-for-rbac \
  --name "gwn-github-actions" \
  --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --sdk-auth 2>/dev/null)

echo "$SP_JSON" | gh secret set AZURE_CREDENTIALS --repo "$REPO"
echo "  ✓ AZURE_CREDENTIALS set as GitHub secret"

# ─── 2. Set app secrets in GitHub ─────────────────────────────────────────────

echo ""
echo "→ Step 2: App secrets"

set_or_generate_secret() {
  local name="$1"
  local byte_length="$2"
  local env_val="${!name:-}"

  if [ -n "$env_val" ]; then
    echo "$env_val" | gh secret set "$name" --repo "$REPO"
    echo "  ✓ $name set from environment variable"
  else
    existing=$(gh secret list --repo "$REPO" --json name --jq '.[].name' 2>/dev/null | grep -x "$name" || true)
    if [ -n "$existing" ]; then
      echo "  ✓ $name already exists, skipping"
    else
      openssl rand -base64 "$byte_length" | gh secret set "$name" --repo "$REPO"
      echo "  ✓ $name generated and set"
    fi
  fi
}

set_or_generate_secret "JWT_SECRET" 48
set_or_generate_secret "SYSTEM_API_KEY" 32

# ─── 3. Get deployed URLs ────────────────────────────────────────────────────

echo ""
echo "→ Step 3: Retrieve deployed URLs"

STAGING_FQDN=$(az containerapp show \
  --name gwn-staging \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  -o tsv 2>/dev/null || echo "")

PROD_FQDN=$(az containerapp show \
  --name gwn-production \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  -o tsv 2>/dev/null || echo "")

if [ -z "$STAGING_FQDN" ] || [ -z "$PROD_FQDN" ]; then
  echo "  ⚠ Container apps not found. Run infra/deploy.sh first."
  echo "  Skipping URL configuration."
else
  STAGING_URL="https://$STAGING_FQDN"
  PROD_URL="https://$PROD_FQDN"

  echo "  Staging:    $STAGING_URL"
  echo "  Production: $PROD_URL"

  # STAGING_URL as variable (staging-deploy.yml reads vars.STAGING_URL)
  # PROD_URL as secret (health-monitor.yml reads secrets.PROD_URL)
  echo "$STAGING_URL" | gh variable set STAGING_URL --repo "$REPO" 2>/dev/null || \
    echo "  ⚠ Could not set STAGING_URL variable (may need environment-level config)"
  echo "$PROD_URL" | gh secret set PROD_URL --repo "$REPO" 2>/dev/null || \
    echo "  ⚠ Could not set PROD_URL secret (may need environment-level config)"
  echo "  ✓ STAGING_URL set as GitHub variable"
  echo "  ✓ PROD_URL set as GitHub secret"
fi

# ─── 4. Summary ──────────────────────────────────────────────────────────────

echo ""
echo "=== Setup Complete ==="
echo ""
echo "GitHub Secrets (set automatically):"
echo "  ✓ AZURE_CREDENTIALS — service principal for Azure deployments"
echo "  ✓ JWT_SECRET"
echo "  ✓ SYSTEM_API_KEY"
echo "  ✓ PROD_URL (if container apps were found)"
echo ""
echo "GitHub Variables:"
echo "  ✓ STAGING_URL (if container apps were found)"
echo ""
echo "Manual steps remaining:"
echo "  1. Create 'staging' environment:  Settings → Environments → New"
echo "     - Add STAGING_URL variable if not set above"
echo "  2. Create 'production' environment:  Settings → Environments → New"
echo "     - Add PROD_URL secret if not set above"
echo "     - Enable 'Required reviewers' for manual approval gate"
echo "  3. (Optional) Enable branch protection / rulesets on 'main'"
echo ""
echo "Note: GitHub Environments with approval gates require GitHub Pro"
echo "for private repositories. The staging deploy workflow will still"
echo "run builds and smoke tests without environments configured —"
echo "only the Azure deploy step will be skipped."
