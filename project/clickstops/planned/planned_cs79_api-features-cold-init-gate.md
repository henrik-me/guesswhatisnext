# CS79 — Api features cold init gate

**Status:** ⬜ Planned
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72, CS75

## Origin

Discovered 2026-05-10 during the prod deploy of image `fa74aec` (run [25617860563](https://github.com/henrik-me/guesswhatisnext/actions/runs/25617860563)). The CS41-1 smoke step failed with `/api/features did not reach 200 within 90000ms (last status=503, attempts=18)`, triggering the auto-rollback safety gate. CS73 wake step worked correctly (DB warm, migrations applied, OLD revision smoke at CS41-12 PASSED returning `/api/features ok in 27ms`); the failure is specific to the new revision.

App Insights captures the exact pattern (revision `gwn-production--0000021`):

```
GET /api/features
res.statusCode: 503
res.headers.retry-after: 5
res.responseTime: 1-2ms
err.message: "failed with status code 503"
```

The 1-2ms response time + `retry-after: 5` header is the **DB-init-gate signature** from `server/app.js` (CS53-19 / CS53-23 boot-quiet contract): when the per-request gate detects `!dbInitialized` AND the request lacks `X-User-Activity: 1`, it returns 503 retry-after immediately without calling `runInit()`. The smoke probe (`scripts/smoke.js`) does not send the `X-User-Activity: 1` header and so never wakes the init path. Eighteen consecutive 503s exhaust the smoke budget and rollback fires.

Critically, the **OLD revision (image `76f5705`) returns 200 to the same header-less smoke probe**, proving the request-gate behavior changed somewhere in the cumulative diff `76f5705..fa74aec` (CS73 wake step + CS75 plan only + CS77 husky dev-only + CS78 dependency bumps).

## Why this matters

- **Auto-rollback fires on every prod deploy** until this is fixed. Operators see a "deploy failed" annotation even though the wake step + migration succeeded; the failure looks alarming and obscures the underlying cause.
- **Local validation cannot reproduce.** `npm run test:e2e:mssql` against the docker MSSQL stack passed all 76 tests on `fa74aec` because the local stack doesn't exercise the cold-DB-init path the same way.
- **Real users are unaffected.** Real requests carry `X-User-Activity: 1` (sent by SPA boot per CS53-23) so they trigger init normally; the user verified prod works after their login warmed the cache. The only failure mode is the smoke probe.

## Suspect

Most likely root cause: **[CS78](../done/done_cs78_dependabot-overrides-may2026.md)**'s `express-rate-limit ^8.3.1 → ^8.5.1` bump or `ip-address ^10.1.0 → ^10.2.0` override may have changed middleware ordering / behavior such that the per-request DB-init gate now fires before `runInit()` would otherwise be invoked. CS73 wake step is workflow-only (no app code). CS75 is plan-only. CS77 husky is dev-only. CS78 is the only suspect that touches runtime middleware.

## Tasks

| # | Task | Notes |
|---|------|-------|
| CS79-1 | Reproduce locally: bisect the cumulative diff `76f5705..fa74aec` to identify the offending commit/PR. Test by deploying each step's image to staging or running it under `GWN_SIMULATE_COLD_START_MS=30000` and probing `/api/features` without `X-User-Activity: 1`. | Most likely lands on PR [#329](https://github.com/henrik-me/guesswhatisnext/pull/329) (CS78). |
| CS79-2 | Decide and implement one of:<br>(a) **Fix the smoke probe** — have `scripts/smoke.js` send `X-User-Activity: 1` to behave as a "real user" probe (matches what every real user request carries).<br>(b) **Fix the request gate** — restore the previous behavior where header-less requests trigger `runInit()` instead of returning 503 immediately on cold init.<br>(c) **Both** (defense in depth).<br>The right answer depends on what CS53-19's "init-gate gap" wanted. If header-less requests were *supposed* to trigger init (current `server/app.js` per-request gate per CS53 memory), this is a regression in CS78; restore the prior behavior. If they were *supposed* to short-circuit (CS53-19.D explicit goal), then the smoke probe should send the header. | Investigation outcome drives the choice. |
| CS79-3 | Add a regression test that catches this end-to-end: spin up the container with cold DB, probe `/api/features` without `X-User-Activity: 1`, expect either 200 (option b) or expect smoke probe to set the header (option a). Whichever shape, the test must fail if today's failure recurs. | The current `test:e2e:mssql` suite missed this because its DB is always warm. |
| CS79-4 | Re-deploy `main` (post-fix) to prod via the standard staging-then-prod sequence. Validate CS41-1 smoke passes against the cold revision. This is the empirical CS79 closure. | Same approval-gated ceremony as CS73's. |

## Acceptance

- A prod deploy after long DB idleness completes successfully on the first attempt without auto-rollback.
- `/api/features` returns 200 (or the documented expected response) to the smoke probe within the 90s CS41-1 budget.
- The cumulative behavior change introduced between `76f5705` and `fa74aec` is identified, documented, and either reverted or compensated by a smoke-probe header change.
- A regression test exists that would have caught this failure mode in CI before the deploy.

## Will not be done

- Disabling the auto-rollback safety gate. The gate worked correctly in this incident (it protected prod from a revision the gate could not validate).
- Lowering the CS41-1 smoke budget. The current 90s is reasonable for normal cold paths.
- Modifying CS73's wake step. CS73 is independently complete and validated.

## Risks & rollback

- **Investigation risk:** if the offending change is buried in a transitive dependency bump (CS78 lockfile churn was 1272 lines), bisection may take effort. Mitigation: start with CS78 as the prime suspect since it's the only runtime-middleware-touching change in the diff.
- **Fix risk:** option (a) ships in CI and only affects the smoke probe — minimal blast radius. Option (b) restores prior request-gate behavior — needs careful review against the CS53-19 boot-quiet contract.
- **Rollback:** revert CS78 (PR [#329](https://github.com/henrik-me/guesswhatisnext/pull/329)) if option (b) proves intractable. The Dependabot alerts would re-open temporarily.

## Cross-references

- Origin: prod-deploy run [25617860563](https://github.com/henrik-me/guesswhatisnext/actions/runs/25617860563) (2026-05-10T02:39Z) failed CS41-1 smoke; auto-rollback to revision 0000022 (image `76f5705`) succeeded.
- Adjacent: [done_cs73](../done/done_cs73_prod-deploy-cold-db-handling.md) — wake step worked perfectly; CS79 is the separate failure on the new image.
- Adjacent: [done_cs78](../done/done_cs78_dependabot-overrides-may2026.md) — prime suspect (express-rate-limit 8.3.1→8.5.1 bump, ip-address 10.1.0→10.2.0 override).
- Adjacent: [active_cs53](../active/active_cs53_prod-cold-start-retry-investigation.md) — boot-quiet contract owner (CS53-23, CS53-19). CS79 may need to coordinate with CS53-19.D.
- Adjacent: [planned_cs56](planned_cs56_server-cache-and-cold-db-fallback.md) — app-level cold-DB cache fallback could provide a defense-in-depth backstop for this failure mode.
- Smoke runner: [`scripts/smoke.js`](../../../scripts/smoke.js).
- Request gate: [`server/app.js`](../../../server/app.js) (per-request `runInit()` gate around line 298).
