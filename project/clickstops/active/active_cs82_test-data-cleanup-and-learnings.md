# CS82 — Test data cleanup and learnings

**Status:** 🔄 In Progress
**Claimed:** yoga-gwn 2026-05-10T14:35Z (branch `cs82-cleanup-and-learnings`)
**Depends on:** none
**Parallel-safe with:** CS55, CS56, CS57, CS59, CS63, CS69, CS70, CS71, CS72, CS75
**Origin:** User direction 2026-05-10T07:27 PT after CS81 prod deploy succeeded: *"I still see cs5210umop3dc23a and cs5210umop4jes6a and other entries from cs52 in the leaderboard, that looks like test data, though not from the smoke tests. That should be cleaned up as well. Any documents to update based on the learnings from this session?"*

This CS combines two related items from the same session conversation:
1. **Extend test data cleanup** to include CS52 development test users (4 users polluting the ranked leaderboards).
2. **Document the session's learnings** in canonical docs so future orchestrators benefit from what we just learned.

Single PR; cleanup evidence informs the LEARNINGS entry.

## Origin (verified)

Public leaderboard probe 2026-05-10T07:27Z (live prod, image `ffccb0f`):

| Mode/Source | Total entries | CS52 test users found |
|---|---|---|
| `freeplay/ranked` | 3 | 2 — `cs5210umop3dc23a` (rank 2, score 792), `cs5210umop4jes6a` (rank 3, score 395) |
| `daily/ranked` | 4 | 2 — `cs5210umop4jes6b` (rank 3, score 594), `cs5210umop3dc23b` (rank 4, score 0) |
| `freeplay/offline` | 29 | 0 |
| `daily/offline` | 8 | 0 |
| `multiplayer-lb` | 0 | n/a |

Pattern: `cs<NN><randomslug><a|b>`. Clearly machine-generated CS52-10 dev artifacts (paired a/b suffix suggests 2-player match testing).

## Approach

### CS82-1: Extend cleanup-test-data.js for additional test-user patterns

Modify `scripts/cleanup-test-data.js` (added by CS81-1) to also delete scores belonging to users matching the CS-prefix dev-test pattern, in addition to the existing `gwn-smoke-bot` cleanup.

**Pattern matching strategy:**
- Match users where `username LIKE 'cs%'` AND username matches the regex `^cs\d+(?!\d)(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]+$` (CS-prefix + maximal digit run + suffix containing BOTH a letter AND a digit). This is a machine-generated shape unlikely to appear in real human-chosen usernames; the mixed-suffix lookaheads + possessive-style `(?!\d)` guard against false positives like `cs50student`, `cs100abc`, `cs2024alice`. (Tightened from the originally-planned `^cs\d+[a-z0-9]+$` per CS82 PR #334 local review.)
- Provide explicit allowlist: also support an `EXTRA_USERNAMES` env var with comma-separated explicit names, for surgical one-off cases.
- Continue scoping all DELETEs to specific user IDs (looked up by username), never wildcard.

**Two-phase safety:**
- The script's existing `DRY_RUN=1` mode now reports all matched users + their score row counts before deleting.
- Add a final assertion: after delete, count remaining matching-pattern rows = 0.

**Deletion scope per user:**
- Delete all rows from `scores` for the matched user_id.
- Optionally delete the user row itself from `users` (decision in plan; default = NO, keep the user row to preserve referential integrity for any historical match_players or other tables; only the score rows pollute the leaderboard). The 4 CS52 users have no other purpose so removing the users would also work — but minimum-blast-radius is to leave the user rows intact.

### CS82-2: Update LEARNINGS.md with session findings

Add a new entry titled "Cascading prod-deploy bug chain (CS73 → CS79 → CS80 → CS81), 2026-05-10" capturing:
- The 5-prod-deploy chain story: each attempt revealed the next latent bug.
- Pattern: smoke probe is the only thing that exercises the "boot-quiet + cold-DB + accumulated test data" path end-to-end. Local tests passed; CI passed; only the prod smoke chain caught these.
- Resolution shape: each cascading bug got its own surgical CS (73 wake-db, 79 X-User-Activity header, 80 BIGINT cast, 81 test data hygiene).
- Meta: deploy infrastructure (auto-rollback + CS41-12 safety gate) protected prod every time. Zero user-facing impact across 4 failed deploy attempts.

### CS82-3: CONVENTIONS.md — MSSQL/SQLite test parity gap

Add a subsection to CONVENTIONS.md § testing strategy (or wherever local-vs-target-DB testing is discussed):

> **MSSQL/SQLite test parity gap.** Local SQLite tests (`npm test`) and the docker MSSQL stack (`npm run test:e2e:mssql`) cannot reproduce certain MSSQL-specific runtime behaviors:
> - **Integer overflow on AVG/SUM over INT columns** (CS80). SQLite uses 64-bit integers everywhere; MSSQL accumulates aggregates in the input column type before final cast.
> - **Transient SQL error class behavior** (CS73). MSSQL's transient error codes (40613, 40197, 40501, 49918-20) only fire against real Azure SQL serverless, not local containers.
> - **Cold-DB-init request gating** (CS79, CS53-19/23). Container boots with init pending; behavior only manifests when DB is actually slow/cold.
>
> Tests for code paths that exercise any of these classes MUST be supplemented by either:
> 1. A regression unit test that mocks the MSSQL-specific behavior (e.g. CS80's overflow test in `tests/scores.test.js`).
> 2. A smoke probe step that exercises the path against a fresh-cold-init container (CS79's added cycle in `scripts/container-validate.js`).
> 3. Documented manual verification against staging/prod with run-ID evidence in the closure CS file.
>
> Never assume "all tests pass locally" implies the code works against Azure SQL.

### CS82-4: CONVENTIONS.md — BIGINT cast hygiene for aggregates

Add to CONVENTIONS.md § database/data (alongside the existing "no DB-waking background work" rule):

> **BIGINT cast hygiene for aggregates over INT columns.** Any `AVG`, `SUM`, `COUNT(*) * x`, or other aggregating operation over an `INTEGER`-typed column in MSSQL must explicitly `CAST(col AS BIGINT)` before the aggregate function. MSSQL accumulates `SUM` (used internally by `AVG`) in the input column's type; with `INT` (32-bit, max 2.1B) this overflows after relatively few large-value rows. SQLite uses 64-bit integers natively so this never reproduces locally — see CS80's `tests/scores.test.js` for the canonical regression.
>
> Pattern: `ROUND(AVG(CAST(score AS BIGINT)), 0)` not `ROUND(AVG(score), 0)`.
>
> Audit checklist when adding a new aggregate query: (1) what's the column type? (2) what's the realistic value × row-count product? (3) does the realistic product exceed 2.1B? If yes or close-to, cast.

### CS82-5: OPERATIONS.md — CS41-12 chicken-and-egg pattern

Add a subsection (under § Cold-start container validation, or near it) describing what happens when an app-code fix lives in NEW image and CS41-12's "smoke OLD against migrated DB" gate fails because OLD lacks the fix:

> **CS41-12 chicken-and-egg pattern.** When a deploy includes an app-code fix (not a migration) that the smoke probe exercises, AND the OLD revision lacks that fix, AND the smoke surfaces the bug: CS41-12 will halt the deploy before traffic shift. This is intentional safety — but it creates a chicken-and-egg where the deploy gate verifies OLD compatibility but OLD has the bug we're fixing.
>
> Resolution paths (in priority order):
> 1. **Data cleanup that makes OLD's bug-trigger condition not present** (e.g. CS81: delete accumulated test rows so the overflow doesn't trigger on either revision). Ideal when the bug requires accumulated state to manifest.
> 2. **Hot-fix admin endpoint** with bypass workflow that skips CS41-12 just this once. More risk; reserve for genuine emergencies.
> 3. **Modify the smoke probe to skip the failing step against OLD only** (still test it on NEW via CS41-1). Loses some validation coverage on the OLD-vs-migrated-DB compat dimension; reserve for cases where the bug is provably not in the schema-compat space.
>
> Hit during CS80 prod-deploy ceremony (run [25621131079](https://github.com/henrik-me/guesswhatisnext/actions/runs/25621131079)) — resolved via path 1 (CS81 cleanup workflow).

### CS82-6: Boot-quiet contract reminder for new /api/* endpoints

Add to CONVENTIONS.md § 4a or wherever boot-quiet is discussed (CS53-19/23 territory):

> **Boot-quiet contract for new `/api/*` endpoints.** Any new endpoint mounted under `/api/*` is gated by `server/app.js:298-351`'s per-request DB-init gate (CS53-19/23). On cold init, requests WITHOUT `X-User-Activity: 1` get an immediate 503+Retry-After:5 response and do NOT trigger `runInit()`. Internal probes (smoke, container-validate, e2e) that hit the new endpoint must either:
> 1. Send `X-User-Activity: 1` (treats the probe as simulated user activity — see `scripts/smoke.js` post-CS79 for the pattern).
> 2. Send a system credential (`X-API-Key` matching `SYSTEM_API_KEY`) — only for system-level probes.
> 3. Be explicitly exempted from the gate at `server/app.js:298` (only for genuinely DB-independent paths like `/healthz`).
>
> Hit by CS79: `/api/features` smoke probe was returning 503 retry-after:5 in 1-2ms because no `X-User-Activity: 1` header → never triggered init → 18 retries × 5s = 90s budget exhausted → auto-rollback. Fix: add the header. Don't widen the app's gate behavior.

## Tasks

| # | Task | Notes |
|---|------|-------|
| CS82-1 | ✅ Done — Extended `scripts/cleanup-test-data.js` for CS-prefix pattern + `EXTRA_USERNAMES` env var. 26 unit tests cover regex hygiene (including the post-local-review tightening to `^cs\d+(?!\d)(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]+$` rejecting plausible human usernames like `cs50student`/`cs100abc`/`cs2024alice`), EXTRA_USERNAMES de-duplication, cumulative count, parameterized DELETEs, and only-scores blast-radius. Shipped in PR [#334](https://github.com/henrik-me/guesswhatisnext/pull/334). | Mirror existing gwn-smoke-bot path; same scope/safety guards. |
| CS82-2 | ✅ Done — LEARNINGS.md entry "Cascading prod-deploy bug chain (CS73 → CS79 → CS80 → CS81), 2026-05-10". Shipped in PR [#334](https://github.com/henrik-me/guesswhatisnext/pull/334). | Pure docs. |
| CS82-3 | ✅ Done — CONVENTIONS.md § Testing Strategy → "MSSQL/SQLite test parity gap". Shipped in PR [#334](https://github.com/henrik-me/guesswhatisnext/pull/334). | Pure docs. |
| CS82-4 | ✅ Done — CONVENTIONS.md § Database & Data → "BIGINT cast hygiene for aggregates over INT columns". Shipped in PR [#334](https://github.com/henrik-me/guesswhatisnext/pull/334). | Pure docs. |
| CS82-5 | ✅ Done — OPERATIONS.md § Cold-start container validation → "CS41-12 chicken-and-egg pattern". Shipped in PR [#334](https://github.com/henrik-me/guesswhatisnext/pull/334). | Pure docs. |
| CS82-6 | ✅ Done — CONVENTIONS.md § 4a Telemetry & Observability → "Boot-quiet contract for new /api/* endpoints". Shipped in PR [#334](https://github.com/henrik-me/guesswhatisnext/pull/334). | Pure docs. |
| CS82-7 | ⬜ Planned — After PR merge: orchestrator triggers `ops-cleanup-test-data.yml` against production (operator approval), watcher reports row counts. Verify leaderboard probe shows 0 cs<NN>* entries. | Orchestrator action; same shape as CS81-1 cleanup. |

## Acceptance

CS82 closure-blocking criteria:
1. `scripts/cleanup-test-data.js` extended; unit tests pass.
2. LEARNINGS.md, CONVENTIONS.md, OPERATIONS.md updated with the 5 doc additions above.
3. PR merged with all required reviews satisfied.
4. CS82-7 cleanup workflow run against production: log shows `before count: N (gwn-smoke-bot)` + `before count: M (cs<NN>* pattern, 4 expected)` → `after count: 0` for both.
5. Public leaderboard probe (`https://gwn.metzger.dk/api/scores/leaderboard?variant=freeplay&source=ranked&limit=100` and `?variant=daily&source=ranked&limit=100`) returns 0 entries matching `cs<NN>*` pattern.

## Will not be done

- Aggressive pattern matching like `username LIKE 'test%'` or `username LIKE '%-test%'` — too risky; could match real users. Stick to the tightened `^cs\d+(?!\d)(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]+$` pattern (mixed-alphanumeric suffix required) + the existing `gwn-smoke-bot` exact match + EXTRA_USERNAMES allowlist.
- Deleting the user rows themselves (only their score rows). Minimum-blast-radius.
- Auditing every other code path for similar latent bugs (CS80-style schema scan). Out of scope; could be a separate CS if anyone wants the audit.
- Backfilling other historical CS files with cross-references to the learnings. Forward-looking only.
- Schema migration `score INTEGER → BIGINT` (option C in CS80 plan, deferred). Still deferred.

## Risks & rollback

- **Pattern false positives.** The shipped regex `^cs\d+(?!\d)(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]+$` (tightened from the originally-planned `^cs\d+[a-z0-9]+$` per PR #334 local review) requires the suffix portion to contain BOTH a letter AND a digit — so `cs100abc123` matches (machine-generated shape) but `cs50student`, `cs100abc`, `cs2024alice` (suffix all letters) and `cs1000`, `cs5210123` (suffix all digits) are all rejected. Residual risk: a human-chosen username with mixed alphanumeric suffix (e.g. `cs2026spring1`) could still match. Mitigation: DRY_RUN mode reports all matched users by username before deleting; the prod cleanup workflow runs under environment-gated approval. Low practical risk because human-chosen usernames rarely follow this exact machine-generated shape.
- **Doc updates risk drift if not maintained.** Mitigation: each doc addition cross-references the originating CS file so the canonical source-of-truth is traceable.
- **Rollback for CS82-1:** revert the PR. Cleanup script returns to gwn-smoke-bot-only behavior. The 4 CS52 rows would re-accumulate? No — they're already there. Revert just stops further pattern-matching. The deletes already executed are permanent (test data, no need to restore).
- **Rollback for docs:** revert the PR. Docs return to current state.

## Cross-references

- Origin: user direction 2026-05-10T07:27 PT after CS81 prod deploy succeeded.
- Cleanup tooling: [done_cs81](../done/done_cs81_test-data-hygiene.md) — extended by CS82-1.
- Learnings inputs: [done_cs73](../done/done_cs73_prod-deploy-cold-db-handling.md), [done_cs79](../done/done_cs79_api-features-cold-init-gate.md), [done_cs80](../done/done_cs80_scores-avg-int-overflow.md), [done_cs81](../done/done_cs81_test-data-hygiene.md).
- Boot-quiet contract owner: [active_cs53](../active/active_cs53_prod-cold-start-retry-investigation.md).
- Smoke runner: [`scripts/smoke.js`](../../../scripts/smoke.js).
- Cleanup script: [`scripts/cleanup-test-data.js`](../../../scripts/cleanup-test-data.js).
- Cleanup workflow: [`.github/workflows/ops-cleanup-test-data.yml`](../../../.github/workflows/ops-cleanup-test-data.yml).
