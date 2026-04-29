# CS56 — Server-side response cache + stale-while-revalidate for cold-DB resilience

**Status:** ⬜ Planned
**Depends on:** CS53
**Parallel-safe with:** any
**Origin:** During CS53 (Azure SQL Free Tier exhaustion incident) we identified that the app makes many DB reads that could be served from an in-process cache, especially for read-heavy public endpoints (leaderboards, feature flags, achievements catalog, community puzzle list, etc.). Two converging problems motivate this CS:

1. **Cost / DB-keepalive (CS53):** every DB read keeps Azure SQL serverless awake. A cache layer reduces both the number of reads and the keepalive pressure.
2. **Cold-start UX (CS42 / CS53):** when the DB is cold or briefly unavailable, the SPA shows the warmup loader for 5–30s. If a recent cached response exists, the server can return it immediately (stale-while-revalidate) and the user sees instant data instead of a loader.

## Goals

1. **Reduce DB read rate** for hot read-only endpoints by ≥80% in steady state.
2. **Mask short DB unavailability windows** (cold-start, transient errors, even capacity-exhausted) by serving cached responses with a `Stale: true` header rather than returning 503.
3. **Establish a single cache primitive** (small, in-process, dependency-light) that future read endpoints can opt into without bespoke infrastructure.
4. **Never reintroduce the polling/keepalive anti-pattern** — this CS reduces DB hits, not hides them behind aggressive background refresh.

## Cache design (proposal — to be confirmed)

- **In-process LRU + TTL** (e.g., `lru-cache` package, already small and battle-tested), single-instance only. Document that cross-instance sharing requires Redis (out of scope).
- **Three-state entries:** `fresh` (within TTL — return immediately, no DB), `stale` (past TTL but within `staleWhileRevalidateMs` — return immediately AND fire async refresh), `expired` (gone — synchronous DB read).
- **Cold-DB fallback:** if a synchronous refresh fails because the DB is cold/unavailable AND a stale entry exists, return the stale entry with `X-Cache: stale-fallback` header instead of erroring. Logged so operators see the masking happening.
- **Per-endpoint config:** `{ ttlMs, staleWhileRevalidateMs, keyFn(req), maxEntries }`. Endpoints opt in explicitly via a thin middleware wrapper.
- **Invalidation:** explicit `cache.invalidate(key)` on writes. Document the contract per endpoint.
- **No background refresh.** Refresh is triggered by request only (lazy, demand-driven). This is critical: a background refresher would re-introduce the DB-keepalive problem CS53 solved.

## Endpoint candidates (decide which in CS56-1)

| Endpoint | Read rate | TTL candidate | Stale-while-revalidate | Invalidation trigger |
|---|---|---|---|---|
| `GET /api/scores/leaderboard?...` | High (every visit) | 30s | 5min | New score insert |
| `GET /api/scores/leaderboard/multiplayer` | High | 30s | 5min | Multiplayer match end |
| `GET /api/features` | Every page load | 5min | 30min | Admin flag change (rare) |
| `GET /api/achievements` (per-user) | Per profile load | 60s | 10min | Achievement unlock |
| `GET /api/notifications/count` (per-user) | One-shot per login (after CS55) | n/a | n/a | Covered by CS55 |
| `GET /api/puzzles/community` | Moderate | 60s | 10min | Submission approved |
| `GET /api/scores/me` (per-user) | Per profile load | 30s | 5min | New score insert (own) |
| `GET /api/matches/history` (per-user) | Per profile load | 60s | 5min | Match end (own) |

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS56-1 | Pick the cache primitive (lru-cache vs. hand-rolled Map+TTL), pin a version, write a small `server/lib/response-cache.js` with the three-state semantics described above. Unit tests cover fresh / stale / expired / cold-DB-fallback paths. | ⬜ Pending | Aim for <200 LoC including tests. No external runtime deps if possible. |
| CS56-2 | Add the cache to `GET /api/features` (lowest risk, infrequently invalidated, every page load benefits). Add `X-Cache: hit\|stale\|stale-fallback\|miss` response header. Verify with E2E. | ⬜ Pending | Start small to validate the primitive. |
| CS56-3 | Add the cache to `GET /api/scores/leaderboard?...` and `/multiplayer`. Wire invalidation from score-insert and match-end handlers. | ⬜ Pending | Highest-traffic endpoints; highest cost reduction. |
| CS56-4 | Add the cache to `GET /api/puzzles/community`. Wire invalidation from submission approval. | ⬜ Pending | Same pattern as CS56-3. |
| CS56-5 | Add per-user caches: `GET /api/scores/me`, `/api/matches/history`, `/api/achievements`. Key includes `user_id`. Invalidation hooks on writes for the same user. | ⬜ Pending | Bound `maxEntries` per cache to prevent memory growth on large user counts. |
| CS56-6 | Cold-DB resilience: confirm the `stale-fallback` path activates when the DB is unavailable. End-to-end test: pause the DB connection, request a hot leaderboard endpoint, expect the stale entry returned with the `X-Cache: stale-fallback` header instead of 503. | ⬜ Pending | This is the CS42/CS53 cold-DB UX win. |
| CS56-7 | Observability: log cache metrics (hit/miss/stale/stale-fallback counts) via Pino structured logs. Once CS54 lands, surface a small KQL dashboard (hit ratio per endpoint, stale-fallback events). | ⬜ Pending | Don't ship a metrics framework — just structured log lines. |
| CS56-8 | Documentation: add a "Server-side caching" section to INSTRUCTIONS.md with the opt-in pattern, the no-background-refresh rule, and the invalidation contract. | ⬜ Pending | Prevent drift back to polling/background-refresh patterns. |

## Acceptance

- DB read rate for the cached endpoints drops by ≥80% in steady-state load tests (or measured live after deploy).
- During a simulated cold-DB window, cached endpoints return ≤300ms with `X-Cache: stale-fallback` instead of triggering the 30s warmup loader.
- All cached endpoints have explicit invalidation tests verifying that writes invalidate the right keys.
- Memory usage of the cache layer is bounded (`maxEntries` enforced).
- No new background timers, no new DB-keepalive paths.

## Will not be done in this clickstop

- Distributed/Redis cache. Single-instance only; documented as a follow-up if/when we scale out.
- HTTP-level caching headers (`Cache-Control: max-age`) for browser/CDN caching. That's a different concern (we're caching server-side to protect the DB, not edge-caching public data).
- Caching of write paths (POST/PUT/DELETE). Out of scope.
- A metrics dashboard framework. Just structured log lines + KQL.

## Relationship to other clickstops

- **CS53** — root-cause incident that motivated this work. CS53 fixed the polling problem at the worst offender (notifications); CS56 generalises the "reduce DB reads" approach.
- **CS42** — established the SPA cold-start UX (warmup loader). CS56's stale-fallback is the next-level upgrade: instead of a loader, show stale data instantly.
- **CS54 (planned)** — App Insights enables proper measurement of cache effectiveness and DB read rate. CS56 doesn't depend on CS54 but benefits enormously from it.
- **CS55 (planned)** — introduces the first per-user cache (unread notifications count). CS56 generalises the pattern.

## Cross-references

- [CS53 active file](../active/active_cs53_prod-cold-start-retry-investigation.md) — source incident for cold-DB resilience work.
- [CS55 planned file](planned_cs55_websocket-notifications-and-redesign.md) — related per-user cache pattern.
