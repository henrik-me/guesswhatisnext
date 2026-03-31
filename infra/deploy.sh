#!/usr/bin/env bash
# Azure Container Apps deployment script for GuessWhatIsNext
# Usage: ./infra/deploy.sh
# Idempotent — safe to re-run.

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

RESOURCE_GROUP="gwn-rg"
LOCATION="eastus"
ENVIRONMENT="gwn-env"
REGISTRY="ghcr.io"
IMAGE_NAME="ghcr.io/henrik-me/guesswhatisnext"
IMAGE_TAG="${IMAGE_TAG:-latest}"
# For initial provisioning, use a public placeholder since GHCR is private.
# Staging auto-deploys the real GHCR image on merge to main via CI/CD;
# production deployment is manual or via a separate workflow.
PLACEHOLDER_IMAGE="mcr.microsoft.com/k8se/quickstart:latest"

# Validate required environment variables
for var in JWT_SECRET SYSTEM_API_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "Error: $var environment variable is required"
    exit 1
  fi
done

echo "=== GuessWhatIsNext Azure Deployment ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location:       $LOCATION"
echo "Image:          $IMAGE_NAME:$IMAGE_TAG"
echo ""

# ─── Resource Group ──────────────────────────────────────────────────────────

echo "→ Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

# ─── Container Apps Environment ──────────────────────────────────────────────

echo "→ Creating Container Apps environment..."
if ! az containerapp env show --name "$ENVIRONMENT" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  az containerapp env create \
    --name "$ENVIRONMENT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
else
  echo "  Environment already exists, skipping."
fi

# ─── Deploy Staging ──────────────────────────────────────────────────────────

echo "→ Deploying staging container app..."
if ! az containerapp show --name gwn-staging --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  az containerapp create \
    --name gwn-staging \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT" \
    --image "$PLACEHOLDER_IMAGE" \
    --target-port 3000 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 2 \
    --cpu 0.25 \
    --memory 0.5Gi \
    --env-vars \
      NODE_ENV=staging \
      PORT=3000 \
      GWN_DB_PATH=/tmp/game.db \
      JWT_SECRET="$JWT_SECRET" \
      SYSTEM_API_KEY="$SYSTEM_API_KEY" \
    --output none
else
  az containerapp update \
    --name gwn-staging \
    --resource-group "$RESOURCE_GROUP" \
    --image "$IMAGE_NAME:$IMAGE_TAG" \
    --set-env-vars \
      NODE_ENV=staging \
      PORT=3000 \
      GWN_DB_PATH=/tmp/game.db \
      JWT_SECRET="$JWT_SECRET" \
      SYSTEM_API_KEY="$SYSTEM_API_KEY" \
    --output none
  echo "  Staging app updated."
fi

# ─── Deploy Production ───────────────────────────────────────────────────────

echo "→ Deploying production container app..."
if ! az containerapp show --name gwn-production --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  az containerapp create \
    --name gwn-production \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT" \
    --image "$PLACEHOLDER_IMAGE" \
    --target-port 3000 \
    --ingress external \
    --min-replicas 1 \
    --max-replicas 5 \
    --cpu 0.5 \
    --memory 1Gi \
    --env-vars \
      NODE_ENV=production \
      PORT=3000 \
      GWN_DB_PATH=/tmp/game.db \
      JWT_SECRET="$JWT_SECRET" \
      SYSTEM_API_KEY="$SYSTEM_API_KEY" \
    --output none
else
  az containerapp update \
    --name gwn-production \
    --resource-group "$RESOURCE_GROUP" \
    --image "$IMAGE_NAME:$IMAGE_TAG" \
    --set-env-vars \
      NODE_ENV=production \
      PORT=3000 \
      GWN_DB_PATH=/tmp/game.db \
      JWT_SECRET="$JWT_SECRET" \
      SYSTEM_API_KEY="$SYSTEM_API_KEY" \
    --output none
  echo "  Production app updated."
fi

# ─── Output URLs ─────────────────────────────────────────────────────────────

echo ""
echo "=== Deployment Complete ==="

STAGING_FQDN=$(az containerapp show \
  --name gwn-staging \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  -o tsv 2>/dev/null || echo "N/A")

PROD_FQDN=$(az containerapp show \
  --name gwn-production \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  -o tsv 2>/dev/null || echo "N/A")

echo "Staging:    https://$STAGING_FQDN"
echo "Production: https://$PROD_FQDN"
echo ""
echo "Next steps:"
echo "  1. Add STAGING_URL and PRODUCTION_URL as GitHub Environment variables"
echo "  2. Add AZURE_CREDENTIALS, JWT_SECRET, SYSTEM_API_KEY as GitHub secrets"
echo "  3. Configure 'production' environment to require manual approval in GitHub"
