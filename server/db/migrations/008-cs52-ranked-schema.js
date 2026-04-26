/**
 * Migration 008 — CS52 server-authoritative scoring schema.
 *
 * Additive only (per LEARNINGS.md migration policy). Introduces:
 *   A1. New columns on `scores`: source, variant, client_game_id,
 *       schema_version, payload_hash + filtered UNIQUE index on
 *       (user_id, client_game_id) for client-side dedup of offline records.
 *   A2. Backfill `scores.source = 'legacy'` for any pre-existing rows
 *       (defensive — the new column already has DEFAULT 'legacy').
 *   A3. New table `ranked_sessions` (server-issued ranked + multiplayer
 *       sessions) with five indexes including two filtered UNIQUE indexes
 *       enforcing (a) one finished Ranked Daily per (user, daily-puzzle-date)
 *       and (b) one in_progress ranked session per user (closes the
 *       concurrent-create race).
 *   A4. New table `ranked_session_events` (per-round answers, server-stamped
 *       elapsed_ms is the score input — client_time_ms is telemetry only).
 *   A5. New table `ranked_puzzles` (separate ranked puzzle pool — never
 *       co-mingled with the bundled local-mode puzzle deck).
 *   A6. New table `game_configs` (per-mode round count / timer config;
 *       empty by default — code-level constants kick in when no row exists).
 *
 * No seed rows here. The ranked-puzzle pool is loaded by the operator-invoked
 * `seed:ranked-puzzles` script (boot-quiet contract — nothing runs on its own).
 *
 * Design contract:
 *   project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § "Schema migration sketch"
 */

const COLUMN_EXISTS_RE = /duplicate column|already exists/i;

async function addColumnSqlite(db, sql) {
  try {
    await db.exec(sql);
  } catch (err) {
    const msg = err && err.message ? err.message : '';
    if (!COLUMN_EXISTS_RE.test(msg)) throw err;
  }
}

module.exports = {
  version: 8,
  name: 'cs52-ranked-schema',
  async up(db) {
    if (db.dialect === 'mssql') {
      // ── A1. scores additive columns ──────────────────────────────────
      await db.exec(`
        IF COL_LENGTH('scores', 'source') IS NULL
          ALTER TABLE scores ADD source NVARCHAR(50) NOT NULL
            CONSTRAINT DF_scores_source DEFAULT 'legacy';
      `);
      await db.exec(`
        IF COL_LENGTH('scores', 'variant') IS NULL
          ALTER TABLE scores ADD variant NVARCHAR(50) NULL;
      `);
      await db.exec(`
        IF COL_LENGTH('scores', 'client_game_id') IS NULL
          ALTER TABLE scores ADD client_game_id NVARCHAR(255) NULL;
      `);
      await db.exec(`
        IF COL_LENGTH('scores', 'schema_version') IS NULL
          ALTER TABLE scores ADD schema_version INT NOT NULL
            CONSTRAINT DF_scores_schema_version DEFAULT 1;
      `);
      await db.exec(`
        IF COL_LENGTH('scores', 'payload_hash') IS NULL
          ALTER TABLE scores ADD payload_hash NVARCHAR(255) NULL;
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes
          WHERE name = 'idx_scores_user_clientgame' AND object_id = OBJECT_ID('scores'))
          CREATE UNIQUE INDEX idx_scores_user_clientgame
            ON scores(user_id, client_game_id)
            WHERE client_game_id IS NOT NULL;
      `);

      // ── A2. backfill ─────────────────────────────────────────────────
      await db.exec(
        `UPDATE scores SET source = 'legacy' WHERE source IS NULL OR source = '';`
      );

      // ── A3. ranked_sessions ──────────────────────────────────────────
      await db.exec(`
        IF OBJECT_ID('ranked_sessions', 'U') IS NULL
        CREATE TABLE ranked_sessions (
          id NVARCHAR(255) PRIMARY KEY,
          user_id INT NOT NULL,
          mode NVARCHAR(50) NOT NULL,
          config_snapshot NVARCHAR(MAX) NOT NULL,
          match_id NVARCHAR(255) NULL,
          room_code NVARCHAR(255) NULL,
          status NVARCHAR(50) NOT NULL,
          score INT NULL,
          correct_count INT NULL,
          best_streak INT NULL,
          started_at DATETIME NOT NULL,
          finished_at DATETIME NULL,
          expires_at DATETIME NOT NULL,
          daily_utc_date NVARCHAR(20) NULL,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes
          WHERE name = 'idx_ranked_sessions_user_mode_finished' AND object_id = OBJECT_ID('ranked_sessions'))
          CREATE INDEX idx_ranked_sessions_user_mode_finished
            ON ranked_sessions(user_id, mode, finished_at DESC);
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes
          WHERE name = 'idx_ranked_sessions_match' AND object_id = OBJECT_ID('ranked_sessions'))
          CREATE INDEX idx_ranked_sessions_match
            ON ranked_sessions(match_id)
            WHERE match_id IS NOT NULL;
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes
          WHERE name = 'idx_ranked_sessions_user_status_expires' AND object_id = OBJECT_ID('ranked_sessions'))
          CREATE INDEX idx_ranked_sessions_user_status_expires
            ON ranked_sessions(user_id, status, expires_at);
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes
          WHERE name = 'idx_ranked_sessions_user_daily' AND object_id = OBJECT_ID('ranked_sessions'))
          CREATE UNIQUE INDEX idx_ranked_sessions_user_daily
            ON ranked_sessions(user_id, daily_utc_date)
            WHERE mode = 'ranked_daily' AND status = 'finished' AND daily_utc_date IS NOT NULL;
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes
          WHERE name = 'idx_ranked_sessions_user_active' AND object_id = OBJECT_ID('ranked_sessions'))
          CREATE UNIQUE INDEX idx_ranked_sessions_user_active
            ON ranked_sessions(user_id)
            WHERE status = 'in_progress';
      `);

      // ── A4. ranked_session_events ────────────────────────────────────
      await db.exec(`
        IF OBJECT_ID('ranked_session_events', 'U') IS NULL
        CREATE TABLE ranked_session_events (
          session_id NVARCHAR(255) NOT NULL,
          round_num INT NOT NULL,
          puzzle_id NVARCHAR(255) NOT NULL,
          answer NVARCHAR(MAX) NOT NULL,
          correct INT NOT NULL,
          round_started_at DATETIME NOT NULL,
          received_at DATETIME NOT NULL,
          elapsed_ms INT NOT NULL,
          client_time_ms INT NULL,
          PRIMARY KEY (session_id, round_num),
          FOREIGN KEY (session_id) REFERENCES ranked_sessions(id)
        );
      `);

      // ── A5. ranked_puzzles ───────────────────────────────────────────
      await db.exec(`
        IF OBJECT_ID('ranked_puzzles', 'U') IS NULL
        CREATE TABLE ranked_puzzles (
          id NVARCHAR(255) PRIMARY KEY,
          category NVARCHAR(255) NOT NULL,
          prompt NVARCHAR(MAX) NOT NULL,
          options NVARCHAR(MAX) NOT NULL,
          answer NVARCHAR(MAX) NOT NULL,
          difficulty INT NULL,
          status NVARCHAR(50) NOT NULL,
          created_at DATETIME NOT NULL
            CONSTRAINT DF_ranked_puzzles_created_at DEFAULT GETDATE(),
          retired_at DATETIME NULL
        );
      `);
      await db.exec(`
        IF NOT EXISTS (SELECT 1 FROM sys.indexes
          WHERE name = 'idx_ranked_puzzles_status' AND object_id = OBJECT_ID('ranked_puzzles'))
          CREATE INDEX idx_ranked_puzzles_status ON ranked_puzzles(status);
      `);

      // ── A6. game_configs ─────────────────────────────────────────────
      await db.exec(`
        IF OBJECT_ID('game_configs', 'U') IS NULL
        CREATE TABLE game_configs (
          mode NVARCHAR(50) PRIMARY KEY,
          rounds INT NOT NULL,
          round_timer_ms INT NOT NULL,
          inter_round_delay_ms INT NOT NULL CONSTRAINT DF_game_configs_iroms DEFAULT 0,
          updated_at DATETIME NOT NULL
        );
      `);
    } else {
      // ── SQLite branch ────────────────────────────────────────────────

      // A1. scores additive columns
      await addColumnSqlite(
        db,
        "ALTER TABLE scores ADD COLUMN source TEXT NOT NULL DEFAULT 'legacy'"
      );
      await addColumnSqlite(db, 'ALTER TABLE scores ADD COLUMN variant TEXT');
      await addColumnSqlite(db, 'ALTER TABLE scores ADD COLUMN client_game_id TEXT');
      await addColumnSqlite(
        db,
        'ALTER TABLE scores ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1'
      );
      await addColumnSqlite(db, 'ALTER TABLE scores ADD COLUMN payload_hash TEXT');
      await db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_user_clientgame
          ON scores(user_id, client_game_id)
          WHERE client_game_id IS NOT NULL;
      `);

      // A2. backfill
      await db.exec(
        "UPDATE scores SET source = 'legacy' WHERE source IS NULL OR source = ''"
      );

      // A3. ranked_sessions
      await db.exec(`
        CREATE TABLE IF NOT EXISTS ranked_sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          mode TEXT NOT NULL,
          config_snapshot TEXT NOT NULL,
          match_id TEXT,
          room_code TEXT,
          status TEXT NOT NULL,
          score INTEGER,
          correct_count INTEGER,
          best_streak INTEGER,
          started_at DATETIME NOT NULL,
          finished_at DATETIME,
          expires_at DATETIME NOT NULL,
          daily_utc_date TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ranked_sessions_user_mode_finished
          ON ranked_sessions(user_id, mode, finished_at DESC);
      `);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ranked_sessions_match
          ON ranked_sessions(match_id)
          WHERE match_id IS NOT NULL;
      `);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ranked_sessions_user_status_expires
          ON ranked_sessions(user_id, status, expires_at);
      `);
      await db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ranked_sessions_user_daily
          ON ranked_sessions(user_id, daily_utc_date)
          WHERE mode = 'ranked_daily' AND status = 'finished' AND daily_utc_date IS NOT NULL;
      `);
      await db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ranked_sessions_user_active
          ON ranked_sessions(user_id)
          WHERE status = 'in_progress';
      `);

      // A4. ranked_session_events
      await db.exec(`
        CREATE TABLE IF NOT EXISTS ranked_session_events (
          session_id TEXT NOT NULL,
          round_num INTEGER NOT NULL,
          puzzle_id TEXT NOT NULL,
          answer TEXT NOT NULL,
          correct INTEGER NOT NULL,
          round_started_at DATETIME NOT NULL,
          received_at DATETIME NOT NULL,
          elapsed_ms INTEGER NOT NULL,
          client_time_ms INTEGER,
          PRIMARY KEY (session_id, round_num),
          FOREIGN KEY (session_id) REFERENCES ranked_sessions(id)
        );
      `);

      // A5. ranked_puzzles
      await db.exec(`
        CREATE TABLE IF NOT EXISTS ranked_puzzles (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          prompt TEXT NOT NULL,
          options TEXT NOT NULL,
          answer TEXT NOT NULL,
          difficulty INTEGER,
          status TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          retired_at DATETIME
        );
      `);
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ranked_puzzles_status
          ON ranked_puzzles(status);
      `);

      // A6. game_configs
      await db.exec(`
        CREATE TABLE IF NOT EXISTS game_configs (
          mode TEXT PRIMARY KEY,
          rounds INTEGER NOT NULL,
          round_timer_ms INTEGER NOT NULL,
          inter_round_delay_ms INTEGER NOT NULL DEFAULT 0,
          updated_at DATETIME NOT NULL
        );
      `);
    }
  },
};
