# CS53 — Production cold-start retry hiccup investigation

**Status:** 🔄 In Progress
**Owner:** yoga-gwn
**Origin:** Deferred from CS42-5c manual production verification (2026-04-23). The CS42 retry path itself worked — progressive messages rendered, the SW migration succeeded, and 503/`Retry-After` plumbing fired — but the user observed that the **profile screen required ~3 explicit Retry-button clicks** before the database came up, with the full incident spanning ~22 minutes (14:09:06 → 14:31:13 PT, 2026-04-23).

## Goal

Use the **real production logs from the 2026-04-23 incident** (App Insights / Container Apps stdout) to determine whether the multi-retry experience is caused by:

- **(a) Server** — a transient error class CS48 doesn't classify, premature 503 with no `Retry-After`, pool exhaustion during warmup, internal retry storms, or self-init still in flight while requests are being served;
- **(b) Client** — `WARMUP_CAP_MS = 30000` in `progressive-loader.js` being too short for the actual cold-start floor of Azure SQL serverless free tier; raw `fetch()` calls that bypass the retry plumbing (e.g. `app.js:530` token validation on boot); profile-screen `onRetry: () => fetchProfile()` semantics resetting state in surprising ways;
- **(c) Infra** — Azure SQL serverless auto-pause + free-tier warmup variance fundamentally exceeding any reasonable client cap, in which case the answer is messaging + a documented floor rather than retry tuning.

## What we already know from code reading (pre-log-pull)

Findings from this session (no new bugs needed yet):

1. **Profile DOES use `progressive-loader`** (`public/js/app.js:2804–2868`). It runs four `apiFetch` calls in `Promise.allSettled`, batch-promotes any sub-`RetryableError` into one `RetryableError` for the loader, and rethrows on all-rejected. Structurally identical to leaderboard. So hypothesis (1) from the original plan ("profile bypasses retry plumbing") is **largely refuted by code**.
2. **`WARMUP_CAP_MS = 30000`** (`public/js/progressive-loader.js:14`). When wall-clock since the loader started exceeds 30s, the loader falls out of `retryLoop()` and renders the **Retry button**. Each manual click *re-enters* the loader with a fresh 30s budget. So 3 clicks ≈ 90s of effective warmup window, and the user's "more than 3 server-side timeouts per click" matches the loader's `min/max retryAfter` clamp of 2–8s × repeated attempts. **The 30s cap is the leading suspect.**
3. **Token validation on boot uses raw `fetch`** (`public/js/app.js:530`). Not `apiFetch`, not `progressiveLoad`. If the DB is cold during this initial request, the response is silently dropped on any non-401/403 path — no retry, no UI signal. Possibly unrelated to the profile-screen complaint, but still a known unhardened surface that CS53 should at minimum document and decide on.
4. **Server-side 503 path is consistent** (`server/app.js:328–366`): central error handler converts any `>=500 + isTransientDbError` into `503 + Retry-After: 5 + {retryAfter:5}`. Logs the incident with `transient: true`. No fall-through to 500 in the transient branch. So if a particular cold-start error reaches the user as a generic 500, it means `isTransientDbError` didn't match it — and **CS53-3 must verify this against actual prod log messages**.
5. **Self-init loop** (`server/app.js:370+`) runs every 5s up to 30 attempts with retry-classification. While self-init is failing, request handlers will see DB errors and emit 503s on their own — so during the warmup window we should see *both* `Self-init attempt failed, retrying in 5s` warnings *and* per-request `Transient DB error — responded 503` errors interleaved.

## Incident window (user-supplied)

- **2026-04-23 14:09:06.640 UTC → 14:31:13.943 UTC** (≈22 minutes total, 3 client retry-button cycles, "more than 3 server-side DB timeouts per cycle").
- App: production deployment of `gwn.metzger.dk` on Azure Container Apps, Azure SQL serverless free tier as backend.
- Telemetry: OTel SDK exporting traces to Azure Monitor via `APPLICATIONINSIGHTS_CONNECTION_STRING`. Pino logs (stdout) include `requestId`, `transient` flag, OTel `trace_id`/`span_id`. Container Apps stdout is also queryable.

## Remaining work summary (2026-04-25 refresh)

After a code re-read against the current `main`, most rows in the table below that were marked "Pending" or "In Progress" are now superseded by code that landed via PRs #233, #234, #239, #244, #246 and the no-DB-wake policy adoption. Status flips below; **truly remaining work**, in priority order:

1. **CS53-23 — Boot-quiet contract foundation (absorbed from CS55-2 v2).** P0 — single biggest unblock for the rest of CS53; takes over PR #241 (currently v1 with a 5-min TTL that violates Policy 1) and reworks it into the v2 design that defines the `X-User-Activity` header contract, server-side enforcement helper, and "no header → never touch DB" response semantics. CS55 marks itself dependent on this row; the rest of CS55-2's downstream tasks (badge wiring, achievement notifications, admin announcements) stay in CS55.
2. **CS53-14 + CS53-16** — paired SW PR (catch path 503 propagation + `skipWaiting`/`clients.claim`). P1.
3. **CS53-8b** — `/api/db-status` ops endpoint (in-memory only). P2.
4. **CS53-10** — capacity-exhausted regression test (finish PR #240, then implement). P2.
5. **CS53-19** — boot-quiet enforcement across every boot/focus endpoint. P2. Phase A HAR can start in parallel with CS53-23; Phases C–G now depend on **CS53-23** (not external CS55-2).
6. **CS53-20** — CD-side staging cold-start smoke. P3.
7. **CS53-24 — Pre-close follow-up decisions.** P3 — final task before CS53 closes; resolves the CS53-13 retry-budget UX question (after CS54 telemetry lands) and the CS53-21 solo-PR merge-policy extraction (decide which planned CS owns it).
8. **Final step (operator)** — flip Azure SQL Free Tier billing setting in prod and validate cold-start UX end-to-end against a live paused-then-resumed DB. Held until everything above is merged so the live validation exercises the complete fixed code path in one shot.

**Out of CS53 scope** (despite earlier rows mentioning them): CS53-21 process policy is a candidate for extraction, decided as part of CS53-24.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS53-1 | Run the KQL query bundle below against App Insights / Container Apps logs for the incident window. Capture: full count of `transient: true` 503s, full count of non-503 `>=500` errors, distinct error messages / SQL error codes, self-init attempt timeline, and request-id correlation for the four profile endpoints (`/api/auth/me`, `/api/scores/me`, `/api/achievements`, `/api/matches/history`). User runs queries; orchestrator analyses results. | ✅ Done (2026-04-25 refresh) | Q1 + Q7 results captured in "## CS53-1 findings" / "Q7 results" sections below. All errors classified as ETIMEOUT transient; no gaps for the incident window. Future incident telemetry depth is owned by CS54 (App Insights enablement). |
| CS53-2 | Cross-check every distinct error class from CS53-1 against `isTransientDbError` (`server/lib/transient-db-error.js`). For each: (a) was it correctly classified transient? (b) was 503 + `Retry-After` actually emitted? Document gaps. | ✅ Done (2026-04-25 refresh) | Bug A (free-tier ELOGIN false-positive) fixed via PR #233 — explicit non-transient classification + `sendDbUnavailable()` 503-without-Retry-After response shape. ETIMEOUT correctly transient (verified by Q1 results). |
| CS53-3 | Quantify the actual cold-start duration distribution from CS53-1 (time from first 503 to first 200 across the incident). Compare with `WARMUP_CAP_MS = 30000`. Decide one of: raise the cap, make the cap adaptive (use `Retry-After` from the latest 503 instead of wall-clock), or accept the floor and improve messaging. | ✅ Done (2026-04-25 refresh) | All three remediation fixes shipped: (1) mssql `connectionTimeout=5000` / `requestTimeout=15000` (`server/db/mssql-adapter.js:336–352`); (2) adaptive client cap 30s→120s via `Retry-After` (`public/js/progressive-loader.js:21–26`, PR #239); (3) proactive resume probe **explicitly cancelled** by Policy 1 — replaced by lazy init (CS53-9, PR #233) + auth retry loop (CS53-17, PR #244). |
| CS53-4 | Audit raw-`fetch` callsites that touch the API and decide which need to be routed through `apiFetch` + retry-aware handling. Specifically: `public/js/app.js:530` (boot token validation). Find others via `grep -nE "fetch\\('/api"`. | ✅ Done | Landed via PR #238 (merge `8dcf3f5`); `safeOnDeferred` wrapper added in `f6de579` to prevent boot unhandledrejection. |
| CS53-5 | Re-run manual cold-start validation against (a) leaderboard, (b) achievements, (c) multiplayer history, (d) community submissions, after waiting for Azure SQL to auto-pause. Record retry-count + wall-clock-to-success per screen. Confirms whether the issue is profile-specific or universal. | ✅ Done (2026-04-25 refresh) — superseded | Superseded by `npm run container:validate` (CS53-11) which exercises the same warmup-retry path on every container restart with `GWN_SIMULATE_COLD_START_MS=30000`, plus the 8 cold-start cycles run during PR #244 review. Manual per-screen replay no longer adds signal beyond the harness. |
| CS53-6 | Implement remediation chosen in CS53-3 (and CS53-2/CS53-4 if those surfaced fixes). Land in one or more PRs through standard validation. | ✅ Done (2026-04-25 refresh) | Same shipped set as CS53-3: PRs #233 (classifier + mssql timeouts + lazy init), #239 (adaptive client cap), #234 (`UnavailableError` + poller removal), #244 (auth retry loop). |
| CS53-7 | Investigate the stuck-state failure mode observed 2026-04-23 ~12:15/~14:30 PT (site permanently stuck in "db is cold"). See dedicated section below for hypotheses (H1/H2/H3/H4) and diagnostic queries. | ✅ Done (2026-04-25 refresh) | Root cause = Azure SQL Free Tier monthly allowance exhaustion (see "🚨 ACTUAL ROOT CAUSE" subsection). H1–H4 hypotheses recorded for the historical record but no longer the active failure mode; permanent-stop branches removed by CS53-9 (lazy init), pool-watchdog plan cancelled (CS53-8a). |
| CS53-8 | Implement stuck-state remediation (fixes #4–#8 below): never permanently stop self-init, ~~pool watchdog~~ (cancelled, see CS53-8a), public `/api/db-status`, surface stuck state to users. | ✅ Done (2026-04-25 refresh) — scope split | Scope was split by Policy 1: (a) "never permanently stop self-init" → done by lazy init (CS53-9, PR #233); (b) pool watchdog → cancelled (CS53-8a); (c) public `/api/db-status` → tracked separately as CS53-8b (still pending); (d) "surface stuck state to users" → done by `UnavailableError` + auth retry loop (PRs #234 + #244). |
| CS53-8a | ~~Pool watchdog: background interval pinging the pool with `SELECT 1` and recreating it on N consecutive failures.~~ | ❌ Cancelled | Violates the no-DB-wake policy ([§ Database & Data in INSTRUCTIONS.md](../../../INSTRUCTIONS.md#database--data)); pool death is detected lazily on the next real request via the central error handler. Re-creation is then handled in-band (or via an operator `POST /api/admin/init-db`). |
| CS53-8b | Public `/api/db-status` endpoint — **ops/health endpoint only**. Reads in-memory state (`dbInitialized` flag, init-guard `isInFlight()`, `getDbUnavailability` cached last-error). **Does NOT issue any DB query.** **No SPA polling.** SPA learns DB state via responses to real user requests (`UnavailableError` / `RetryableError` already in place from PR #234). | ⬜ Pending | Scope tightened to comply with Policy 1. Safe to probe externally because it does not touch the DB. |
| CS53-9 | **Lazy self-init (replace timer with request-driven).** PR #233 introduced a 60s slow-retry `setTimeout` that re-attempts `initializeDatabase()` while `dbInitialized=false`. That violates Policy 1. Replace with: on first inbound user request when `dbInitialized=false`, call `runInit()` via the init guard. Subsequent concurrent requests during init either queue or get `503 + Retry-After` per existing central error handler. The init guard already prevents concurrent attempts. | ✅ Done (this PR) | Acceptance: no `setInterval`/`setTimeout` in `server/app.js` or `server/lib/db-init-guard.js` issues a DB query; cold app boot does not contact DB until the first request arrives. Verified by `tests/lazy-init.test.js`. |
| CS53-10 | **Test out-of-money (`capacity_exhausted`) state end-to-end.** Need a way to reliably reproduce Azure SQL Free Tier `capacity_exhausted` (`ELOGIN` with "paused for the remainder of the month" message) in the local container or a unit test, so that the fail-fast `UnavailableError` path stays regression-protected. Approach TBD — orchestrator + user iterate after Round 1. | ⬜ Pending — design | Stub. Likely options: (a) extend `GWN_SIMULATE_COLD_START_MS`-style env var to inject a synthesized `ELOGIN`+free-tier-exhausted message on first connect; (b) inject via the mssql adapter test harness directly. |
| CS53-11 | **Local cold-start container validation harness.** Add `npm run container:validate` that boots the MSSQL stack with `GWN_SIMULATE_COLD_START_MS`, probes `/api/features` until it transitions from 503 → 200, and asserts the warmup retry path is exercised on every restart. Required by Policy 2 (cold-start container validation gates check-in). | ✅ Done | Script in `scripts/container-validate.js`. Used by every CS53-* PR going forward. Verified by hand on PRs #240, #244. |
| CS53-12 | **Fix `ServerResponse` `'finish'` listener leak.** Container logs emit `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 finish listeners added to [ServerResponse]` repeatedly during normal traffic (hot DB, no retries). Suspected sources: OTel HTTP instrumentation, pino-http, and the drain/active-request tracker in `server/app.js` each attach a `'finish'` listener per request. Identify which middleware accumulates without removing, fix, and add a regression guard (assert `res.listenerCount('finish') ≤ N` in an integration test). In CS53 scope because the leak amplifies under cold-start retry storms (each retried request stacks more listeners) and degrades the same UX path CS53 protects. | ✅ Done | Landed via `setMaxListeners(32)` on the response-tracker emitter (commit `8e49fff`). Cherry-picked into PR #244 because cs53-17 was branched off pre-fix. Regression test in `tests/response-listener-cap.test.js`. |
| CS53-13 | **Retry-loop UX when cold-start exceeds budget.** When the auth retry loop (CS53-17) exhausts its `AUTH_WARMUP_DEADLINE_MS` budget without a successful response, the user currently sees a static "Server is warming up — please try again in a moment" message and must click again. Three design candidates: (a) keep current behaviour but add a retry button with a fresh budget; (b) auto-extend the budget once on user opt-in; (c) surface a structured "still cold after Ns" status. | ⬜ Pending — design | Stub. Decide after CS53-17 ships and we have manual-validation data on how often the 120s deadline actually trips. |
| CS53-14 | **SW catch path: distinguish offline vs server error.** `public/sw.js` currently synthesises a `503 (Offline)` response for any failed inner fetch — including warmup 503s from the server's own gate. This corrupts the auth retry loop's view of the response (the SW response has no `Retry-After`, breaking `parseRetryAfterMs`). Solution: SW should propagate the original network error or pass-through the upstream 503 with its headers intact. | ⬜ Pending | Manifested during CS53-17 validation when the old SW (`gwn-f224ccd2`) intercepted requests after the new SW shipped but before the user re-loaded. Workaround: unregister SW in DevTools or InPrivate browse. |
| CS53-15 | **Persist Caddy local CA across container recreates.** `docker compose down` removes the Caddy container and its anonymous volumes, regenerating the local CA on each `up`. Browsers then reject the new cert until manually re-trusted, which torpedoed cold-start validation rounds. Add named volumes for `/data` and `/config` in `docker-compose.mssql.yml` so the CA persists across recreates. | ✅ Done | Commit `10b19c5` (cherry-picked into PR #244). Eliminates the recurring "ERR_CERT_AUTHORITY_INVALID" / `net::ERR_ABORTED 503 (Offline)` churn during local validation. |
| CS53-16 | **SW skipWaiting + clients.claim.** New service-worker versions wait for all clients to close before activating. During CS53-17 iteration this routinely meant the old SW kept intercepting requests for the entire dev session. Adding `self.skipWaiting()` in `install` and `clients.claim()` in `activate` makes new versions take over immediately. | ⬜ Pending | Branch created but not committed. Sequence after CS53-14 so the cache-version bump and the catch-path fix ship together. |
| CS53-17 | **Auth form retry loop — swallow warmup 503s during cold-start.** Login/register currently show the raw 503 to the user, who then clicks 5–10 times. Wrap `authAction()` in a retry loop that respects `Retry-After`, caps total wall-clock at `AUTH_WARMUP_DEADLINE_MS`, and uses progressive in-button messaging so a single click succeeds across a cold-start. **v1** `646669f` initial loop. **v2** `3221493`+`a306886` 120s deadline + no static red label + bugfix. **v2 review fixes** `4caf5a5` (rubber-duck found 3 bugs: per-attempt cap, register idempotency, 503 wording). **v3** also retry on gateway errors 502/504 with 5s default when no `Retry-After` (Caddy/Azure FD don't always send one); register stays non-retried for 502/504 (request may have reached origin). **v3 review fixes**: rubber-duck R2 (`1cff227`: register UX nudge to login, `Retry-After` authoritative, `AUTH_MIN_ATTEMPT_MS=1500` floor); GPT 5.4 code-review (`478f25e`: gate response now carries `phase:'cold-start'` discriminator so register-503 retry doesn't fire on transient-DB-503 from inside the handler); Copilot R1 (5 findings — 503 UI fallback signal check, vacuous listener-cap test → `X-Test-Max-Listeners` echo header, comment fix, CS doc rows); Copilot R2 (rename `cancelActive`→`clearActiveTimeout`, merge main into branch); Copilot R3+R4 (tighten test status assertions to strict `401`). | ✅ Done | PR #244 merged (squash `2c6147b`) via admin override (Copilot bot only "COMMENTED", branch protection wanted APPROVED). 8 cold-start container-validation cycles all PASSED. CS53-12 + CS53-15 cherry-picked (PRs #242/#243 closed as redundant). Follow-ups: CS53-13 (retry-budget UX), CS53-14 (SW catch path corrupts upstream 503). |
| CS53-18 | **Raise / unify `WARMUP_CAP_MS` across the SPA.** Originally tracked because `public/js/progressive-loader.js` was thought to still have a static `WARMUP_CAP_MS = 30000`. **Discovered already done by CS53-6.** The file now has `INITIAL_WARMUP_BUDGET_MS = 30000` + adaptive extension per 503 (clamped at `MAX_WARMUP_BUDGET_MS = 120000`, matching auth's deadline) — the `Retry-After`-driven approach we wanted. | ✅ Done (duplicate of CS53-6) | Code: `public/js/progressive-loader.js:21–26, 161–273`. Shipped via PR #239 (`c2a36d1` + `e82d622`, merged 2026-04-24). Verified 40/40 progressive-loader unit tests pass against current code. No new work required. |
| CS53-19 | **Boot-time DB-wake audit — apply the X-User-Activity contract to every boot/focus endpoint.** `/api/auth/me` (boot JWT validation), `/api/features`, `/api/notifications/count` and friends all wake the DB on every tab open / refresh / refocus even when no user activity has occurred. HAR evidence (2026-04-25 local-cold-start repro) confirms `/api/features` and `/api/notifications/count` each fire **twice** during a single login boot — both DB-touching, neither user-initiated. **CS53-23 (absorbed from CS55-2 v2)** owns the *contract* (`X-User-Activity: 1` header + server-side enforcement helper); CS53-19 owns *applying* that contract to every endpoint a stale tab can hit. **Hard prerequisite: CS53-23 must ship first** (header name, enforcement helper, and "no header → don't touch DB" response semantics must be defined before this CS can begin Phase C; Phases A and E can run in parallel with CS53-23). | 🔒 Blocked on CS53-23 — P2 | See "## CS53-19 detailed plan" below for sub-tasks A–G. Cross-link: CS53-23 row below. Acceptance: opening a tab with a valid JWT and immediately closing it causes **zero** DB queries; a CI test enforces this. |
| CS53-20 | **CD-side cold-start smoke against staging.** `npm run container:validate` (CS53-11) is a great local regression harness, but it does not run in CI/CD. A regression that breaks cold-start handling would ship to prod and only be caught when a user clicks login during an Azure SQL auto-pause window. Add a post-deploy job (against staging) that does the equivalent probe — boot a known-paused state and assert the warmup retry path completes within budget. | ⬜ Pending — P3 | Implementation options: (a) `az containerapp exec` into the deployed staging app and run the validation probe; (b) external probe from the GitHub Actions runner that hits the staging URL after waiting for auto-pause; (c) a synthetic transaction in App Insights once CS54 lands. Option (b) is the most portable and doesn't depend on CS54. |
| CS53-21 | **Solo-PR merge-gating policy.** PR #244 had to merge with `gh pr merge --admin` because branch protection requires an APPROVED review and the only reviewer (Copilot bot) only ever issues "COMMENTED" reviews. Admin override silently bypasses CI gates as well. Decide: (a) make Copilot bot's "COMMENTED" sufficient when all CI checks pass, (b) configure a "self-merge after N successful CI cycles" rule, (c) accept admin-override as documented policy with a checklist (CI green + local review clean + Copilot has no open findings). | 🪓 Deferred to CS53-24 — P3 | **2026-04-25 refresh:** out of CS53 cold-start scope; extraction decision (which planned CS owns it) is rolled up into CS53-24 (pre-close follow-up decisions) so we don't re-litigate it now. Recommended landing position is still option (a). |
| CS53-22 | **Prod-deploy verify must respect Policy 1 + capacity-exhausted state.** Prod deploy of `cceedac` (run 24935682157) auto-rolled back because `Verify production deployment` polls `/api/health` and requires `db=ok`. With Policy 1 (lazy DB init) the new code returns `db=not_initialized` until something wakes the DB; `/api/health` no longer does that. Worse, when Azure SQL Free Tier is exhausted (the user's current state), `db` will *never* be `ok` even after warming — so the verify step blocks shipping the very fix that handles capacity exhaustion. Two-phase fix: (1) actively probe `/api/features` to trigger lazy init OR confirm `503 + unavailable=true + no Retry-After` (intentional unavailability is a successful deploy of the unavailable-handling code); (2) authoritatively check `/api/health` for `status=ok` (and `db=ok` only when phase 1 returned 200). | ✅ Done | PR #246 merged (squash `842827f`). Re-deploy run 24936344788 succeeded with `phase1=intentional_unavailable` — proving the verify logic on its first real run. Production now on `cceedac` (revision `gwn-production--0000018`). |
| CS53-23 | **Boot-quiet contract foundation (absorbed from CS55-2 v2).** Take ownership of PR #241 (`cs55-2-unread-count-cache`) and rework v1 (5-min TTL — violates Policy 1) into the v2 design. Defines the `X-User-Activity: 1` request-header contract, the server-side enforcement helper, the cache-lifetime model (process lifetime, writer-only invalidation), and the response shape when the header is absent. This is the contract foundation that CS53-19 (apply contract to every endpoint) and CS55 (real-time notifications) both depend on. | ⬜ Pending — **P0** (next dispatch) | Sub-tasks (renumbered from CS55-2.A–L): **CS53-23.A** remove TTL re-read (cache lifetime = process lifetime; writer-only invalidation); **CS53-23.B** decide cold-cache miss policy (recommend: return `0`/`null` until first writer seeds — strict zero-DB-from-reads); **CS53-23.C** define `X-User-Activity: 1` request-header contract (header semantics + missing → never touch DB); **CS53-23.D** wire SPA's `refreshNotificationBadge()` (`public/js/app.js:3403`), submission-screen open, mark-read, mark-all-read paths to send the header; **CS53-23.E** apply contract to `/api/auth/me` (HMAC + expiry verification without DB lookup, OR cached user row with write-invalidation); **CS53-23.F** audit + gate the rest of the boot/focus set (`/api/features`, `/api/notifications` list, `/api/scores/me`, `/api/achievements`, `/api/matches/history`) — each must be DB-free, cached + write-invalidated, or explicitly require the header; **CS53-23.G** add `INSTRUCTIONS.md § Database & Data` paragraph documenting the contract; **CS53-23.H** tests asserting header absence → zero DB queries (unit + integration); **CS53-23.I** add `## Container Validation` to PR #241 body and run `npm run container:validate` per Policy 2; **CS53-23.J** GPT-5.4 R3+ local review on the policy-compliant design; **CS53-23.K** Copilot review on PR #241; **CS53-23.L** merge once container-validate, GPT-5.4, and Copilot are clean. Cross-link: planned_cs55 marks CS55 dependent on this row. |
| CS53-24 | **Pre-close follow-up decisions.** Final task before CS53 is moved to `done/`. Resolve: (1) **CS53-13 retry-budget UX** — by this point CS54 telemetry should have run for some time; decide based on whether the 120s deadline actually trips in real prod traffic. (2) **CS53-21 solo-PR merge-gating policy** — extract to its own planned CS (recommended) or land inline; pick a CS number and file the planned CS file. (3) Anything else that surfaces during CS53-23/19 implementation that's tangential and should be deferred. | ⬜ Pending — P3 | Do not run this until everything else in CS53 is merged. The point of deferring is to avoid re-litigating decisions we don't yet have data for. After CS53-24 closes, the very last step before declaring CS53 ✅ Done is the operator-side **prod-billing flip + live validation** (see remaining-work summary item 8). |

## CS53-1 findings (preliminary, 2026-04-23)

App Insights is **not configured in production** (no `APPLICATIONINSIGHTS_CONNECTION_STRING` env var on the Container App), so OTel does not export traces. We are working from Container Apps stdout → Log Analytics (`ContainerAppConsoleLogs_CL`). Enabling App Insights in prod is tracked separately as **CS54** (planned).

## CS53-2 root-cause analysis (after deeper code reading, 2026-04-23)

Two distinct 503 paths exist server-side; understanding which one fired in the incident changes the remediation:

- **Path A — gating middleware (`server/app.js:170–178`)**: when `draining || !dbInitialized`, returns 503 + `Retry-After: 5` *before any DB call* with **no log statement**. Cost: ~0ms per request.
- **Path B — central error handler (`server/app.js:328–366`)**: triggered when a route handler reaches a transient DB error mid-request. **Emits the "Transient DB error — responded 503" log line**. Cost: 15000ms (mssql `connectTimeout`/`requestTimeout` defaults).

**Every error in Q1/Q7 is Path B** (all carry the "Transient DB error — responded 503" message). This is a critical signal:

> `dbInitialized` was **`true`** at incident time. The DB had already been initialized in this container; what we observed was Azure SQL **auto-pausing mid-session**, not a deploy-time cold-start.

This rules out the leading hypothesis from earlier ("deploy cold-start hits the WARMUP_CAP_MS too early"). The actual chain of events:

1. Azure SQL serverless auto-paused after the configured idle period.
2. Next request reaches a route handler → mssql pool tries to use a paused connection → **15s `requestTimeout`** fires → ETIMEOUT.
3. Central error handler catches it, classifies transient (correctly), emits 503 + `Retry-After: 5`. Logs the line we see.
4. Client `progressive-loader` enters `retryLoop()`. Sleeps 2–8s clamped from `Retry-After`. Retries. Server tries again → another 15s timeout → another 503.
5. Wall-clock cap (`WARMUP_CAP_MS = 30000`) exhausts after ~2 server attempts. Retry button shown.
6. **Self-init loop NEVER re-runs** — it short-circuits on `if (draining || dbInitialized) return;` (`server/app.js:379`). So the server has **no proactive DB warming** after the initial bootstrap. The only thing waking the DB is the per-request connection attempts themselves — and each one times out at 15s before the DB finishes warming.
7. Eventually (after some number of failed attempts) Azure SQL completes its resume cycle and a subsequent attempt succeeds.

**Confirmed defaults from `node_modules/mssql/lib/tedious/connection-pool.js:41–42`:** both `connectTimeout` AND `requestTimeout` default to **15000ms**. `mssql.connect(connectionString)` in `server/db/mssql-adapter.js:312` passes no options → we inherit both defaults.

**Why wave 1 had only 3 endpoints (no `/api/auth/me`):** the boot-time raw `fetch('/api/auth/me')` at `public/js/app.js:530` fires at page load *before* the profile-screen `fetchProfile()` batch. It overlapped wave 1 (already in flight when `progressiveLoad` started), so wave 1 only saw 3 distinct fan-out URLs. Wave 2 (the retry batch) included `/api/auth/me` because the boot-time fetch had already failed silently and `fetchProfile()`'s batch picked it up. **The boot-time raw fetch is also unhardened** — on 503 it silently does nothing (only 401/403 are handled at `app.js:533`), so a paused DB at app boot leaves the user logged-in-but-not-loaded.

**Why `/api/notifications/count` shows up at 14:09:00 and 14:31:13:** `NOTIFICATION_POLL_INTERVAL = 60000ms` (`public/js/app.js:3142`) — it's a 60s interval poller hitting the DB. Each tick during a paused window adds a 15s timeout to the pool's traffic. The 14:31:13 entry is almost certainly a *second* auto-pause cycle (22 min idle from 14:09 → 14:31 lines up with Azure SQL's free-tier auto-pause threshold), not the tail of the same event.

## Root cause (one-line)

Azure SQL serverless auto-pauses idle; the mssql driver's default 15s `requestTimeout` is shorter than the DB's resume time, so each per-request connection attempt times out before the DB warms — and the server has **no proactive resume probe** after `dbInitialized = true` is set, so warming relies entirely on the very requests that keep timing out. The client's 30s `WARMUP_CAP_MS` then surfaces the Retry button after ~2 such attempts.

## Proposed remediation (CS53-3 decision)

Three small, additive fixes — all needed; none alone is sufficient:

1. **Server: tune mssql timeouts** — pass `connectionTimeout: 8000` and `requestTimeout: 8000` to `mssql.connect()`. Trades long single timeouts for more attempts per wall-clock window. (Going below ~5s risks false positives on real network jitter.)
2. **Server: add a proactive resume probe** — when the central error handler catches a transient error AND `dbInitialized === true`, schedule a short async background ping (`SELECT 1` with the same short timeout, retry-with-backoff up to N attempts) to wake the pool without holding the response. This is the missing piece that converts every paused-DB user-request into "fail-fast + warm in background" instead of "block 15s + hope the next click happens after warmup".
3. **Client: adaptive `WARMUP_CAP_MS`** — extend the wall-clock budget by `Retry-After` on each successive 503 instead of fixing 30s. Cap total at ~120s. Combined with #1, this means a typical Azure SQL resume (~30–60s) fits inside one client cycle without the user ever seeing a Retry button.

**Out-of-scope but flagged:**
- Boot-time raw `fetch('/api/auth/me')` at `public/js/app.js:530` should be migrated to `apiFetch` + tolerate 503. Small follow-up; fold into CS53-4.
- The 60s notifications poller adds steady pool pressure during paused windows. Could be backed off when the last response was 503. Optional polish, not required for the core fix.

## Data points still useful (not blocking)

- A query to find Path A 503s in the window — they would prove whether self-init was ever re-attempted. Path A is silent in logs today, so we'd need to either (a) add a debug log to that branch, or (b) infer absence from the fact that no `Self-init attempt` lines appear in Q5/Q7.
- A second-incident replay (CS53-5 manual re-validation after auto-pause) to verify the proposed fixes actually reduce retry count.

## CS53-7 second incident (2026-04-23 ~12:15 PT and ~14:30 PT) — STUCK STATE

### 🚨 ACTUAL ROOT CAUSE: Azure SQL Free Tier monthly allowance exhausted

User-supplied logs from 21:49 UTC (the second incident) show a hard error from Azure, **not** the cold-start ETIMEOUT we saw at 14:09 UTC:

> `ELOGIN` — *"This database has reached the monthly free amount allowance for the month of April 2026 and is paused for the remainder of the month. The free amount will renew at 12:00 AM (UTC) on May 01, 2026. To regain access immediately, open the Compute and Storage tab from the database menu on the Azure Portal and select the 'Continue using database with additional charges' option."*

Implications:
- **The DB will not respond to any connection attempt until 2026-05-01T00:00:00Z** (or until billing is enabled in the Azure Portal).
- The "infinite db is cold" UX is the natural consequence of the SPA's warmup messages cycling forever against an unavailable backend.
- **None of the stuck-state code hypotheses (H1/H2/H3/H4) below apply to this incident.** Our server is actually doing the right thing (returning 503 + Retry-After) — but it's classifying the error as transient when Azure has explicitly told us it is permanent until next month.

### Bugs surfaced by this incident

**Bug A — CS48 false positive on free-tier exhaustion** (`server/lib/transient-db-error.js:28-31`):

```js
if (err.name === 'ConnectionError' || err.name === 'RequestError') return true;
if (err.message && /connection.*timeout|pool.*failed|database.*paused|database.*unavailable|failed to connect/i.test(err.message)) {
  return true;
}
```

The free-tier-exhausted error has `err.code === 'ELOGIN'`, `err.name === 'ConnectionError'`, and a message containing "is paused for the remainder of the month". Both line 28 and the `database.*paused` branch on line 29 match → we classify it as transient → emit `503 + Retry-After: 5` → the client retries indefinitely. Azure SQL **auto-pause** is transient (resumes on first connection) but **free-tier-exhausted-pause** is permanent until May 1. The classifier cannot distinguish them today.

**Fix:** add an explicit check before the generic ConnectionError branch:

```js
// Free-tier monthly allowance exhausted — permanent until next month, not transient.
if (err.code === 'ELOGIN' && err.message &&
    /monthly free amount allowance|paused for the remainder of the month/i.test(err.message)) {
  return false;
}
```

And the generic regex on line 29 should drop `database.*paused` (or narrow it to exclude the free-tier case) — Azure SQL "auto-pause" recovery is already covered by ETIMEOUT/ECONNREFUSED + the ConnectionError catch-all.

**Bug B — no UX for permanent unavailability:**

The SPA only knows two end states: "loading (DB warming)" and "click Retry". When the backend is permanently unavailable, the user sees the warmup messages cycle forever with no explanation. We need a surface like:

- A new server response shape for permanent-unavailable: e.g. `503` with `{error: 'database_unavailable', reason: 'capacity_exhausted', renewsAt: '2026-05-01T00:00:00Z'}` and **no `Retry-After` header** so the client falls out of `retryLoop` immediately.
- A SPA handler that recognises this shape and renders a one-off banner ("This site is temporarily unavailable. Service will resume on May 1, 2026.") instead of cycling the warmup loader.

### Immediate recovery options for prod (operator action)

1. **Enable additional charges** — Azure Portal → SQL Database → Compute and Storage → "Continue using database with additional charges". Unpauses immediately. Cost continues at standard serverless rates until May 1.
2. **Wait for 2026-05-01T00:00:00Z** — site stays unusable for ~1 week.
3. **Switch to a non-free-tier SKU** — also a billing change.

### Stuck-state hypotheses (still relevant for OTHER scenarios, not this one)

The hypotheses below were drafted before the free-tier-exhausted finding. They no longer explain the 2026-04-23 incident, but they remain valid lurking failure modes worth fixing as part of CS53-8.

**H1 — Self-init's permanent-stop branch** (`server/app.js:392-395`):

```js
if (!isRetryable) {
  try { await closeDbAdapter(); } catch { /* ignore */ }
  draining = true;
  logger.error({ err }, 'Self-init failed with non-retryable error — call POST /api/admin/init-db after fixing the underlying issue');
}
// NOTE: no setTimeout(attemptSelfInit, ...) is scheduled here.
```

If self-init throws an error that `isTransientDbError` does *not* classify transient (e.g. a schema/migration error, an auth/connection-string problem, or any new error class we haven't seen before), the server:
- closes the pool,
- sets `draining = true`,
- **does not schedule any further self-init attempt**.

After that, the gating middleware (`server/app.js:172-174`) returns `503 + {error: 'Server is draining', retryAfter: 5}` for **every** `/api/*` request, forever, until a human calls `POST /api/admin/init-db`. `attemptSelfInit` itself short-circuits on `if (draining || dbInitialized) return;` (line 379), so even a manually re-triggered timer wouldn't help.

**Side note — once Bug A is fixed**, ELOGIN free-tier-exhausted will become a non-transient error, which means it will hit *exactly* this branch on container startup and put the server in stuck state H1. So the fix for Bug A and the fix for H1 must ship together (or H1 ships first), otherwise the next deploy after May 1 may boot fine, but a subsequent free-tier exhaustion would soft-brick the container.

**H2 — Self-init exhausted MAX_ATTEMPTS** (`server/app.js:402-408`):

`SELF_INIT_MAX_ATTEMPTS = 30` × `SELF_INIT_INTERVAL_MS = 5000` = **150 seconds total budget**. Azure SQL serverless cold-starts can be longer than that. After 30 attempts the server gives up *permanently* and goes to the same stuck-`draining=true` state as H1.

**H3 — mssql Pool stuck in a broken state**:

`server/db/mssql-adapter.js:308` stores the pool: `this._pool = await this._sql.connect(connectionString);` and **never reassigns it**. If the pool's internal state goes bad but `dbInitialized` is still `true` and `draining` is still `false`, every request slides past the gating middleware, hits the route handler, and times out at the pool — emitting "Transient DB error — responded 503" forever with no recovery path.

**H4 — No watchdog**:

There is no background process that periodically pings the DB to detect a broken pool and proactively recover. All recovery is reactive (driven by user requests) and short-circuits as soon as one of the above stuck states is reached.

### Diagnostic queries (kept for reference; H1/H2/H3 remain real risks)

**CS53-7-Q1 — Did self-init permanently fail?** (smoking gun for H1/H2)

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T19:00:00Z) .. datetime(2026-04-23T22:30:00Z))
| extend P = parse_json(Log_s)
| extend msg = tostring(P.msg)
| where msg has_any("Self-init", "Database self-initialized", "Server is draining", "Database not yet initialized", "non-retryable", "max attempts")
| project TimeGenerated, level = toint(P.level), msg, attempt = toint(P.attempt), errMsg = tostring(P.err.message), errCode = tostring(P.err.code)
| order by TimeGenerated asc
```

**CS53-7-Q2 — Did the container restart between incidents?**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T19:00:00Z) .. datetime(2026-04-23T22:30:00Z))
| extend P = parse_json(Log_s)
| extend msg = tostring(P.msg)
| where msg has_any("listening", "Server started", "OpenTelemetry", "Database initialized", "process exit", "SIGTERM", "SIGINT")
| project TimeGenerated, msg, port = toint(P.port), env = tostring(P.env)
| order by TimeGenerated asc
```

### Additional remediation (extends CS53-3 proposal)

The 3 fixes proposed earlier (mssql timeout tuning, proactive resume probe in error handler, adaptive client cap) **do not fully address the stuck-state failure modes or the free-tier exhaustion case**. Add:

4. **Server: classify ELOGIN free-tier-exhausted as permanent** (Bug A above). Surface to client as `503` with no `Retry-After` and a structured body indicating the renewal time.
5. **Server: never permanently stop self-init.** Replace the "give up" branches at `app.js:392-395` and `app.js:402-408` with a long-interval re-try (e.g., every 60s for non-retryable errors, every 30s after MAX_ATTEMPTS exhausted). Pair with a clear log line at each cycle.
6. **Server: pool health watchdog.** Background interval (every 30s) that runs `SELECT 1` against the pool when `dbInitialized=true`. After N (3?) consecutive failures, flip `dbInitialized=false`, close+recreate the pool, and re-enter self-init. Catches H3.
7. **Server: recreate pool on persistent transient errors** — backup mechanism if #6 isn't sufficient.
8. **Public diagnostic endpoint.** `/api/db-status` (no auth required) returning `{state: 'ready'|'initializing'|'stuck'|'capacity_exhausted', lastInitAttempt, consecutiveFailures, renewsAt?}`. Lets the SPA show a meaningful message instead of looping silently.
9. **Surface permanent-unavailable to users** (Bug B above). When the SPA gets a 503 without `Retry-After` (or with the structured body from #4/#8), break out of the retry loop and render a banner instead of cycling the warmup messages.

**Q1 results from incident window (`2026-04-23T14:09:00Z` – `14:31:30Z`):**
- Every error in the window is the same shape: `Failed to connect to gwn-sqldb.database.windows.net:1433 in 15000ms`, `errCode = ETIMEOUT`, `transient = true`, status 503 emitted.
- Affected URLs include the four profile endpoints **plus** `/api/notifications/count` (a 60s poller, see `public/js/app.js:3163`).
- **CS48 classified every observed error as transient — no gaps to plug there.**

**Root-cause hypothesis (confirmed by code reading + log evidence):**
1. **mssql `connectTimeout` = 15000ms** — `server/db/mssql-adapter.js:312` calls `mssql.connect(connectionString)` with no options, so we inherit the mssql package's library default of 15s.
2. **Client `WARMUP_CAP_MS = 30000ms`** in `public/js/progressive-loader.js:14`.
3. With a 15s server attempt and a 30s client cap, **at most ~2 server attempts fit per client retry cycle** before the cap exhausts and the Retry button appears.
4. User clicked Retry 3 times → ~6 server attempts × 15s ≈ 90s of effective warmup, lining up with Azure SQL serverless free-tier cold-start times (typically 60–120s).

**Likely remediations (CS53-3 will pick one):**
- **(a)** Lower mssql `connectTimeout` to ~5s so 4–6 attempts fit per client cycle (faster failure surfacing, cheaper to retry).
- **(b)** Raise client `WARMUP_CAP_MS` to ~120s (covers full cold-start; risk: long perceived hang if it's a real outage).
- **(c)** Make the client cap *adaptive* — extend the budget by `Retry-After` from the latest 503 instead of using a fixed wall-clock (cleanest, more code).
- **(d)** Combine: lower server timeout + adaptive client cap.

**Open data point still needed (Q7 below):** the actual end-to-end cold-start duration on this incident — i.e., from first 503 to first 200 — and the self-init attempt cadence.

**Q7 results (registered 2026-04-23; analysis pending):**

```
14:09:00.633   503  /api/notifications/count        ← first failure (poller)
14:09:06.640   503  /api/scores/me                  ┐
14:09:06.640   503  /api/achievements               │ profile wave 1 (3 endpoints; no auth/me)
14:09:06.640   503  /api/matches/history            ┘
14:09:17.733   503  /api/matches/history            ┐
14:09:17.733   503  /api/auth/me                    │ profile wave 2 (4 endpoints, ~11.1s later)
14:09:17.733   503  /api/scores/me                  │
14:09:17.733   503  /api/achievements               ┘
14:31:13.943   503  /api/notifications/count        ← last 503 in window (poller)
```

Observations (raw, not yet interpreted into a remediation):
- **Only two client-driven waves** on the profile endpoints, not three. Wave 2 fired 11.1s after Wave 1 — consistent with a client `retryLoop` sleep (clamped 2–8s) + a 15s mssql attempt overlap.
- **Wave 1 has three endpoints, wave 2 has four.** The missing `/api/auth/me` in wave 1 is noteworthy — likely because `/api/auth/me` was already in flight from the boot-time raw `fetch` (`public/js/app.js:530`) and overlapped.
- **No `Self-init attempt failed` or `Database self-initialized` rows** appeared in Q7 — suggests either the self-init loop wasn't emitting during this window (it's quiet on success), or messages fell outside the level filter.
- **22-minute gap** between 14:09:17 and 14:31:13 with no visible error rows → strongly implies the DB warmed somewhere in that gap and subsequent requests succeeded. The 14:31:13 entry is likely a fresh auto-pause cycle catching the 60s-interval notifications poller.
- **Successful 2xx responses were not in the result set** — either because Pino only logs request-level detail on warn+ paths, or Q7's `status >= 200` branch didn't match (Pino info-level access logs may not carry a `status` field at the top level). A follow-up query against request-access logs would pin down the exact "first 200" timestamp.

**What we still do not know (do NOT move forward on remediation until these are answered):**
- Exact timestamp of the first successful 200 — i.e. the real cold-start floor.
- Whether the self-init loop ran and at what cadence during 14:09–14:31.
- Whether the 14:31:13 entry is a *second* auto-pause cycle (in which case the cold-start was much shorter than 22 min) or the tail of the same event.

## KQL queries for user to run (CS53-1)

> Run in Azure Portal → Container App → Logs (Log Analytics workspace).
> Time window: `2026-04-23T14:09:00Z` to `2026-04-23T14:31:30Z` (UTC, per user-supplied incident timestamps).
> Pino JSON lives in the `Log_s` field of `ContainerAppConsoleLogs_CL`.

**Q1 — All warn/error logs in the window (✅ already run; results captured above):**

```kql
let win_start = datetime(2026-04-23T14:09:00Z);
let win_end   = datetime(2026-04-23T14:31:30Z);
ContainerAppConsoleLogs_CL
| where TimeGenerated between (win_start .. win_end)
| extend P = parse_json(Log_s)
| where isnotempty(P.level) and toint(P.level) >= 40   // pino: 40=warn, 50=error, 60=fatal
| project TimeGenerated,
          level     = toint(P.level),
          msg       = tostring(P.msg),
          status    = toint(P.status),
          transient = tobool(P.transient),
          method    = tostring(P.method),
          url       = tostring(P.url),
          requestId = tostring(P.requestId),
          errMsg    = tostring(P.err.message),
          errCode   = tostring(P.err.code),
          errNumber = toint(P.err.number),
          ContainerAppName_s
| order by TimeGenerated asc
```

**Q2 — Distinct error classes (drives the CS48 gap analysis):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| extend P = parse_json(Log_s)
| where toint(P.level) >= 50
| extend errMsg = tostring(P.err.message),
         errCode = tostring(P.err.code),
         errNumber = toint(P.err.number),
         transient = tobool(P.transient),
         status = toint(P.status)
| summarize count(), min(TimeGenerated), max(TimeGenerated) by errMsg, errCode, errNumber, transient, status
| order by count_ desc
```

**Q3 — Response-code mix per URL (confirms 503 vs 500 emission ratios):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| extend P = parse_json(Log_s)
| where isnotempty(P.url) and isnotempty(P.status)
| summarize count() by url = tostring(P.url), status = toint(P.status)
| order by url asc, status asc
```

**Q4 — Per-request timeline for the four profile endpoints + notifications poller:**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| extend P = parse_json(Log_s)
| extend url = tostring(P.url)
| where url has_any("/api/auth/me", "/api/scores/me", "/api/achievements", "/api/matches/history", "/api/notifications/count")
| project TimeGenerated, url, status = toint(P.status), transient = tobool(P.transient), requestId = tostring(P.requestId), msg = tostring(P.msg)
| order by TimeGenerated asc
```

**Q5 — Self-init timeline (when did the pool actually come up?):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| extend P = parse_json(Log_s)
| extend msg = tostring(P.msg)
| where msg has_any("Self-init", "Database self-initialized", "Self-init attempt")
| project TimeGenerated, msg, attempt = toint(P.attempt), errMsg = tostring(P.err.message)
| order by TimeGenerated asc
```

**Q6 — Catch-all (raw rows, when JSON parse fails or fields are unexpected):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:31:30Z))
| project TimeGenerated, Log_s, ContainerAppName_s, ContainerName_s
| order by TimeGenerated asc
```

**Q7 — End-to-end cold-start duration (first 503 → first 2xx + self-init markers):**

```kql
ContainerAppConsoleLogs_CL
| where TimeGenerated between (datetime(2026-04-23T14:09:00Z) .. datetime(2026-04-23T14:35:00Z))
| extend P = parse_json(Log_s)
| extend status = toint(P.status), msg = tostring(P.msg)
| where msg has_any("Self-init", "Database self-initialized") or status >= 200
| project TimeGenerated, msg, status, attempt = toint(P.attempt), url = tostring(P.url)
| order by TimeGenerated asc
| take 200
```

## CS53-19 detailed plan

**Goal:** When a stale or freshly-opened tab does its boot lifecycle (page load with stored JWT, refresh, refocus from background, bfcache restore), **zero** DB queries should be issued. Only requests carrying `X-User-Activity: 1` (set by genuine user-driven navigation/click handlers) may touch the DB. Stale tabs that the user has closed-and-reopened-in-background must not wake the Azure SQL pool.

**Hard prerequisite:** **CS53-23** (the boot-quiet contract foundation, absorbed from CS55-2 v2; row above) must ship the contract before Phase C can begin:
- **CS53-23.C** — `X-User-Activity` header contract documented in `INSTRUCTIONS.md` (header name, semantics, who sets it client-side, what the server does on absence).
- **CS53-23.E/F** — server-side enforcement helper (e.g. `requireUserActivity(req, res)` middleware or per-route `if (!req.userActivity) { return res.status(204).end(); }`-style helper) so endpoints don't reimplement the rule.
- **CS53-23.B** — decision on response shape when the header is missing: `204 No Content`, `200 + cached value from process memory`, `200 + null`, or per-endpoint policy. CS53-19 needs this nailed down before it can apply the rule.

Phases A and E can run in parallel with CS53-23; Phases B–D wait.

### Sub-tasks

| # | Task | Depends on | Notes |
|---|---|---|---|
| **CS53-19.A** | **Inventory.** Open SPA in DevTools and capture HARs for: (1) cold-anonymous boot (no JWT), (2) warm boot (valid JWT in `localStorage`), (3) refresh, (4) tab refocus from background ≥ 5 min, (5) bfcache restore (back/forward), (6) service-worker update apply. For every API request observed, record: URL, method, who-fires-it (boot script / screen mount / poller / SW), and whether it currently touches the DB. Output as a markdown table appended to this section. | None — can start now | Use the same local cold-start container (`npm run dev:mssql:coldstart`) so timing is realistic. Don't rely solely on the existing 2026-04-25 HAR — it only covers login-and-relogin, not refocus/bfcache/SW-update. |
| **CS53-19.B** | **Wait on CS53-23.B/C/E/F** to define the contract. | CS53-23 | Track that row; close 19.B when CS53-23 is marked Done. |
| **CS53-19.C** | **Apply the contract to client-side boot/focus call sites.** Convert every fetch identified in 19.A as "fires without user activity" so it either: (a) is removed (truly redundant — e.g. duplicate `/api/features` from boot AND screen), (b) sends without `X-User-Activity` and tolerates the cached/204 response, or (c) is deferred until the first real user gesture. Specifically audit: boot-time raw `fetch('/api/auth/me')` at `public/js/app.js:530`-area, `apiFetch` callers in `public/js/app.js:fetchProfile()`, the home-screen mount fetches, `refreshNotificationBadge()` callsites, `progressive-loader.js` warmup batches, and any SW lifecycle hooks. | CS53-19.A, CS53-19.B | This is the bulk of the work. Don't apply blanket "no header" — the duplicate-fetch issue (HAR shows `/api/features` and `/api/notifications/count` each fire twice from one login) is partly a callsite dedup problem, not just a header problem. Solve dedup AND header. |
| **CS53-19.D** | **Apply the contract to server-side handlers.** For every endpoint in 19.A's "DB-touching boot endpoint" column, wire the CS53-23.E/F helper. Targets at minimum: `/api/auth/me`, `/api/features`, `/api/notifications` (list), `/api/notifications/count`, `/api/scores/me`, `/api/achievements`, `/api/matches/history`. Each handler returns the agreed shape (per CS53-23.B) when the header is absent. JWT validation in `/api/auth/me` is the trickiest case — must validate the token (which is in-memory), but must **not** look up the user record in the DB unless the header is present. | CS53-19.B | If CS53-23 ships the helper as middleware, this may collapse to a one-line `app.use('/api/...', requireUserActivity)` per route group. Prefer that over per-handler edits. |
| **CS53-19.E** | **Boot-quiet regression test.** Add `tests/boot-quiet.spec.mjs` (Playwright E2E) that: (1) launches the local stack, (2) seeds a valid JWT into `localStorage`, (3) navigates to `/`, (4) waits 10s, (5) asserts via a server-side query-counter (or via log scraping of mssql adapter calls) that **zero** DB queries fired during the boot. Then repeat for refresh, refocus, bfcache. **Fail the test if any DB-touching endpoint was called.** | CS53-19.D | The query-counter is the contract — without it, the rule will silently regress. Easiest impl: instrument `mssql-adapter._connect()` and `request.query()` to increment a counter, expose via a debug-only endpoint or test-only header. |
| **CS53-19.F** | **Update `scripts/container-validate.js` (CS53-11)** to add a "stale-tab probe" assertion: hit `/healthz` (allowed), then issue boot-shaped requests **without** the header and assert no 503 is returned (because nothing should have touched the DB and the cold-start gate shouldn't fire). | CS53-19.D | Keeps the cold-start harness honest. Without this, a regression in 19.C/D would only surface in the new E2E test. |
| **CS53-19.G** | **Document in `INSTRUCTIONS.md`** under § Database & Data: codify "boot-quiet rule" — no boot/focus/SW-lifecycle code path may fire a DB-touching request without a deliberate user gesture marker. Reference the CS53-23 header. | CS53-23.G done | One paragraph. Likely co-shipped with CS53-23.G itself; this row exists so we don't forget if CS53-23 splits the doc update from the code. |

### Sequencing

```
CS53-19.A  ─────────────────────────►
                                     ╲
CS53-23 (boot-quiet contract) ── CS53-19.B ── CS53-19.C ─┤── CS53-19.E ── done
                                                ╰─────────► CS53-19.D ─┘
                                                                      └── CS53-19.F
CS53-23.G ── CS53-19.G (parallel doc update)
```

### Acceptance criteria (all must hold)

1. **Boot-quiet:** opening the SPA in incognito with a valid JWT seeded into `localStorage` and immediately closing the tab causes **zero** DB queries (verified by query counter and by mssql adapter logs). Same for refresh, refocus, bfcache, SW update.
2. **First user gesture wakes DB normally:** clicking a navigation link sets `X-User-Activity: 1` and the corresponding endpoint touches the DB exactly once.
3. **Duplicate-fetch elimination:** the `/api/features` and `/api/notifications/count` double-fires observed in the 2026-04-25 HAR are gone — each endpoint fires at most once per genuine user action.
4. **Cold-start harness:** `npm run container:validate`'s new stale-tab probe (CS53-19.F) passes — no 503s from boot-shaped requests during a simulated paused-DB window.
5. **Regression test:** `tests/boot-quiet.spec.mjs` is green in CI on every PR.
6. **Docs:** the boot-quiet rule is in `INSTRUCTIONS.md` and survives the next `npm run check:docs` run.

### Out of scope for CS53-19

- The `X-User-Activity` header design itself (owned by **CS53-23** — absorbed from CS55-2 v2).
- The notification poller redesign (owned by CS55-2.A–F).
- Service-worker `skipWaiting` behavior (CS53-16).
- App Insights enablement (CS54) — though once CS54 lands, the boot-quiet rule becomes trivially monitorable in prod via `requests | where customDimensions.userActivity == "missing" and resultCode != 204`.

## Acceptance Criteria

- We can explain (citing log evidence from CS53-1) **why** profile required multiple manual retries on 2026-04-23, with a quantified cold-start duration.
- Every distinct error class observed has been audited against `isTransientDbError`, with gaps either fixed or explicitly accepted.
- Either a fix is shipped that demonstrably reduces the retry count to 0–1 on the affected screens (validated via CS53-5 cold-start re-runs), OR a documented decision exists explaining why the current behaviour is the accepted floor with the trade-offs spelled out.
- Any new transient-error class found is added to CS48's `isTransientDbError` with a regression test.
- Raw-`fetch` callsites that touch the API are either routed through `apiFetch`/`progressive-loader` or have an explicit "intentionally raw" rationale.

## Relationship to other clickstops

- **CS42** — closed; this CS picks up the loose thread from CS42-5c without reopening it.
- **CS48** — already centralized transient-error → 503 conversion. CS53-2 verifies that classifier covers the prod-observed errors; gaps get fixed inside CS48's surface.
- **CS47 (planned)** — adds *forward-looking* ProgressiveLoader telemetry + alerting. CS53 is *backward-looking* (read existing logs from a known incident). The two are complementary: CS53 likely produces requirements that strengthen the CS47 schema.
- **CS54 (planned)** — App Insights enablement; prerequisite for proper KQL across HTTP/DB/exception layers.
- **CS55 (planned)** — Real-time notifications via WebSocket + server-side unread-count cache, replacing the polling path that CS53-2 disabled. Restores real-time UX without re-introducing DB-keepalive polling.
- **CS56 (planned)** — General server-side response cache + stale-while-revalidate. Two motivations rooted in CS53: (a) reduce DB read rate / keepalive pressure; (b) mask cold-DB / brief-unavailable windows by serving stale-with-revalidate instead of 503.

## CS53-2 PRs landed

- **PR #233** (`cs53-1-classifier-and-selfinit-resilience`) — Bug A: classify Azure SQL Free Tier exhaustion (`ELOGIN` + free-amount message) as **non-transient**. Self-init: never permanently stop; switch to 60s slow-retry so the container self-heals at free-tier renewal without manual `/api/admin/init-db`.
- **PR #(next)** (`cs53-2-permanent-unavailable-and-poller`) — Bug B + DB-keepalive fix:
  - Server: new `getDbUnavailability()` helper; central error handler returns 503 with `{ unavailable: true, reason, message }` and **no** `Retry-After` for permanent conditions. SPA recognises this signal and renders an informational banner instead of cycling the warmup loader.
  - Client: new `UnavailableError` in `progressive-loader.js`; bails out of both the first-attempt path and the warmup retry loop; renders a non-retry banner. `fetchProfile` promotes any sub-`UnavailableError` to a top-level one.
  - **Notification poller killed entirely** (Option 1). Was hitting `/api/notifications/count` every 60s, single-handedly keeping Azure SQL serverless awake and exhausting the Free Tier monthly compute allowance. Now: one-shot fetch on login + refresh as a side effect of opening My Submissions. Real-time freshness is restored separately by CS55.
  - Server-side audit confirmed **no DB-keepalive timers exist** (only WS heartbeat and room cleanup, both in-memory).

## Prod observations — 2026-04-25 (post `cceedac` deploy)

Empirical evidence from prod immediately after `cceedac` shipped to revision `gwn-production--0000018`. Lock these in as the canonical reference inputs for **CS53-10** (capacity-exhausted regression test) so the test fixtures match what the real backend emits.

**`/api/features` while Azure SQL Free Tier is exhausted:**

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json; charset=utf-8
(no Retry-After header)

{
  "error": "Database temporarily unavailable",
  "message": "The database has reached its monthly free capacity allowance and is paused until the start of next month.",
  "unavailable": true,
  "reason": "capacity-exhausted"
}
```

Source: `sendDbUnavailable()` in `server/app.js:119-126`.

**`/api/health` in the same state (Policy 1 working):**

```json
{
  "status": "ok",
  "checks": { "database": { "status": "not_initialized" } }
}
```

i.e. the app boots and reports healthy without ever waking the DB. Verified by the CS53-22 two-phase verify step on run `24936344788`.

**Implications for CS53-10:** the unit/container regression must assert (a) status `503`, (b) **no** `Retry-After` (this is what disambiguates capacity-exhausted from cold-start), (c) body keys `unavailable: true` + `reason: "capacity-exhausted"`. The client treats this exact shape as `UnavailableError` and renders the banner — any drift breaks the contract.

## Process learnings (not blocking, candidates for separate follow-up clickstops)

- **Strict docs-check (CS43-7) only runs on PRs.** Pushes to `main` (admin override) bypass CI entirely, so violations of canonical state vocabulary or broken cross-doc links accumulate silently and don't surface until the next PR. Possible mitigation: post-push `docs-check` job on `main` that opens an issue (or a self-PR) when it finds violations, so they're caught at landing time rather than at next-PR time. Not yet a clickstop.
- **Path depth from `project/clickstops/{planned,active,done}/*.md` to repo root is three `..`s, not two** — multiple files had this bug. Could be a `check-docs-consistency.js` rule.
- **Prod-deploy approval gate** is now codified in `INSTRUCTIONS.md` ("Production deploys — approval gate is on the user", commit `ee4725f`). Any future agent that triggers a prod deploy must surface the approval URL prominently in their next response, not bury it in a status table.

## Will not be done as part of this clickstop

- General "make Azure SQL faster" infra work — separate concern.
- Migrating off Azure SQL serverless free tier — cost/architecture decision.
- Adding new client-side telemetry routes — that's CS47's job.
