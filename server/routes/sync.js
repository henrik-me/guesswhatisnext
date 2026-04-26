'use strict';

/**
 * CS52-5 — POST /api/sync
 *
 * Unified gesture-driven sync endpoint that carries:
 *   - `queuedRecords` : L1 offline-score writes (idempotent on
 *     `(user_id, client_game_id)`; payload-hash conflict rule).
 *   - `revalidate`    : L2 read-cache revalidation map (profile,
 *     achievements, notifications, four leaderboard keys).
 *
 * Spec: project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § Identity & client sync model
 *   § Decision #5 (immutable record + payload-hash conflict)
 *   § POST /api/sync contract
 *   § Sign-out semantics (server-side neutral; client-driven)
 *
 * Boot-quiet contract: requests MUST carry `X-User-Activity: 1`.
 * Achievement evaluation is intentionally skipped for offline-source records
 * (Decision #7 / CS52-7).
 *
 * 202 path (mutually exclusive with 200 fields) is gated behind CS52-7e
 * `pending_writes` durable queue — until then we surface the existing
 * 503-with-`unavailable` body so the client's connectivity state machine
 * still transitions to `db-unavailable`. See TODO(CS52-7e).
 */

const express = require('express');
const crypto = require('crypto');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getDbUnavailability } = require('../lib/transient-db-error');
const logger = require('../logger');

const router = express.Router();

const VALID_REVALIDATE_KEYS = new Set([
  'leaderboard:freeplay:ranked',
  'leaderboard:daily:ranked',
  'leaderboard:freeplay:offline',
  'leaderboard:daily:offline',
  'profile',
  'achievements',
  'notifications',
]);

const MAX_QUEUED_RECORDS = 50;
const LB_ROW_LIMIT = 100;
const NOTIF_ROW_LIMIT = 20;

// Mirror the legacy POST /api/scores validation so the unified-sync write
// path can't pollute the scores table with unexpected mode values that
// would then leak into profile / leaderboard queries.
const VALID_MODES = new Set(['freeplay', 'daily']);

// Match server/app.js sendDbUnavailable shape so client-side handlers see a
// single consistent 503 body across the unified-sync route and the central
// error path. Includes the `error` field and intentionally omits Retry-After
// (its absence signals the SPA to stop retrying and render the banner).
function sendUnavailable(res, descriptor) {
  return res.status(503).json({
    error: 'Database temporarily unavailable',
    message: descriptor.message,
    unavailable: true,
    reason: descriptor.reason,
  });
}

/** Stable JSON serialization (sorted keys) for hashing immutable record fields. */
function canonicalJson(obj) {
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => JSON.stringify(k) + ':' + JSON.stringify(obj[k]));
  return '{' + parts.join(',') + '}';
}

/** Normalize completed_at to a canonical ISO-8601 UTC string (or null). */
function normalizeCompletedAt(v) {
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Compute payload_hash over the immutable record fields + user_id. */
function computePayloadHash(userId, raw) {
  return crypto
    .createHash('sha256')
    .update(canonicalJson({
      user_id: userId,
      client_game_id: String(raw.client_game_id),
      mode: String(raw.mode || 'freeplay'),
      variant: raw.variant ? String(raw.variant) : null,
      score: Number(raw.score) || 0,
      correct_count: Number(raw.correct_count) || 0,
      total_rounds: Number(raw.total_rounds) || 0,
      best_streak: Number(raw.best_streak) || 0,
      fastest_answer_ms: raw.fastest_answer_ms == null ? null : Number(raw.fastest_answer_ms),
      // Hash the canonical normalized form so two payloads representing
      // the same instant in different surface forms (e.g. "...:00Z" vs
      // "...:00.000Z", or epoch-ms vs ISO) hash identically and don't
      // misclassify a benign retry as conflict_with_existing.
      completed_at: normalizeCompletedAt(raw.completed_at),
      schema_version: Number(raw.schema_version) || 1,
    }))
    .digest('hex');
}

/** True iff the value parses to a finite Date (accepts ISO strings, epoch ms, etc.). */
function isValidCompletedAt(v) {
  if (v == null) return true; // optional — server fills in default
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

/** Upsert a single L1 record. Returns 'acked' | 'rejected' | throws. */
async function processRecord(db, userId, raw) {
  const payloadHash = computePayloadHash(userId, raw);
  const mode = String(raw.mode || 'freeplay');
  const variant = raw.variant ? String(raw.variant) : null;
  const score = Number(raw.score) || 0;
  const correctCount = Number(raw.correct_count) || 0;
  const totalRounds = Number(raw.total_rounds) || 0;
  const bestStreak = Number(raw.best_streak) || 0;
  const schemaVersion = Number(raw.schema_version) || 1;

  // Idempotency probe: was this client_game_id already accepted?
  const existing = await db.get(
    'SELECT payload_hash FROM scores WHERE user_id = ? AND client_game_id = ?',
    [userId, String(raw.client_game_id)]
  );
  if (existing) {
    if (existing.payload_hash === payloadHash) return 'acked';
    return 'rejected';
  }

  try {
    // Persist `completed_at` (offline play time) into `played_at` so
    // date-based views (e.g. daily leaderboard) reflect when the game
    // was actually played, not when it was synced. The DB DEFAULT
    // (current timestamp) only fires when we omit the column, so we
    // bind it explicitly here for offline records.
    //
    // Normalize completed_at to a canonical UTC ISO-8601 string before
    // binding it as a query parameter.
    // - The value is parsed through `new Date(...)` first so a malformed
    //   `completed_at` surfaces as a deterministic rejection instead of
    //   corrupt DB state.
    // - The mssql node driver implicitly converts a parameterized ISO-8601
    //   string with a `Z` suffix into a SqlDateTime; the conversion path that
    //   would reject a `Z` suffix (raw string concatenation into SQL text) is
    //   never used here because all values are bound via `request.input(...)`.
    // - SQLite stores TEXT verbatim; ISO-8601 with `T` and `Z` is the format
    //   SQLite's date()/datetime() functions understand, so daily-leaderboard
    //   bucketing works without an additional cast.
    let playedAt;
    if (raw.completed_at != null) {
      // Use the same normalizer the hash path uses so the persisted
      // played_at always matches the canonical form that produced
      // payload_hash.
      playedAt = normalizeCompletedAt(raw.completed_at);
      if (playedAt == null) return 'rejected';
    } else {
      playedAt = new Date().toISOString();
    }
    await db.run(
      `INSERT INTO scores
         (user_id, mode, score, correct_count, total_rounds, best_streak,
          source, variant, client_game_id, schema_version, payload_hash, played_at)
       VALUES (?, ?, ?, ?, ?, ?, 'offline', ?, ?, ?, ?, ?)`,
      [userId, mode, score, correctCount, totalRounds, bestStreak,
        variant, String(raw.client_game_id), schemaVersion, payloadHash, playedAt]
    );
    return 'acked';
  } catch (err) {
    // Concurrent insert raced past our SELECT — re-check and reclassify.
    const after = await db.get(
      'SELECT payload_hash FROM scores WHERE user_id = ? AND client_game_id = ?',
      [userId, String(raw.client_game_id)]
    );
    if (after) return after.payload_hash === payloadHash ? 'acked' : 'rejected';
    throw err;
  }
}

async function fetchEntity(db, key, userId) {
  const updatedAt = new Date().toISOString();
  const limitClause = (n) =>
    db.dialect === 'mssql' ? `OFFSET 0 ROWS FETCH NEXT ${n} ROWS ONLY` : `LIMIT ${n}`;

  if (key === 'profile') {
    const stats = await db.all(
      `SELECT mode, COUNT(*) as games_played, MAX(score) as high_score,
              ROUND(AVG(score), 0) as avg_score, MAX(best_streak) as best_streak
       FROM scores WHERE user_id = ? GROUP BY mode`,
      [userId]
    );
    return { stats, updatedAt };
  }

  if (key === 'achievements') {
    const rows = await db.all(
      `SELECT a.id, a.name, a.description, a.icon, a.category, ua.unlocked_at
       FROM achievements a
       INNER JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
       ORDER BY ua.unlocked_at DESC`,
      [userId]
    );
    return { rows, updatedAt };
  }

  if (key === 'notifications') {
    const rows = await db.all(
      `SELECT id, type, message, is_read, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC ${limitClause(NOTIF_ROW_LIMIT)}`,
      [userId]
    );
    return { rows, updatedAt };
  }

  const m = key.match(/^leaderboard:(freeplay|daily):(ranked|offline)$/);
  if (m) {
    const variant = m[1];
    const source = m[2];
    // Variant filter uses scores.mode (gameplay mode). source filter is the
    // CS52 provenance column. Note: legacy rows stay excluded from public LBs.
    const dateFilter = variant === 'daily' && db.dialect !== 'mssql'
      ? "AND date(s.played_at) = date('now')"
      : variant === 'daily' && db.dialect === 'mssql'
        ? "AND CAST(s.played_at AS DATE) = CAST(GETUTCDATE() AS DATE)"
        : '';
    const rows = await db.all(
      `SELECT s.id, s.score, s.correct_count, s.total_rounds, s.best_streak, s.played_at,
              u.username, u.id as user_id
       FROM scores s JOIN users u ON s.user_id = u.id
       WHERE s.mode = ? AND s.source = ? ${dateFilter}
       ORDER BY s.score DESC ${limitClause(LB_ROW_LIMIT)}`,
      [variant, source]
    );
    return {
      rows: rows.map((r, i) => ({
        rank: i + 1,
        username: r.username,
        score: r.score,
        correctCount: r.correct_count,
        totalRounds: r.total_rounds,
        bestStreak: r.best_streak,
        playedAt: r.played_at,
        isCurrentUser: r.user_id === userId,
      })),
      cursor: updatedAt,
      updatedAt,
    };
  }

  return { rows: [], updatedAt };
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    // Boot-quiet contract: gesture-driven only.
    if (req.headers['x-user-activity'] !== '1') {
      return res.status(400).json({ error: 'X-User-Activity header required' });
    }

    const userId = req.user.id;
    const body = req.body || {};
    const queuedRecords = Array.isArray(body.queuedRecords) ? body.queuedRecords : [];
    const revalidate = (body.revalidate && typeof body.revalidate === 'object') ? body.revalidate : {};

    if (queuedRecords.length > MAX_QUEUED_RECORDS) {
      return res.status(400).json({ error: `queuedRecords exceeds max ${MAX_QUEUED_RECORDS}` });
    }

    let db;
    try {
      db = await getDbAdapter();
    } catch (err) {
      // TODO(CS52-7e): persist queuedRecords to durable per-request file and
      // return 202 with queuedRequestIds (mutually exclusive with 200 fields).
      const u = getDbUnavailability(err);
      if (u) return sendUnavailable(res, u);
      throw err;
    }

    // Verify user still exists in DB (token may reference deleted user).
    const userExists = await db.get('SELECT 1 FROM users WHERE id = ?', [userId]);
    if (!userExists) {
      return res.status(401).json({ error: 'User not found — please log in again' });
    }

    logger.info({
      event: 'sync_request_received',
      user_id: userId,
      queued_count: queuedRecords.length,
      revalidate_keys: Object.keys(revalidate),
    }, 'POST /api/sync received');

    const acked = [];
    const rejected = [];

    for (const [recordIndex, raw] of queuedRecords.entries()) {
      if (!raw || typeof raw !== 'object' || !raw.client_game_id) {
        // Always emit a structured rejection + warn log for these so a
        // corrupted L1 entry (e.g. missing client_game_id) is visible in
        // logs and the client/operator can detect and remediate instead of
        // silently retrying forever.
        const clientGameId = (raw && typeof raw === 'object' && raw.client_game_id !== undefined)
          ? raw.client_game_id
          : null;
        rejected.push({ client_game_id: clientGameId, reason: 'invalid_payload' });
        logger.warn({
          event: 'sync_record_rejected',
          user_id: userId,
          client_game_id: clientGameId,
          record_index: recordIndex,
          reason: 'invalid_payload',
        }, 'sync record rejected: missing or invalid client_game_id');
        continue;
      }
      if (!isValidCompletedAt(raw.completed_at)) {
        rejected.push({ client_game_id: raw.client_game_id, reason: 'invalid_payload' });
        logger.warn({
          event: 'sync_record_rejected',
          user_id: userId,
          client_game_id: raw.client_game_id,
          reason: 'invalid_payload',
        }, 'sync record rejected: invalid completed_at');
        continue;
      }
      if (raw.mode != null && !VALID_MODES.has(String(raw.mode))) {
        // Match the legacy POST /api/scores validator (server/routes/scores.js).
        // Records with unrecognized mode values would otherwise pollute the
        // scores table and downstream profile/leaderboard queries.
        rejected.push({ client_game_id: raw.client_game_id, reason: 'invalid_payload' });
        logger.warn({
          event: 'sync_record_rejected',
          user_id: userId,
          client_game_id: raw.client_game_id,
          reason: 'invalid_payload',
        }, 'sync record rejected: unsupported mode');
        continue;
      }

      try {
        const result = await processRecord(db, userId, raw);
        if (result === 'acked') {
          acked.push(raw.client_game_id);
          logger.info({
            event: 'sync_record_acked',
            user_id: userId,
            client_game_id: raw.client_game_id,
          }, 'sync record acked');
        } else {
          rejected.push({ client_game_id: raw.client_game_id, reason: 'conflict_with_existing' });
          logger.warn({
            event: 'sync_record_rejected',
            user_id: userId,
            client_game_id: raw.client_game_id,
            reason: 'conflict_with_existing',
          }, 'sync record rejected: payload_hash mismatch on existing client_game_id');
        }
      } catch (err) {
        const u = getDbUnavailability(err);
        if (u) {
          // TODO(CS52-7e): partial enqueue + 202.
          return sendUnavailable(res, u);
        }
        // Per-record failure — log + continue so the rest of the batch succeeds.
        logger.error({
          err,
          event: 'sync_record_error',
          user_id: userId,
          client_game_id: raw.client_game_id,
        }, 'sync record write failed');
      }
    }

    const entities = {};
    for (const key of Object.keys(revalidate)) {
      if (!VALID_REVALIDATE_KEYS.has(key)) continue;
      try {
        entities[key] = await fetchEntity(db, key, userId);
      } catch (err) {
        const u = getDbUnavailability(err);
        if (u) return sendUnavailable(res, u);
        logger.warn({ err, key }, 'sync revalidate entity failed; partial response');
      }
    }

    res.status(200).json({ acked, rejected, entities });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.computePayloadHash = computePayloadHash;
