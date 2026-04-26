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

/**
 * Get the round time in ms.
 *
 * For Practice (local) modes, falls back to the user's Settings slider.
 * For Ranked modes, the active state.roundTimeMs override (sourced from the
 * server's `config_snapshot.round_timer_ms`) wins — Settings does NOT apply
 * to Ranked because Ranked uses canonical configs (CS52 Decision #4).
 */
function getRoundTimeMs() {
  if (state && state.roundTimeMs) return state.roundTimeMs;
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
    ranked: false,
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
  if (state && state.ranked) {
    return submitRankedAnswer(answer, ui);
  }
  if (!state || state.finished) return;
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
  if (state && state.ranked) {
    return nextRankedRound(ui);
  }
  if (!state || state.finished) return;
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

// ────────────────────────────────────────────────────────────────────
// CS52-4 — Ranked streaming flow
// ────────────────────────────────────────────────────────────────────
//
// Drives the streaming loop against the CS52-3 server endpoints:
//   POST /api/sessions               (create; returns round 0)
//   POST /api/sessions/:id/answer    (server computes elapsed + correct)
//   POST /api/sessions/:id/next-round (425-gated; we retry once on 425)
//   POST /api/sessions/:id/finish    (server computes final score)
//
// Anti-cheat (CS52 Decision #7): the server-returned puzzle has NO `answer`
// field, so the client genuinely can't pre-decide correctness. We submit the
// chosen option to /answer and use the server-supplied `correct` + `runningScore`.
//
// Mid-Ranked-disconnect (CS52 Decision #9): hard fail — abortRanked() aborts
// the in-flight fetch, clears game state, and the caller renders the
// "Lost connection — Ranked session abandoned" overlay.

let rankedAbortController = null;

/**
 * Normalize a server-issued ranked puzzle ({ id, prompt: { type, sequence,
 * explanation }, options, ... }) into the local puzzle shape the existing UI
 * expects. The `answer` field is intentionally absent — the client never sees
 * the correct answer in Ranked.
 */
function normalizeRankedPuzzle(p) {
  const puzzle = (p && typeof p === 'object') ? p : {};
  const prompt = puzzle.prompt;
  const promptObj = (prompt && typeof prompt === 'object') ? prompt : {};
  // CS52-4 anti-cheat: ranked puzzles must not expose hints. The server
  // strips `answer` but currently still includes `explanation` in the
  // payload; force it to '' here so it can never leak via DevTools, and
  // ui.showResult always renders an empty explanation for ranked rounds.
  return {
    id: puzzle.id,
    sequence: Array.isArray(promptObj.sequence) ? promptObj.sequence : [],
    type: promptObj.type || 'text',
    explanation: '',
    options: Array.isArray(puzzle.options) ? puzzle.options : [],
    category: puzzle.category,
    difficulty: puzzle.difficulty,
  };
}

function presentRankedRound(roundData, ui) {
  state.currentPuzzle = normalizeRankedPuzzle(roundData.puzzle);
  state.currentRound = roundData.round_num;
  state.roundStartedAtMs = Date.now();
  ui.showScreen('game');
  ui.renderRound(state);
  startTimer(ui);
}

/**
 * Start a Ranked session.
 *
 * @param {object} opts
 * @param {string} opts.mode - 'ranked_freeplay' | 'ranked_daily'
 * @param {Function} opts.apiFetch - app's apiFetch wrapper (auth-aware)
 * @param {object} opts.ui - UI callbacks
 */
async function startRanked({ mode, apiFetch, ui }) {
  if (!apiFetch) throw new Error('startRanked requires apiFetch');
  if (mode !== 'ranked_freeplay' && mode !== 'ranked_daily') {
    throw new Error(`startRanked: unsupported mode ${mode}`);
  }
  // Defensive cleanup: a non-ranked round (for example Practice) may still
  // have an active timer when the user navigates Home and starts Ranked.
  // abortRanked() only stops the timer when the current state is ranked,
  // so explicitly stop any timer here before the async session-create
  // request — otherwise a stale Practice timeout could fire submitAnswer()
  // and overwrite the UI mid-launch.
  stopTimer();
  abortRanked(); // ensure no stale session

  rankedAbortController = new AbortController();
  const signal = rankedAbortController.signal;

  // No client telemetry is emitted before POST /api/sessions.
  // ranked_session_started is logged only after the server confirms
  // session creation so failed starts are not counted as started sessions.

  let res;
  try {
    res = await apiFetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Activity': '1' },
      body: JSON.stringify({ mode }),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') return { aborted: true };
    // Session-creation failure — caller (handleStartRanked) surfaces the
    // friendly toast. Do NOT call ui.showRankedError here: it would route
    // through showRankedError → handleRankedDisconnect → "session abandoned"
    // overlay, which is wrong because no session was ever created.
    return { error: 'network' };
  }

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    // Session-creation HTTP error (409 already-played, 503 warming, 401, …)
    // Caller maps these to per-status friendly toasts. No ui.showRankedError.
    return { error: 'http', status: res.status, body };
  }

  const data = await res.json();
  // CS52-4 telemetry: emit ranked_session_started exactly once, AFTER the
  // server confirms session creation. (handleStartRanked deliberately does
  // not pre-emit; that would inflate the denominator with failed starts
  // like 409 "already played today" / 503 / 401.)
  try { console.info('[client] ranked_session_started', { mode, sessionId: data.sessionId }); } catch { /* ignore */ }

  // Stale-launch guard: if a newer abortRanked() landed between the request
  // and now (e.g. user double-clicked Ranked), bail out without binding the
  // UI to this stale session. The signal would have been aborted; this
  // catches the rare race where the server response arrives first.
  if (signal && signal.aborted) return { aborted: true };

  // Defensive defaults — server should always supply config, but guard
  // anyway so a missing/partial response doesn't throw at runtime when
  // nextRankedRound()/finishRankedSession() read state.config.rounds.
  const safeConfig = {
    rounds: (data.config && data.config.rounds) || 10,
    roundTimerMs: (data.config && data.config.roundTimerMs) || 15000,
    interRoundDelayMs: (data.config && data.config.interRoundDelayMs) || 0,
    ...(data.config || {}),
  };
  const totalRounds = safeConfig.rounds;
  state = createState(new Array(totalRounds).fill(null), mode);
  state.ranked = true;
  state.sessionId = data.sessionId;
  state.config = safeConfig;
  state.roundTimeMs = safeConfig.roundTimerMs;
  state.expiresAt = data.expiresAt;
  state.apiFetch = apiFetch;
  presentRankedRound(data.round0, ui);
  return { ok: true };
}

async function submitRankedAnswer(answer, ui) {
  stopTimer();
  if (!state || !state.ranked || state.finished) return;
  const round = state.currentRound;
  const puzzleId = state.currentPuzzle.id;
  const clientTimeMs = Date.now() - state.roundStartedAtMs;
  // Capture session-scoped values up-front so a mid-flight abort that nulls
  // `state` cannot leak into the response handler below.
  const sessionId = state.sessionId;
  const apiFetch = state.apiFetch;
  const signal = rankedAbortController ? rankedAbortController.signal : undefined;

  let res;
  try {
    res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Activity': '1' },
      body: JSON.stringify({
        round_num: round,
        puzzle_id: puzzleId,
        answer: answer == null ? '' : String(answer),
        client_time_ms: clientTimeMs,
      }),
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    if (ui.showRankedError) ui.showRankedError({ kind: 'network' });
    return;
  }
  if (!state || !state.ranked || state.sessionId !== sessionId) return; // aborted/replaced between fetch and response

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    if (!state || !state.ranked || state.sessionId !== sessionId) return;
    if (ui.showRankedError) ui.showRankedError({ kind: 'http', status: res.status, body });
    return;
  }

  const data = await res.json();
  if (!state || !state.ranked || state.sessionId !== sessionId) return;
  const correct = !!data.correct;
  if (correct) {
    state.streak += 1;
    state.correctCount += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
  } else {
    state.streak = 0;
  }
  state.score = Number.isFinite(data.runningScore) ? data.runningScore : state.score;
  state.results.push({
    puzzleId,
    answer,
    correct,
    timeMs: Number.isFinite(data.elapsed_ms) ? data.elapsed_ms : clientTimeMs,
    score: { points: 0, speedBonus: 0, multiplier: 1, total: 0 },
  });

  // Derive a Practice-shaped score breakdown for the UI from the server's
  // running-score delta. The shape is approximate but the totalScore is
  // authoritative (server-computed).
  const totalDelta = state.results.length === 1
    ? state.score
    : state.score - (state._lastRunningScore || 0);
  state._lastRunningScore = state.score;

  ui.showResult({
    correct,
    answer,
    correctAnswer: null, // Ranked never reveals the canonical answer
    explanation: '',     // Ranked puzzles don't ship explanations to client
    score: { points: correct ? totalDelta : 0, speedBonus: 0, multiplier: 1, total: correct ? totalDelta : 0 },
    totalScore: state.score,
    streak: state.streak,
    rankedHidden: true,
  });
}

async function nextRankedRound(ui) {
  if (!state || !state.ranked) return;
  // Last round answered → finish.
  if (state.results.length >= state.config.rounds) {
    return finishRankedSession(ui);
  }
  const sessionId = state.sessionId;
  const apiFetch = state.apiFetch;
  const signal = rankedAbortController ? rankedAbortController.signal : undefined;

  // Try once; if 425 (Too Early) honor Retry-After and try once more.
  let attempt = 0;
  while (attempt < 2) {
    attempt += 1;
    let res;
    try {
      res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/next-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Activity': '1' },
        signal,
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (ui.showRankedError) ui.showRankedError({ kind: 'network' });
      return;
    }
    if (!state || !state.ranked || state.sessionId !== sessionId) return;

    if (res.status === 425) {
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      if (!state || !state.ranked || state.sessionId !== sessionId) return;
      const retryMs = (body && Number(body.retryAfterMs)) || 1000;
      await new Promise(r => setTimeout(r, Math.min(retryMs, 5000)));
      if (!state || !state.ranked || state.sessionId !== sessionId) return;
      continue;
    }
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch { /* ignore */ }
      if (!state || !state.ranked || state.sessionId !== sessionId) return;
      if (ui.showRankedError) ui.showRankedError({ kind: 'http', status: res.status, body });
      return;
    }
    const data = await res.json();
    if (!state || !state.ranked || state.sessionId !== sessionId) return;
    presentRankedRound(data, ui);
    return;
  }
  if (ui.showRankedError) ui.showRankedError({ kind: 'too-early-retry-exhausted' });
}

async function finishRankedSession(ui) {
  if (!state || !state.ranked) return;
  // NOTE: state.finished is intentionally NOT set here. We need the
  // session to remain "active" (ranked && !finished) while the /finish
  // request is in flight so that:
  //   - applyConnectivityState() still hard-fails on ok→non-ok mid-finalize
  //   - ui.showRankedError({kind:'network'}) still surfaces the abandoned
  //     overlay if /finish itself fails with a network error
  // The flag is set only after the server confirms the finalize call.
  stopTimer();
  const sessionId = state.sessionId;
  const apiFetch = state.apiFetch;
  const signal = rankedAbortController ? rankedAbortController.signal : undefined;

  let res;
  try {
    res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Activity': '1' },
      signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    if (ui.showRankedError) ui.showRankedError({ kind: 'network' });
    return;
  }
  if (!state || !state.ranked || state.sessionId !== sessionId) return;
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* ignore */ }
    if (!state || !state.ranked || state.sessionId !== sessionId) return;
    if (ui.showRankedError) ui.showRankedError({ kind: 'http', status: res.status, body });
    return;
  }
  const data = await res.json();
  if (!state || !state.ranked || state.sessionId !== sessionId) return;
  state.finished = true;
  const summary = {
    score: data.score,
    correctCount: data.correctCount,
    totalRounds: state.config.rounds,
    bestStreak: data.bestStreak,
    fastestAnswerMs: data.fastestAnswerMs,
    results: state.results,
    mode: state.mode,
    skipCount: 0,
    ranked: true,
  };
  ui.showGameOver(summary);
}

/**
 * Abort an in-flight Ranked session (mid-disconnect, sign-out, or explicit
 * cancel). Aborts any in-flight fetch and clears game state. Does NOT call
 * the server — the server-side reconciliation flips `status='abandoned'` on
 * the user's next session-mutating request (CS52-3).
 *
 * Returns the prior session id (or null) so callers can include it in
 * structured logs.
 */
function abortRanked() {
  if (rankedAbortController) {
    try { rankedAbortController.abort(); } catch { /* ignore */ }
    rankedAbortController = null;
  }
  const priorId = state && state.ranked ? state.sessionId : null;
  if (state && state.ranked) {
    state.finished = true;
    stopTimer();
    state = null;
  }
  return priorId;
}

// Re-export startRanked. apiFetch is plumbed via state.apiFetch internally.
async function startRankedExport(opts) {
  return startRanked(opts);
}

export const Game = {
  calculateScore,
  startFreePlay,
  startDaily,
  startRanked: startRankedExport,
  abortRanked,
  nextRound,
  skipRound,
  submitAnswer,
  shareResult,
  // Stop the round countdown after the user has selected an answer but
  // before the brief feedback delay before submitAnswer fires. Without this,
  // a timer expiry firing inside the 50–600 ms feedback window would call
  // submitAnswer(null) and cause a double-submit when the deferred submit
  // also runs.
  lockRound: () => stopTimer(),
  get state() { return state; },
  get CONFIG() { return CONFIG; },
};
