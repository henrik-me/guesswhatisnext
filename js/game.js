/**
 * Game — Core game engine.
 * Handles rounds, scoring, timer, and answer submission.
 * Pure logic + callbacks — no direct DOM manipulation.
 */

import { filterByCategory } from './puzzles.js';

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

/** Shuffle an array in place (Fisher-Yates). */
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
  const timeRatio = Math.max(0, 1 - timeMs / CONFIG.ROUND_TIME_MS);
  const speedBonus = Math.round(CONFIG.MAX_SPEED_BONUS * timeRatio);
  const { multiplier } = CONFIG.STREAK_THRESHOLDS.find(t => streak >= t.min);
  const total = Math.round((points + speedBonus) * multiplier);

  return { points, speedBonus, multiplier, total };
}

/** Start the countdown timer. Calls onTick(ratio) and onExpired(). */
function startTimer(ui) {
  stopTimer();
  roundStartTime = Date.now();

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - roundStartTime;
    const ratio = Math.max(0, 1 - elapsed / CONFIG.ROUND_TIME_MS);
    ui.updateTimer(ratio);

    if (elapsed >= CONFIG.ROUND_TIME_MS) {
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

/** Start a free-play game with optional category filter. */
function startFreePlay(allPuzzles, category, ui) {
  const filtered = filterByCategory(allPuzzles, category);
  const queue = shuffle(filtered).slice(0, CONFIG.MAX_ROUNDS);
  state = createState(queue, 'freeplay');
  loadRound(ui);
}

/** Start a daily challenge (single puzzle). */
function startDaily(allPuzzles, ui) {
  // Daily uses the full game loop but is wired differently in step 7
  // For now, start with a shuffled set like freeplay
  const queue = shuffle([...allPuzzles]).slice(0, CONFIG.MAX_ROUNDS);
  state = createState(queue, 'daily');
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

/** End the game and show summary. */
function endGame(ui) {
  state.finished = true;
  stopTimer();

  ui.showGameOver({
    score: state.score,
    correctCount: state.correctCount,
    totalRounds: state.puzzleQueue.length,
    bestStreak: state.bestStreak,
    results: state.results,
    mode: state.mode,
  });
}

/** Placeholder — share game result (implemented in step 7). */
function shareResult() {
  if (!state) return;
  const text = `🧩 Guess What's Next\n` +
    `Score: ${state.score} | ${state.correctCount}/${state.puzzleQueue.length} correct\n` +
    `Best streak: ${state.bestStreak} 🔥`;
  navigator.clipboard?.writeText(text);
}

export const Game = {
  calculateScore,
  startFreePlay,
  startDaily,
  nextRound,
  submitAnswer,
  shareResult,
  get state() { return state; },
  get CONFIG() { return CONFIG; },
};
