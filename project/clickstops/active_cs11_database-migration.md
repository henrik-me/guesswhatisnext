# Clickstop CS11: Database Abstraction + Azure SQL Migration

**Status:** 🔄 Active
**Goal:** Replace the tightly-coupled SQLite layer with a clean database abstraction that supports both SQLite (local dev, staging, tests) and Azure SQL (production), eliminating SMB issues and enabling persistent production data with proper schema migrations.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS11-60 | Azure Files cleanup | ✅ Done | CS10-59 | Remove dead SMB references from all files. PR #49 merged. |
| CS11-60v | Validate staging (post-cleanup) | ✅ Done | CS11-60 | Staging deploy + smoke tests all passed. DB self-init, user reg, score submit, puzzles all working. Run #23809714266. |
| CS11-61a | Adapter interface + factory | ✅ Done | CS11-60v | `base-adapter.js`, `index.js` factory, config changes. PR #52 merged. |
| CS11-61b | SQLite adapter + migrations | ✅ Done | CS11-61a | `sqlite-adapter.js`, migration system (`_tracker.js`, `001–004`), `seed.js`. PR #55 merged. |
| CS11-61c | mssql adapter | ✅ Done | CS11-61a | `mssql-adapter.js`. PR #56 merged. Not used until CS11-64. |
| CS11-62 | Convert routes to async | ✅ Done | CS11-61a | All DB-touching handlers use `await db.get/all/run()`. PR #57 merged. |
| CS11-63 | Update tests for async | ✅ Done | CS11-61b, CS11-62 | Async test helpers. Test suite passes with SQLite adapter. PR #57 merged (combined with CS11-62). |
| CS11-63v | Validate staging (post-async) | ✅ Done | CS11-63 | Staging deploy + smoke tests + E2E all passed. 4 migrations applied, 504 puzzles seeded, async routes working. Run #23833160313. |
| CS11-64 | Provision Azure SQL | ⬜ Pending | CS11-63v | Rollup for 64a–64e: create prod Azure SQL, open access, define MSSQL init path, store GitHub secret. |
| CS11-64a | Create Azure SQL server | ⬜ Pending | CS11-63v | Create the production logical server in the chosen region/tier; capture admin + server details. |
| CS11-64b | Create serverless prod DB | ⬜ Pending | CS11-64a | Create the production DB on that server and capture the final DB name/connection parameters. |
| CS11-64c | Configure firewall access | ⬜ Pending | CS11-64a | Allow Azure-hosted app access plus operator IP(s) for setup/testing. Parallel with CS11-64b once server exists. |
| CS11-64d | Enable MSSQL schema bootstrap | ✅ Done | CS11-64b | Removed MSSQL fail-fast gate; dialect-aware migrations, seeding, and retry logic. |
| CS11-64e | Add GitHub `DATABASE_URL` secret | ⬜ Pending | CS11-64b | Store the production connection string after the server + DB names are final. Parallel with CS11-64d. |
| CS11-65 | Production deploy | ⬜ Pending | CS11-64 | Rollup for 65a–65c: wire workflow/env, deploy, then verify production. |
| CS11-65a | Update `prod-deploy.yml` for MSSQL | ⬜ Pending | CS11-64 | Pass `DATABASE_URL` so production selects MSSQL; the workflow still uses `GWN_DB_PATH=/tmp/game.db` today. |
| CS11-65b | First production deploy | ⬜ Pending | CS11-65a | Run the first deploy with Azure SQL settings and the chosen MSSQL bootstrap process. |
| CS11-65c | Verify production | ⬜ Pending | CS11-65b | Smoke test startup, read paths, auth, submit flow, and DB-backed writes against Azure SQL. |

## Design Decisions

### CS11a — Azure Files Cleanup (Quick Win)

Remove all dead Azure Files / SMB volume mount references. Nothing uses them anymore.

| File | Change |
|------|--------|
| `staging-deploy.yml` | Remove `volumes`, `volumeMounts`, `data-volume` blocks |
| `prod-deploy.yml` | Same — deploy + rollback paths (4 blocks) |
| `infra/deploy.sh` | Remove storage account/share creation, mount YAML |
| `infra/deploy.ps1` | Same |
| `infra/README.md` | Remove Azure Files documentation |
| `Dockerfile` | Remove `RUN mkdir -p /app/data` |
| `docker-compose.yml` | Remove `./data:/app/data` volume |
| `server/db/connection.js` | Remove stale WAL/SHM cleanup, simplify comments |
| `server/app.js` | Remove SMB lock release comments |

**Azure resources to delete:** `gwn-storage-staging` and `gwn-storage-production` file shares, container app env storage links, and the storage account (if only used for these shares).

### CS11b — Database Abstraction Layer

#### Architecture: Repository Pattern with Adapter Interface

```
server/db/
  index.js              — createDb(config) factory → returns adapter
  base-adapter.js       — shared interface + parameter translation
  sqlite-adapter.js     — SQLite implementation (sync → promisified)
  mssql-adapter.js      — Azure SQL implementation (native async)
  migrations/
    _tracker.js         — migration version table + runner
    001-initial.js      — full schema creation
    002-add-role.js     — users.role column
    003-add-max-players.js — matches.max_players, host_user_id
  seed.js               — achievements, puzzles, system user
```

#### Adapter Interface (what routes use)

```javascript
const db = await createDb(config);

await db.get(sql, params)          // single row or null
await db.all(sql, params)          // array of rows
await db.run(sql, params)          // { changes, lastId }
await db.exec(rawSql)              // DDL (migrations)
await db.transaction(async (tx) => { ... })
await db.migrate()                 // run pending migrations
await db.isHealthy()               // SELECT 1
await db.close()
```

Routes never import `better-sqlite3` or `mssql` directly. They only use this interface.

#### Parameter Translation (automatic)

Routes write `?` placeholders everywhere. The adapter translates:
- **SQLite**: passes through as-is
- **Azure SQL**: rewrites `?` → `@p1, @p2, ...` and binds accordingly

#### Versioned Migration System

Replaces the current try/catch ALTER TABLE approach:
- `_migrations` table tracks applied migrations: `(version, name, applied_at)`
- Each migration file exports `async up(db)` and `async down(db)`
- `up()` checks `db.dialect` for SQLite vs T-SQL differences
- Migrations run on startup via `db.migrate()`; each wrapped in a transaction
- New schema changes = new migration file → PR → deploy → auto-applied

```javascript
// migrations/001-initial.js
module.exports = {
  async up(db) {
    if (db.dialect === 'sqlite') {
      await db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, ...)');
    } else {
      await db.exec("IF OBJECT_ID('users') IS NULL CREATE TABLE users (id INT IDENTITY(1,1) PRIMARY KEY, ...)");
    }
  }
};
```

#### SQL Dialect Differences (only in DDL / migrations)

| Feature | SQLite | Azure SQL |
|---------|--------|-----------|
| Auto-increment | `INTEGER PRIMARY KEY AUTOINCREMENT` | `INT IDENTITY(1,1) PRIMARY KEY` |
| Create if not exists | `CREATE TABLE IF NOT EXISTS` | `IF OBJECT_ID(...) IS NULL` |
| Upsert | `INSERT OR REPLACE` | `MERGE` or `IF NOT EXISTS INSERT` |
| Timestamps | `CURRENT_TIMESTAMP` | `GETDATE()` |
| Text types | `TEXT` | `NVARCHAR(255)` / `NVARCHAR(MAX)` |

Queries in routes (SELECT, INSERT, UPDATE) use standard SQL — work in both without changes.

#### Config-Driven Backend Selection

```javascript
DB_BACKEND: process.env.DATABASE_URL ? 'mssql' : 'sqlite',
DATABASE_URL: process.env.DATABASE_URL || null,
GWN_DB_PATH: process.env.GWN_DB_PATH || 'data/game.db',
```

- `DATABASE_URL` present → Azure SQL (production)
- `DATABASE_URL` absent → SQLite (local dev, staging, tests)

### CS11c — Azure SQL Provisioning + Production Deploy

| Step | Description |
|------|-------------|
| Provision | Azure SQL logical server + free-tier serverless DB (gwn-production). Firewall rules for Container Apps. Connection string as GitHub secret. |
| Deploy workflow | `prod-deploy.yml`: add `DATABASE_URL` env var, remove volume mounts, add `GWN_DB_PATH=/tmp/game.db` fallback. |
| First deploy | Trigger with staging-validated image tag. Verify health + DB connectivity. |

**Azure SQL Free Tier Specs:**
- 100,000 vCore-seconds/month (~28h compute)
- 32 GB storage
- Serverless auto-pause when idle → $0 cost
- 1 free DB per subscription → use for production; staging stays ephemeral SQLite

## Notes

**Parallelism:** After CS11-64a, CS11-64b and CS11-64c can move in parallel. After CS11-64b, CS11-64d and CS11-64e can run in parallel. Task CS11-65 stays sequential: 65a → 65b → 65c.

**Suggested order:** CS11-63v → CS11-64a → (CS11-64b + CS11-64c) → (CS11-64d + CS11-64e) → CS11-64 → CS11-65a → CS11-65b → CS11-65c → CS11-65

**CS11a/CS11b parallelism history:** After CS11-61a merges, three parallel tracks start:
```
Main: CS11-61a → merge → signal workers → orchestrate merges → CS11-63v → CS11-64 → CS11-65
  wt-1: CS11-61b (SQLite adapter + migrations)
  wt-2: CS11-61c (mssql adapter)
  wt-3: CS11-62 (route conversion) → pull CS11-61b when merged → CS11-63 (test updates)
```
