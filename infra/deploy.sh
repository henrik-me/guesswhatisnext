#!/usr/bin/env bash
# Unified Azure + GitHub bootstrap for GuessWhatIsNext
# Usage: ./infra/deploy.sh [--skip-provision] [--skip-health-check]
# Idempotent — safe to re-run.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./infra/deploy.sh [--skip-provision] [--skip-health-check]

Options:
  --skip-provision     Skip resource-group/environment/app creation and only
                       reconfigure existing apps, GitHub settings, and checks.
  --skip-health-check  Skip post-setup health verification.
  -h, --help           Show this help message.
EOF
}

SKIP_PROVISION=0
SKIP_HEALTH_CHECK=0

for arg in "$@"; do
  case "$arg" in
    --skip-provision)
      SKIP_PROVISION=1
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RESOURCE_GROUP="${RESOURCE_GROUP:-gwn-rg}"
LOCATION="${LOCATION:-eastus}"
ENVIRONMENT="${ENVIRONMENT:-gwn-env}"
IMAGE_NAME="${IMAGE_NAME:-ghcr.io/henrik-me/guesswhatisnext}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLACEHOLDER_IMAGE="${PLACEHOLDER_IMAGE:-mcr.microsoft.com/k8se/quickstart:latest}"
TARGET_REPO="${TARGET_REPO:-henrik-me/guesswhatisnext}"
SERVICE_PRINCIPAL_NAME="${SERVICE_PRINCIPAL_NAME:-gwn-github-actions}"
STAGING_APP_NAME="gwn-staging"
PRODUCTION_APP_NAME="gwn-production"

SUBSCRIPTION_ID=""
TENANT_ID=""
RESOURCE_SCOPE=""
AZURE_CREDENTIALS_JSON=""

log_step() {
  echo "→ $1"
}

log_info() {
  echo "  $1"
}

log_success() {
  echo "  ✓ $1"
}

log_warn() {
  echo "  ⚠ $1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

gh_secret_exists() {
  local name="$1"
  gh secret list --repo "$TARGET_REPO" --json name --jq '.[].name' 2>/dev/null | grep -Fxq "$name"
}

gh_variable_exists() {
  local name="$1"
  gh variable list --repo "$TARGET_REPO" --json name --jq '.[].name' 2>/dev/null | grep -Fxq "$name"
}

set_gh_secret() {
  local name="$1"
  local value="$2"
  printf '%s' "$value" | gh secret set "$name" --repo "$TARGET_REPO" >/dev/null
  log_success "$name set as GitHub secret"
}

set_gh_variable() {
  local name="$1"
  local value="$2"
  gh variable set "$name" --repo "$TARGET_REPO" --body "$value" >/dev/null
  log_success "$name set as GitHub variable"
}

new_secure_secret() {
  local byte_length="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 "$byte_length" | tr -d '\r\n'
  else
    node -e "const crypto = require('node:crypto'); process.stdout.write(crypto.randomBytes(Number(process.argv[1])).toString('base64'));" "$byte_length"
  fi
}

sanitize_tsv_value() {
  local value="$1"
  value="${value//$'\r'/}"
  if [ "$value" = "None" ] || [ "$value" = "null" ]; then
    printf ''
  else
    printf '%s' "$value"
  fi
}

get_app_query() {
  local app_name="$1"
  local query="$2"
  local value
  value="$(az containerapp show --name "$app_name" --resource-group "$RESOURCE_GROUP" --query "$query" -o tsv 2>/dev/null || true)"
  sanitize_tsv_value "$value"
}

get_app_env_value() {
  local app_name="$1"
  local env_name="$2"
  get_app_query "$app_name" "properties.template.containers[0].env[?name=='$env_name'].value | [0]"
}

get_app_image() {
  local app_name="$1"
  get_app_query "$app_name" "properties.template.containers[0].image"
}

get_app_fqdn() {
  local app_name="$1"
  get_app_query "$app_name" "properties.configuration.ingress.fqdn"
}

get_host_from_url() {
  local url="$1"
  if [ -z "$url" ]; then
    printf ''
    return 0
  fi

  node -e "try { process.stdout.write(new URL(process.argv[1]).host); } catch { process.exit(1); }" "$url"
}

resolve_shared_secret() {
  local env_name="$1"
  local byte_length="$2"
  local value

  value="${!env_name:-}"
  if [ -n "$value" ]; then
    printf '%s' "$value"
    return 0
  fi

  for app_name in "$STAGING_APP_NAME" "$PRODUCTION_APP_NAME"; do
    value="$(get_app_env_value "$app_name" "$env_name")"
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return 0
    fi
  done

  new_secure_secret "$byte_length"
}

ensure_azure_login() {
  SUBSCRIPTION_ID="$(az account show --query id -o tsv 2>/dev/null || true)"
  TENANT_ID="$(az account show --query tenantId -o tsv 2>/dev/null || true)"
  SUBSCRIPTION_ID="$(sanitize_tsv_value "$SUBSCRIPTION_ID")"
  TENANT_ID="$(sanitize_tsv_value "$TENANT_ID")"

  if [ -z "$SUBSCRIPTION_ID" ] || [ -z "$TENANT_ID" ]; then
    echo "Error: not logged in to Azure. Run 'az login' first." >&2
    exit 1
  fi

  RESOURCE_SCOPE="/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP"
}

ensure_github_login() {
  if ! gh auth status >/dev/null 2>&1; then
    echo "Error: not logged in to GitHub CLI. Run 'gh auth login' first." >&2
    exit 1
  fi
}

ensure_service_principal() {
  local app_id
  local sp_object_id
  local role_count
  local client_secret

  log_step "Ensuring Azure service principal..."

  app_id="$(az ad app list --display-name "$SERVICE_PRINCIPAL_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)"
  app_id="$(sanitize_tsv_value "$app_id")"

  if [ -z "$app_id" ]; then
    app_id="$(az ad app create --display-name "$SERVICE_PRINCIPAL_NAME" --query appId -o tsv)"
    app_id="$(sanitize_tsv_value "$app_id")"
    log_success "Created Entra application $SERVICE_PRINCIPAL_NAME"
  else
    log_info "Using existing Entra application $SERVICE_PRINCIPAL_NAME"
  fi

  if ! az ad sp show --id "$app_id" >/dev/null 2>&1; then
    az ad sp create --id "$app_id" >/dev/null
    log_success "Created service principal"
  else
    log_info "Service principal already exists"
  fi

  sp_object_id="$(az ad sp show --id "$app_id" --query id -o tsv)"
  sp_object_id="$(sanitize_tsv_value "$sp_object_id")"
  role_count="$(az role assignment list --assignee-object-id "$sp_object_id" --scope "$RESOURCE_SCOPE" --query "[?roleDefinitionName=='Contributor'] | length(@)" -o tsv 2>/dev/null || echo 0)"
  role_count="$(sanitize_tsv_value "$role_count")"
  role_count="${role_count:-0}"

  if [ "$role_count" = "0" ]; then
    az role assignment create \
      --assignee-object-id "$sp_object_id" \
      --assignee-principal-type ServicePrincipal \
      --role Contributor \
      --scope "$RESOURCE_SCOPE" \
      >/dev/null
    log_success "Granted Contributor on $RESOURCE_SCOPE"
  else
    log_info "Contributor role already assigned on $RESOURCE_SCOPE"
  fi

  client_secret="$(az ad app credential reset --id "$app_id" --display-name "${SERVICE_PRINCIPAL_NAME}-github-actions" --query password -o tsv)"
  client_secret="$(sanitize_tsv_value "$client_secret")"
  AZURE_CREDENTIALS_JSON="$(node -e "const [clientId, clientSecret, subscriptionId, tenantId] = process.argv.slice(1); process.stdout.write(JSON.stringify({ clientId, clientSecret, subscriptionId, tenantId, activeDirectoryEndpointUrl: 'https://login.microsoftonline.com', resourceManagerEndpointUrl: 'https://management.azure.com/', activeDirectoryGraphResourceId: 'https://graph.windows.net/', sqlManagementEndpointUrl: 'https://management.core.windows.net:8443/', galleryEndpointUrl: 'https://gallery.azure.com/', managementEndpointUrl: 'https://management.core.windows.net/' }));" "$app_id" "$client_secret" "$SUBSCRIPTION_ID" "$TENANT_ID")"
  log_success "Refreshed service principal credentials"
}

ensure_resource_group() {
  log_step "Creating resource group..."
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
  log_success "Resource group ready"
}

ensure_containerapp_environment() {
  log_step "Ensuring Container Apps environment..."
  if ! az containerapp env show --name "$ENVIRONMENT" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    az containerapp env create \
      --name "$ENVIRONMENT" \
      --resource-group "$RESOURCE_GROUP" \
      --location "$LOCATION" \
      --output none
    log_success "Created Container Apps environment $ENVIRONMENT"
  else
    log_info "Container Apps environment already exists"
  fi
}

ensure_container_app_exists() {
  local app_name="$1"
  local node_env="$2"
  local min_replicas="$3"
  local max_replicas="$4"
  local cpu="$5"
  local memory="$6"

  if az containerapp show --name "$app_name" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
    log_info "$app_name already exists"
    return 0
  fi

  log_step "Creating $app_name..."
  az containerapp create \
    --name "$app_name" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT" \
    --image "$PLACEHOLDER_IMAGE" \
    --target-port 3000 \
    --ingress external \
    --min-replicas "$min_replicas" \
    --max-replicas "$max_replicas" \
    --cpu "$cpu" \
    --memory "$memory" \
    --env-vars \
      "NODE_ENV=$node_env" \
      "PORT=3000" \
      "GWN_DB_PATH=/tmp/game.db" \
      "JWT_SECRET=$JWT_SECRET" \
      "SYSTEM_API_KEY=$SYSTEM_API_KEY" \
    --output none
  log_success "Created $app_name"
}

configure_container_registry() {
  local app_name="$1"
  local username="$2"
  local password="$3"

  if [ -z "$username" ] || [ -z "$password" ]; then
    return 0
  fi

  log_step "Configuring GHCR pull credentials for $app_name..."
  az containerapp registry set \
    --name "$app_name" \
    --resource-group "$RESOURCE_GROUP" \
    --server ghcr.io \
    --username "$username" \
    --password "$password" \
    --output none
  log_success "Configured GHCR registry credentials for $app_name"
}

update_container_app_runtime() {
  local app_name="$1"
  local node_env="$2"
  local canonical_host="$3"
  local image="$4"
  local env_vars=(
    "NODE_ENV=$node_env"
    "PORT=3000"
    "GWN_DB_PATH=/tmp/game.db"
    "JWT_SECRET=$JWT_SECRET"
    "SYSTEM_API_KEY=$SYSTEM_API_KEY"
  )
  if [ -n "$canonical_host" ]; then
    env_vars+=("CANONICAL_HOST=$canonical_host")
  fi
  local command=(
    az containerapp update
    --name "$app_name"
    --resource-group "$RESOURCE_GROUP"
    --set-env-vars
      "${env_vars[@]}"
    --output none
  )

  if [ -n "$image" ]; then
    command+=(--image "$image")
  fi

  "${command[@]}"
  log_success "Updated $app_name runtime configuration"
}

ensure_container_app_running() {
  local app_name="$1"
  local state

  state="$(get_app_query "$app_name" "properties.runningStatus")"
  if [[ "$state" =~ ^Running ]]; then
    return 0
  fi

  log_step "Starting $app_name via Azure REST API..."
  az rest \
    --method POST \
    --url "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.App/containerApps/$app_name/start?api-version=2024-03-01" \
    >/dev/null

  for _ in $(seq 1 12); do
    sleep 10
    state="$(get_app_query "$app_name" "properties.runningStatus")"
    if [[ "$state" =~ ^Running ]]; then
      log_success "$app_name is running"
      return 0
    fi
  done

  echo "Error: $app_name failed to reach a running state (last state: ${state:-unknown})." >&2
  exit 1
}

run_health_check() {
  local label="$1"
  local app_name="$2"
  local base_url="$3"
  local image="$4"

  if [ -z "$base_url" ]; then
    log_warn "Skipping $label health check: no URL available"
    return 2
  fi

  if [ -z "$image" ] || [ "$image" = "$PLACEHOLDER_IMAGE" ]; then
    log_warn "Skipping $label health check: $app_name is still using the placeholder image"
    return 2
  fi

  require_command curl
  ensure_container_app_running "$app_name"

  log_step "Running $label health check..."
  sleep 30
  "$REPO_ROOT/scripts/health-check.sh" "$base_url" "$SYSTEM_API_KEY"
}

echo "=== GuessWhatIsNext Infra Bootstrap ==="
echo "Repository:      $TARGET_REPO"
echo "Resource Group:  $RESOURCE_GROUP"
echo "Location:        $LOCATION"
echo "Image:           $IMAGE_NAME:$IMAGE_TAG"
echo ""

require_command az
require_command gh
require_command node

ensure_azure_login
ensure_github_login

JWT_SECRET="$(resolve_shared_secret JWT_SECRET 48)"
SYSTEM_API_KEY="$(resolve_shared_secret SYSTEM_API_KEY 32)"

GHCR_USERNAME="${GHCR_USERNAME:-}"
if [ -z "$GHCR_USERNAME" ]; then
  GHCR_USERNAME="$(gh api user --jq .login 2>/dev/null || true)"
fi
if [ -z "$GHCR_USERNAME" ]; then
  GHCR_USERNAME="${TARGET_REPO%%/*}"
fi

GHCR_PAT_VALUE="${GHCR_PAT:-}"

if [ "$SKIP_PROVISION" -eq 0 ]; then
  ensure_resource_group
  ensure_containerapp_environment
  ensure_container_app_exists "$STAGING_APP_NAME" staging 0 2 0.25 0.5Gi
  ensure_container_app_exists "$PRODUCTION_APP_NAME" production 1 5 0.5 1Gi
else
  log_info "Skipping Azure resource creation (--skip-provision)"
fi

STAGING_FQDN="$(get_app_fqdn "$STAGING_APP_NAME")"
PROD_FQDN="$(get_app_fqdn "$PRODUCTION_APP_NAME")"
STAGING_URL=""
PROD_URL=""

if [ -n "$STAGING_FQDN" ]; then
  STAGING_URL="https://$STAGING_FQDN"
fi
if [ -n "$PROD_FQDN" ]; then
  PROD_URL="https://$PROD_FQDN"
fi

STAGING_HOST="${CANONICAL_HOST:-$(get_host_from_url "$STAGING_URL")}"
PRODUCTION_HOST="${PRODUCTION_CANONICAL_HOST:-$(get_host_from_url "$PROD_URL")}"
if [ -z "$STAGING_HOST" ]; then
  STAGING_HOST="$(get_app_env_value "$STAGING_APP_NAME" CANONICAL_HOST)"
fi
if [ -z "$PRODUCTION_HOST" ]; then
  PRODUCTION_HOST="$(get_app_env_value "$PRODUCTION_APP_NAME" CANONICAL_HOST)"
fi

STAGING_IMAGE="$(get_app_image "$STAGING_APP_NAME")"
PRODUCTION_IMAGE="$(get_app_image "$PRODUCTION_APP_NAME")"

if [ -n "$GHCR_PAT_VALUE" ]; then
  configure_container_registry "$STAGING_APP_NAME" "$GHCR_USERNAME" "$GHCR_PAT_VALUE"
  configure_container_registry "$PRODUCTION_APP_NAME" "$GHCR_USERNAME" "$GHCR_PAT_VALUE"
  if [ -z "$STAGING_IMAGE" ] || [ "$STAGING_IMAGE" = "$PLACEHOLDER_IMAGE" ]; then
    STAGING_IMAGE="$IMAGE_NAME:$IMAGE_TAG"
  fi
  if [ -z "$PRODUCTION_IMAGE" ] || [ "$PRODUCTION_IMAGE" = "$PLACEHOLDER_IMAGE" ]; then
    PRODUCTION_IMAGE="$IMAGE_NAME:$IMAGE_TAG"
  fi
fi

log_step "Configuring $STAGING_APP_NAME..."
if [ -z "$STAGING_HOST" ]; then
  log_warn "Could not determine staging CANONICAL_HOST; updating runtime without changing it"
fi
update_container_app_runtime "$STAGING_APP_NAME" staging "$STAGING_HOST" "$STAGING_IMAGE"

log_step "Configuring $PRODUCTION_APP_NAME..."
if [ -z "$PRODUCTION_HOST" ]; then
  log_warn "Could not determine production CANONICAL_HOST; updating runtime without changing it"
fi
update_container_app_runtime "$PRODUCTION_APP_NAME" production "$PRODUCTION_HOST" "$PRODUCTION_IMAGE"

log_step "Configuring GitHub repository settings..."
ensure_service_principal
set_gh_secret AZURE_CREDENTIALS "$AZURE_CREDENTIALS_JSON"
set_gh_secret JWT_SECRET "$JWT_SECRET"
set_gh_secret SYSTEM_API_KEY "$SYSTEM_API_KEY"

if [ -n "$GHCR_PAT_VALUE" ]; then
  set_gh_secret GHCR_PAT "$GHCR_PAT_VALUE"
elif gh_secret_exists GHCR_PAT; then
  log_info "GHCR_PAT already exists, leaving current value in place"
else
  log_warn "GHCR_PAT is not set. Export a dedicated read:packages token to seed the repo secret and Azure registry credentials."
fi

if [ -n "$PROD_URL" ]; then
  set_gh_secret PROD_URL "$PROD_URL"
else
  log_warn "Production URL is unavailable; skipping PROD_URL secret"
fi

if [ -n "$STAGING_URL" ]; then
  set_gh_variable STAGING_URL "$STAGING_URL"
else
  log_warn "Staging URL is unavailable; skipping STAGING_URL variable"
fi

if [ -n "$GHCR_USERNAME" ]; then
  set_gh_variable GHCR_USERNAME "$GHCR_USERNAME"
else
  log_warn "Could not determine GHCR_USERNAME; skipping GHCR_USERNAME variable"
fi

if [ -n "$STAGING_HOST" ]; then
  set_gh_variable CANONICAL_HOST "$STAGING_HOST"
else
  log_warn "Could not determine CANONICAL_HOST; skipping CANONICAL_HOST variable"
fi

if [ -n "${STAGING_AUTO_DEPLOY:-}" ]; then
  set_gh_variable STAGING_AUTO_DEPLOY "$STAGING_AUTO_DEPLOY"
elif gh_variable_exists STAGING_AUTO_DEPLOY; then
  log_info "STAGING_AUTO_DEPLOY already exists, leaving current value in place"
else
  set_gh_variable STAGING_AUTO_DEPLOY false
fi

HEALTH_CHECKS_RUN=0
HEALTH_CHECK_FAILURES=0

if [ "$SKIP_HEALTH_CHECK" -eq 0 ]; then
  STAGING_IMAGE="$(get_app_image "$STAGING_APP_NAME")"
  PRODUCTION_IMAGE="$(get_app_image "$PRODUCTION_APP_NAME")"

  set +e
  run_health_check staging "$STAGING_APP_NAME" "$STAGING_URL" "$STAGING_IMAGE"
  status=$?
  set -e
  case "$status" in
    0) HEALTH_CHECKS_RUN=$((HEALTH_CHECKS_RUN + 1)) ;;
    1) HEALTH_CHECKS_RUN=$((HEALTH_CHECKS_RUN + 1)); HEALTH_CHECK_FAILURES=$((HEALTH_CHECK_FAILURES + 1)) ;;
  esac

  set +e
  run_health_check production "$PRODUCTION_APP_NAME" "$PROD_URL" "$PRODUCTION_IMAGE"
  status=$?
  set -e
  case "$status" in
    0) HEALTH_CHECKS_RUN=$((HEALTH_CHECKS_RUN + 1)) ;;
    1) HEALTH_CHECKS_RUN=$((HEALTH_CHECKS_RUN + 1)); HEALTH_CHECK_FAILURES=$((HEALTH_CHECK_FAILURES + 1)) ;;
  esac

  if [ "$HEALTH_CHECKS_RUN" -eq 0 ]; then
    log_warn "No health checks were executed. This usually means the apps are still on the placeholder image."
  fi

  if [ "$HEALTH_CHECK_FAILURES" -gt 0 ]; then
    echo "Error: one or more health checks failed." >&2
    exit 1
  fi
else
  log_info "Skipping health checks (--skip-health-check)"
fi

# ── Custom domain binding (one-time setup, not run on every deploy) ──────────
# Production uses a custom domain: gwn.metzger.dk
# Prerequisites:
#   1. CNAME record: gwn.metzger.dk → <app-fqdn> (e.g. gwn-production.<env-id>.<region>.azurecontainerapps.io)
#   2. TXT record: asuid.gwn.metzger.dk → <domain verification ID from Azure>
#
# After DNS records are in place, run these commands once:
#   az containerapp hostname add \
#     --name $PRODUCTION_APP_NAME --resource-group $RESOURCE_GROUP \
#     --hostname gwn.metzger.dk
#   az containerapp hostname bind \
#     --name $PRODUCTION_APP_NAME --resource-group $RESOURCE_GROUP \
#     --hostname gwn.metzger.dk --environment $ENVIRONMENT \
#     --validation-method CNAME
#
# Azure will provision a free managed TLS certificate automatically.
# The certificate renews automatically — no manual rotation needed.
#
# After binding, update the GitHub repo settings:
#   PROD_URL secret       → https://gwn.metzger.dk
#
# Note: re-running this script recomputes PROD_URL from the Azure FQDN
# and may overwrite the PROD_URL GitHub secret with that Azure hostname.
# Until this script supports overriding PROD_URL for a custom domain,
# restore PROD_URL manually after re-running if you want to keep using
# the custom domain in production deploys.
# ────────────────────────────────────────────────────────────────────────────

echo ""
echo "=== Setup Complete ==="
if [ -n "$STAGING_URL" ]; then
  echo "Staging URL:     $STAGING_URL"
fi
if [ -n "$PROD_URL" ]; then
  echo "Production URL:  $PROD_URL"
fi
echo "GitHub repo:     $TARGET_REPO"
echo ""
echo "Configured secrets:"
echo "  - AZURE_CREDENTIALS"
echo "  - JWT_SECRET"
echo "  - SYSTEM_API_KEY"
if [ -n "$GHCR_PAT_VALUE" ] || gh_secret_exists GHCR_PAT; then
  echo "  - GHCR_PAT"
fi
if [ -n "$PROD_URL" ]; then
  echo "  - PROD_URL"
fi
echo "Configured variables:"
if [ -n "$STAGING_URL" ]; then
  echo "  - STAGING_URL"
fi
if [ -n "$GHCR_USERNAME" ]; then
  echo "  - GHCR_USERNAME"
fi
if [ -n "$STAGING_HOST" ]; then
  echo "  - CANONICAL_HOST"
fi
echo "  - STAGING_AUTO_DEPLOY"
