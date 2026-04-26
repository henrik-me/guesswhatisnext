# CS40 — Feature Flag Testing Infrastructure

**Status:** ⬜ Planned (revised 2026-04-25 by yoga-gwn-c4 — most original
scope is de-facto shipped; remaining work is audit + harden + document + guard)
**Goal:** Confirm and lock in the feature-flag testing mechanism that was
silently shipped during CS25, document it formally, and add a CI regression
guard so the percentage-rollout `=100` workaround can't be reintroduced and
`FEATURE_FLAG_ALLOW_OVERRIDE` can't accidentally land in production-deploy
assets.

**Origin:** Discovered during CS25 (MSSQL E2E Testing) — `NODE_ENV=production`
disables feature flag request overrides, causing 28 E2E test failures for
community/submission features.

**2026-04-25 revision (yoga-gwn-c4):** an audit during pickup found that the
chosen mechanism (option (b) below) was **already implemented and wired** but
never formally tracked, audited, or documented:

- `FEATURE_FLAG_ALLOW_OVERRIDE` env var implemented in
  `server/feature-flags.js:35-46` with a startup warning when enabled in
  production/staging.
- Wired into `docker-compose.mssql.yml:31`, `docker-compose.mssql.delay.yml:33`,
  and `.github/workflows/staging-deploy.yml:100` (in-CI smoke service only).
- E2E specs (`tests/e2e/community.spec.mjs`, `my-submissions.spec.mjs`,
  `moderation.spec.mjs`) use `?ff_submit_puzzle=true/1` overrides successfully
  in MSSQL E2E.
- The `FEATURE_SUBMIT_PUZZLE_PERCENTAGE=100` blunt workaround appears already
  removed from all configs (no grep hits outside this CS file).

So CS40-1/2/3/5 from the original task table are **functionally done but
unverified, undocumented, and unguarded**. This revision reframes the
remaining work.

---

## Problem (real remaining)

1. **Live-staging exposure unverified.** `FEATURE_FLAG_ALLOW_OVERRIDE=true`
   is set on the staging-deploy.yml in-CI smoke service. File-structure
   analysis suggests this is separate from the live `gwn-staging` ACA app
   (`staging-deploy.yml:60-108` smoke service vs `:450-486` `az containerapp
   update` block — different env vars, different runtimes), but this needs
   live verification, not assumption.
2. **No prod-mode test coverage of the override gate.** Today's
   `tests/feature-flags.test.js` injects `allowOverride: true` manually; no
   test exercises the `OVERRIDE_ALLOWED` module-level gate at
   `server/feature-flags.js:35`. A regression flipping that boolean would
   only be caught by post-merge staging smoke or local MSSQL E2E.
3. **No documentation** of the feature-flag testing strategy in
   `INSTRUCTIONS.md`. New contributors / sub-agents have no canonical reference.
4. **No regression guard** preventing reintroduction of the `=100` workaround
   in test configs or accidental enablement of `FEATURE_FLAG_ALLOW_OVERRIDE`
   in `prod-deploy.yml` / `infra/deploy.{sh,ps1}`.

## Resolved decisions (with user, 2026-04-25)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | CS40-2 = option (A) keep `FEATURE_FLAG_ALLOW_OVERRIDE=true` in staging-deploy.yml in-CI smoke service only (no code change). | Option (B) system-API-key gating would force browser E2E to send privileged headers into ordinary user traffic (`public/js/app.js:1386-1403` propagates `ff_*` params into API calls), which is a worse security model than the current ephemeral-CI exposure. Conditional on CS40-1 audit confirming live `gwn-staging` ACA app does not have the flag on. |
| 2 | CS40-5 guard = dedicated Node policy script invoked via `npm test`. | Clearer intent and remediation messaging than a vitest grep test or shell workflow step. |

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS40-1 | Audit & verification | ✅ Done | See §Evidence below. Live `gwn-staging` ACA env (rev `gwn-staging--deploy-1777143570`): 7 env vars, none FEATURE-related. No `=100` workaround anywhere. `prod-deploy.yml` + `infra/` clean. Latest staging-deploy run #237 (HEAD `6b368de`) green. |
| CS40-2 | Document option (A) decision (no code change) | ✅ Done | Decision captured in this file (Resolved decisions table) + will be reflected in INSTRUCTIONS.md via CS40-4. Per resolved decision #1; CS40-1 §Evidence confirms the precondition (live ACA app does not have the override on). |
| CS40-3 | Direct prod-mode override coverage | ✅ Done | `tests/feature-flags-env-gate.test.js` — 7 tests covering (prod no env var → denied), (staging no env var → denied), (prod env var → allowed query), (prod env var → allowed header), (staging env var → allowed query), (development → allowed), (FEATURE_FLAG_ALLOW_OVERRIDE=false → denied). Uses `vi.resetModules()` + `delete require.cache[...]` for both `server/feature-flags` and `server/config`. |
| CS40-4 | Documentation | ✅ Done | INSTRUCTIONS.md "Feature flag testing across environments" subsection added under `### Feature Flag Rollouts` with environment-vs-override-acceptance matrix (7 rows), E2E test pattern, forbidden-pattern doc, and prod-lockdown reference. |
| CS40-5 | Regression guard (Node policy script) | ✅ Done | `scripts/check-feature-flag-policy.js` (no deps) + `npm run check:feature-flag-policy` script + chained into `npm test`. Two policies with comment-prefix rejection (per code-review feedback). Self-tested by `tests/check-feature-flag-policy.test.js` (9 regex tests using string-concatenation fixtures so the script does not flag its own test file). |
| CS40-6 | Close the loop | ✅ Done | `docker-compose.mssql.yml:30` "Temporary workaround" comment replaced with INSTRUCTIONS.md reference. CS file moved planned/ → active/ at start of work; will move active/ → done/ on PR merge by the merging agent. WORKBOARD updated. |

---

## Design Considerations (preserved from original)

- **Production must remain secure** — no mechanism allows end users to toggle
  flags via request headers/params in production. Verified by CS40-1 audit
  + locked in by CS40-5 guard.
- **Test environments need per-test control** — `FEATURE_FLAG_ALLOW_OVERRIDE`
  + `?ff_*` query / `X-Gwn-Feature-*` header satisfies this in dev, MSSQL
  Docker E2E, and the staging-CI smoke service.
- **Existing flag infrastructure extended, not replaced** — evaluation order
  (override → default → targeting → percentage) is unchanged.
- **Solution works across all test contexts:** local dev (default-on),
  Docker SQLite + MSSQL (env-var opt-in), staging-deploy CI smoke
  (env-var opt-in), E2E (uses overrides). Live `gwn-staging` ACA app and
  prod intentionally excluded — verified by CS40-1, locked by CS40-5.

## Validation

- `npm test` — runs new `feature-flags-env-gate.test.js` and
  `check-feature-flag-policy` script.
- `npm run check:docs:strict` — INSTRUCTIONS.md + this CS file consistency.
- No server-runtime code changes (option A).

---

## §Evidence (CS40-1 audit, 2026-04-25 by yoga-gwn-c4)

### A. Live `gwn-staging` ACA app environment

```powershell
az containerapp show --name gwn-staging --resource-group gwn-rg -o json | ...
```

Revision: `gwn-staging--deploy-1777143570`. Total env vars on the live app
container = **7**, namely:

```
APPLICATIONINSIGHTS_CONNECTION_STRING
CANONICAL_HOST
GWN_DB_PATH
JWT_SECRET
NODE_ENV
PORT
SYSTEM_API_KEY
```

Neither `FEATURE_FLAG_ALLOW_OVERRIDE` nor `FEATURE_SUBMIT_PUZZLE_PERCENTAGE`
is present. ✅ Confirms the file-structure analysis (smoke service !=
deployed app) matches reality on the live app. Lookup performed against
revision `gwn-staging--deploy-1777143570` corresponding to `release/staging`
HEAD `6b368de`.

### B. `=100` percentage workaround

Repo-wide grep for `FEATURE_SUBMIT_PUZZLE_PERCENTAGE\s*[=:]\s*"?100`
returned **0 matches** in any code or config file. Only references to the
literal string `FEATURE_SUBMIT_PUZZLE_PERCENTAGE=100` are inside this CS
file (describing the historical workaround). ✅

### C. `prod-deploy.yml` and `infra/deploy.{sh,ps1}` cleanliness

Grep for `FEATURE_FLAG_ALLOW_OVERRIDE` across `.github/workflows/prod-deploy.yml`
and `infra/` returned **0 matches**. ✅

### D. MSSQL E2E uses overrides successfully (sample passing run)

Latest staging-deploy.yml run on `main` (HEAD `6b368de`):
- run_id `24938066927`, run_number 237, event `workflow_dispatch`,
  conclusion **success**.
- This run uses the in-CI smoke service with `FEATURE_FLAG_ALLOW_OVERRIDE=true`
  (`.github/workflows/staging-deploy.yml:100`) and exercises the E2E specs
  that depend on `?ff_submit_puzzle=true` (`tests/e2e/community.spec.mjs`,
  `my-submissions.spec.mjs`, `moderation.spec.mjs`). ✅

### E. Conclusion

The premise of CS40-2's option (A) — "live `gwn-staging` ACA app does not
have the override flag on" — is **verified**. The override mechanism works
as designed in the in-CI smoke service. The `=100` workaround is gone.
Remaining work (CS40-3 through CS40-6) can proceed safely.

