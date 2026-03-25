/**
 * Game — Core game engine.
 * Handles rounds, scoring, timer, and answer submission.
 * Pure logic + callbacks — no direct DOM manipulation.
 */

const CONFIG = {
  ROUND_TIME_MS: 15000,
  MAX_ROUNDS: 10,
  BASE_POINTS: 100,
  MAX_SPEED_BONUS: 100,
  STREAK_THRESHOLDS: [
    { min: 6, multiplier: 2.0 },
    { min: 3, multiplier: 1.5 },
    { min: 0, multiplier: 1.0 },
  ],
};

let state = null;

/** Calculate score for a single round. */
function calculateScore(correct, timeMs, streak) {
  if (!correct) {
    return { points: 0, speedBonus: 0, multiplier: 1, total: 0 };
  }

  const points = CONFIG.BASE_POINTS;
  const timeRatio = Math.max(0, 1 - timeMs / CONFIG.ROUND_TIME_MS);
  const speedBonus = Math.round(CONFIG.MAX_SPEED_BONUS * timeRatio);
  const { multiplier } = CONFIG.STREAK_THRESHOLDS.find(t => streak >= t.min);
  const total = Math.round((points + speedBonus) * multiplier);

  return { points, speedBonus, multiplier, total };
}

/** Get the streak multiplier for display. */
function getStreakMultiplier(streak) {
  return CONFIG.STREAK_THRESHOLDS.find(t => streak >= t.min).multiplier;
}

/** Placeholder — start a free-play game. */
function startFreePlay(puzzles, category, ui) {
  // Will be implemented in step 6
}

/** Placeholder — start a daily challenge. */
function startDaily(puzzles, ui) {
  // Will be implemented in step 7
}

/** Placeholder — advance to the next round. */
function nextRound(ui) {
  // Will be implemented in step 4
}

/** Placeholder — share game result. */
function shareResult() {
  // Will be implemented in step 7
}

export const Game = {
  calculateScore,
  getStreakMultiplier,
  startFreePlay,
  startDaily,
  nextRound,
  shareResult,
  get state() { return state; },
  get CONFIG() { return CONFIG; },
};
