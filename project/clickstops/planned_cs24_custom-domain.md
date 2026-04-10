# CS24 — Custom Domain (gwn.metzger.dk)

**Status:** ⬜ Planned
**Goal:** Configure the production environment to be accessible via `gwn.metzger.dk` custom domain with HTTPS, replacing the default Azure Container Apps FQDN.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS24-1 | Configure DNS for gwn.metzger.dk | ⬜ Pending | Add CNAME (or A + TXT validation) record in the metzger.dk DNS zone pointing `gwn` to the Azure Container Apps custom domain verification endpoint. Document the required DNS records. |
| CS24-2 | Add Azure custom domain binding | ⬜ Pending | Bind `gwn.metzger.dk` as a custom hostname on the `gwn-production` Container App using `az containerapp hostname add`. Add domain validation. Update `infra/deploy.sh` and `infra/deploy.ps1` with the custom domain binding commands. |
| CS24-3 | Configure managed TLS certificate | ⬜ Pending | Provision an Azure-managed free TLS certificate for `gwn.metzger.dk` via `az containerapp hostname bind --hostname gwn.metzger.dk --certificate-type ManagedCertificate`. Add to deploy scripts. |
| CS24-4 | Update CANONICAL_HOST and deploy vars | ⬜ Pending | Update GitHub secret/var `PROD_URL` to `https://gwn.metzger.dk`. Update `CANONICAL_HOST` env var on the container app to `gwn.metzger.dk`. This propagates to HTTPS redirect, CSP headers, and WebSocket policy automatically via `server/middleware/security.js`. |
| CS24-5 | Update deploy workflows and documentation | ⬜ Pending | Update `.github/workflows/prod-deploy.yml` health check and smoke test URLs to use `gwn.metzger.dk`. Update `infra/README.md` with custom domain setup documentation. Update `README.md` with the production URL. |

---

## Design Decisions

- **Azure managed certificate:** Use Azure's free managed certificate rather than bringing a custom cert. Azure handles renewal automatically. This is the simplest approach for a single custom domain.
- **CNAME vs A record:** CNAME is preferred for Container Apps since the underlying IP can change. Azure Container Apps provides a domain verification TXT record and expects a CNAME to the app's FQDN.
- **No code changes needed:** The app already uses `CANONICAL_HOST` for all host-dependent behavior (HTTPS redirect, CSP, WebSocket URL). Changing the env var is sufficient — no code modifications required in security middleware, app.js, or any route.
- **Backward compatibility:** The old `.azurecontainerapps.io` URL will continue to work but will redirect to the canonical host via the existing security middleware.

## Current State (from investigation)

- Production runs on Azure Container Apps (`gwn-production` in `gwn-rg` resource group).
- Current URL pattern: `https://gwn-production.<region>.azurecontainerapps.io`.
- `CANONICAL_HOST` env var drives HTTPS redirect (`server/middleware/security.js:14-25`), CSP policy (`security.js:43-66`), and HSTS.
- `PROD_URL` GitHub secret feeds `CANONICAL_HOST` during deploy (`.github/workflows/prod-deploy.yml:170-200`).
- Deploy scripts (`infra/deploy.sh`, `infra/deploy.ps1`) create the container app and set `PROD_URL`/`CANONICAL_HOST` but have no custom domain config.
- No existing DNS documentation in the repo.
- `trust proxy` is set in `app.js` — works correctly behind Azure's reverse proxy with custom domains.

## Prerequisites

- Access to the `metzger.dk` DNS zone (domain owner manages this)
- Azure CLI access to the `gwn-rg` resource group
- The `gwn-production` container app must be running for domain validation
