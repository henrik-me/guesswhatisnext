# CS40 — Feature Flag Testing Infrastructure

**Status:** ⬜ Planned
**Goal:** Enable proper feature flag control across dev, staging, and production environments for E2E testing, without bypassing the existing flag infrastructure or weakening production security.

**Origin:** Discovered during CS25 (MSSQL E2E Testing) — `NODE_ENV=production` disables feature flag request overrides, causing 28 E2E test failures for community/submission features. Temporary workaround: set `FEATURE_SUBMIT_PUZZLE_PERCENTAGE=100` in container env. This clickstop addresses the proper solution.

---

## Problem

The feature flag system (`server/feature-flags.js`) supports three control mechanisms:
1. **Request overrides** (query param / header) — disabled in production/staging for security
2. **User targeting** (explicit user list via env var)
3. **Percentage rollout** (deterministic per user via env var)

E2E tests rely on request overrides to toggle features per test. This works in `NODE_ENV=development` but breaks in production mode — which is what the MSSQL Docker stack and staging deploy use.

**Current workaround:** Set `FEATURE_SUBMIT_PUZZLE_PERCENTAGE=100` in container env vars. This uses the existing flag infrastructure correctly but is blunt — it enables the feature for all users rather than allowing per-test control.

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS40-1 | Evaluate test-mode override approach | ⬜ Pending | Design a mechanism that allows E2E tests to control feature flags in production mode without weakening production security. Options: (a) test-only API key that enables overrides, (b) `GWN_ALLOW_FLAG_OVERRIDES=true` env var for containers, (c) dedicated test flag endpoint behind system auth, (d) seed flag state per test via API. |
| CS40-2 | Implement chosen approach | ⬜ Pending | Based on CS40-1 evaluation. Must not weaken production security — overrides should only work with explicit opt-in via env var or auth. |
| CS40-3 | Update E2E tests | ⬜ Pending | Migrate community/submission/moderation tests to use the new mechanism instead of request overrides. |
| CS40-4 | Document flag testing strategy | ⬜ Pending | Update INSTRUCTIONS.md with guidance on how to test feature-flagged features across environments. |
| CS40-5 | Remove FEATURE_SUBMIT_PUZZLE_PERCENTAGE workaround | ⬜ Pending | Once the proper mechanism is in place, remove the `FEATURE_SUBMIT_PUZZLE_PERCENTAGE=100` env var from container configs. |

---

## Design Considerations

- **Production must remain secure** — no mechanism should allow end users to toggle flags via request headers/params in production
- **Test environments need per-test control** — some tests verify flag-on behavior, others verify flag-off behavior, in the same test run
- **Existing flag infrastructure should be extended, not replaced** — the evaluation order (override → default → targeting → percentage) is sound
- **The solution should work across all test contexts:** local dev, Docker containers (SQLite + MSSQL), staging deploy CI, and E2E
