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

# ─── 2. Get deployed URLs ────────────────────────────────────────────────────

echo ""
echo "→ Step 2: Retrieve deployed URLs"

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

  # Set as repo-level variables (environments may not be available on free plan)
  echo "$STAGING_URL" | gh variable set STAGING_URL --repo "$REPO" 2>/dev/null || \
    echo "  ⚠ Could not set STAGING_URL variable (may need environment-level config)"
  echo "$PROD_URL" | gh variable set PROD_URL --repo "$REPO" 2>/dev/null || \
    echo "  ⚠ Could not set PROD_URL variable (may need environment-level config)"
  echo "  ✓ URLs set as GitHub variables"
fi

# ─── 3. Summary ──────────────────────────────────────────────────────────────

echo ""
echo "=== Setup Complete ==="
echo ""
echo "GitHub Secrets (set automatically):"
echo "  ✓ AZURE_CREDENTIALS — service principal for Azure deployments"
echo "  ✓ JWT_SECRET — set previously"
echo "  ✓ SYSTEM_API_KEY — set previously"
echo ""
echo "Manual steps remaining:"
echo "  1. Create 'staging' environment:  Settings → Environments → New"
echo "     - Add STAGING_URL variable if not set above"
echo "  2. Create 'production' environment:  Settings → Environments → New"
echo "     - Add PRODUCTION_URL variable if not set above"
echo "     - Enable 'Required reviewers' for manual approval gate"
echo "  3. (Optional) Enable branch protection / rulesets on 'main'"
echo ""
echo "Note: GitHub Environments with approval gates require GitHub Pro"
echo "for private repositories. The staging deploy workflow will still"
echo "run builds and smoke tests without environments configured —"
echo "only the Azure deploy step will be skipped."
