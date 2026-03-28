#!/usr/bin/env bash
# Azure Container Apps deployment script for GuessWhatIsNext
# Usage: ./infra/deploy.sh
# Idempotent — safe to re-run.

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

RESOURCE_GROUP="gwn-rg"
LOCATION="eastus"
ENVIRONMENT="gwn-env"
STORAGE_ACCOUNT="gwnstorage${RANDOM_SUFFIX:-$(az account show --query id -o tsv | cut -c1-8)}"
SHARE_NAME_STAGING="gwn-data-staging"
SHARE_NAME_PRODUCTION="gwn-data-production"
REGISTRY="ghcr.io"
IMAGE_NAME="ghcr.io/henrik-me/guesswhatisnext"
IMAGE_TAG="${IMAGE_TAG:-latest}"

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

# ─── Azure Storage for SQLite persistence ────────────────────────────────────
# Each environment gets its own file share so staging data never touches production.
# The app uses CREATE TABLE IF NOT EXISTS and only seeds when tables are empty,
# so deployments never overwrite existing data. Schema changes are additive
# (ALTER TABLE ADD COLUMN) and applied on startup.
#
# MIGRATION NOTE: If upgrading from the old shared gwn-data share, copy data first:
#   azcopy copy "https://<account>.file.core.windows.net/gwn-data/*" \
#               "https://<account>.file.core.windows.net/gwn-data-production/" --recursive

echo "→ Setting up persistent storage..."

# Find or create storage account (names must be globally unique)
EXISTING_STORAGE=$(az storage account list \
  --resource-group "$RESOURCE_GROUP" \
  --query "[?starts_with(name, 'gwnstorage')].name | [0]" \
  -o tsv)

if [ -n "$EXISTING_STORAGE" ] && [ "$EXISTING_STORAGE" != "None" ]; then
  STORAGE_ACCOUNT="$EXISTING_STORAGE"
  echo "  Using existing storage account: $STORAGE_ACCOUNT"
else
  # Generate a unique name
  STORAGE_ACCOUNT="gwnstorage$(date +%s | tail -c 9)"
  echo "  Creating storage account: $STORAGE_ACCOUNT"
  az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --output none
fi

STORAGE_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "$STORAGE_ACCOUNT" \
  --query "[0].value" \
  -o tsv)

# Create separate file shares for staging and production
for SHARE in "$SHARE_NAME_STAGING" "$SHARE_NAME_PRODUCTION"; do
  echo "  Creating file share: $SHARE"
  az storage share create \
    --name "$SHARE" \
    --account-name "$STORAGE_ACCOUNT" \
    --account-key "$STORAGE_KEY" \
    --output none 2>/dev/null || true
done

# Register storage mounts in Container Apps environment (one per share)
az containerapp env storage set \
  --name "$ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-name gwn-storage-staging \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$SHARE_NAME_STAGING" \
  --access-mode ReadWrite \
  --output none 2>/dev/null || true

az containerapp env storage set \
  --name "$ENVIRONMENT" \
  --resource-group "$RESOURCE_GROUP" \
  --storage-name gwn-storage-production \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$SHARE_NAME_PRODUCTION" \
  --access-mode ReadWrite \
  --output none 2>/dev/null || true

# ─── Deploy Staging ──────────────────────────────────────────────────────────

echo "→ Deploying staging container app..."
if ! az containerapp show --name gwn-staging --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  az containerapp create \
    --name gwn-staging \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT" \
    --image "$IMAGE_NAME:$IMAGE_TAG" \
    --target-port 3000 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 2 \
    --cpu 0.25 \
    --memory 0.5Gi \
    --env-vars \
      NODE_ENV=staging \
      PORT=3000 \
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
      JWT_SECRET="$JWT_SECRET" \
      SYSTEM_API_KEY="$SYSTEM_API_KEY" \
    --output none
  echo "  Staging app updated."
fi

# Add volume mount to staging
az containerapp update \
  --name gwn-staging \
  --resource-group "$RESOURCE_GROUP" \
  --yaml /dev/stdin <<EOF 2>/dev/null || echo "  Volume mount may need manual config via Azure Portal."
properties:
  template:
    volumes:
      - name: data-volume
        storageName: gwn-storage-staging
        storageType: AzureFile
    containers:
      - name: gwn-staging
        image: $IMAGE_NAME:$IMAGE_TAG
        volumeMounts:
          - volumeName: data-volume
            mountPath: /app/data
EOF

# ─── Deploy Production ───────────────────────────────────────────────────────

echo "→ Deploying production container app..."
if ! az containerapp show --name gwn-production --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  az containerapp create \
    --name gwn-production \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT" \
    --image "$IMAGE_NAME:$IMAGE_TAG" \
    --target-port 3000 \
    --ingress external \
    --min-replicas 1 \
    --max-replicas 5 \
    --cpu 0.5 \
    --memory 1Gi \
    --env-vars \
      NODE_ENV=production \
      PORT=3000 \
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
      JWT_SECRET="$JWT_SECRET" \
      SYSTEM_API_KEY="$SYSTEM_API_KEY" \
    --output none
  echo "  Production app updated."
fi

# Add volume mount to production
az containerapp update \
  --name gwn-production \
  --resource-group "$RESOURCE_GROUP" \
  --yaml /dev/stdin <<EOF 2>/dev/null || echo "  Volume mount may need manual config via Azure Portal."
properties:
  template:
    volumes:
      - name: data-volume
        storageName: gwn-storage-production
        storageType: AzureFile
    containers:
      - name: gwn-production
        image: $IMAGE_NAME:$IMAGE_TAG
        volumeMounts:
          - volumeName: data-volume
            mountPath: /app/data
EOF

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
