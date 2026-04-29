# CS63 — Investigate + fix `game_configs` boot-race window

**Status:** 🆕 Planned
**Depends on:** CS52
**Parallel-safe with:** CS65, CS66, CS67, CS68
**Origin:** CS52-10 staging validation (yoga-gwn-c5, 2026-04-27).

## Symptom

After a fresh staging deploy of image `1f690e3` (CS52-2 + CS52-7c live), App Insights `exceptions` table showed **8× `SQLITE_ERROR: no such table: game_configs`** in a ~1-second window (06:07:45–06:07:46) from role instance `gwn-staging--deploy-1777269494-5f7f8f8749-kgnmk`.

After that 1-second window, the table existed and `PUT /api/admin/game-configs/multiplayer` returned 200 with the expected row. Zero `SQLITE` errors in the following 5+ minutes. The CS52-10 probe's 5/6 PASS attestation captured steady-state correctly.

## Why this is a planned CS, not a CS52 regression

The race exists on **every deploy** — any first request hitting `game_configs` (or any other CS52-2-introduced table) before migration 008 finishes applying on a fresh container will throw the same `no such table: …` error. CS52-10 unmasked it but didn't introduce it. CS52-7c's `getConfig()` loader reads from `game_configs` lazily; if the very first inbound request after a deploy lands during the boot-init window, the loader race-loses to the migration runner.

**Doesn't block prod** because:
1. Lazy init is idempotent and self-heals on the next request after migration completes.
2. The errors are bounded to the cold-boot window (~1s) and don't surface as 500s to users — they convert into the expected `503 cold-start` Retry-After path that the SPA already handles.
3. The same race profile applies pre-CS52 to *all* tables created in *all* migrations — it's a CS53-9 / CS53-10 boot-quiet contract issue, not a CS52 contract issue.

## Hypothesis

Two candidates (both worth ruling in/out):

1. **CS52-7c game_configs loader called during a non-DB-touching path that shouldn't reach the DB at all** — the boot-quiet contract says enrolled read endpoints don't touch DB on cache miss when `X-User-Activity: 1` is absent (INSTRUCTIONS.md line 30 + memory). If `getConfig()` is invoked from somewhere that fires before the gesture-driven gate, that's the bug.
2. **`getConfig()` runs before `_tracker.runMigrations()` returns** — the migration runner's success acknowledgment may not strictly precede the lazy-init "ok" signal that other code paths gate on.

## Investigation plan

1. **Identify the call site.** App Insights `exceptions | where outerMessage contains 'game_configs'` returned 8 events from a single role instance. Pull the full stack trace from one event to identify which route handler is calling `getConfig()` so early.
2. **Reproduce locally.** Run `npm run dev:mssql:coldstart` with `GWN_SIMULATE_COLD_START_MS=30000`, then immediately curl the suspected endpoint. Should see the same error pattern.
3. **Decide the fix:**
   - If the race is in CS52-7c's loader on cache miss: gate the loader's DB read on `dbInitialized()` (add to existing init-flag check pattern), return code defaults during boot.
   - If the race is in a route that should be boot-quiet: add the missing X-User-Activity gate.

## Acceptance

- A ~10-min cold-deploy window on staging produces **0** `no such table` exceptions in App Insights.
- Container validation cycle 1: cold-start → first request to `/api/sessions` returns 503 (existing behaviour) without throwing `SQLITE_ERROR` anywhere.
- KQL query in `docs/observability.md` that asserts the invariant ("no `no such table` errors in App Insights last 7d").

## Cross-references

- CS52 design contract — `project/clickstops/done/done_cs52_server-authoritative-scoring.md` (or wherever it lands once CS52-11 closes).
- CS53-9 lazy DB self-init — `project/clickstops/done/done_cs53_*.md`.
- CS52-10 staging probe attestation — PR #291 (merged commit `ea4aaac`).
- App Insights signal location — `docs/observability.md` § B.7 (migration applied logs).
