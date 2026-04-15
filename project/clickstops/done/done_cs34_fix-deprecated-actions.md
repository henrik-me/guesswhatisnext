# Clickstop CS34: Fix Deprecated Node.js 20 Actions Warnings

**Status:** ✅ Complete
**Goal:** Eliminate Node.js 20 deprecation warnings from GitHub Actions workflow runs. All actions should use Node.js 20+ compatible versions with no warnings.

## Audit Results (CS34-1 ✅)

**7 unique actions need updating across 5 workflow files:**

| Action | Current | Latest | Files Affected |
|--------|---------|--------|---------------|
| `actions/checkout` | v4 | v5 | ci, staging-deploy, prod-deploy, load-test |
| `actions/setup-node` | v4 | v5 | ci, staging-deploy, load-test |
| `actions/upload-artifact` | v4 | v5 | ci, staging-deploy, load-test |
| `docker/login-action` | v3 | v4 | staging-deploy |
| `docker/build-push-action` | v5 | v7 | staging-deploy |
| `azure/login` | v2 | v3 | staging-deploy, prod-deploy, health-monitor |
| `azure/cli` | v2 | v3 | staging-deploy, prod-deploy, health-monitor |

**No update needed:** `actions/github-script` v7 (health-monitor) — already Node.js 24 compatible.

**Total occurrences:** ~30 SHA-pinned references across all files.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS34-1 | Audit all workflow action versions | ✅ Done | — | See audit results above |
| CS34-2 | Update actions to latest versions | ✅ Done | CS39 (CI E2E fix) | PR #179 (Phase 1), PR #180 (Phase 2), PR #181 (Phase 3) |
| CS34-3 | Validate workflows run clean | ✅ Done | CS34-2 | Staging deploy runs verified zero warnings across all jobs |

## Risk Assessment

### ✅ Low Risk (drop-in replacement)
| Action | Current → Latest | Risk | Notes |
|--------|-----------------|------|-------|
| `actions/checkout` | v4 → v5 | Low | Node.js 24 runtime. No workflow changes needed for GitHub-hosted runners. |
| `actions/upload-artifact` | v4 → v5 | Low | API-compatible, drop-in. |
| `docker/login-action` | v3 → v4 | Low | No breaking changes. |
| `docker/build-push-action` | v5 → v7 | Low | API-compatible. |

### ⚠️ Medium Risk (verify before merging)
| Action | Current → Latest | Risk | Notes |
|--------|-----------------|------|-------|
| `actions/setup-node` | v4 → v5 | Medium | Caching no longer auto-enabled by default — but we already specify `cache: npm` explicitly (ci.yml:28), so **should be safe**. Other workflow files don't use setup-node caching. Verify no regressions. |
| `azure/cli` | v2 → v3 | Medium | `azcliversion` input removed (we don't use it ✅). `failOnStdErr` removed (we don't use it ✅). Always uses latest CLI (we're fine with this). Our usage pattern is simple `inlineScript:` blocks — **should be compatible**. However, relies on `azure/login` auth context which changes in v3 (see below). |

### 🔴 High Risk (breaking change — requires credential migration)
| Action | Current → Latest | Risk | Notes |
|--------|-----------------|------|-------|
| `azure/login` | v2 → v3 | **High** | **Deprecates `creds: ${{ secrets.AZURE_CREDENTIALS }}` JSON format.** Requires switching to individual secrets: `client-id`, `tenant-id`, `client-secret`. Used in 4 places across 3 files (staging-deploy, prod-deploy, health-monitor). Requires: (1) extract client-id/tenant-id/client-secret from AZURE_CREDENTIALS JSON, (2) create 3 new GitHub secrets, (3) update all workflow files. Alternatively, v3 may still support `creds` for backward compat — needs testing. |

### Implementation Strategy

**Phase 1 (safe, no conflicts with CS39):** Update `actions/checkout`, `actions/upload-artifact`, `docker/login-action`, `docker/build-push-action` — all drop-in replacements.

**Phase 2 (verify):** Update `actions/setup-node` — verify caching still works.

**Phase 3 (credential migration):** Update `azure/login` and `azure/cli` together — requires new GitHub secrets and testing. Should coordinate with repo admin for secret creation.

## Results

All 7 deprecated GitHub Actions updated to Node.js 24-compatible versions across 5 workflow files:

| Action | Old | New | Phase | PR |
|--------|-----|-----|-------|----|
| `actions/checkout` | v4 | v5 | 1 | #179 |
| `actions/upload-artifact` | v4 | v5 | 1 | #179 |
| `docker/login-action` | v3 | v4 | 1 | #179 |
| `docker/build-push-action` | v5 | v7 | 1 | #179 |
| `actions/setup-node` | v4 | v5 | 2 | #180 |
| `azure/login` | v2 | v3 | 3 | #181 |
| `azure/cli` | v2 | v3 | 3 | #181 |

**Validation:** Three staging deployments confirmed zero Node.js 20 deprecation warnings across all workflow jobs. The `azure/login` v3 `creds` parameter worked as a drop-in replacement — no credential migration was needed (contrary to initial risk assessment).

**Note:** The initial risk assessment rated `azure/login` v3 as 🔴 High Risk, but testing showed v3 still supports the `creds` JSON format. The actual risk was Low.
