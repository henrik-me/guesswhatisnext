/**
 * Game — Core game engine.
 * Handles rounds, scoring, timer, and answer submission.
 * Pure logic + callbacks — no direct DOM manipulation.
 */

import { filterByCategory } from './puzzles.js';
import { getDailyPuzzle, getTodayString } from './daily.js';
import { Storage } from './storage.js';

const CONFIG = {
  MAX_ROUNDS: 10,
  BASE_POINTS: 100,
  MAX_SPEED_BONUS: 100,
  STREAK_THRESHOLDS: [
    { min: 6, multiplier: 2.0 },
    { min: 3, multiplier: 1.5 },
    { min: 0, multiplier: 1.0 },
  ],
};

/** Get the round time in ms based on user settings (free-play only). */
function getRoundTimeMs() {
  const seconds = Storage.getSettings().timer || 15;
  return seconds * 1000;
}

let state = null;
let timerInterval = null;
let roundStartTime = null;

/** Create a fresh game state. */
function createState(puzzleQueue, mode) {
  return {
    mode,
    puzzleQueue,
    currentRound: 0,
    currentPuzzle: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    results: [],
    finished: false,
  };
}

/** Shuffle an array (Fisher-Yates). Returns a new array; does not mutate the input. */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Calculate score for a single round. */
function calculateScore(correct, timeMs, streak) {
  if (!correct) {
    return { points: 0, speedBonus: 0, multiplier: 1, total: 0 };
  }

  const points = CONFIG.BASE_POINTS;
  const roundTimeMs = getRoundTimeMs();
  const timeRatio = Math.max(0, 1 - timeMs / roundTimeMs);
  const speedBonus = Math.round(CONFIG.MAX_SPEED_BONUS * timeRatio);
  const { multiplier } = CONFIG.STREAK_THRESHOLDS.find(t => streak >= t.min);
  const total = Math.round((points + speedBonus) * multiplier);

  return { points, speedBonus, multiplier, total };
}

/** Start the countdown timer. Calls onTick(ratio) and onExpired(). */
function startTimer(ui) {
  stopTimer();
  roundStartTime = Date.now();
  const roundTimeMs = getRoundTimeMs();

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - roundStartTime;
    const ratio = Math.max(0, 1 - elapsed / roundTimeMs);
    ui.updateTimer(ratio);

    // Notify UI for tick sounds in the last 3 seconds
    const remaining = roundTimeMs - elapsed;
    if (remaining > 0 && remaining <= 3000 && ui.onTimerTick) {
      ui.onTimerTick(remaining);
    }

    if (elapsed >= roundTimeMs) {
      stopTimer();
      submitAnswer(null, ui);
    }
  }, 50);
}

/** Stop the countdown timer. */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/** Start a free-play game with optional category and difficulty filter. */
function startFreePlay(allPuzzles, category, ui, difficulty) {
  let filtered = filterByCategory(allPuzzles, category);
  if (difficulty && difficulty !== 'all') {
    const level = Number(difficulty);
    filtered = filtered.filter(p => p.difficulty === level);
  }
  const queue = shuffle(filtered).slice(0, CONFIG.MAX_ROUNDS);
  state = createState(queue, 'freeplay');
  state.skipCount = 0;
  loadRound(ui);
}

/** Start a daily challenge — single puzzle, one attempt per day. */
function startDaily(allPuzzles, ui) {
  const today = getTodayString();
  const existing = Storage.getDailyState(today);

  if (existing && existing.completed) {
    ui.showDailyLocked(existing);
    return;
  }

  const dailyPuzzle = getDailyPuzzle(allPuzzles, today);
  const queue = [dailyPuzzle];
  state = createState(queue, 'daily');
  state.dailyDate = today;
  loadRound(ui);
}

/** Load the current round's puzzle and update UI. */
function loadRound(ui) {
  if (state.currentRound >= state.puzzleQueue.length) {
    endGame(ui);
    return;
  }

  state.currentPuzzle = state.puzzleQueue[state.currentRound];

  ui.showScreen('game');
  ui.renderRound(state);
  startTimer(ui);
}

/**
 * Handle answer submission.
 * @param {string|null} answer - The selected answer, or null if timer expired
 * @param {object} ui - UI callback object
 */
function submitAnswer(answer, ui) {
  stopTimer();

  const timeMs = Date.now() - roundStartTime;
  const correct = answer === state.currentPuzzle.answer;

  if (correct) {
    state.streak += 1;
    state.correctCount += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    state.streak = 0;
  }

  const scoreResult = calculateScore(correct, timeMs, state.streak);
  state.score += scoreResult.total;

  state.results.push({
    puzzleId: state.currentPuzzle.id,
    answer,
    correct,
    timeMs,
    score: scoreResult,
  });

  ui.showResult({
    correct,
    answer,
    correctAnswer: state.currentPuzzle.answer,
    explanation: state.currentPuzzle.explanation,
    score: scoreResult,
    totalScore: state.score,
    streak: state.streak,
  });
}

/** Advance to the next round. */
function nextRound(ui) {
  state.currentRound += 1;
  loadRound(ui);
}

/** Skip the current round (free-play only). Counts as incorrect. */
function skipRound(ui) {
  if (!state || state.finished || state.mode !== 'freeplay') return;
  stopTimer();

  state.streak = 0;
  state.skipCount = (state.skipCount || 0) + 1;

  state.results.push({
    puzzleId: state.currentPuzzle.id,
    answer: null,
    correct: false,
    timeMs: Date.now() - roundStartTime,
    score: { points: 0, speedBonus: 0, multiplier: 1, total: 0 },
    skipped: true,
  });

  state.currentRound += 1;
  loadRound(ui);
}

/** End the game and show summary. */
function endGame(ui) {
  state.finished = true;
  stopTimer();

  const summary = {
    score: state.score,
    correctCount: state.correctCount,
    totalRounds: state.puzzleQueue.length,
    bestStreak: state.bestStreak,
    results: state.results,
    mode: state.mode,
    skipCount: state.skipCount || 0,
  };

  // Save daily challenge completion
  if (state.mode === 'daily' && state.dailyDate) {
    Storage.setDailyState(state.dailyDate, {
      completed: true,
      score: state.score,
      correct: state.correctCount > 0,
      results: state.results,
    });
  }

  ui.showGameOver(summary);
}

/** Generate shareable result text. */
function getShareText() {
  if (!state) return '';

  const results = state.results.map(r => r.correct ? '🟩' : '🟥').join('');

  if (state.mode === 'daily') {
    const date = state.dailyDate || getTodayString();
    return `🧩 Guess What's Next — Daily ${date}\n` +
      `${results}\n` +
      `Score: ${state.score} ${state.correctCount > 0 ? '✅' : '❌'}`;
  }

  return `🧩 Guess What's Next\n` +
    `${results}\n` +
    `Score: ${state.score} | ${state.correctCount}/${state.puzzleQueue.length} correct\n` +
    `Best streak: ${state.bestStreak} 🔥`;
}

/** Copy share text to clipboard. Returns the text. */
function shareResult() {
  const text = getShareText();
  navigator.clipboard?.writeText(text);
  return text;
}

export { shuffle };

export const Game = {
  calculateScore,
  startFreePlay,
  startDaily,
  nextRound,
  skipRound,
  submitAnswer,
  shareResult,
  get state() { return state; },
  get CONFIG() { return CONFIG; },
};
