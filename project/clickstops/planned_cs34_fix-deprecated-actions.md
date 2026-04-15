# Clickstop CS34: Fix Deprecated Node.js 20 Actions Warnings

**Status:** ⬜ Planned (audit complete, implementation blocked on CS39)
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
| CS34-2 | Update actions to latest versions | ⬜ Pending | CS39 (CI E2E fix) | Avoid conflicts with CS39 modifying same workflow files. Update all SHA pins with verified tags. |
| CS34-3 | Validate workflows run clean | ⬜ Pending | CS34-2 | Trigger workflows and confirm zero deprecation warnings in logs. |

## Notes

- All actions are SHA-pinned per project convention (with `# vN` comments).
- CS39 (yoga-gwn-c3) is currently modifying workflow files — wait for merge before implementing CS34-2.
- Ensure updated SHAs are verified against the action repo tags.
