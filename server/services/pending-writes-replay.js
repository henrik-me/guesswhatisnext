'use strict';

/**
 * CS52-7e — replay handlers for the three `pending_writes` variants.
 *
 * Each handler is invoked by the drain worker (server/lib/pending-writes.js)
 * with the parsed JSON record. The handler must:
 *   - Be idempotent (drain may legitimately re-run after a partial failure).
 *   - Throw with `err.transient = true` when the DB is still unavailable so
 *     the drain pauses instead of dead-lettering.
 *   - Throw a plain Error for non-retryable failures (corrupt file, schema
 *     violation, etc.) — the drain will move the file to `dead/`.
 */

const { getDbAdapter } = require('../db');
const { computeFinalScore } = require('./scoringService');
const { computePayloadHash, processRecord } = require('../routes/sync');
const { getDbUnavailability, isTransientDbError } = require('../lib/transient-db-error');
const logger = require('../logger');

// Mirror server/routes/sync.js's VALID_MODES so a record that would have been
// rejected by the live route's pre-processRecord validators is also rejected
// at replay time. Without this mirror, the 202 enqueue path would let unknown
// `mode` values into the scores table when the queue eventually drains.
const REPLAY_VALID_MODES = new Set(['freeplay', 'daily']);

function isValidCompletedAtForReplay(v) {
  if (v == null) return true;
  const d = new Date(v);
  return !Number.isNaN(d.getTime());
}

function tagTransientIfDbUnavailable(err) {
  const u = getDbUnavailability(err);
  if (u) {
    const wrapped = new Error(`pending-writes replay paused: ${u.reason}`);
    wrapped.name = 'PendingWritesTransient';
    wrapped.transient = true;
    wrapped.cause = err;
    return wrapped;
  }
  // Tag ordinary transient DB failures (SQLITE_BUSY/LOCKED, MSSQL connection
  // resets/timeouts, mssql transient error numbers) so a temporary hiccup
  // mid-replay pauses the drain instead of dead-lettering the queued write.
  // We probe both dialects because the dialect isn't always known when
  // `getDbAdapter()` itself threw.
  if (isTransientDbError(err, 'mssql') || isTransientDbError(err, 'sqlite')) {
    const wrapped = new Error(`pending-writes replay paused: transient DB error`);
    wrapped.name = 'PendingWritesTransient';
    wrapped.transient = true;
    wrapped.cause = err;
    return wrapped;
  }
  return err;
}

/**
 * Variant A — POST /api/sessions/:id/finish
 *
 * Idempotency: skip if the row is already `status='finished'` with a non-
 * null `score` (live-write succeeded after the file was queued, or a
 * previous drain replayed). Skip if status is `abandoned`/`expired`.
 */
async function replayFinish(record) {
  if (!record || !record.concrete_route || !record.concrete_route.session_id) {
    throw new Error('pending-writes Variant A missing concrete_route.session_id');
  }
  if (typeof record.user_id !== 'number') {
    throw new Error('pending-writes Variant A missing user_id');
  }
  let db;
  try {
    db = await getDbAdapter();
  } catch (err) {
    throw tagTransientIfDbUnavailable(err);
  }

  const sessionId = record.concrete_route.session_id;
  const userId = record.user_id;

  let session;
  try {
    session = await db.get(
      `SELECT id, user_id, mode, config_snapshot, status, score
         FROM ranked_sessions WHERE id = ?`,
      [sessionId]
    );
  } catch (err) {
    throw tagTransientIfDbUnavailable(err);
  }

  if (!session) {
    // No row matches — original /api/sessions create never landed (a
    // realistic case if DB was down at that point too). Nothing to do;
    // dropping the file is correct.
    logger.info(
      { event: 'pending-writes-replay-noop-no-session', request_id: record.request_id, sessionId },
      'pending-writes: replay /finish noop — session row absent'
    );
    return;
  }
  if (session.user_id !== userId) {
    throw new Error(`session ${sessionId} user_id mismatch (file=${userId}, db=${session.user_id})`);
  }
  if (session.status === 'finished' && session.score != null) {
    return; // idempotent: already finished
  }
  if (session.status !== 'in_progress') {
    // Abandoned / expired by reconciliation — file is stale, drop it.
    logger.info(
      {
        event: 'pending-writes-replay-noop-not-in-progress',
        request_id: record.request_id,
        sessionId,
        status: session.status,
      },
      'pending-writes: replay /finish noop — session no longer in_progress'
    );
    return;
  }

  let config;
  try {
    config = typeof session.config_snapshot === 'string'
      ? JSON.parse(session.config_snapshot)
      : session.config_snapshot;
  } catch {
    throw new Error(`session ${sessionId} has unparseable config_snapshot`);
  }

  let events;
  try {
    events = await db.all(
      `SELECT round_num, puzzle_id, answer, correct, round_started_at,
              received_at, elapsed_ms, client_time_ms
         FROM ranked_session_events
        WHERE session_id = ?
        ORDER BY round_num ASC`,
      [sessionId]
    );
  } catch (err) {
    throw tagTransientIfDbUnavailable(err);
  }
  if (events.length < config.rounds) {
    throw new Error(
      `session ${sessionId} has only ${events.length}/${config.rounds} answered rounds — cannot finish`
    );
  }

  const final = computeFinalScore(events, config);
  const finishedAtIso = new Date().toISOString();
  const legacyMode = session.mode === 'ranked_daily' ? 'daily' : 'freeplay';
  const variant = session.mode === 'ranked_daily' ? 'daily' : 'freeplay';

  try {
    await db.transaction(async (tx) => {
      const upd = await tx.run(
        `UPDATE ranked_sessions
            SET status = 'finished',
                score = ?,
                correct_count = ?,
                best_streak = ?,
                finished_at = ?
          WHERE id = ? AND status = 'in_progress'`,
        [final.score, final.correctCount, final.bestStreak, finishedAtIso, sessionId]
      );
      if (!upd.changes) return; // race: live /finish won; idempotent skip.
      await tx.run(
        `INSERT INTO scores
           (user_id, mode, score, correct_count, total_rounds, best_streak,
            source, variant, client_game_id)
         VALUES (?, ?, ?, ?, ?, ?, 'ranked', ?, NULL)`,
        [
          userId,
          legacyMode,
          final.score,
          final.correctCount,
          config.rounds,
          final.bestStreak,
          variant,
        ]
      );
    });
  } catch (err) {
    throw tagTransientIfDbUnavailable(err);
  }
}

/**
 * Variant B — POST /api/sync
 *
 * Per-record `(user_id, client_game_id)` upsert via the same `processRecord`
 * helper the live route uses. Idempotency / payload-hash conflict semantics
 * are inherited from that helper.
 */
async function replaySync(record) {
  if (!record || !record.payload || !Array.isArray(record.payload.queuedRecords)) {
    throw new Error('pending-writes Variant B missing payload.queuedRecords');
  }
  if (typeof record.user_id !== 'number') {
    throw new Error('pending-writes Variant B missing user_id');
  }
  let db;
  try {
    db = await getDbAdapter();
  } catch (err) {
    throw tagTransientIfDbUnavailable(err);
  }

  for (const raw of record.payload.queuedRecords) {
    if (!raw || typeof raw !== 'object' || !raw.client_game_id) continue;
    // Mirror the live POST /api/sync validators: drop records the live
    // route would have rejected with `reason='invalid_payload'`. Doing
    // this here (in addition to skipping the bad records on the 202 path)
    // is defense in depth — handcrafted queue files or older schema
    // versions can't slip past these checks at replay.
    if (!isValidCompletedAtForReplay(raw.completed_at)) {
      logger.warn(
        { event: 'pending-writes-replay-skip-record', reason: 'invalid_completed_at',
          request_id: record.request_id, client_game_id: raw.client_game_id },
        'pending-writes: replay skipped record (invalid completed_at)'
      );
      continue;
    }
    if (raw.mode != null && !REPLAY_VALID_MODES.has(String(raw.mode))) {
      logger.warn(
        { event: 'pending-writes-replay-skip-record', reason: 'invalid_mode',
          request_id: record.request_id, client_game_id: raw.client_game_id, mode: raw.mode },
        'pending-writes: replay skipped record (invalid mode)'
      );
      continue;
    }
    try {
      await processRecord(db, record.user_id, raw);
    } catch (err) {
      throw tagTransientIfDbUnavailable(err);
    }
  }
}

/**
 * Variant C — INTERNAL multiplayer-match-completion
 *
 * Idempotency: if any `ranked_sessions` row already exists for this
 * `match_id`, the file is dropped (live write or earlier drain succeeded).
 * Otherwise, a single transaction inserts one ranked_sessions row per
 * participant + N ranked_session_events rows per participant.
 *
 * NOTE (CS52-7d): the WS handler does not yet enqueue Variant C records —
 * that work lands in CS52-7d. This handler exists so the queue + drain
 * code paths can be exercised end-to-end now (including by tests), and
 * so CS52-7d only needs to wire the producer side.
 */
async function replayMpMatch(record) {
  if (!record || !record.concrete_route || !record.concrete_route.match_id) {
    throw new Error('pending-writes Variant C missing concrete_route.match_id');
  }
  if (!record.payload || !Array.isArray(record.payload.participants)) {
    throw new Error('pending-writes Variant C missing payload.participants');
  }
  let db;
  try {
    db = await getDbAdapter();
  } catch (err) {
    throw tagTransientIfDbUnavailable(err);
  }

  const matchId = record.concrete_route.match_id;
  const roomCode = record.concrete_route.room_code || null;
  let existing;
  try {
    existing = await db.get(
      `SELECT id FROM ranked_sessions WHERE match_id = ?`,
      [String(matchId)]
    );
  } catch (err) {
    throw tagTransientIfDbUnavailable(err);
  }
  if (existing) return; // idempotent on match_id

  const config = record.payload.config_snapshot || {};
  const startedAt = record.payload.started_at || new Date().toISOString();
  const finishedAt = record.payload.finished_at || new Date().toISOString();
  const configJson = JSON.stringify(config);

  try {
    await db.transaction(async (tx) => {
      // CS52-7d: keep legacy matches/match_players in sync alongside the
      // new ranked_sessions rows (the live MP path also writes both inside
      // a single transaction). Without this, `/api/match-history` and the
      // legacy MP leaderboard would not see the replayed match.
      // CS52-7d (Copilot R3): mirror the live MP path — use DB-side
      // CURRENT_TIMESTAMP for legacy `matches`/`match_players` DATETIME
      // columns instead of binding an ISO-Z string. The replay timestamp
      // (when DB came back) is the most useful value here anyway, and we
      // avoid the implicit string→DATETIME conversion path that has been
      // brittle on Azure SQL (done_cs18_mssql-production-fixes.md). The
      // ranked_sessions row below still takes `finishedAt` (the original
      // captured value) so the started_at/finished_at/expires_at columns
      // remain mutually consistent for that row.
      await tx.run(
        `UPDATE matches SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [matchId]
      );
      for (const p of record.payload.participants) {
        if (!p || !p.ranked_session_id || typeof p.user_id !== 'number') {
          throw new Error(`Variant C participant missing ranked_session_id/user_id`);
        }
        await tx.run(
          `UPDATE match_players SET score = ?, finished_at = CURRENT_TIMESTAMP WHERE match_id = ? AND user_id = ?`,
          [p.score || 0, matchId, p.user_id]
        );
        await tx.run(
          `INSERT INTO ranked_sessions
             (id, user_id, mode, match_id, room_code, config_snapshot, status,
              score, correct_count, best_streak, started_at, finished_at, expires_at)
           VALUES (?, ?, 'multiplayer', ?, ?, ?, 'finished', ?, ?, ?, ?, ?, ?)`,
          [
            p.ranked_session_id,
            p.user_id,
            String(matchId),
            roomCode,
            configJson,
            p.score || 0,
            p.correct_count || 0,
            p.best_streak || 0,
            startedAt,
            finishedAt,
            finishedAt,
          ]
        );
        const events = Array.isArray(p.events) ? p.events : [];
        for (const ev of events) {
          await tx.run(
            `INSERT INTO ranked_session_events
               (session_id, round_num, puzzle_id, answer, correct,
                round_started_at, received_at, elapsed_ms, client_time_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              p.ranked_session_id,
              ev.round_num,
              ev.puzzle_id,
              ev.answer == null ? '' : String(ev.answer),
              ev.correct ? 1 : 0,
              ev.round_started_at,
              ev.received_at,
              ev.elapsed_ms,
              ev.client_time_ms == null ? null : ev.client_time_ms,
            ]
          );
        }
      }
    });
  } catch (err) {
    throw tagTransientIfDbUnavailable(err);
  }

  logger.info(
    {
      event: 'multiplayer_match_replayed',
      match_id: matchId,
      room_code: roomCode,
      participant_count: record.payload.participants.length,
      drain_request_id: record.request_id || null,
    },
    'multiplayer match replayed from pending_writes Variant C'
  );
}

const REPLAY_HANDLERS = {
  'POST /api/sessions/:id/finish': replayFinish,
  'POST /api/sync': replaySync,
  'INTERNAL multiplayer-match-completion': replayMpMatch,
};

// Mark `computePayloadHash` as referenced — exposed for tests that build
// Variant B records with the canonical hash. Bundlers / linters otherwise
// flag the require as unused since only `processRecord` is invoked here.
void computePayloadHash;

module.exports = {
  REPLAY_HANDLERS,
  replayFinish,
  replaySync,
  replayMpMatch,
};
