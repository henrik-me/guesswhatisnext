# CS79 — Api features cold init gate

> **Rewritten 2026-05-09T20:15Z.** An earlier draft suspected CS78. Direct code inspection of `server/app.js:332-351` and `scripts/smoke.js:292-294,372-380` revealed the actual root cause is a **pre-existing bug in the smoke probe** that just hadn't been hit before because past deploys benefitted from already-warm replica processes. CS78 is NOT implicated.

**Status:** 🔄 In Progress
**Claimed:** yoga-gwn 2026-05-10T03:20Z (branch `cs79-smoke-cold-init`)
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72, CS75

## Origin

CS73 prod-deploy run [25617860563](https://github.com/henrik-me/guesswhatisnext/actions/runs/25617860563) (2026-05-10T02:39Z, image `fa74aec`) failed CS41-1 smoke step:

```
##[error]smoke step features: did not reach 200 within 90000ms (last status=503, attempts=18)
```

App Insights logs from revision `gwn-production--0000021` show every `/api/features` request returned `503 retry-after:5` in 1-2ms. CS73 wake step worked perfectly; the OLD revision smoke (CS41-12) passed `/api/features ok in 27ms`. The failure is specific to the new revision's cold-start path.

## Root cause (verified)

`server/app.js:332-351` (boot-quiet contract per CS53-23/19) — when `dbInitialized=false` AND a request hits `/api/*`, the per-request gate returns `503 retry-after:5` immediately. It only triggers `runInit()` if the request carries `X-User-Activity: 1` (real user gesture marker) or system credentials. The relevant excerpt:

```js
const reqUserActivity = req.get('X-User-Activity') === '1';
// (and a few other system-key checks)
if (reqUserActivity || ...) {
  // Fire-and-forget runInit(); current request still gets 503; next retry sees dbInitialized=true.
  runInit().catch(() => { /* errors already logged inside runInit */ });
}
return res.set('Retry-After', '5').status(503).json({
  error: 'Database not yet initialized', retryAfter: 5, phase: 'cold-start'
});
```

`scripts/smoke.js`:
- Step (b) `/api/features` (line 292-315) — **does NOT send `X-User-Activity` header.** Polls with default headers via `pollUntil()`.
- Step (e) `/api/scores/me` (line 372-380) — DOES send `X-User-Activity: 1`, with an explicit comment about CS53-19.

So step (b) on a cold-init container gets 503 retry-after:5 forever — the gate never kicks `runInit()` because the smoke doesn't send the activity header. The 90s budget × 5s retry interval = 18 attempts, all 503, smoke fails, auto-rollback.

**Why past deploys passed:** revision rolling kept the container process warm long enough that some prior request (real user, health check, or warmup of the OLD revision) already set `dbInitialized=true` before the new revision's smoke ran. Today's deploy hit a fully cold path because (a) the DB had been auto-paused for many hours (CS73 wake confirmed `Initial DB status: Paused`) AND (b) the new revision was a brand-new container process with no prior traffic.

**This is a pre-existing latent bug,** not a regression introduced by anything in `76f5705..fa74aec`. CS78 is exonerated.

## Goal

Eliminate the smoke probe's reliance on already-warm `dbInitialized` state. The smoke is explicitly simulating "first user activity against a brand-new container" per its docstring (line 8). Real users send `X-User-Activity: 1` on boot per CS53-23. The smoke probe must do the same on every DB-touching step.

## Out of scope

- Modifying the `server/app.js` per-request gate or the boot-quiet contract. CS53-23/19 designed this behavior intentionally; CS79 fixes the smoke probe to match the contract, not the other way around.
- Adding cold-DB cache fallback ([CS56](../planned/planned_cs56_server-cache-and-cold-db-fallback.md)'s scope).
- Adding telemetry on the cold-init failure mode ([CS72](../planned/planned_cs72_progressive-loader-warmup-alert-and-dashboard.md)-adjacent).
- Reverting CS78 — exonerated.
- Changing the auto-rollback safety gate — it worked correctly in this incident.

## Approach

**Single-PR fix:** make every DB-touching step in `scripts/smoke.js` send `X-User-Activity: 1` on every probe attempt, plus add a regression test that exercises the cold-init path end-to-end so this can't silently regress.

### Implementation sketch

1. Modify `pollUntil(url, opts)` in `scripts/smoke.js` (line ~155) to accept an `opts.headers` parameter and forward it to `fetcher('GET', url, { ..., headers })`.
2. Update step (b) `/api/features` call site (line ~294) to pass `headers: { 'X-User-Activity': '1' }`. **Only step (b) needs the fix** — once `/api/features` reaches 200, `dbInitialized=true` and all later steps work without the header. Step (e) `/api/scores/me` already sends the header (kept; explicit per CS53-19 comment). Step (a) `/healthz` is gate-bypassed and does NOT need the header (don't add it — keep diff minimal).
3. Add a regression test to `tests/smoke.test.js` (extends the existing test file, uses its existing DI seam): fake fetcher returns 503+Retry-After:5 for `/api/features` until one carrying `X-User-Activity: 1` is observed, then returns 200 with `{ features: {} }`. Assert (i) `runSmoke()` reaches success; (ii) the fake fetcher observed the header on every `/api/features` request (not just the first).
4. Add a fresh-cold-init smoke cycle to `scripts/container-validate.js`. The existing `probeColdStart()` already sends `X-User-Activity: 1` and initializes the DB, so simply running smoke after it does NOT exercise the bug. Required: run the smoke probe against a **freshly-restarted container** before any other DB-touching probe — the smoke must complete successfully without `probeColdStart()` having pre-warmed `dbInitialized`. Without the CS79-1 fix, this cycle must fail; with it, it must pass.
5. Update step (b)'s docstring (line 12-16) to mention the `X-User-Activity: 1` requirement and reference CS53-19 boot-quiet contract.

### Why local `test:e2e:mssql` doesn't catch this today

The docker MSSQL stack starts the app with `dbInitialized` racing to true very quickly (no auto-pause, no real cold-start). By the time Playwright probes any endpoint, init is done. The cold-init failure mode requires a fresh container process with `dbInitialized=false` AND a probe sequence that doesn't carry `X-User-Activity: 1`. The new regression test exercises exactly that path with `GWN_SIMULATE_COLD_START_MS` to delay init.

## Tasks (self-driving — no operator interaction during implementation)

| # | Task | Acceptance |
|---|------|------------|
| CS79-1 | **Implement smoke-probe fix** in `scripts/smoke.js`: extend `pollUntil()` (line ~155) to accept and forward an `opts.headers` parameter to `fetcher('GET', url, { ..., headers })`. Pass `headers: { 'X-User-Activity': '1' }` from step (b) `/api/features` (line ~294). The fix is **only** needed on step (b) because once `/api/features` reaches 200, `dbInitialized=true` and all later steps work without the header — but step (e) already sends it (kept; explicit per CS53-19 comment) and adding to step (a) `/healthz` is optional (gate-bypassed; would be cosmetic consistency only — leave it OFF to keep the diff minimal). Update step (b) docstring (line 12-16) to mention the `X-User-Activity: 1` requirement and reference CS53-19 boot-quiet contract. | Diff is minimal (~5-10 lines); CI lint + unit tests pass. |
| CS79-2 | **Extend the existing `tests/smoke.test.js`** with a regression case for the cold-init failure mode. Use the existing DI seam on `runSmoke()` / `pollUntil200()` to inject a fake fetcher that returns `503` with `Retry-After: 5` for `/api/features` requests UNTIL one is observed carrying `X-User-Activity: 1`, after which it returns `200` with a valid `{ features: {} }` body. Assertions: (i) `runSmoke()` reaches the success path within budget; (ii) the fake fetcher observed `X-User-Activity: 1` on every `/api/features` request (proves the header is sent on every retry, not just the first); (iii) without the fix (test the old `pollUntil()` shape if a regression is introduced later) the assertion in (i) would fail. The test must be self-contained — no real network calls. | New test case in existing file; runs in `npm test`; would have caught today's failure if it had existed. |
| CS79-3 | **Add a true cold-init smoke cycle to `scripts/container-validate.js`.** Today the script's `probeColdStart()` already sends `X-User-Activity: 1` (which initializes the DB), so simply running smoke after it does NOT exercise the bug. The fix: add a new validate cycle that boots a **fresh, second container restart** (or a separate compose stack instance) and immediately invokes `node scripts/smoke.js <fqdn>` BEFORE any other request hits `/api/*`. The smoke probe must complete successfully on this fresh-cold-init stack. Without the CS79-1 fix, this cycle must fail (replicating today's prod failure mode locally); with the fix, it must pass. Document the ordering constraint inline so future maintainers don't accidentally insert a warming probe ahead of the smoke cycle. | `npm run container:validate` exercises the genuine cold-init-without-prior-warming path; this is the safety net that prevents recurrence. |
| CS79-4 | **PR body** must include `## Local Review`, `## Container Validation` (table with the new fresh-cold-init cycle from CS79-3), `## Telemetry Validation` = `not applicable (tooling-only)` since smoke probe is a CI script, no runtime telemetry signals introduced. Local Review log + Copilot review per the standard PR loop. | Standard non-docs PR gates pass. |
| CS79-5 | **Deploy:** after PR merges, follow [INSTRUCTIONS.md § Production deploys "Standard deploy sequence"](../../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user) main → staging → prod. Surface BOTH approval links prominently. Dispatch background watcher (Haiku, `mode: background`) for each deploy per [trip-wire #1](../../../.github/instructions/orchestrator-trip-wires.instructions.md). On prod, the deploy must succeed without auto-rollback — the wake step (CS73) will fire if DB is paused, then `/api/features` smoke must reach 200 within budget. **This is the empirical CS79 closure validation.** | Both deploys complete green. Prod revision is the new image, NOT a rolled-back one. |

### Failure handling matrix (decisions made now so the orchestrator doesn't ask)

| Phase | Failure mode | Action without operator |
|---|---|---|
| Implementation | Sub-agent hits unexpected complexity in `pollUntil()` refactor | Sub-agent emits `STATE: blocked` with reason; orchestrator checks plan diff vs reality and patches the spec or asks user. **Plan should be specific enough this doesn't happen.** |
| Local validation | `npm run container:validate` fails on the new cold-init step | Fix the test or fix the implementation; do not skip. If both options blocked, escalate. |
| Local review | GPT-5.5 surfaces issues | Apply fixes per standard loop. Up to 5 rounds before re-checking spec. |
| Copilot review | Threads to resolve | Standard disposition + commit-SHA reply, then resolve. Up to 8 rounds before flagging persistent disagreement. |
| Staging deploy | Build/push/Ephemeral Smoke fails | Investigate immediately. If it's a CS79-introduced regression: fix and re-deploy. If unrelated environmental: rerun once; if still failing, escalate. |
| Staging deploy | Cold-start assertion smoke (CS53-20) fails | Investigate as a real signal; CS53 territory. May require coordinating with CS53. Escalate. |
| Prod deploy | CS73 wake step fails | Investigate immediately. CS73 should be robust per its tests; failure indicates env regression (e.g. SQL credentials, network). Escalate. |
| Prod deploy | CS41-1 smoke fails on `/api/features` again | The CS79 fix did NOT take. Investigate: is `X-User-Activity: 1` actually in the request headers? Is `pollUntil` forwarding correctly? Is the gate logic different from what we read? Capture App Insights evidence; do NOT re-deploy without diagnosis. Escalate. |
| Prod deploy | CS41-1 smoke fails on a different step (login, score submit, etc.) | Different failure mode. Investigate via App Insights and smoke-results.json artifact. Escalate if not obvious. |
| Prod deploy | Auto-rollback fires successfully | Prod is safe (back on prior image). Diagnose, fix, re-deploy through the same ceremony. |
| Prod deploy | Auto-rollback FAILS | This is a serious incident; escalate immediately. CS41-5 rollback verification step would have logged the failure. |

## Acceptance

CS79 closure-blocking criteria:

1. `scripts/smoke.js` step (b) `/api/features` sends `X-User-Activity: 1` on every probe attempt.
2. Regression test in `tests/smoke-cold-init.test.mjs` (or equivalent) passes against the fix and would fail without it.
3. `scripts/container-validate.js` exercises the cold-init path end-to-end via `GWN_SIMULATE_COLD_START_MS=30000`; passes.
4. Standard validation suite passes: `npm run lint && npm test && npm run test:e2e && npm run test:e2e:mssql && npm run container:validate`.
5. PR merged with all required reviews satisfied.
6. **Staging deploy completes green** (5 jobs).
7. **Prod deploy completes green WITHOUT auto-rollback.** Active prod revision is the new image, not a rolled-back one. CS41-1 smoke evidence in deploy log shows `/api/features ok in <Nms> (attempts=N)`.
8. CS73's empirical closure is also satisfied as a side effect (the same prod deploy exercises CS73 wake-step on a paused DB AND CS79 fix together).

## Will not be done as part of this clickstop

- Modifying `server/app.js` boot-quiet contract behavior (CS53-23/19 territory).
- Adding cold-DB cache fallback (CS56).
- Adding cold-init telemetry / dashboard (CS72-adjacent).
- Reverting CS78 (exonerated).
- Investigating other smoke steps for similar latent bugs (in scope only if local validation surfaces them).

## Risks & rollback

- **Fix risk: minimal.** Adding `X-User-Activity: 1` to a smoke probe matches what real users already send and what step (e) already sends. No production runtime code changed. Worst case: smoke probe behaves slightly differently against a warm DB (still works because gate is no-op when `dbInitialized=true`).
- **Test risk:** the new regression test must use the same `GWN_SIMULATE_COLD_START_MS` env var as CS53's existing tests. If it conflicts with CS53 fixtures, coordinate but don't break them.
- **Deploy risk:** if CS79-5's prod deploy auto-rolls-back AGAIN, prod is safe (CS41-5 rollback verification confirms). Diagnose via App Insights before re-deploying.
- **Rollback:** revert the PR. Smoke probe returns to today's behavior (works on warm-replica deploys, fails on cold-replica deploys — same as today). No production runtime impact.

## Operator-required actions during execution

The user explicitly asked for autonomous execution through implementation, test, review, validation, and deploy ceremony. The only steps that **structurally** require user action:

1. **Click "Approve" on staging deploy** in GitHub Actions UI. Surfacing the link prominently is the orchestrator's responsibility per [INSTRUCTIONS.md § Production deploys](../../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user); the click itself is unavoidable per the `staging` Environment's required-reviewers protection.
2. **Click "Approve" on prod deploy** in GitHub Actions UI. Same — unavoidable per the `production` Environment's required-reviewers protection. Cannot be bypassed by the orchestrator without violating safety policy.

Both clicks happen at known, documented gates. The orchestrator does NOT need user input for any other phase. Watchers carry the deploy through to terminal state and report on completion.

## Cross-references

- Origin: prod-deploy run [25617860563](https://github.com/henrik-me/guesswhatisnext/actions/runs/25617860563) (2026-05-10T02:39Z) failed CS41-1 smoke; auto-rollback to revision 0000022 (image `76f5705`) succeeded.
- Adjacent: [done_cs73](../done/done_cs73_prod-deploy-cold-db-handling.md) — wake step worked perfectly; CS79 is the separate failure on the new image.
- Adjacent: [done_cs78](../done/done_cs78_dependabot-overrides-may2026.md) — exonerated as the cause; safe to keep merged.
- Adjacent: [active_cs53](../active/active_cs53_prod-cold-start-retry-investigation.md) — boot-quiet contract owner (CS53-23, CS53-19). CS79 conforms to the contract; does NOT change it.
- Smoke runner: [`scripts/smoke.js`](../../../scripts/smoke.js).
- Request gate: [`server/app.js`](../../../server/app.js) (line 332-351).
- Container validate: [`scripts/container-validate.js`](../../../scripts/container-validate.js).
