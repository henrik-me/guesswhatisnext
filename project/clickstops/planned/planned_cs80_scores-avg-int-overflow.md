# CS80 — Scores avg int overflow

**Status:** ⬜ Planned
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72, CS75
**Blocks:** [CS79](../active/active_cs79_api-features-cold-init-gate.md) closure (no prod deploy can succeed past CS41-1 smoke step (e) `/api/scores/me` until this is fixed).

## Origin

Surfaced 2026-05-10T04:21Z during CS79 prod-deploy run [25619591048](https://github.com/henrik-me/guesswhatisnext/actions/runs/25619591048). CS79 fix worked correctly (`/api/features` cleared cold-init in 2 attempts), POST `/api/scores` returned id=48 with score=604,634,726, but the next smoke step `GET /api/scores/me` returned 503. App Insights captured the SQL Server error verbatim:

```
RequestError: Arithmetic overflow error converting expression to data type int.
number: 8115, state: 2, class: 16, serverName: gwn-sqldb, lineNumber: 2
url: /api/scores/me, status: 503, transient: true (mssql-adapter classifies all 8115 as transient)
```

Auto-rollback to `76f5705` fired correctly; prod is safe.

## Root cause (verified)

[`server/routes/scores.js:346-355`](../../../server/routes/scores.js):

```sql
SELECT mode, source,
       COUNT(*) as games_played,
       MAX(score)         as high_score,
       ROUND(AVG(score), 0) as avg_score,
       MAX(best_streak)   as best_streak
FROM scores WHERE user_id = ?
GROUP BY mode, source
```

`scores.score` is declared `INTEGER` in [`server/db/schema.sql:15`](../../../server/db/schema.sql) → maps to MSSQL `INT` (signed 32-bit, max 2,147,483,647). `AVG(score)` accumulates an internal SUM before dividing; SQL Server preserves the input type for the accumulator unless told otherwise. The `gwn-smoke-bot` user has accumulated ~48 sentinel scores in the ~600M range each (per CS73's sentinelScore() generator). Cumulative SUM ≥ ~5 rows × 600M = 3B > int max → overflow at line 2 of the prepared statement (the AVG column).

**Why this is hitting now and not earlier:** smoke runs accumulate one score per deploy cycle. Past prod deploys were rare; the bot's cumulative score count was lower. Today's CS73/CS75/CS77/CS78/CS79 deploy cadence (4 prod-deploy attempts in ~2 hours, plus historical runs) pushed the SUM over the threshold.

**Why this never reproduces locally:** SQLite always uses 64-bit integers — `AVG(INTEGER column)` cannot overflow. The bug is MSSQL-specific.

**Why it's classified transient by mssql-adapter:** SQL error 8115 falls into the adapter's transient bucket so the route handler returns 503 + retry-after. But unlike a real transient (deadlock, timeout), retry will fail identically every time because the data state is unchanged.

## Goal

Eliminate the int overflow on `AVG(score)` in `/api/scores/me` so prod-deploy CS41-1 smoke step (e) succeeds. Closure is empirical: a prod deploy completes without auto-rollback, with `/api/scores/me` returning the smoke probe's submitted score.

## Approach options

| # | Approach | Pros | Cons |
|---|----------|------|------|
| A | **Cast AVG to BIGINT in the query**: `ROUND(AVG(CAST(score AS BIGINT)), 0)` and `ROUND(AVG(CAST(mp.score AS BIGINT)), 0)` (line 351 + line 363). Minimal change. | Surgical; no schema migration; no client-API change; no test churn beyond the route test. Same result type returned to client (BIGINT fits in JS number for values < 2^53). | Doesn't address the underlying schema issue — `MAX(score)` is fine because individual values < 2.1B, but if a single score ever exceeds 2.1B the INSERT itself fails (out of scope for CS80). |
| B | **Reduce smoke-bot sentinel score range** to under 100M so cumulative SUM stays well under int max even after many rows. Update `sentinelScore()` in `scripts/smoke.js`. | Even smaller change; fixes the immediate failure without touching prod runtime code. | Doesn't fix the latent bug for any other heavy-aggregate user (real users could in theory hit it after many high-score games — though practically unlikely with normal score values). Treats the symptom only. |
| C | **Schema migration**: ALTER `scores.score`, `match_players.score` to BIGINT. Existing data converts losslessly. | Permanent fix; eliminates the overflow class entirely. | Migration on prod (Azure SQL serverless) requires careful testing; cast on read sites; client-side handling check (BIGINT may need string serialization). Bigger blast radius. |
| D | **A + B (recommended)**: cast AVG to BIGINT (eliminates the bug for any user) AND reduce smoke sentinel range (defense-in-depth + cleans up the smoke bot's accumulated test data on the next migration). | Belt-and-braces; small surface; passes CS41-1 even if option A had a residual edge case. | Slightly larger PR than A alone. |

**Recommended: D (A + B).** Defer C (schema migration) to a separate planning exercise if anyone wants to harden against real-user overflow — practically unlikely (a real player would need ~5 rows × 600M average score to hit it, far outside normal gameplay).

## Tasks

| # | Task | Notes |
|---|------|-------|
| CS80-1 | Apply cast in [`server/routes/scores.js`](../../../server/routes/scores.js) lines 346-355 (`/api/scores/me` stats query) and lines 360-368 (`mpStats` query): `ROUND(AVG(CAST(score AS BIGINT)), 0)`. Verify SQLite still works — `CAST(x AS BIGINT)` is a no-op in SQLite, returns the same INTEGER. | One-line change × 2 sites. |
| CS80-2 | Reduce sentinel score range in `scripts/smoke.js` `sentinelScore()` (current range likely ~600M; bring under 100M). Document the rationale inline (CS80 reference + "stay well under int's accumulator threshold even after many smoke runs"). | One-line change. |
| CS80-3 | **Clean up the existing smoke-bot rows in prod.** A `DELETE FROM scores WHERE user_id = (SELECT id FROM users WHERE username='gwn-smoke-bot')` against `gwn-production` would clear the accumulated overflow-triggering data. Decide whether to ship this as a one-off operator-invoked admin endpoint or a one-time SQL script run against prod. **This is operator-touched data, not code** — needs explicit user approval before execution. | Operational; gated on user direction. May be skipped if CS80-1+2 alone passes the deploy. |
| CS80-4 | Add unit test for the route: integration test that inserts N rows summing > int max, calls `/api/scores/me`, asserts no overflow + correct AVG. Use the existing test pattern in `tests/scores-route.test.js` (verify file exists; if not, file as `tests/scores-me-route.test.js`). | Regression test so this can't recur silently. |
| CS80-5 | **Deploy ceremony**: standard staging → prod per [INSTRUCTIONS.md § Production deploys](../../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user). Both deploys with watchers per trip-wire #1. **Closure validation:** prod deploy succeeds without auto-rollback AND CS41-1 smoke step (e) returns the submitted sentinel score. **This also closes CS79 empirically** (CS79's prod-deploy validation happens as a side effect of CS80's). | Same ceremony shape as CS73/CS78/CS79. |

## Acceptance

CS80 closure-blocking criteria:
1. `server/routes/scores.js` `/api/scores/me` aggregation queries cast AVG to BIGINT.
2. `scripts/smoke.js` `sentinelScore()` returns values < 100M.
3. Unit test exists that would have caught this overflow.
4. Prod deploy completes green WITHOUT auto-rollback. CS41-1 smoke step (e) `/api/scores/me` returns 200 with the submitted score id present.
5. As a side effect: CS79 closes empirically (its closure precondition was the same — successful prod deploy without rollback).

## Will not be done as part of this clickstop

- Schema migration for `scores.score INTEGER → BIGINT` (option C). File a separate planning exercise if needed; CS80 takes the surgical path.
- Removing or restructuring the smoke bot's score accumulation. Its design is fine; CS80-2 just shrinks the sentinel range to stay safe.
- General audit of all `AVG()` / `SUM()` usage across the codebase for similar overflow risks. CS80 fixes the proven failure path; broader audit is its own CS.
- Adding telemetry on transient SQL errors. (CS72-adjacent territory.)

## Risks & rollback

- **Cast risk: minimal.** `CAST(score AS BIGINT)` is supported in both MSSQL and SQLite (where it's a no-op).
- **Smoke score range risk: minimal.** Reducing the range only affects smoke probe behavior; production users are unaffected.
- **CS80-3 prod data deletion risk:** real. Only delete `gwn-smoke-bot` rows; never touch real-user data. Defer until user explicitly approves.
- **Rollback:** revert the PR. The smoke probe returns to today's behavior (which was already broken on prod), no production runtime impact.
- **Deploy ceremony risk:** if THIS deploy also auto-rolls-back for yet another reason, prod is still safe (back on `76f5705`). Diagnose per CS79's failure-handling matrix shape; file a CS81 if needed.

## Cross-references

- Origin: prod-deploy run [25619591048](https://github.com/henrik-me/guesswhatisnext/actions/runs/25619591048) (2026-05-10T04:16Z) failed CS41-1 smoke step (e); auto-rollback fired.
- App Insights query for the verbatim error: covered in this CS file's § Origin.
- Code: [`server/routes/scores.js:316-380`](../../../server/routes/scores.js) (the `/me` route).
- Schema: [`server/db/schema.sql:11-22`](../../../server/db/schema.sql) (`scores` table).
- Smoke: [`scripts/smoke.js`](../../../scripts/smoke.js) (`sentinelScore()` and step e).
- Adjacent: [active_cs79](../active/active_cs79_api-features-cold-init-gate.md) — blocked on CS80 closure.
- Adjacent: [done_cs73](../done/done_cs73_prod-deploy-cold-db-handling.md) — wake step continues to work; will exercise on the next prod-deploy after CS80.
