# CS18 — Address MSSQL Issues in Production

Production is deployed against Azure SQL (MSSQL) but many route queries use SQLite-specific SQL syntax that fails on MSSQL. Leaderboard, profile data, match history, achievements, and puzzle selection are broken.

## Root Cause Analysis

The database adapter layer (CS11) correctly handles connection pooling, parameter rewriting (`?` → `@p1`), and migrations with dialect branches. However, **route-level SQL** was never updated to be dialect-aware — it still uses SQLite functions and syntax that MSSQL doesn't understand.

### Issue Categories

| # | Issue | Affected Files | MSSQL Error |
|---|-------|---------------|-------------|
| 1 | `LIMIT ?` / `LIMIT ? OFFSET ?` — not valid T-SQL | scores.js, matches.js, puzzles.js, matchHandler.js | Incorrect syntax near 'LIMIT' |
| 2 | `date('now')`, `datetime('now', '-7 days')`, `DATE()` — SQLite date functions | scores.js, submissions.js | 'date' is not a recognized function |
| 3 | `RANDOM()` — SQLite random function | matchHandler.js | 'RANDOM' is not a recognized function |
| 4 | `INSERT OR IGNORE INTO` — SQLite conflict handling | achievements.js, matchHandler.js | Incorrect syntax near 'OR' |
| 5 | `lastId` not returned for INSERT on MSSQL | auth.js, scores.js, submissions.js | Registration returns id: 0 |
| 6 | `INSERT OR REPLACE INTO` — already has dialect branch in seed-puzzles.js | seed-puzzles.js | ✅ Already fixed |

## Adapter Abstraction Audit

Routes, WS handler, client, and achievements.js have **zero** dialect references. The only `db.dialect` checks are in infrastructure code (migrations, seeding, app.js retry logic, _tracker.js DDL) — all appropriate. The architecture is sound; the fix is purely adapter-level.

## Task Breakdown

| Task | Description | Status | Depends On | Notes |
|------|-------------|--------|------------|-------|
| CS18-1 | Add MSSQL SQL rewriting layer to adapter | ⬜ Pending | — | LIMIT→OFFSET/FETCH, RANDOM→NEWID, dates, INSERT OR IGNORE, lastId |
| CS18-2 | Local MSSQL Docker environment | ⬜ Pending | — | docker-compose.mssql.yml + SQL Server 2022 container |
| CS18-3 | npm run test:mssql script | ⬜ Pending | CS18-2 | Runs full test suite against local MSSQL container |
| CS18-4 | Add MSSQL rewriting unit tests | ⬜ Pending | CS18-1 | Test all rewriting patterns |
| CS18-5 | Integration validation | ⬜ Pending | CS18-1..4 | lint + unit (SQLite) + unit (MSSQL container) + E2E |
| CS18-6 | Deploy and verify production | ⬜ Pending | CS18-5 | Deploy, hit all affected endpoints |

## Approach: Adapter-Level SQL Rewriting

Rather than making every route file dialect-aware, extend the MSSQL adapter's query methods to **automatically rewrite** SQLite-isms to T-SQL equivalents. This is the same pattern already used for `?` → `@p1` parameter rewriting.

### Rewriting Rules

| SQLite | T-SQL | Notes |
|--------|-------|-------|
| `... ORDER BY x LIMIT ?` | `... ORDER BY x OFFSET 0 ROWS FETCH NEXT @pN ROWS ONLY` | All LIMIT queries have ORDER BY |
| `... ORDER BY x LIMIT ? OFFSET ?` | `... ORDER BY x OFFSET @pM ROWS FETCH NEXT @pN ROWS ONLY` | Note param order swap |
| `RANDOM()` | `NEWID()` | |
| `date('now')` | `CAST(GETUTCDATE() AS DATE)` | Use UTC to match SQLite default |
| `date(col)` | `CAST(col AS DATE)` | |
| `datetime('now', '-N days')` | `DATEADD(day, -N, GETUTCDATE())` | |
| `DATE(expr) = DATE('now')` | `CAST(expr AS DATE) = CAST(GETUTCDATE() AS DATE)` | |
| `INSERT OR IGNORE` | `INSERT INTO` + duplicate-key suppression | Adapter strips `OR IGNORE` and suppresses 2627/2601 |

### INSERT OR IGNORE → Adapter-Level TRY/CATCH

Instead of adding dialect checks at call sites, the MSSQL adapter's `_run` detects `INSERT OR IGNORE INTO` and:
1. Strips `OR IGNORE` from the SQL
2. Wraps execution in a TRY/CATCH that suppresses duplicate key errors (2627, 2601)

This keeps routes and business logic 100% dialect-unaware.

### lastId → Adapter-Level SCOPE_IDENTITY()

The MSSQL adapter's `_run` detects `INSERT INTO` statements and automatically appends `; SELECT SCOPE_IDENTITY() AS lastId` to return the generated identity value. Routes continue using `result.lastId` as-is.

### Why Adapter-Level?

1. **Zero route changes** — routes stay 100% dialect-unaware
2. **Future-proof** — new routes get MSSQL compat automatically
3. **Consistent** with existing `rewriteParams()` pattern
4. **Testable** — unit tests on the rewriting function
5. **Architecture-sound** — confirmed via audit that no dialect leaks exist in routes/WS/client

### Local MSSQL Validation via Docker

`docker-compose.mssql.yml` spins up SQL Server 2022 (`mcr.microsoft.com/mssql/server:2022-latest`).
`npm run test:mssql` sets DATABASE_URL and runs the full test suite against it.
This ensures every adapter change is validated against real MSSQL before deployment.
