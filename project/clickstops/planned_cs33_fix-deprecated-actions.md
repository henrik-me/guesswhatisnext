# Clickstop CS33: Fix Deprecated Node.js 20 Actions Warnings

**Status:** ⬜ Planned
**Goal:** Eliminate Node.js 20 deprecation warnings from GitHub Actions workflow runs. All actions should use Node.js 20+ compatible versions with no warnings.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS33-1 | Audit all workflow action versions | ⬜ Pending | — | Check all .github/workflows/*.yml for actions using Node.js 16/20 that trigger deprecation warnings. Identify which actions need updating. |
| CS33-2 | Update actions to latest versions | ⬜ Pending | CS33-1 | Update pinned action SHAs to versions that use Node.js 20+ without deprecation warnings. Maintain SHA-pinning convention with version comments. |
| CS33-3 | Validate workflows run clean | ⬜ Pending | CS33-2 | Trigger workflows and confirm zero deprecation warnings in logs. |

## Notes

- Observed in staging-deploy.yml Build & Push Docker Image step.
- All actions are SHA-pinned per project convention (with `# vN` comments).
- Ensure updated SHAs are verified against the action repo tags.
