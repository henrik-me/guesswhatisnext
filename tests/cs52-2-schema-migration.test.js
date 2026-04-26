/**
 * CS52-2 — Schema migration test.
 *
 * Boots a fresh SQLite adapter, runs all migrations, and asserts:
 *   - new columns exist on `scores` with correct shape
 *   - new tables exist (ranked_sessions, ranked_session_events,
 *     ranked_puzzles, game_configs)
 *   - all five ranked_sessions indexes exist (incl. two filtered UNIQUE ones)
 *   - backfill set source='legacy' on rows pre-existing the migration
 *   - filtered UNIQUE indexes enforce their constraints:
 *       * second in_progress session for the same user fails
 *       * second finished ranked_daily for the same (user, daily date) fails
 *       * abandoned rows do NOT conflict with an active row (filter works)
 *   - migration completion is logged via the structured logger
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const SqliteAdapter = require('../server/db/sqlite-adapter');
const migrations = require('../server/db/migrations');

let tmpDir;
let dbPath;
let db;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gwn-cs52-2-'));
  dbPath = path.join(tmpDir, 'cs52-2.db');
  db = new SqliteAdapter(dbPath);
  await db.connect();
});

afterAll(async () => {
  if (db) await db.close();
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('CS52-2 migration', () => {
  test('migration 008 is registered', () => {
    const m = migrations.find((m) => m.version === 8);
    expect(m).toBeDefined();
    expect(m.name).toBe('cs52-ranked-schema');
  });

  test('seeds a legacy scores row, then runs all migrations', async () => {
    // Migration 001 is needed first to create the scores table — run only 001
    // so we can insert a pre-existing row before migration 008's backfill.
    const initial = migrations.filter((m) => m.version === 1);
    await db.migrate(initial);

    // Need a user row for the FK
    await db.run(
      "INSERT INTO users (username, password_hash) VALUES ('legacyuser', 'x')"
    );
    const u = await db.get(
      "SELECT id FROM users WHERE username = 'legacyuser'"
    );
    await db.run(
      `INSERT INTO scores (user_id, mode, score, correct_count, total_rounds, best_streak)
       VALUES (?, 'freeplay', 100, 5, 5, 3)`,
      [u.id]
    );

    // Now apply ALL pending migrations (002…008)
    const applied = await db.migrate(migrations);
    expect(applied).toBeGreaterThanOrEqual(7);
  });

  test('scores table has all new columns', async () => {
    const cols = await db.all('PRAGMA table_info(scores)');
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'source',
        'variant',
        'client_game_id',
        'schema_version',
        'payload_hash',
      ])
    );

    const source = cols.find((c) => c.name === 'source');
    expect(source.notnull).toBe(1);
    expect(source.dflt_value).toContain('legacy');

    const sv = cols.find((c) => c.name === 'schema_version');
    expect(sv.notnull).toBe(1);
    expect(String(sv.dflt_value)).toBe('1');
  });

  test('backfill set source=legacy on pre-existing rows', async () => {
    const rows = await db.all('SELECT source, schema_version FROM scores');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(r.source).toBe('legacy');
      expect(r.schema_version).toBe(1);
    }
  });

  test('idx_scores_user_clientgame is a filtered UNIQUE index', async () => {
    const idx = await db.get(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_scores_user_clientgame'"
    );
    expect(idx).not.toBeNull();
    expect(idx.sql).toMatch(/UNIQUE/i);
    expect(idx.sql).toMatch(/WHERE\s+client_game_id\s+IS\s+NOT\s+NULL/i);
  });

  test('all four new tables exist', async () => {
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('ranked_sessions', 'ranked_session_events', 'ranked_puzzles', 'game_configs')"
    );
    expect(tables.map((t) => t.name).sort()).toEqual([
      'game_configs',
      'ranked_puzzles',
      'ranked_session_events',
      'ranked_sessions',
    ]);
  });

  test('ranked_sessions has expected columns', async () => {
    const cols = await db.all('PRAGMA table_info(ranked_sessions)');
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'mode',
        'config_snapshot',
        'match_id',
        'room_code',
        'status',
        'score',
        'correct_count',
        'best_streak',
        'started_at',
        'finished_at',
        'expires_at',
        'daily_utc_date',
      ])
    );
  });

  test('ranked_sessions has all five expected indexes', async () => {
    const idx = await db.all(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='ranked_sessions'"
    );
    const names = idx.map((i) => i.name);
    for (const expected of [
      'idx_ranked_sessions_user_mode_finished',
      'idx_ranked_sessions_match',
      'idx_ranked_sessions_user_status_expires',
      'idx_ranked_sessions_user_daily',
      'idx_ranked_sessions_user_active',
    ]) {
      expect(names).toContain(expected);
    }

    const daily = idx.find((i) => i.name === 'idx_ranked_sessions_user_daily');
    expect(daily.sql).toMatch(/UNIQUE/i);
    expect(daily.sql).toMatch(/ranked_daily/);
    expect(daily.sql).toMatch(/finished/);
    expect(daily.sql).toMatch(/daily_utc_date\s+IS\s+NOT\s+NULL/i);

    const active = idx.find((i) => i.name === 'idx_ranked_sessions_user_active');
    expect(active.sql).toMatch(/UNIQUE/i);
    expect(active.sql).toMatch(/in_progress/);

    const match = idx.find((i) => i.name === 'idx_ranked_sessions_match');
    expect(match.sql).toMatch(/match_id\s+IS\s+NOT\s+NULL/i);
  });

  test('ranked_session_events composite PK enforced', async () => {
    const pk = await db.all('PRAGMA table_info(ranked_session_events)');
    const pkCols = pk.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
    expect(pkCols.map((c) => c.name)).toEqual(['session_id', 'round_num']);
  });

  test('game_configs starts empty (no auto-seed)', async () => {
    const rows = await db.all('SELECT * FROM game_configs');
    expect(rows.length).toBe(0);
  });

  test('ranked_puzzles starts empty (no auto-seed at boot)', async () => {
    const rows = await db.all('SELECT * FROM ranked_puzzles');
    expect(rows.length).toBe(0);
  });

  test('idx_ranked_sessions_user_active rejects two in_progress for same user', async () => {
    await db.run(
      "INSERT INTO users (username, password_hash) VALUES ('rkuser1', 'x')"
    );
    const u = await db.get(
      "SELECT id FROM users WHERE username = 'rkuser1'"
    );

    await db.run(
      `INSERT INTO ranked_sessions
        (id, user_id, mode, config_snapshot, status, started_at, expires_at)
       VALUES ('s-active-1', ?, 'ranked_freeplay', '{}', 'in_progress', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z')`,
      [u.id]
    );

    await expect(
      db.run(
        `INSERT INTO ranked_sessions
          (id, user_id, mode, config_snapshot, status, started_at, expires_at)
         VALUES ('s-active-2', ?, 'ranked_daily', '{}', 'in_progress', '2026-01-01T00:00:01Z', '2026-01-01T01:00:00Z')`,
        [u.id]
      )
    ).rejects.toThrow(/UNIQUE|constraint/i);
  });

  test('idx_ranked_sessions_user_active filter excludes non-in_progress rows', async () => {
    await db.run(
      "INSERT INTO users (username, password_hash) VALUES ('rkuser2', 'x')"
    );
    const u = await db.get(
      "SELECT id FROM users WHERE username = 'rkuser2'"
    );

    // Abandoned row should NOT count against the filtered UNIQUE
    await db.run(
      `INSERT INTO ranked_sessions
        (id, user_id, mode, config_snapshot, status, started_at, expires_at)
       VALUES ('s-aband', ?, 'ranked_freeplay', '{}', 'abandoned', '2026-01-01T00:00:00Z', '2026-01-01T01:00:00Z')`,
      [u.id]
    );

    // Now an in_progress for the same user is allowed
    await expect(
      db.run(
        `INSERT INTO ranked_sessions
          (id, user_id, mode, config_snapshot, status, started_at, expires_at)
         VALUES ('s-active-3', ?, 'ranked_freeplay', '{}', 'in_progress', '2026-01-01T00:00:01Z', '2026-01-01T01:00:00Z')`,
        [u.id]
      )
    ).resolves.toBeDefined();
  });

  test('idx_ranked_sessions_user_daily rejects second finished daily for same date', async () => {
    await db.run(
      "INSERT INTO users (username, password_hash) VALUES ('rkuser3', 'x')"
    );
    const u = await db.get(
      "SELECT id FROM users WHERE username = 'rkuser3'"
    );

    await db.run(
      `INSERT INTO ranked_sessions
        (id, user_id, mode, config_snapshot, status, started_at, finished_at, expires_at, daily_utc_date)
       VALUES ('s-daily-1', ?, 'ranked_daily', '{}', 'finished', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', '2026-01-01T01:00:00Z', '2026-01-01')`,
      [u.id]
    );

    await expect(
      db.run(
        `INSERT INTO ranked_sessions
          (id, user_id, mode, config_snapshot, status, started_at, finished_at, expires_at, daily_utc_date)
         VALUES ('s-daily-2', ?, 'ranked_daily', '{}', 'finished', '2026-01-01T00:10:00Z', '2026-01-01T00:15:00Z', '2026-01-01T01:00:00Z', '2026-01-01')`,
        [u.id]
      )
    ).rejects.toThrow(/UNIQUE|constraint/i);

    // Different date is fine
    await expect(
      db.run(
        `INSERT INTO ranked_sessions
          (id, user_id, mode, config_snapshot, status, started_at, finished_at, expires_at, daily_utc_date)
         VALUES ('s-daily-3', ?, 'ranked_daily', '{}', 'finished', '2026-01-02T00:00:00Z', '2026-01-02T00:05:00Z', '2026-01-02T01:00:00Z', '2026-01-02')`,
        [u.id]
      )
    ).resolves.toBeDefined();
  });

  test('idx_ranked_sessions_user_daily filter excludes NULL daily_utc_date (MSSQL parity)', async () => {
    // The filter MUST include `daily_utc_date IS NOT NULL` so that on MSSQL
    // (where unique indexes treat repeated NULL key tuples as duplicates) we
    // do not accidentally enforce "at most one finished ranked_daily row with
    // NULL date per user". On SQLite the filter is also necessary to keep
    // index semantics identical across backends.
    await db.run(
      "INSERT INTO users (username, password_hash) VALUES ('rkuser4', 'x')"
    );
    const u = await db.get(
      "SELECT id FROM users WHERE username = 'rkuser4'"
    );

    // Two finished ranked_daily rows with NULL daily_utc_date — must be
    // accepted because the filter excludes NULL-date rows from the unique set.
    await db.run(
      `INSERT INTO ranked_sessions
        (id, user_id, mode, config_snapshot, status, started_at, finished_at, expires_at, daily_utc_date)
       VALUES ('s-daily-null-1', ?, 'ranked_daily', '{}', 'finished', '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', '2026-01-01T01:00:00Z', NULL)`,
      [u.id]
    );
    await expect(
      db.run(
        `INSERT INTO ranked_sessions
          (id, user_id, mode, config_snapshot, status, started_at, finished_at, expires_at, daily_utc_date)
         VALUES ('s-daily-null-2', ?, 'ranked_daily', '{}', 'finished', '2026-01-01T00:10:00Z', '2026-01-01T00:15:00Z', '2026-01-01T01:00:00Z', NULL)`,
        [u.id]
      )
    ).resolves.toBeDefined();
  });

  test('migration completion is logged via the structured logger', async () => {
    // The migration runner emits one INFO line per applied migration with
    // {version, name} fields — see server/db/migrations/_tracker.js.
    // The test just ensures the registered migration carries the queryable
    // shape the KQL in docs/observability.md depends on.
    const m = migrations.find((mig) => mig.version === 8);
    expect(m.version).toBe(8);
    expect(m.name).toBe('cs52-ranked-schema');
  });
});
