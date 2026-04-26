/**
 * Ranked session routes (CS52-3).
 *
 * Mounted at `/api/sessions`.
 *
 * Endpoints:
 *   POST   /api/sessions                       - create a ranked session (returns round 0)
 *   POST   /api/sessions/:id/answer            - submit an answer for the current round
 *   POST   /api/sessions/:id/next-round        - dispatch the next puzzle (425-gated)
 *   POST   /api/sessions/:id/finish            - finalize and persist score
 *
 * Design contract:
 *   project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § Ranked session lifecycle (CS52-3) + § Server-side in-band reconciliation
 *
 * Anti-cheat (CS52 Decision #7):
 *   - puzzle.answer is NEVER returned to the client through any endpoint.
 *   - elapsed_ms is server-derived (received_at − round_started_at).
 *   - client_time_ms is telemetry only; never scored.
 *   - In-band reconciliation runs at the top of every session-mutating endpoint
 *     (no background sweeper, per the no-DB-waking-work rule).
 *   - "One active ranked session per user" + "one Ranked Daily per
 *     (user, daily_utc_date)" are enforced by filtered UNIQUE INDEXes in
 *     migration 008 — the route catches the constraint violation and
 *     returns 409 rather than racing through application checks.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const { getDbAdapter } = require('../db');
const { requireAuth } = require('../middleware/auth');
const logger = require('../logger');
const {
  computeFinalScore,
  validateAnswerEvent,
} = require('../services/scoringService');
const { getDbUnavailability } = require('../lib/transient-db-error');
const {
  getDbUnavailabilityState,
  setDbUnavailabilityState,
} = require('../lib/db-unavailability-state');
const pendingWrites = require('../lib/pending-writes');

const router = express.Router();

// ── Constants ────────────────────────────────────────────────────────────

const SUPPORTED_MODES = new Set(['ranked_freeplay', 'ranked_daily']);

// Code-level defaults per CS52 Decision #4. Source of truth at boot — a
// `game_configs` row may override per environment (CS52-7c provides the
// shared loader; until that lands we read the row inline here).
// TODO(CS52-7c): replace inline fallback with the shared loader once merged.
const DEFAULT_CONFIGS = {
  ranked_freeplay: { rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0 },
  ranked_daily: { rounds: 10, round_timer_ms: 15000, inter_round_delay_ms: 0 },
};

// Slack added to expires_at so a player who answers right at the buzzer
// each round still has a comfortable window to /finish.
const EXPIRY_SLACK_MS = 30000;

// ── In-process state ─────────────────────────────────────────────────────
//
// `dispatchedRounds` holds the currently-dispatched round per session, keyed
// by sessionId. This is process-local: if the process restarts mid-session,
// the session is effectively expired (acceptable per CS52-3 plan — session
// expiry handles it; abandoned sessions don't count against quotas).
//
// **Multi-process / horizontal-scale caveat (documented design limitation):**
// only one process can correctly serve `/answer` and `/next-round` for a
// given session, because the round-dispatch state lives only here. The
// existing deploy is single-instance, and CS52-7d reuses this service from
// the WS handler in the same process. If/when we go horizontal, this map
// must move to shared storage (Redis or a `ranked_dispatched_rounds` row).
//
// Shape per entry:
//   { round_num, puzzle_id, puzzle: { id, prompt, options, answer },
//     round_started_at_ms, last_answer_received_at_ms }
//
// `last_answer_received_at_ms` is set when /answer is processed for that
// round; /next-round uses it to enforce inter_round_delay_ms (425 gate).
// `puzzle.answer` lives only in this map — never persisted in a way the
// client can see, never returned through an HTTP response.
const dispatchedRounds = new Map();

// ── Per-session mutex ────────────────────────────────────────────────────
//
// The four endpoints (/answer, /next-round, /finish) all read-modify-write
// the same in-process dispatched-round entry plus the same DB row. To prevent
// double-tap races (two simultaneous /answer requests for the same round
// both inserting an event row, two simultaneous /next-round both dispatching
// round N+1, etc.), each session-scoped mutating handler runs inside a
// per-session promise chain. This is correct for a single process; it is
// the same process-local assumption that `dispatchedRounds` already lives
// under. See the multi-process caveat above.
const sessionLocks = new Map();
function withSessionLock(sessionId, fn) {
  const prev = sessionLocks.get(sessionId) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => fn());
  sessionLocks.set(sessionId, next);
  // Keep map bounded: drop the entry once nothing else is queued behind it.
  next.finally(() => {
    if (sessionLocks.get(sessionId) === next) sessionLocks.delete(sessionId);
  });
  return next;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function nowIso(ms = Date.now()) {
  return new Date(ms).toISOString();
}

function todayUtcDate(ms = Date.now()) {
  // YYYY-MM-DD (UTC). Used as the daily_utc_date snapshot for ranked_daily.
  return new Date(ms).toISOString().slice(0, 10);
}

function isUniqueViolation(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  // SQLite: "UNIQUE constraint failed: ranked_sessions.user_id"
  // mssql:  "Cannot insert duplicate key row in object 'dbo.ranked_sessions'
  //          with unique index 'idx_ranked_sessions_user_active'"
  return /unique constraint failed|duplicate key|cannot insert duplicate/i.test(msg);
}

function stripAnswer(puzzle) {
  // Defence-in-depth: never return `answer` to the client.
  // eslint-disable-next-line no-unused-vars
  const { answer, ...safe } = puzzle;
  return safe;
}

function deserializePuzzle(row) {
  // ranked_puzzles stores prompt + options as JSON strings.
  return {
    id: row.id,
    prompt: safeJsonParse(row.prompt),
    options: safeJsonParse(row.options),
    answer: row.answer,
    category: row.category,
    difficulty: row.difficulty,
  };
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

async function loadConfig(db, mode) {
  // TODO(CS52-7c): switch to shared loader (cached, code-default fallback).
  const row = await db.get(
    'SELECT rounds, round_timer_ms, inter_round_delay_ms FROM game_configs WHERE mode = ?',
    [mode]
  );
  if (row) {
    return {
      rounds: row.rounds,
      round_timer_ms: row.round_timer_ms,
      inter_round_delay_ms: row.inter_round_delay_ms,
    };
  }
  return { ...DEFAULT_CONFIGS[mode] };
}

/**
 * In-band reconciliation UPDATE: any in_progress row for this user that
 * has expired is flipped to 'abandoned'. Runs at the top of every
 * session-mutating endpoint (per CS52 § Server-side in-band reconciliation).
 * No background sweeper — reconciliation rides on the next user request.
 *
 * Also evicts any in-process dispatched-round entries belonging to the now-
 * abandoned sessions so the `dispatchedRounds` Map doesn't leak (caps memory
 * at "live in-progress sessions on this process" instead of "all sessions
 * this process has ever served").
 */
async function reconcileExpiredSessions(db, userId, nowMs) {
  const nowS = nowIso(nowMs);
  // Snapshot the about-to-be-reconciled session ids first so we can evict
  // their in-process state. The two queries are not transactional with
  // each other; that's OK — even if a session expires between SELECT and
  // UPDATE, the next reconciliation call will catch it. Worst case: a
  // dispatched-round entry briefly survives a process-local race.
  const stale = await db.all(
    `SELECT id FROM ranked_sessions
       WHERE user_id = ? AND status = 'in_progress' AND expires_at < ?`,
    [userId, nowS]
  );
  const result = await db.run(
    `UPDATE ranked_sessions
        SET status = 'abandoned', finished_at = ?
      WHERE user_id = ?
        AND status = 'in_progress'
        AND expires_at < ?`,
    [nowS, userId, nowS]
  );
  for (const row of stale) dispatchedRounds.delete(row.id);
  if (result && result.changes > 0) {
    logger.info(
      { userId, reconciledCount: result.changes },
      'ranked-session reconciled-by-request'
    );
  }
}

async function pickNextPuzzle(db, alreadyServedIds) {
  // Pick a random active puzzle, excluding any already served in this session.
  // Using ORDER BY RANDOM() keeps it portable; if the pool grows large we can
  // switch to OFFSET-based sampling — for ~50 puzzles + ~10 rounds it's fine.
  const placeholders = alreadyServedIds.map(() => '?').join(',');
  const where = alreadyServedIds.length
    ? `WHERE status = 'active' AND id NOT IN (${placeholders})`
    : `WHERE status = 'active'`;
  const orderBy = db.dialect === 'mssql' ? 'ORDER BY NEWID()' : 'ORDER BY RANDOM()';
  const sql = `
    SELECT id, category, prompt, options, answer, difficulty
      FROM ranked_puzzles
      ${where}
      ${orderBy}
    ${db.dialect === 'mssql' ? 'OFFSET 0 ROWS FETCH NEXT 1 ROW ONLY' : 'LIMIT 1'}
  `;
  const row = await db.get(sql, alreadyServedIds);
  return row ? deserializePuzzle(row) : null;
}

async function loadSessionForUser(db, sessionId, userId) {
  const row = await db.get(
    `SELECT id, user_id, mode, config_snapshot, status, score, correct_count,
            best_streak, started_at, finished_at, expires_at, daily_utc_date
       FROM ranked_sessions WHERE id = ?`,
    [sessionId]
  );
  if (!row) return null;
  if (row.user_id !== userId) return null;
  row.config_snapshot = safeJsonParse(row.config_snapshot);
  return row;
}

async function getSessionEvents(db, sessionId) {
  return db.all(
    `SELECT round_num, puzzle_id, answer, correct, round_started_at,
            received_at, elapsed_ms, client_time_ms
       FROM ranked_session_events
      WHERE session_id = ?
      ORDER BY round_num ASC`,
    [sessionId]
  );
}

function logAntiCheat(sessionId, reason, extra = {}) {
  logger.warn(
    { sessionId, reason, gate: 'ranked-anti-cheat', ...extra },
    'ranked-session anti-cheat-rejection'
  );
}

// ── Routes ───────────────────────────────────────────────────────────────

/**
 * POST /api/sessions
 * Create a new ranked session and dispatch round 0.
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { mode } = req.body || {};
    if (!mode || !SUPPORTED_MODES.has(mode)) {
      return res.status(400).json({
        error: 'mode must be ranked_freeplay or ranked_daily',
      });
    }
    if (req.user.role === 'system') {
      return res.status(400).json({ error: 'ranked sessions require a user account' });
    }

    const db = await getDbAdapter();
    const userId = req.user.id;
    const nowMs = Date.now();

    await reconcileExpiredSessions(db, userId, nowMs);

    // Daily uniqueness pre-check (the filtered UNIQUE index only fires when
    // BOTH rows are status='finished', so explicit guard is required at
    // create-time too).
    const todayUtc = todayUtcDate(nowMs);
    if (mode === 'ranked_daily') {
      const dup = await db.get(
        `SELECT id FROM ranked_sessions
          WHERE user_id = ? AND mode = 'ranked_daily'
            AND status = 'finished' AND daily_utc_date = ?`,
        [userId, todayUtc]
      );
      if (dup) {
        logAntiCheat(dup.id, 'already-played-daily', { userId, dailyUtcDate: todayUtc });
        return res.status(409).json({
          error: 'already played Ranked Daily today',
          reason: 'already-played-daily',
        });
      }
    }

    const config = await loadConfig(db, mode);
    const sessionId = crypto.randomUUID();
    const startedAtMs = nowMs;
    const expiresAtMs =
      startedAtMs +
      config.rounds * (config.round_timer_ms + config.inter_round_delay_ms) +
      EXPIRY_SLACK_MS;

    try {
      await db.run(
        `INSERT INTO ranked_sessions
           (id, user_id, mode, config_snapshot, status,
            started_at, expires_at, daily_utc_date)
         VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
        [
          sessionId,
          userId,
          mode,
          JSON.stringify(config),
          nowIso(startedAtMs),
          nowIso(expiresAtMs),
          mode === 'ranked_daily' ? todayUtc : null,
        ]
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        logAntiCheat(sessionId, 'concurrent-active-session', { userId });
        return res.status(409).json({
          error: 'user already has an active ranked session',
          reason: 'active-session-exists',
        });
      }
      throw err;
    }

    // Pre-fetch round 0.
    const puzzle = await pickNextPuzzle(db, []);
    if (!puzzle) {
      // No active ranked puzzles — fail loud. Roll back the session row.
      await db.run(
        `UPDATE ranked_sessions SET status = 'abandoned', finished_at = ?
           WHERE id = ?`,
        [nowIso(), sessionId]
      );
      logger.error({ sessionId, userId }, 'ranked-session no-active-puzzles');
      return res.status(503).json({ error: 'no ranked puzzles available' });
    }
    const dispatchedAtMs = Date.now();
    dispatchedRounds.set(sessionId, {
      round_num: 0,
      puzzle_id: puzzle.id,
      puzzle,
      round_started_at_ms: dispatchedAtMs,
      last_answer_received_at_ms: null,
    });

    logger.info(
      {
        sessionId,
        userId,
        mode,
        expiresAt: nowIso(expiresAtMs),
        dailyUtcDate: mode === 'ranked_daily' ? todayUtc : null,
      },
      'ranked-session created'
    );

    return res.status(201).json({
      sessionId,
      expiresAt: nowIso(expiresAtMs),
      config: {
        rounds: config.rounds,
        roundTimerMs: config.round_timer_ms,
        interRoundDelayMs: config.inter_round_delay_ms,
      },
      round0: {
        round_num: 0,
        puzzle: stripAnswer(puzzle),
        dispatched_at: nowIso(dispatchedAtMs),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:id/answer
 */
router.post('/:id/answer', requireAuth, async (req, res, next) => {
  const sessionId = req.params.id;
  return withSessionLock(sessionId, async () => {
    try {
      const { round_num, puzzle_id, answer, client_time_ms } = req.body || {};
      if (round_num == null || !puzzle_id || answer == null) {
        return res.status(400).json({ error: 'round_num, puzzle_id, answer required' });
      }
      const db = await getDbAdapter();
      const nowMs = Date.now();
      const userId = req.user.id;

      await reconcileExpiredSessions(db, userId, nowMs);

      const session = await loadSessionForUser(db, sessionId, userId);
      if (!session) return res.status(404).json({ error: 'session not found' });

      const dispatched = dispatchedRounds.get(sessionId);
      const validation = validateAnswerEvent({
        session,
        dispatchedRound: dispatched,
        roundNum: round_num,
        puzzleId: puzzle_id,
        submittedAnswer: answer,
        receivedAtMs: nowMs,
        configSnapshot: session.config_snapshot,
      });
      if (!validation.ok) {
        logAntiCheat(sessionId, validation.error, {
          userId,
          roundNum: round_num,
          puzzleId: puzzle_id,
        });
        const status = validation.error === 'expired' ? 410 : 400;
        return res.status(status).json({ error: validation.error });
      }

      const { correct, elapsedMs } = validation;
      const clientMs =
        client_time_ms == null || Number.isNaN(Number(client_time_ms))
          ? null
          : Math.trunc(Number(client_time_ms));

      // Insert with PK (session_id, round_num) — if a duplicate slips through
      // the per-session lock (e.g. inside a multi-process deploy), the unique
      // PK will fire and we map it to the same anti-cheat 409 path.
      try {
        await db.run(
          `INSERT INTO ranked_session_events
             (session_id, round_num, puzzle_id, answer, correct,
              round_started_at, received_at, elapsed_ms, client_time_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            round_num,
            puzzle_id,
            String(answer),
            correct,
            nowIso(dispatched.round_started_at_ms),
            nowIso(nowMs),
            elapsedMs,
            clientMs,
          ]
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          logAntiCheat(sessionId, 'duplicate-answer', { userId, roundNum: round_num });
          return res.status(409).json({ error: 'answer already recorded for this round' });
        }
        throw err;
      }
      dispatched.last_answer_received_at_ms = nowMs;

      // Recompute running score from all events so far (cheap — at most
      // `rounds` events). Also derives newStreak for the response.
      const events = await getSessionEvents(db, sessionId);
      const { score: runningScore } = computeFinalScore(events, session.config_snapshot);

      logger.info(
        {
          sessionId,
          userId,
          roundNum: round_num,
          correct,
          elapsedMs,
          clientTimeMs: clientMs,
          clientTimeMsDiff: clientMs == null ? null : clientMs - elapsedMs,
        },
        'ranked-session answer-received'
      );

      return res.status(200).json({
        correct: !!correct,
        runningScore,
        elapsed_ms: elapsedMs,
      });
    } catch (err) {
      next(err);
      return undefined;
    }
  });
});

/**
 * POST /api/sessions/:id/next-round
 */
router.post('/:id/next-round', requireAuth, async (req, res, next) => {
  const sessionId = req.params.id;
  return withSessionLock(sessionId, async () => {
    try {
      const db = await getDbAdapter();
      const nowMs = Date.now();
      const userId = req.user.id;

      await reconcileExpiredSessions(db, userId, nowMs);

      const session = await loadSessionForUser(db, sessionId, userId);
      if (!session) return res.status(404).json({ error: 'session not found' });
      if (session.status !== 'in_progress') {
        return res.status(409).json({ error: `session is ${session.status}` });
      }
      if (Date.parse(session.expires_at) <= nowMs) {
        return res.status(410).json({ error: 'expired' });
      }

      const events = await getSessionEvents(db, sessionId);
      const dispatched = dispatchedRounds.get(sessionId);

      // Must have answered the current round before advancing.
      if (!dispatched || dispatched.last_answer_received_at_ms == null) {
        return res.status(409).json({ error: 'no current answer to advance from' });
      }

      // Atomic "advance once" guard: the dispatched round_num must equal
      // the most recently answered round (events.length - 1). If a parallel
      // /next-round already advanced (concurrent double-tap that slipped past
      // the lock in a multi-process deploy), this returns 409 instead of
      // dispatching round N+2 over the top of round N+1.
      const expectedDispatchedRound = events.length - 1;
      if (dispatched.round_num !== expectedDispatchedRound) {
        return res.status(409).json({ error: 'next round already dispatched' });
      }

      // All rounds answered → can't dispatch another.
      if (events.length >= session.config_snapshot.rounds) {
        return res.status(409).json({ error: 'session already finished' });
      }

      const interDelayMs = session.config_snapshot.inter_round_delay_ms || 0;
      const earliestNextMs = dispatched.last_answer_received_at_ms + interDelayMs;
      if (nowMs < earliestNextMs) {
        const retryMs = earliestNextMs - nowMs;
        res.set('Retry-After', String(Math.max(1, Math.ceil(retryMs / 1000))));
        return res.status(425).json({
          error: 'too early',
          retryAfterMs: retryMs,
        });
      }

      const servedIds = events.map((e) => e.puzzle_id);
      const puzzle = await pickNextPuzzle(db, servedIds);
      if (!puzzle) {
        logger.error({ sessionId, userId }, 'ranked-session puzzle-pool-exhausted');
        return res.status(503).json({ error: 'puzzle pool exhausted' });
      }

      const nextRoundNum = events.length; // next round = number of completed answers
      const dispatchedAtMs = Date.now();
      dispatchedRounds.set(sessionId, {
        round_num: nextRoundNum,
        puzzle_id: puzzle.id,
        puzzle,
        round_started_at_ms: dispatchedAtMs,
        last_answer_received_at_ms: null,
      });

      return res.status(200).json({
        round_num: nextRoundNum,
        puzzle: stripAnswer(puzzle),
        dispatched_at: nowIso(dispatchedAtMs),
      });
    } catch (err) {
      next(err);
      return undefined;
    }
  });
});

/**
 * POST /api/sessions/:id/finish
 */
router.post('/:id/finish', requireAuth, async (req, res, next) => {
  const sessionId = req.params.id;
  return withSessionLock(sessionId, async () => {
    try {
      // CS52-7e — preflight DB-unavailable check. If a previous request
      // (or the cold-start init) flagged the DB as unavailable, persist a
      // Variant A pending_writes file and return 202. Replay drains when
      // the DB is back; idempotency is handled by the replay handler.
      const preState = getDbUnavailabilityState();
      if (preState) {
        return await enqueueFinishAndRespond(req, res, sessionId, preState);
      }

      let db;
      try {
        db = await getDbAdapter();
      } catch (err) {
        const u = getDbUnavailability(err);
        if (u) {
          setDbUnavailabilityState(u);
          return await enqueueFinishAndRespond(req, res, sessionId, u);
        }
        throw err;
      }
      const nowMs = Date.now();
      const userId = req.user.id;

      await reconcileExpiredSessions(db, userId, nowMs);

      const session = await loadSessionForUser(db, sessionId, userId);
      if (!session) return res.status(404).json({ error: 'session not found' });

      // Idempotency: if already finished, return the persisted result.
      if (session.status === 'finished') {
        return res.status(200).json({
          score: session.score,
          correctCount: session.correct_count,
          bestStreak: session.best_streak,
          fastestAnswerMs: (await getSessionEvents(db, sessionId))
            .filter((e) => e.correct)
            .reduce(
              (min, e) => (min == null || e.elapsed_ms < min ? e.elapsed_ms : min),
              null
            ),
        });
      }

      if (session.status !== 'in_progress') {
        return res.status(409).json({ error: `session is ${session.status}` });
      }

      const events = await getSessionEvents(db, sessionId);
      const expectedRounds = session.config_snapshot.rounds;
      if (events.length < expectedRounds) {
        return res.status(400).json({
          error: 'not all rounds answered',
          answered: events.length,
          expected: expectedRounds,
        });
      }

      const final = computeFinalScore(events, session.config_snapshot);
      const finishedAtIso = nowIso(nowMs);

      // Atomic compare-and-set finish + scores INSERT in one transaction.
      // The UPDATE filters on status='in_progress' so a concurrent /finish
      // (or a finished-by-another-process race) sees `changes=0` and falls
      // through to the idempotent re-read path below.
      let finishedNow = false;
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
          if (!upd.changes) {
            // Lost the race; do not insert a duplicate scores row.
            return;
          }
          finishedNow = true;
          const legacyMode = session.mode === 'ranked_daily' ? 'daily' : 'freeplay';
          const variant = session.mode === 'ranked_daily' ? 'daily' : 'freeplay';
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
              expectedRounds,
              final.bestStreak,
              variant,
            ]
          );
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          logAntiCheat(sessionId, 'daily-already-finished', { userId });
          return res.status(409).json({
            error: 'already played Ranked Daily today',
            reason: 'already-played-daily',
          });
        }
        throw err;
      }

      if (!finishedNow) {
        // Concurrent /finish won; re-read and return the persisted result.
        const fresh = await loadSessionForUser(db, sessionId, userId);
        return res.status(200).json({
          score: fresh.score,
          correctCount: fresh.correct_count,
          bestStreak: fresh.best_streak,
          fastestAnswerMs: events
            .filter((e) => e.correct)
            .reduce(
              (min, e) => (min == null || e.elapsed_ms < min ? e.elapsed_ms : min),
              null
            ),
        });
      }

      // Drop in-memory dispatched-round state.
      dispatchedRounds.delete(sessionId);

      logger.info(
        {
          sessionId,
          userId,
          score: final.score,
          correctCount: final.correctCount,
          bestStreak: final.bestStreak,
        },
        'ranked-session finished'
      );

      return res.status(200).json({
        score: final.score,
        correctCount: final.correctCount,
        bestStreak: final.bestStreak,
        fastestAnswerMs: final.fastestAnswerMs,
      });
    } catch (err) {
      // CS52-7e — if a DB op inside the handler surfaces a permanent
      // unavailability descriptor, set the shared state and enqueue a
      // Variant A file (matches the preflight 202 path so the client
      // sees a single response shape regardless of when the DB went
      // down). Any other error continues to the central handler.
      const u = getDbUnavailability(err);
      if (u) {
        setDbUnavailabilityState(u);
        try {
          return await enqueueFinishAndRespond(req, res, sessionId, u);
        } catch (enqueueErr) {
          next(enqueueErr);
          return undefined;
        }
      }
      next(err);
      return undefined;
    }
  });
});

/**
 * CS52-7e — enqueue a Variant A `pending_writes` file and return 202.
 *
 * The 202 carries `queuedRequestId` and `retryAfterMs: 5000`. No score /
 * correctCount / bestStreak fields — the client will surface the result
 * once a subsequent /api/sync (or another GET) returns a finalised state.
 *
 * Validates `sessionId` shape before enqueueing so an authenticated
 * client cannot inflate the on-disk queue with arbitrary garbage IDs
 * during an outage. If the queue is already full (per
 * `PENDING_WRITES_MAX_DEPTH`), responds 503 Retry-After instead of 202.
 */
// UUID v1–v5 shape (matches `crypto.randomUUID()`'s v4 output and any
// pre-existing v1 IDs that may be in flight). We only care about shape
// here — the synchronous `/finish` path further validates ownership/
// existence against the DB; the queue is just a deferred replay tube.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function enqueueFinishAndRespond(req, res, sessionId, descriptor) {
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
    logger.warn(
      {
        event: 'finish_request_queued_rejected',
        reason: 'invalid-session-id',
        sessionIdSample: typeof sessionId === 'string' ? sessionId.slice(0, 64) : typeof sessionId,
        user_id: req.user && req.user.id,
      },
      'POST /api/sessions/:id/finish 400 — invalid session id (db-unavailable enqueue path)'
    );
    return res.status(400).json({ error: 'invalid session id' });
  }
  let request_id;
  try {
    ({ request_id } = await pendingWrites.enqueue({
      endpoint: 'POST /api/sessions/:id/finish',
      concrete_route: { session_id: sessionId },
      user_id: req.user.id,
      payload: {},
    }));
  } catch (err) {
    if (err && err.code === 'PENDING_WRITES_QUEUE_FULL') {
      logger.error(
        {
          event: 'finish_request_queued_rejected',
          reason: 'queue-full',
          depth: err.depth,
          max: err.max,
          sessionId,
          user_id: req.user.id,
        },
        'POST /api/sessions/:id/finish 503 — pending_writes queue full'
      );
      return res
        .set('Retry-After', '30')
        .status(503)
        .json({ error: 'Server is overloaded; please retry later', retryAfter: 30 });
    }
    throw err;
  }
  logger.info(
    {
      event: 'finish_request_queued_202',
      sessionId,
      user_id: req.user.id,
      request_id,
      reason: descriptor.reason,
    },
    'POST /api/sessions/:id/finish 202 — queued for replay (db-unavailable)'
  );
  return res.status(202).json({
    queuedRequestId: request_id,
    retryAfterMs: 5000,
    unavailable: true,
    reason: descriptor.reason,
  });
}

/**
 * POST /api/sessions/:id/finish (legacy duplicate removed in local-review fix R1)
 */

// ── Test-only helpers ────────────────────────────────────────────────────
//
// Exposed under `module.exports.__test` so tests can poke at process-local
// state (e.g. clear the dispatched-rounds map between suites). Not used by
// production code.

module.exports = router;
module.exports.__test = {
  dispatchedRounds,
  resetState() { dispatchedRounds.clear(); },
};
