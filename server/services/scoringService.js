/**
 * Shared core scoring service (CS52-3).
 *
 * Transport-agnostic — no Express / WebSocket coupling. Pure functions over
 * plain data so that:
 *   - the HTTP `/api/sessions/*` routes (this CS) and
 *   - the WebSocket multiplayer match handler (CS52-7d, later)
 * can both call into the same scoring + validation logic. The score formula
 * mirrors `public/js/game.js#calculateScore` (the historical client formula)
 * but the **server** is now the source of truth — the client copy is kept
 * only for local-mode play (per CS52 Decision #7).
 *
 * Anti-cheat invariants enforced here (per CS52 Decision #7):
 *   - elapsed_ms is server-derived (received_at − round_started_at). The
 *     `client_time_ms` field is telemetry only and MUST NOT influence scoring.
 *   - elapsed_ms outside [50ms, 2× round_timer_ms] is rejected as
 *     "timing-impossible".
 *   - round_num must equal the currently-dispatched round (monotonic order).
 *   - puzzle_id must match the currently-dispatched puzzle.
 *   - the session must be in_progress and not past its expires_at.
 *
 * Design contract:
 *   project/clickstops/active/active_cs52_server-authoritative-scoring.md
 *   § Key design decisions #7, #9 + § Ranked session lifecycle (CS52-3)
 */

'use strict';

const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 100;
const STREAK_THRESHOLDS = [
  { min: 6, multiplier: 2.0 },
  { min: 3, multiplier: 1.5 },
  { min: 0, multiplier: 1.0 },
];
const MIN_PLAUSIBLE_ELAPSED_MS = 50;

function streakMultiplier(streak) {
  for (const t of STREAK_THRESHOLDS) {
    if (streak >= t.min) return t.multiplier;
  }
  return 1.0;
}

/**
 * Compute the score awarded for a single round.
 *
 * @param {Object} args
 * @param {boolean|number} args.correct        - 1/0 or true/false
 * @param {number} args.elapsedMs              - server-derived elapsed (ms)
 * @param {number} args.streak                 - streak BEFORE this round
 * @param {number} args.roundTimerMs           - configured round timer (ms)
 * @returns {{ pointsEarned:number, newStreak:number, speedBonus:number,
 *             multiplier:number, basePoints:number }}
 */
function computeRoundScore({ correct, elapsedMs, streak, roundTimerMs }) {
  const isCorrect = !!correct;
  if (!isCorrect) {
    return {
      pointsEarned: 0,
      newStreak: 0,
      speedBonus: 0,
      multiplier: 1,
      basePoints: BASE_POINTS,
    };
  }
  const newStreak = streak + 1;
  const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
  const safeTimer = Math.max(1, Number(roundTimerMs) || 1);
  const timeRatio = Math.max(0, 1 - safeElapsed / safeTimer);
  const speedBonus = Math.round(MAX_SPEED_BONUS * timeRatio);
  const multiplier = streakMultiplier(newStreak);
  const pointsEarned = Math.round((BASE_POINTS + speedBonus) * multiplier);
  return { pointsEarned, newStreak, speedBonus, multiplier, basePoints: BASE_POINTS };
}

/**
 * Aggregate the final score from the persisted per-round events.
 *
 * @param {Array<{correct:number|boolean, elapsed_ms:number}>} events
 *   Sorted ascending by round_num (caller's responsibility).
 * @param {{round_timer_ms:number}} configSnapshot
 * @returns {{ score:number, correctCount:number, bestStreak:number, fastestAnswerMs:number|null }}
 */
function computeFinalScore(events, configSnapshot) {
  const roundTimerMs = configSnapshot.round_timer_ms;
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let correctCount = 0;
  let fastestAnswerMs = null;
  for (const ev of events) {
    const { pointsEarned, newStreak } = computeRoundScore({
      correct: ev.correct,
      elapsedMs: ev.elapsed_ms,
      streak,
      roundTimerMs,
    });
    score += pointsEarned;
    streak = newStreak;
    if (streak > bestStreak) bestStreak = streak;
    if (ev.correct) {
      correctCount += 1;
      if (fastestAnswerMs == null || ev.elapsed_ms < fastestAnswerMs) {
        fastestAnswerMs = ev.elapsed_ms;
      }
    }
  }
  return { score, correctCount, bestStreak, fastestAnswerMs };
}

/**
 * Validate an incoming answer event for an active ranked session.
 *
 * Pure function — caller supplies the session row, the in-memory
 * "currently dispatched round" record, and the secret puzzle (with `answer`).
 * Returns the validation outcome plus the server-derived elapsed_ms.
 *
 * @param {Object} args
 * @param {{ status:string, expires_at:string }} args.session
 * @param {{ round_num:number, puzzle_id:string,
 *           round_started_at_ms:number, puzzle:{ id:string, answer:string } } | null}
 *   args.dispatchedRound
 * @param {number} args.roundNum
 * @param {string} args.puzzleId
 * @param {string} args.submittedAnswer
 * @param {number} args.receivedAtMs
 * @param {{ round_timer_ms:number }} args.configSnapshot
 * @returns {{ ok:boolean, error?:string, correct?:number, elapsedMs?:number }}
 *   On success: `{ ok:true, correct, elapsedMs }`.
 *   On failure: `{ ok:false, error }` where error is one of
 *     'expired' | 'not-in-progress' | 'no-current-round' |
 *     'out-of-order' | 'puzzle-mismatch' | 'timing-impossible'.
 */
function validateAnswerEvent({
  session,
  dispatchedRound,
  roundNum,
  puzzleId,
  submittedAnswer,
  receivedAtMs,
  configSnapshot,
}) {
  if (!session || session.status !== 'in_progress') {
    return { ok: false, error: 'not-in-progress' };
  }
  if (Date.parse(session.expires_at) <= receivedAtMs) {
    return { ok: false, error: 'expired' };
  }
  if (!dispatchedRound) {
    return { ok: false, error: 'no-current-round' };
  }
  if (Number(roundNum) !== Number(dispatchedRound.round_num)) {
    return { ok: false, error: 'out-of-order' };
  }
  if (String(puzzleId) !== String(dispatchedRound.puzzle_id)) {
    return { ok: false, error: 'puzzle-mismatch' };
  }
  const elapsedMs = receivedAtMs - dispatchedRound.round_started_at_ms;
  const upperBound = 2 * configSnapshot.round_timer_ms;
  if (elapsedMs < MIN_PLAUSIBLE_ELAPSED_MS || elapsedMs > upperBound) {
    return { ok: false, error: 'timing-impossible' };
  }
  const correct = String(submittedAnswer) === String(dispatchedRound.puzzle.answer) ? 1 : 0;
  return { ok: true, correct, elapsedMs };
}

module.exports = {
  computeRoundScore,
  computeFinalScore,
  validateAnswerEvent,
  // Exported for tests + future callers that want to inspect the formula.
  BASE_POINTS,
  MAX_SPEED_BONUS,
  MIN_PLAUSIBLE_ELAPSED_MS,
  STREAK_THRESHOLDS,
};
