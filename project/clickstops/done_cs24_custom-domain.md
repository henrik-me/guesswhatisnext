# CS24 — Custom Domain (gwn.metzger.dk)

**Status:** ✅ Complete
**Goal:** Configure the production environment to be accessible via `gwn.metzger.dk` custom domain with HTTPS, replacing the default Azure Container Apps FQDN.

**Verified:** `https://gwn.metzger.dk/healthz` returns 200 OK, CSP header shows `wss://gwn.metzger.dk`.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS24-1 | Configure DNS for gwn.metzger.dk | ✅ Done | CNAME `gwn` → `gwn-production.blackbay-4189fc2a.eastus.azurecontainerapps.io` + TXT verification record configured in metzger.dk DNS zone. |
| CS24-2 | Add Azure custom domain binding | ✅ Done | Bound `gwn.metzger.dk` as custom hostname on `gwn-production` via `az containerapp hostname add`. Deploy scripts updated. |
| CS24-3 | Configure managed TLS certificate | ✅ Done | Azure-managed free TLS certificate provisioned (cert `mc-gwn-env-gwn-metzger-dk-4767`, SNI-enabled). Auto-renewal handled by Azure. |
| CS24-4 | Update CANONICAL_HOST and deploy vars | ✅ Done | GitHub secret `PROD_URL` updated to `https://gwn.metzger.dk`. `CANONICAL_HOST` env var set to `gwn.metzger.dk` on the container app. HTTPS redirect, CSP headers, and WebSocket policy all reflect the custom domain. |
| CS24-5 | Verify deploy workflows and update documentation | ✅ Done | Deploy scripts, `infra/README.md`, `README.md`, and `CONTEXT.md` updated with custom domain details. PR #155. |

---

## Design Decisions

- **Azure managed certificate:** Use Azure's free managed certificate rather than bringing a custom cert. Azure handles renewal automatically. This is the simplest approach for a single custom domain.
- **CNAME vs A record:** CNAME is preferred for Container Apps since the underlying IP can change. Azure Container Apps provides a domain verification TXT record and expects a CNAME to the app's FQDN.
- **No code changes needed:** The app already uses `CANONICAL_HOST` for all host-dependent behavior (HTTPS redirect, CSP, WebSocket URL). Changing the env var is sufficient — no code modifications required in security middleware, `server/app.js`, or any route.
- **Backward compatibility:** The old `.azurecontainerapps.io` URL may continue to work, but the existing security middleware does not perform canonical-host redirects for already-HTTPS requests.

## Pre-Implementation State (from investigation)

- Production runs on Azure Container Apps (`gwn-production` in `gwn-rg` resource group).
- Original URL pattern: `https://gwn-production.<region>.azurecontainerapps.io`.
- `CANONICAL_HOST` env var drives HTTPS redirect (`server/middleware/security.js:14-25`), CSP policy (`server/middleware/security.js:43-66`), and HSTS.
- `PROD_URL` GitHub secret feeds `CANONICAL_HOST` during deploy (`.github/workflows/prod-deploy.yml:170-200`).
- Deploy scripts (`infra/deploy.sh`, `infra/deploy.ps1`) created the container app and set `PROD_URL`/`CANONICAL_HOST` but had no custom domain config.
- No DNS documentation existed in the repo.
- `trust proxy` is set in `server/app.js` — works correctly behind Azure's reverse proxy with custom domains.

## Prerequisites

- Access to the `metzger.dk` DNS zone (domain owner manages this)
- Azure CLI access to the `gwn-rg` resource group
- The `gwn-production` container app must be running for domain validation

---

## Completion Checklist

- [x] All tasks done and merged (5/5 — PR #155)
- [x] README updated (production URL updated to gwn.metzger.dk)
- [x] INSTRUCTIONS.md updated (N/A — no architectural/workflow changes)
- [x] CONTEXT.md updated with final state
- [x] Tests added/updated (N/A — infrastructure-only, no code changes)
- [x] Performance/load test evaluation (N/A — DNS/TLS change only)
- [x] Data structure changes documented (N/A)
- [x] Staging deployed and verified (N/A — custom domain is production-only)
- [x] Production deployed and verified — `https://gwn.metzger.dk/healthz` returns 200 OK
