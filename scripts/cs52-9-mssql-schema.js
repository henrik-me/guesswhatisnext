#!/usr/bin/env node
/**
 * scripts/cs52-9-mssql-schema.js — Verify CS52-2 migration 008 schema is
 * present on the live MSSQL instance.
 *
 * Connects to the MSSQL service on the local docker network from inside
 * the app container (where DATABASE_URL already points at mssql:1433),
 * so it must be invoked as:
 *
 *   docker exec wt-cs52-9-app-1 node /app/scripts/cs52-9-mssql-schema.js
 *
 * Asserts (CS52-9 § B (e)):
 *   - Tables: ranked_sessions, ranked_session_events, ranked_puzzles, game_configs
 *   - UNIQUE INDEXes: idx_ranked_sessions_user_active, idx_ranked_sessions_user_daily
 *   - Backfill: every legacy `scores` row has source='legacy' (or the table is empty)
 *
 * Also reports row counts so the PR body can include an attestation table.
 */
'use strict';

(async () => {
  const { getDbAdapter, closeDbAdapter } = require('../server/db');
  const db = await getDbAdapter();

  const required = [
    'scores', 'ranked_sessions', 'ranked_session_events',
    'ranked_puzzles', 'game_configs',
  ];
  const missing = [];
  const counts = {};
  for (const t of required) {
    try {
      const row = await db.get(`SELECT COUNT(*) AS n FROM ${t}`);
      counts[t] = row.n;
    } catch {
      missing.push(t);
    }
  }

  // UNIQUE INDEXes (MSSQL sys.indexes)
  const idxRows = await db.all(`
    SELECT i.name AS index_name, OBJECT_NAME(i.object_id) AS table_name,
           i.is_unique AS is_unique, i.has_filter AS has_filter, i.filter_definition AS filter_def
    FROM sys.indexes i
    WHERE i.name IN ('idx_ranked_sessions_user_active', 'idx_ranked_sessions_user_daily')
  `);
  const idxNames = idxRows.map((r) => r.index_name);

  // Legacy backfill: any pre-CS52 scores rows must be tagged source='legacy'
  let legacyOk = true;
  let legacyCounts = {};
  try {
    const rows = await db.all(`SELECT source, COUNT(*) AS n FROM scores GROUP BY source`);
    for (const r of rows) legacyCounts[r.source ?? '(null)'] = r.n;
    legacyOk = !('(null)' in legacyCounts);
  } catch (e) {
    legacyOk = false;
    legacyCounts.error = e.message;
  }

  // game_configs default rows present?
  let gameConfigs = [];
  try {
    gameConfigs = await db.all(`SELECT mode, rounds, round_timer_ms, inter_round_delay_ms FROM game_configs`);
  } catch {}

  const report = {
    tablesPresent: required.filter((t) => !missing.includes(t)),
    tablesMissing: missing,
    rowCounts: counts,
    uniqueIndexesPresent: idxNames,
    uniqueIndexesMissing: ['idx_ranked_sessions_user_active', 'idx_ranked_sessions_user_daily']
      .filter((n) => !idxNames.includes(n)),
    indexDetails: idxRows,
    legacyBackfillCounts: legacyCounts,
    legacyBackfillOk: legacyOk,
    gameConfigsRows: gameConfigs,
  };

  console.log(JSON.stringify(report, null, 2));
  await closeDbAdapter();

  const ok = missing.length === 0 && report.uniqueIndexesMissing.length === 0 && legacyOk;
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(2);
});
