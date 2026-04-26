/**
 * App — Entry point and screen navigation.
 * Manages which screen is visible and delegates to game modules.
 */

import { Game, shuffle } from './game.js';
import { puzzles as localPuzzles, getCategories } from './puzzles.js';
import { Storage } from './storage.js';
import { GameAudio } from './audio.js';
import { progressiveLoad, MESSAGE_SETS, RetryableError, UnavailableError } from './progressive-loader.js';
import { validateStoredAuthToken } from './auth-boot.js';
import {
  CONNECTIVITY_BANNER_COPY,
  renderConnectivityBanner as renderBanner,
  applyRankedEntryGate as applyGate,
} from './connectivity-ui.js';
import {
  buildRecord as syncBuildRecord,
  enqueueRecord as syncEnqueueRecord,
  getL1Records,
  syncNow,
  handleSignOut as syncHandleSignOut,
  findClaimableRecords,
  applyClaim,
  migrateLegacyQueues,
  installConnectivityListeners,
  connectivity,
  onConnectivityChange,
  setConnectivityState,
} from './sync-client.js';

/**
 * Check a fetch Response for a retryable 503 signal and throw RetryableError if present.
 * Retry signal: Retry-After HTTP header (preferred) or retryAfter JSON body field (fallback).
 * SW-synthesised offline 503s lack both signals and are NOT retried.
 *
 * Permanent unavailability signal (CS53 Bug B): 503 body with `unavailable: true`
 * (no Retry-After header). Throws UnavailableError so callers/loader stop retrying
 * and render a banner instead of cycling the warmup loader forever.
 */
async function throwIfRetryable(res) {
  if (res.status !== 503) return;

  // Fast path: Retry-After header alone is a sufficient retry signal — avoid
  // parsing the JSON body for the common warmup case. Server contract
  // guarantees the unavailable shape never sets Retry-After.
  const headerVal = res.headers.get('Retry-After');
  if (headerVal) {
    const seconds = parseInt(headerVal, 10);
    if (!isNaN(seconds) && seconds >= 0) {
      throw new RetryableError('Server warming up', seconds * 1000);
    }
  }

  // No Retry-After header: inspect body for unavailable signal or fallback retryAfter.
  let body = null;
  try { body = await res.clone().json(); } catch { /* not JSON */ }

  if (body && body.unavailable === true) {
    const message = body.message || 'This data is temporarily unavailable.';
    throw new UnavailableError(message, body.reason);
  }
  if (body && typeof body.retryAfter === 'number' && body.retryAfter >= 0) {
    throw new RetryableError('Server warming up', body.retryAfter * 1000);
  }
}

// Client-side error reporting (IIFE keeps internals private)
(function initErrorReporting() {
  const ERROR_ENDPOINT = '/api/telemetry/errors';
  const MAX_ERRORS_PER_MINUTE = 10;
  const WINDOW_MS = 60000;
  let errorTimestamps = [];

  function getAuthToken() {
    try { return localStorage.getItem('gwn_auth_token'); } catch { return null; }
  }

  function reportError(payload) {
    const now = Date.now();
    errorTimestamps = errorTimestamps.filter(t => now - t < WINDOW_MS);
    if (errorTimestamps.length >= MAX_ERRORS_PER_MINUTE) return;
    errorTimestamps.push(now);
    const token = getAuthToken();
    // Use fetch with auth when available; fall back to sendBeacon for anonymous
    if (token) {
      fetch(ERROR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {}); // Swallow — error reporting must never break the app
    } else if (navigator.sendBeacon) {
      navigator.sendBeacon(ERROR_ENDPOINT, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    } else {
      fetch(ERROR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }

  window.addEventListener('error', (event) => {
    reportError({
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      type: 'error',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportError({
      message: reason?.message || String(reason),
      stack: reason?.stack,
      type: 'unhandledrejection',
    });
  });
})();

const screens = {};

/** Currently selected difficulty for free-play. */
let selectedDifficulty = 'all';

/** Puzzle data — starts with local fallback, updated from server when available. */
let activePuzzles = localPuzzles;

/** Fetch puzzles from the server API; falls back to local data on failure. */
async function fetchPuzzlesFromServer() {
  if (!authToken) return; // no auth — keep local puzzles

  try {
    const resp = await apiFetch('/api/puzzles');
    if (!resp.ok) return;
    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      activePuzzles = data;
    }
  } catch {
    // Server unreachable — keep local puzzles as fallback
  }
}
let currentScreen = null;

/** Show a screen by name, hiding all others. */
function showScreen(name) {
  if (currentScreen) {
    screens[currentScreen].classList.remove('active');
  }
  screens[name].classList.add('active');
  currentScreen = name;
  if (name === 'auth') setAuthMode('login');
}

/** Update a data-bind element's text content. */
function bindText(key, value) {
  document.querySelectorAll(`[data-bind="${key}"]`).forEach(el => {
    el.textContent = value;
  });
}



/**
 * UI callbacks object passed to the game engine.
 * The engine calls these to update the display without touching the DOM directly.
 */
const ui = {
  showScreen,

  /** Render the current round: sequence, options, HUD. */
  renderRound(state) {
    const puzzle = state.currentPuzzle;

    // HUD
    bindText('score', state.score);
    bindText('round', state.currentRound + 1);
    bindText('total-rounds', state.puzzleQueue.length);

    // Show/hide skip button (free-play only)
    const skipBtn = document.getElementById('btn-skip');
    if (skipBtn) {
      skipBtn.style.display = state.mode === 'freeplay' ? '' : 'none';
    }

    // Score bump animation (skip first round where score is 0)
    const scoreEl = document.querySelector('[data-bind="score"]');
    if (scoreEl && state.currentRound > 0) {
      scoreEl.classList.remove('bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('bump');
    }

    // Streak display with fire indicator
    const streakVal = state.streak;
    const streakEl = document.querySelector('[data-bind="streak"]');
    if (streakEl) {
      streakEl.textContent = streakVal;
      streakEl.classList.toggle('on-fire', streakVal >= 3);
      if (streakVal >= 3) {
        streakEl.textContent = `${streakVal} 🔥`;
      }
    }

    // Reset timer bar for new round
    const timerBar = document.querySelector('[data-bind="timer-bar"]');
    if (timerBar) {
      timerBar.style.width = '100%';
      timerBar.style.backgroundColor = '';
      timerBar.classList.remove('warning');
    }

    // Sequence display
    const seqContainer = document.querySelector('[data-bind="sequence"]');
    seqContainer.innerHTML = '';
    puzzle.sequence.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'sequence-item';
      el.style.setProperty('--seq-i', index);
      if (puzzle.type === 'image') {
        el.innerHTML = `<img src="${item}" alt="sequence item">`;
      } else {
        el.textContent = item;
      }
      seqContainer.appendChild(el);
    });

    // Mystery placeholder
    const mystery = document.createElement('div');
    mystery.className = 'sequence-item mystery';
    mystery.textContent = '?';
    mystery.style.setProperty('--seq-i', puzzle.sequence.length);
    seqContainer.appendChild(mystery);

    // Puzzle credit (community submissions)
    const creditEl = document.querySelector('[data-bind="puzzle-credit"]');
    if (creditEl) {
      creditEl.textContent = puzzle.submitted_by
        ? `\u{1F4DD} Submitted by: ${puzzle.submitted_by}`
        : '';
    }

    // Options grid (shuffled to prevent position bias)
    const optContainer = document.querySelector('[data-bind="options"]');
    optContainer.innerHTML = '';
    const shuffledOptions = shuffle(puzzle.options);
    shuffledOptions.forEach((option, index) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.style.setProperty('--opt-i', index);
      if (puzzle.type === 'image') {
        btn.innerHTML = `<img src="${option}" alt="option">`;
      } else {
        btn.textContent = option;
      }
      btn.addEventListener('click', () => handleOptionClick(option, btn));
      optContainer.appendChild(btn);
    });
  },

  /** Update the timer bar width (0 = empty, 1 = full). */
  updateTimer(ratio) {
    const bar = document.querySelector('[data-bind="timer-bar"]');
    bar.style.width = `${ratio * 100}%`;

    // Change color and pulse as time runs low
    if (ratio < 0.25) {
      bar.style.backgroundColor = 'var(--color-wrong)';
      bar.classList.add('warning');
    } else if (ratio < 0.5) {
      bar.style.backgroundColor = '#e17055';
      bar.classList.remove('warning');
    } else {
      bar.style.backgroundColor = '';
      bar.classList.remove('warning');
    }
  },

  /** Called every ~50ms when timer is in the last 3 seconds. */
  onTimerTick: (() => {
    let lastTickSecond = null;
    return function (remainingMs) {
      const sec = Math.ceil(remainingMs / 1000);
      if (sec !== lastTickSecond && sec <= 3) {
        lastTickSecond = sec;
        GameAudio.playTick();
      }
      if (remainingMs > 3000) lastTickSecond = null;
    };
  })(),

  /** Show the round result screen. */
  showResult(result) {
    const isTimeUp = result.answer === null;
    bindText('result-icon', result.correct ? '✅' : (isTimeUp ? '⏰' : '❌'));
    bindText('result-title', result.correct ? 'Correct!' : (isTimeUp ? "⏰ Time's Up!" : 'Wrong!'));
    bindText('result-explanation', result.explanation);

    // Score breakdown
    const breakdown = document.querySelector('[data-bind="score-breakdown"]');
    if (result.correct) {
      let html = `
        <div class="score-row"><span class="label">Base</span><span class="value">+${result.score.points}</span></div>`;
      if (!result.rankedHidden) {
        html += `<div class="score-row"><span class="label">Speed bonus</span><span class="value">+${result.score.speedBonus}</span></div>`;
      }
      if (result.score.multiplier > 1) {
        html += `<div class="score-row"><span class="label">Streak ×${result.score.multiplier}</span><span class="value"><span class="streak-badge">🔥 ×${result.score.multiplier}</span></span></div>`;
      }
      html += `<div class="score-row total"><span class="label">Total</span><span class="value">+${result.score.total}</span></div>`;
      breakdown.innerHTML = html;
    } else if (result.rankedHidden) {
      // Ranked: server says incorrect, but we never reveal the canonical answer.
      breakdown.innerHTML = `
        <div class="score-row"><span class="label">No points</span><span class="value">+0</span></div>`;
    } else {
      breakdown.innerHTML = `
        <div class="score-row"><span class="label">No points</span><span class="value">+0</span></div>
        <div class="score-row"><span class="label">Correct answer</span><span class="value">${result.correctAnswer}</span></div>`;
    }

    // Update the next-round button text if this was the last round
    const state = Game.state;
    const isLastRound = state.currentRound + 1 >= state.puzzleQueue.length;
    const nextBtn = document.querySelector('[data-action="next-round"]');
    nextBtn.textContent = isLastRound ? 'See Results →' : 'Next Round →';

    showScreen('result');
  },

  /** Show the game-over screen with final stats. */
  showGameOver(summary) {
    bindText('final-score', summary.score);
    bindText('correct-count', `${summary.correctCount}/${summary.totalRounds}`);
    bindText('best-streak', summary.bestStreak);

    // Show skip count if any skips occurred
    const skipStatContainer = document.querySelector('[data-bind="skip-stat-container"]');
    if (skipStatContainer) {
      if (summary.skipCount > 0) {
        bindText('skip-count', summary.skipCount);
        skipStatContainer.style.display = '';
      } else {
        skipStatContainer.style.display = 'none';
      }
    }

    // Persist high score and stats
    Storage.setHighScore(summary.score);
    Storage.updateStats({
      score: summary.score,
      correct: summary.correctCount,
      bestStreak: summary.bestStreak,
    });

    // CS52-4: Ranked sessions are persisted server-side by /api/sessions/:id/finish
    // — the score row already exists in `scores` with `source='ranked'`. Do NOT
    // double-write into the offline L1 queue (would create a phantom `offline`
    // row with the same gameplay). Local Practice modes still flow through
    // CS52-5's L1 + /api/sync path below.
    let enqueued = false;
    if (summary.ranked) {
      enqueued = true; // server-persisted; skip L1 enqueue
      if (authToken) showSyncIndicator('Ranked score recorded ✓');
    } else {
      try {
        const userId = (() => {
          try { return getCurrentUserId(); } catch { return null; }
        })();
        const record = syncBuildRecord(summary, userId);
        // enqueueRecord returns false on either (a) idempotent dedup (record
        // already in L1, fine) or (b) L1 cap hit. Distinguish via post-state.
        const ok = syncEnqueueRecord(record);
        if (ok) {
          enqueued = true;
        } else {
          // Check whether the record is now in L1 (dedup) or was refused (cap).
          const present = getL1Records().some(r => r.client_game_id === record.client_game_id);
          if (present) {
            enqueued = true; // dedup is benign — record is already queued
          } else {
            showSyncIndicator('Score not saved (offline cache full)');
          }
        }
      } catch { /* localStorage unavailable — score is still on screen */ }
    }

    if (authToken && enqueued && !summary.ranked) {
      showSyncIndicator('Score saved ✓');
      // Submit score to server if logged in (single-flight via syncNow).
      // Score-submission IS a user gesture per CS52-5 § Sync triggers (#2).
      syncNow({
        apiFetch,
        trigger: 'score-submit',
        currentUserId: getCurrentUserId(),
      }).then(result => {
        if (!result) return;
        if (result.status === 200) {
          showSyncIndicator('Synced ✓');
        } else if (result.status === 202 || result.status === 503) {
          showSyncIndicator('Will sync later');
        } else if (result.status === 401) {
          showSyncIndicator('Sign in to sync');
        } else if (result.error === 'network') {
          showSyncIndicator('Will sync later');
        }
      }).catch(() => {
        showSyncIndicator('Will sync later');
      });
    } else if (!authToken && !summary.ranked) {
      showToast('Log in to save your score to the leaderboard');
    }
    // (authToken && !enqueued) → cap-overflow indicator was already shown above.

    // Show/hide share button based on mode
    const shareBtn = document.querySelector('[data-action="share-result"]');
    if (shareBtn) shareBtn.style.display = '';

    showScreen('gameover');

    // Confetti celebration for perfect score
    if (summary.correctCount === summary.totalRounds && summary.totalRounds > 0) {
      showConfetti();
      if (typeof GameAudio !== 'undefined' && GameAudio.playAchievement) {
        GameAudio.playAchievement();
      }
    }
  },

  /** Show daily challenge locked screen (already played today). */
  showDailyLocked(dailyState) {
    const gameover = screens['gameover'];
    bindText('final-score', dailyState.score);
    bindText('correct-count', dailyState.correct ? '1/1' : '0/1');
    bindText('best-streak', dailyState.correct ? '1' : '0');

    const header = gameover.querySelector('.gameover-title');
    if (header) header.textContent = "Today's Challenge Complete!";
    const icon = gameover.querySelector('.gameover-icon');
    if (icon) icon.textContent = '📅';

    showScreen('gameover');
  },

  /**
   * CS52-4 § Ranked error surface. Called by game.js for HTTP/network/425
   * errors mid-session. Network/auth-expired during a session is also handled
   * by the connectivity state machine (hard fail overlay); this provides a
   * narrower toast for HTTP-level errors that don't trip connectivity.
   */
  showRankedError(info) {
    if (!info) return;
    if (info.kind === 'network') {
      // Only treat as a mid-session disconnect if there is an in-flight
      // ranked session to abandon. Session-creation network failures are
      // surfaced by handleStartRanked, not here.
      const hasActiveRankedSession = !!(Game.state && Game.state.ranked && !Game.state.finished);
      if (hasActiveRankedSession) {
        showToast('Network error — your Ranked session was abandoned');
        try {
          // apiFetch only updates connectivity for fetch responses (4xx/5xx);
          // raw network failures (TypeError) bypass it. Synthesize the
          // network-down transition here so the banner + ranked-entry gate
          // stay consistent — applyConnectivityState (the connectivity
          // listener) then performs handleRankedDisconnect, so abandonment
          // telemetry is emitted exactly once.
          setConnectivityState('network-down', 'ranked-network-error');
        } catch {
          // setConnectivityState is best-effort; fall back to a direct
          // disconnect so the session is still abandoned cleanly.
          handleRankedDisconnect('network-down');
        }
      }
      return;
    }
    if (info.kind === 'too-early-retry-exhausted') {
      showToast('Server is busy — please try again');
      return;
    }
    if (info.kind === 'http') {
      if (info.status === 410) {
        showToast('Session expired — please start a new Ranked game');
        if (Game.abortRanked) Game.abortRanked();
        showScreen('home');
        return;
      }
      if (info.status === 401) {
        // apiFetch already handled global sign-out; connectivity SM will
        // surface the auth-expired banner and trigger hard-fail overlay.
        return;
      }
      showToast(`Ranked error (HTTP ${info.status})`);
    }
  },
};

/** Handle an option button click — briefly show correct/wrong, then submit. */
function handleOptionClick(answer, btnEl) {
  // Defensive guard: a connectivity-driven hard-fail (or any other async
  // abort) can null Game.state between render and click. Bail before
  // dereferencing so the click can't throw mid-overlay.
  if (!Game.state || !Game.state.currentPuzzle) return;

  // Stop the round timer immediately so a timer-expiry can't fire
  // submitAnswer(null) during the 50–600 ms feedback delay below and cause
  // a double-submit.
  Game.lockRound && Game.lockRound();

  // Disable all option buttons immediately
  const allBtns = document.querySelectorAll('.option-btn');
  allBtns.forEach(b => { b.disabled = true; });

  const puzzle = Game.state.currentPuzzle;
  const isRanked = !!Game.state.ranked;

  // Practice mode: pre-highlight correct/wrong locally (we have the answer
  // bundled with the puzzle). Ranked mode: we DO NOT have the canonical
  // answer client-side (CS52 Decision #1), so we cannot pre-color the buttons
  // — wait for the server's verdict from /answer.
  if (!isRanked) {
    const isCorrect = answer === puzzle.answer;
    allBtns.forEach(b => {
      if (b === btnEl && !isCorrect) {
        b.classList.add('wrong');
      }
      if ((b.textContent === puzzle.answer) || (b.querySelector('img')?.src === puzzle.answer)) {
        b.classList.add('correct');
      }
    });
    if (isCorrect) {
      GameAudio.playCorrect();
    } else {
      GameAudio.playWrong();
    }
  } else {
    // Mark the chosen button "selected" so the user gets click feedback even
    // without local correctness highlighting.
    btnEl.classList.add('selected');
  }

  // Brief delay to show feedback, then submit
  setTimeout(() => {
    Game.submitAnswer(answer, ui);
  }, isRanked ? 50 : 600);
}

/** Render category selection buttons. */
function renderCategories() {
  const container = document.querySelector('[data-bind="category-list"]');
  const categories = getCategories(activePuzzles);

  container.innerHTML = '';

  // Wire difficulty buttons
  const diffBtns = document.querySelectorAll('.difficulty-btn');
  diffBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.difficulty === selectedDifficulty);
    btn.onclick = () => {
      selectedDifficulty = btn.dataset.difficulty;
      diffBtns.forEach(b => b.classList.toggle('active', b === btn));
    };
  });

  // "Random" option
  const randomBtn = document.createElement('button');
  randomBtn.className = 'category-btn';
  randomBtn.textContent = '🎲 Random';
  randomBtn.addEventListener('click', () => {
    Game.startFreePlay(activePuzzles, null, ui, selectedDifficulty);
  });
  container.appendChild(randomBtn);

  // Category buttons
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      Game.startFreePlay(activePuzzles, cat, ui, selectedDifficulty);
    });
    container.appendChild(btn);
  });
}

/** Show a temporary toast notification. */
function showToast(message) {
  const existing = document.querySelector('.share-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'share-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

/**
 * CS52-4 § Connectivity state machine — UI surface.
 *
 * Renders the per-state banner above the main app and toggles the
 * `data-bind="ranked-entry"` buttons disabled state. Subscribes to
 * sync-client's onConnectivityChange so transitions re-render. The pure
 * helpers (CONNECTIVITY_BANNER_COPY + renderBanner + applyGate) live in
 * ./connectivity-ui.js so tests can import them directly.
 */

function renderConnectivityBanner(stateName) {
  renderBanner(document, stateName);
}

function applyRankedEntryGate(canRank, stateName) {
  applyGate(document, canRank, stateName);
}

function applyConnectivityState(stateName) {
  // canRank is derived by sync-client's connectivity state machine —
  // use the getter rather than re-implementing the (stateName === 'ok')
  // mapping here so the UI gate stays consistent if the SM ever adds
  // an "ok-but-cannot-rank" state.
  const canRank = connectivity.canRank;
  renderConnectivityBanner(stateName);
  applyRankedEntryGate(canRank, stateName);
  // CS52-4: if a Ranked session is in flight and ranking is no longer
  // allowed, hard-fail the session and show the abandoned overlay.
  if (!canRank && Game.state && Game.state.ranked && !Game.state.finished) {
    handleRankedDisconnect(stateName);
  }
}

let connectivityUnsubscribe = null;
function installConnectivityUI() {
  applyConnectivityState(connectivity.state);
  if (connectivityUnsubscribe) connectivityUnsubscribe();
  connectivityUnsubscribe = onConnectivityChange((next) => {
    applyConnectivityState(next);
  });
}

/**
 * CS52-4 § Mid-Ranked-disconnect = hard fail (per CS52 Decision #9).
 * Aborts any in-flight session, clears Game state, shows the abandoned overlay.
 * Server-side reconciliation flips status='abandoned' on the user's next
 * session-mutating request — no client → server signal needed here.
 */
function handleRankedDisconnect(stateName) {
  // Capture mode/sessionId BEFORE abortRanked() clears state — abort runs
  // first to stop the timer + in-flight fetches.
  const priorMode = (Game.state && Game.state.mode) || null;
  const priorSessionId = (Game.state && Game.state.sessionId) || null;
  if (Game.abortRanked) Game.abortRanked();
  try {
    console.info('[client] ranked_session_abandoned_due_to_disconnect', {
      mode: priorMode,
      sessionId: priorSessionId,
      connectivityState: stateName,
    });
  } catch { /* ignore */ }
  showRankedAbandonedOverlay();
}

let rankedAbandonedPriorFocus = null;
let rankedAbandonedKeyHandler = null;

function showRankedAbandonedOverlay() {
  // De-dup: if an overlay is already up, just re-focus its primary action.
  let overlay = document.querySelector('.ranked-abandoned-overlay');
  if (overlay) {
    const primary = overlay.querySelector('.btn-primary');
    if (primary) primary.focus();
    return;
  }
  rankedAbandonedPriorFocus = document.activeElement;
  overlay = document.createElement('div');
  overlay.className = 'ranked-abandoned-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'ranked-abandoned-title');
  overlay.innerHTML = `
    <div class="ranked-abandoned-modal" tabindex="-1">
      <div class="ranked-abandoned-icon" aria-hidden="true">📡</div>
      <h2 class="ranked-abandoned-title" id="ranked-abandoned-title">Session abandoned</h2>
      <p class="ranked-abandoned-message">Lost connection — Ranked session abandoned, no score recorded.</p>
      <div class="ranked-abandoned-actions">
        <button type="button" class="btn btn-primary" data-action="ranked-abandoned-practice">Play Practice</button>
        <button type="button" class="btn btn-secondary" data-action="ranked-abandoned-home">Back to home</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const modal = overlay.querySelector('.ranked-abandoned-modal');
  const primary = overlay.querySelector('.btn-primary');
  const secondary = overlay.querySelector('.btn-secondary');
  const focusables = [primary, secondary].filter(Boolean);

  // Modal keyboard handling — Tab cycles within the overlay (focus trap),
  // Escape dismisses to home, focus is restored to the prior element on close.
  rankedAbandonedKeyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismissRankedAbandonedOverlay();
      showScreen('home');
      return;
    }
    if (e.key === 'Tab' && focusables.length > 0) {
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  overlay.addEventListener('keydown', rankedAbandonedKeyHandler);
  if (primary) primary.focus();
  else if (modal) modal.focus();
}

function dismissRankedAbandonedOverlay() {
  const overlay = document.querySelector('.ranked-abandoned-overlay');
  if (overlay) {
    if (rankedAbandonedKeyHandler) {
      overlay.removeEventListener('keydown', rankedAbandonedKeyHandler);
      rankedAbandonedKeyHandler = null;
    }
    overlay.remove();
  }
  if (rankedAbandonedPriorFocus && typeof rankedAbandonedPriorFocus.focus === 'function') {
    try { rankedAbandonedPriorFocus.focus(); } catch { /* ignore */ }
  }
  rankedAbandonedPriorFocus = null;
}

/**
 * CS52-4 § Ranked entry handler. Validates auth + connectivity, surfaces the
 * appropriate friendly toast on the common failure modes (not-signed-in,
 * connectivity gate, 409 already-played-today), and otherwise hands off to
 * Game.startRanked for the streaming flow.
 */
let rankedStartInFlight = false;
async function handleStartRanked(mode) {
  if (rankedStartInFlight) return; // ignore double-clicks while a start is in progress
  if (!isLoggedIn()) {
    authReturnScreen = currentScreen;
    showToast('Sign in to play Ranked');
    showScreen('auth');
    return;
  }
  if (!connectivity.canRank) {
    const copy = CONNECTIVITY_BANNER_COPY[connectivity.state];
    showToast(copy ? copy.text : 'Ranked is unavailable right now');
    return;
  }
  rankedStartInFlight = true;
  let result;
  try {
    result = await Game.startRanked({ mode, apiFetch, ui });
  } catch {
    rankedStartInFlight = false;
    showToast('Couldn\u2019t start Ranked — please try again');
    return;
  }
  rankedStartInFlight = false;
  if (!result || result.ok || result.aborted) return;
  if (result.error === 'http') {
    if (result.status === 409) {
      showToast('You already played today\u2019s Ranked Daily');
    } else if (result.status === 401) {
      showToast('Signed out — please sign in again');
    } else if (result.status === 503) {
      showToast('Ranked is warming up — try again in a moment');
    } else {
      showToast('Couldn\u2019t start Ranked — please try again');
    }
  } else if (result.error === 'network') {
    // Connectivity listeners will surface the banner; show a quick toast too.
    showToast('Network error — Ranked unavailable');
  }
  // result.aborted → silent (overlay shown by handleRankedDisconnect)
}

/**
 * CS52-4 § Claim prompt — replaces the MVP window.confirm shim.
 *
 * Renders an accessible modal (focus trap, ESC = decline, Enter = accept).
 * Decline → records stay in L1 in current state (re-fires on next sign-in).
 * Accept → applyClaim re-attributes records to currentUserId and they sync
 * on the next gesture-driven /api/sync.
 */
function showClaimPromptModal({ total, unattachedCount, mismatchedCount, onAccept, onDecline }) {
  return new Promise(resolve => {
    const previousActive = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'claim-modal-backdrop';
    backdrop.innerHTML = `
      <div class="claim-modal" role="dialog" aria-modal="true" aria-labelledby="claim-modal-title" aria-describedby="claim-modal-message" tabindex="-1">
        <h2 class="claim-modal-title" id="claim-modal-title">Add offline games to your account?</h2>
        <p class="claim-modal-message" id="claim-modal-message">${total} pending offline games will be added to your account.</p>
        <div class="claim-modal-actions">
          <button type="button" class="btn btn-secondary" data-action="claim-decline">Not now</button>
          <button type="button" class="btn btn-primary" data-action="claim-accept">Add to my account</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    const modal = backdrop.querySelector('.claim-modal');
    const acceptBtn = backdrop.querySelector('[data-action="claim-accept"]');
    const declineBtn = backdrop.querySelector('[data-action="claim-decline"]');

    const focusables = [declineBtn, acceptBtn].filter(Boolean);
    let focusIdx = focusables.length > 1 ? 1 : 0;
    const setFocus = () => {
      if (focusables.length === 0) {
        // Fallback: keep focus inside the modal so keyboard users can still
        // dismiss with Escape / backdrop click.
        modal?.focus?.();
        return;
      }
      focusables[focusIdx]?.focus();
    };

    function cleanup() {
      backdrop.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (previousActive && typeof previousActive.focus === 'function') previousActive.focus();
    }
    function accept() {
      try { console.info('[client] claim_prompt_accepted', { claimedCount: total }); } catch { /* ignore */ }
      cleanup();
      try { onAccept && onAccept(); } catch { /* ignore */ }
      resolve('accept');
    }
    function decline() {
      try { console.info('[client] claim_prompt_declined', { pendingCount: total }); } catch { /* ignore */ }
      cleanup();
      try { onDecline && onDecline(); } catch { /* ignore */ }
      resolve('decline');
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); decline(); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (focusables.length === 0) return;
        focusIdx = (focusIdx + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
        setFocus();
        return;
      }
      if (e.key === 'Enter') {
        // Per the documented contract Enter always accepts, regardless of
        // which button currently has focus inside the modal. Without this
        // explicit handler, Enter on the decline button would trigger its
        // default click instead.
        e.preventDefault();
        accept();
      }
    }

    acceptBtn.addEventListener('click', accept);
    declineBtn.addEventListener('click', decline);
    backdrop.addEventListener('keydown', onKey);
    // Click on backdrop = decline (treat as dismiss).
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) decline();
    });

    try {
      console.info('[client] claim_prompt_shown', { unattachedCount, mismatchedCount });
    } catch { /* ignore */ }

    // Focus the primary action so Enter accepts.
    if (modal) modal.focus();
    setFocus();
  });
}

/** Show a non-blocking sign-in banner for unauthenticated players. */
function showSignInBanner() {
  const existing = document.querySelector('.sign-in-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.className = 'sign-in-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `To keep score, <a href="#" class="sign-in-banner-link">sign in</a>`;
  banner.querySelector('.sign-in-banner-link').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    banner.remove();
    authReturnScreen = 'home';
    showScreen('auth');
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'sign-in-banner-dismiss';
  dismissBtn.textContent = '✕';
  dismissBtn.setAttribute('aria-label', 'Dismiss sign-in banner');
  dismissBtn.addEventListener('click', () => banner.remove());
  banner.appendChild(dismissBtn);

  const authTopBar = document.getElementById('auth-top-bar');
  if (authTopBar && authTopBar.parentNode) {
    authTopBar.after(banner);
  } else {
    document.getElementById('app').prepend(banner);
  }
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
}

/** Show confetti celebration for perfect scores. */
function showConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#6c5ce7', '#00cec9', '#00b894', '#fdcb6e', '#e17055', '#d63031', '#fd79a8'];
  for (let i = 0; i < 30; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 1}s`;
    piece.style.animationDuration = `${1.5 + Math.random() * 1.5}s`;
    if (Math.random() > 0.5) piece.style.borderRadius = '50%';
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 3000);
}

/** Initialize screen references and wire up navigation. */
function init() {
  document.querySelectorAll('[data-screen]').forEach(el => {
    screens[el.dataset.screen] = el;
  });

  // Update auth display on home screen
  updateHomeAuthDisplay();
  refreshFeatureFlags();

  // CS52-5: arm online/offline observers. The online event ONLY clears
  // network-down — it does NOT auto-fire a sync. The next user gesture
  // is what triggers the actual /api/sync RPC (boot-quiet contract).
  try { installConnectivityListeners(); } catch { /* test env may lack window */ }

  // CS52-4: install the connectivity-banner + ranked-entry gate. Renders
  // current state once, subscribes to onConnectivityChange so transitions
  // re-render and (when ok→non-ok mid-Ranked-session) trigger hard fail.
  try { installConnectivityUI(); } catch { /* DOM may be absent in tests */ }

  // Validate stored token on startup (non-blocking).
  //
  // CS53-4 + CS53 Policy 1: route through apiFetch so we honor the 503
  // warmup / UnavailableError contract. This call runs before any UI is
  // mounted, so there is no progressive-loader container to render warmup
  // messages into. On RetryableError or UnavailableError we silently defer
  // — auth state stays whatever localStorage gave us, and the next real
  // user action will surface the warming/unavailable banner via the
  // central error handler. We do NOT poll and we do NOT retry here
  // (Policy 1: no DB-waking background work).
  if (authToken) {
    validateStoredAuthToken({
      apiFetch: (url) => apiFetch(url, { skipAuthHandling: true }),
      throwIfRetryable,
      onUnauthorized: () => {
        authToken = null;
        authUsername = null;
        authRole = null;
        try {
          localStorage.removeItem('gwn_auth_token');
          localStorage.removeItem('gwn_auth_username');
          localStorage.removeItem('gwn_auth_role');
        } catch {
          // Ignore storage errors during startup token cleanup
        }
        updateHomeAuthDisplay();
        if (currentScreen === 'community') updateCommunityAuthDisplay();
      },
      onValidated: (data) => {
        if (data && data.user && data.user.role) {
          authRole = data.user.role;
          // localStorage.setItem can throw (quota / storage-unavailable).
          // Isolate the failure so score sync still runs on success.
          try {
            localStorage.setItem('gwn_auth_role', authRole);
          } catch {
            // Storage unavailable — role survives in-memory; will retry on next login.
          }
          updateHomeAuthDisplay();
          if (currentScreen === 'community') updateCommunityAuthDisplay();
        }
        // CS52-5: silent token refresh on boot is NOT a sync trigger
        // (boot-quiet contract). Token is valid; defer the actual sync until
        // the next user gesture (score-submit, navigation, sync-now button).
        // We do, however, opportunistically migrate any pre-CS52 queued
        // entries from the legacy localStorage keys into L1 — that's a
        // local-only operation, no network/DB activity.
        try { migrateLegacyQueues(); } catch { /* ignore */ }
      },
      // onDeferred intentionally omitted — silent defer per CS53-4 / Policy 1.
    }).catch(() => {
      // Belt-and-suspenders: match the prior boot path's terminal `.catch(() => {})`
      // so any unexpected error never surfaces as an unhandledrejection.
    });
  }

  // Fetch puzzles from server (non-blocking, falls back to local data)
  fetchPuzzlesFromServer();

  // Gallery filter listeners
  const galleryCatFilter = document.getElementById('gallery-category-filter');
  if (galleryCatFilter) {
    galleryCatFilter.addEventListener('change', () => {
      galleryCategory = galleryCatFilter.value;
      galleryPage = 1;
      loadGallery();
    });
  }
  document.querySelectorAll('[data-gallery-difficulty]').forEach(btn => {
    btn.addEventListener('click', () => {
      galleryDifficulty = btn.dataset.galleryDifficulty;
      document.querySelectorAll('[data-gallery-difficulty]').forEach(b => {
        b.classList.toggle('active', b === btn);
      });
      galleryPage = 1;
      loadGallery();
    });
  });

  // Keyboard support: 1-4 selects options during game or match
  document.addEventListener('keydown', (e) => {
    if (currentScreen !== 'game' && currentScreen !== 'match') return;
    const index = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key];
    if (index === undefined) return;
    const selector = currentScreen === 'match'
      ? '[data-bind="match-options"] .option-btn'
      : '.option-btn';
    const btns = document.querySelectorAll(selector);
    if (btns[index] && !btns[index].disabled) {
      btns[index].click();
    }
  });

  // Keyboard activation for notification items (Enter/Space → click)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const notifItem = e.target.closest('.notification-item');
    if (notifItem && !e.target.closest('[data-action]')) {
      e.preventDefault();
      notifItem.click();
    }
  });

  // Auth form submit handler — Enter key triggers login/register
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      authAction(currentAuthMode);
    });
  }

  // Wire up button actions
  document.addEventListener('click', (e) => {
    // Handle notification item click → highlight submission
    const notifItem = e.target.closest('.notification-item');
    if (notifItem && !e.target.closest('[data-action]')) {
      const subId = notifItem.dataset.submissionId;
      if (subId) highlightSubmissionFromNotification(Number(subId));
      return;
    }

    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    // While a Ranked create-session request is in flight, any navigation
    // action (anything that isn't another start-ranked-* click) means the
    // user has lost interest in Ranked. Abort the in-flight session so its
    // resolution doesn't hijack the user away with showScreen('game'),
    // then fall through and run the action they actually clicked.
    if (rankedStartInFlight && !/^start-ranked-/.test(action)) {
      try { Game.abortRanked && Game.abortRanked(); } catch { /* ignore */ }
      rankedStartInFlight = false;
    }

    switch (action) {
      case 'start-freeplay':
        if (!isLoggedIn()) showSignInBanner();
        showScreen('category');
        renderCategories();
        break;
      case 'start-daily':
        if (!isLoggedIn()) showSignInBanner();
        Game.startDaily(localPuzzles, ui);
        break;
      case 'start-ranked-freeplay':
      case 'start-ranked-daily':
        handleStartRanked(action === 'start-ranked-daily' ? 'ranked_daily' : 'ranked_freeplay');
        break;
      case 'connectivity-sign-in':
        authReturnScreen = currentScreen;
        showScreen('auth');
        break;
      case 'ranked-abandoned-practice':
        dismissRankedAbandonedOverlay();
        showScreen('category');
        renderCategories();
        break;
      case 'ranked-abandoned-home':
        dismissRankedAbandonedOverlay();
        showScreen('home');
        break;
      case 'go-home':
        disconnectWebSocket();
        resetMatchState();
        if (currentScreen === 'auth') authReturnScreen = null;
        if (galleryReturnScreen && (currentScreen === 'gameover' || currentScreen === 'game' || currentScreen === 'result')) {
          galleryReturnScreen = null;
          showCommunityGallery();
        } else {
          galleryReturnScreen = null;
          showScreen('home');
          updateHomeAuthDisplay();
        }
        break;
      case 'next-round':
        Game.nextRound(ui);
        break;
      case 'play-again':
        if (galleryReturnScreen) {
          galleryReturnScreen = null;
          showCommunityGallery();
        } else {
          showScreen('category');
          renderCategories();
        }
        break;
      case 'share-result':
        Game.shareResult();
        showToast('Copied to clipboard! 📋');
        break;
      case 'skip-round':
        Game.skipRound(ui);
        break;
      case 'show-leaderboard':
        showScreen('leaderboard');
        leaderboardMode = 'freeplay';
        leaderboardSource = 'ranked';
        setActiveLeaderboardMode('freeplay');
        setActiveLeaderboardSource('ranked');
        setActiveLeaderboardTab('alltime');
        fetchPersonalBests();
        fetchLeaderboard('alltime');
        break;
      case 'show-achievements':
        if (isLoggedIn()) {
          showScreen('achievements');
          fetchAchievements();
        } else {
          showScreen('auth');
        }
        break;
      case 'show-submit-puzzle':
        if (!isLoggedIn()) {
          showScreen('auth');
        } else if (isFeatureEnabled('submitPuzzle')) {
          openSubmitPuzzleScreen();
        } else {
          showToast('Puzzle submissions are not enabled for your account yet');
        }
        break;
      case 'browse-community':
        showCommunityGallery();
        break;
      case 'create-puzzle':
        if (!isLoggedIn()) {
          authReturnScreen = 'submit-puzzle';
          showScreen('auth');
        } else if (isFeatureEnabled('submitPuzzle')) {
          openSubmitPuzzleScreen();
        } else {
          showComingSoonTooltip(e.target.closest('[data-action]'));
        }
        break;
      case 'show-my-submissions':
        if (!isLoggedIn()) {
          showScreen('auth');
        } else if (isFeatureEnabled('submitPuzzle')) {
          showMySubmissions();
        } else {
          showToast('Puzzle submissions are not enabled for your account yet');
        }
        break;
      case 'toggle-reviewer-notes': {
        const toggleButton = e.target.closest('[data-action="toggle-reviewer-notes"]');
        const notesContent = toggleButton?.closest('.submission-reviewer-notes')?.querySelector('.submission-notes-content');
        if (toggleButton && notesContent) {
          const isExpanded = notesContent.classList.toggle('expanded');
          toggleButton.setAttribute('aria-expanded', String(isExpanded));
          toggleButton.textContent = isExpanded ? '📝 Reviewer notes ▾' : '📝 Reviewer notes ▸';
        }
        break;
      }
      case 'edit-submission': {
        const editId = e.target.closest('[data-action="edit-submission"]')?.dataset.submissionId;
        if (editId) openEditSubmission(Number(editId));
        break;
      }
      case 'cancel-edit-submission': {
        const cancelCard = e.target.closest('.submission-card');
        if (cancelCard) cancelEditSubmission(cancelCard);
        break;
      }
      case 'save-edit-submission': {
        const saveCard = e.target.closest('.submission-card');
        if (saveCard) saveEditSubmission(saveCard);
        break;
      }
      case 'delete-submission': {
        const deleteId = e.target.closest('[data-action="delete-submission"]')?.dataset.submissionId;
        if (deleteId) showDeleteConfirmation(Number(deleteId));
        break;
      }
      case 'confirm-delete-submission': {
        const confirmId = e.target.closest('[data-action="confirm-delete-submission"]')?.dataset.submissionId;
        if (confirmId) confirmDeleteSubmission(Number(confirmId));
        break;
      }
      case 'cancel-delete-submission': {
        const cancelDeleteCard = e.target.closest('.submission-card');
        if (cancelDeleteCard) {
          const overlay = cancelDeleteCard.querySelector('.submission-delete-confirm');
          if (overlay) overlay.remove();
        }
        break;
      }
      case 'mark-notification-read': {
        const nid = e.target.closest('[data-action="mark-notification-read"]')?.dataset.notificationId;
        if (nid) markNotificationRead(Number(nid));
        break;
      }
      case 'mark-all-notifications-read':
        markAllNotificationsRead();
        break;
      case 'toggle-notifications': {
        const toggleBtn = e.target.closest('[data-action="toggle-notifications"]');
        const nList = document.querySelector('[data-bind="notifications-list"]');
        if (toggleBtn && nList) {
          const expanded = nList.style.display !== 'none';
          nList.style.display = expanded ? 'none' : '';
          toggleBtn.setAttribute('aria-expanded', String(!expanded));
          const unreadCountEl =
            toggleBtn.querySelector('[data-bind="notifications-unread-count"]')
            || document.querySelector('[data-bind="notifications-unread-count"]');
          if (unreadCountEl) {
            toggleBtn.replaceChildren(
              document.createTextNode('🔔 Notifications ('),
              unreadCountEl,
              document.createTextNode(expanded ? ' unread) ▸' : ' unread) ▾')
            );
          }
        }
        break;
      }
      case 'toggle-onboarding':
        toggleOnboarding();
        break;
      case 'dismiss-onboarding':
        dismissOnboarding();
        break;
      case 'show-moderation':
        if (isLoggedIn() && (authRole === 'admin' || authRole === 'system')) {
          showScreen('moderation');
          loadModerationSubmissions();
          loadModerationStats();
        }
        break;
      case 'gallery-load-more':
        galleryPage += 1;
        loadGallery(true);
        break;
      case 'gallery-play': {
        const puzzleId = e.target.closest('[data-puzzle-id]')?.dataset.puzzleId;
        if (puzzleId) playGalleryPuzzle(puzzleId);
        break;
      }
      case 'leaderboard-mode': {
        const mode = e.target.dataset.mode;
        if (mode) {
          // CS52-6: multiplayer has no offline path (server-validated only)
          // and hides the source tabs; if the user had selected Offline on
          // Free Play / Daily, snap back to the default `ranked` so the
          // hidden state can't strand them with an empty list.
          if (mode === 'multiplayer' && leaderboardSource !== 'ranked') {
            leaderboardSource = 'ranked';
            setActiveLeaderboardSource('ranked');
          }
          leaderboardMode = mode;
          setActiveLeaderboardMode(mode);
          // Show/hide period tabs for multiplayer (they apply to both)
          setActiveLeaderboardTab('alltime');
          fetchLeaderboard('alltime');
        }
        break;
      }
      case 'leaderboard-source': {
        const source = e.target.dataset.source;
        if (source && source !== leaderboardSource) {
          // CS52-6 § Telemetry: structured client log for filter changes.
          // Visible in App Insights customEvents once the browser SDK is
          // wired (CS54-9). Until then this lands in `console.info`.
          console.info(JSON.stringify({
            event: 'lb_filter_change',
            from: leaderboardSource,
            to: source,
            mode: leaderboardMode,
            ts: new Date().toISOString(),
          }));
          leaderboardSource = source;
          setActiveLeaderboardSource(source);
          // Re-render from the active period.
          const activeTab = document.querySelector('.leaderboard-tab.active');
          const period = activeTab?.dataset.period || 'alltime';
          fetchLeaderboard(period);
        }
        break;
      }
      case 'leaderboard-tab': {
        const period = e.target.dataset.period;
        if (period) {
          setActiveLeaderboardTab(period);
          fetchLeaderboard(period);
        }
        break;
      }
      case 'start-multiplayer':
        if (isLoggedIn()) {
          showScreen('multiplayer');
        } else {
          showScreen('auth');
        }
        break;
      case 'show-auth-login':
        showScreen('auth');
        break;
      case 'auth-toggle-mode':
        setAuthMode(currentAuthMode === 'login' ? 'register' : 'login');
        break;
      case 'logout':
        logout();
        break;
      case 'create-room':
        createRoom();
        break;
      case 'join-room': {
        const codeInput = document.getElementById('join-room-code');
        joinRoom(codeInput ? codeInput.value : '');
        break;
      }
      case 'copy-room-code': {
        const code = document.querySelector('[data-bind="lobby-room-code"]')?.textContent;
        if (code) {
          navigator.clipboard.writeText(code).then(() => showToast('Room code copied!')).catch(() => {});
        }
        break;
      }
      case 'copy-room-link': {
        const roomCode = document.querySelector('[data-bind="lobby-room-code"]')?.textContent;
        if (roomCode) {
          const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomCode)}`;
          navigator.clipboard.writeText(url).then(() => showToast('Copied! 🔗')).catch(() => {});
        }
        break;
      }
      case 'toggle-sound': {
        const settings = Storage.getSettings();
        const newVal = !settings.sound;
        Storage.saveSetting('sound', newVal);
        updateSoundToggleButton();
        break;
      }
      case 'leave-lobby':
        disconnectWebSocket();
        resetMatchState();
        showScreen('multiplayer');
        break;
      case 'start-match':
        if (ws && matchState.isHost) {
          ws.send(JSON.stringify({ type: 'start-match' }));
        }
        break;
      case 'rematch':
        sendRematchRequest();
        break;
      case 'start-rematch':
        sendRematchStartConfirm();
        break;
      case 'show-match-history':
        showScreen('match-history');
        fetchMatchHistory();
        break;
      case 'back-to-multiplayer':
        showScreen('multiplayer');
        break;
      case 'reconnect-go-home':
        hideReconnectOverlay();
        disconnectWebSocket();
        resetMatchState();
        showScreen('home');
        break;
      case 'show-settings':
        loadSettingsUI();
        showScreen('settings');
        break;
      case 'show-community':
      case 'go-community':
        showScreen('community');
        updateCommunityAuthDisplay();
        break;
      case 'show-profile':
        if (isLoggedIn()) {
          showScreen('profile');
          fetchProfile();
        } else {
          showScreen('auth');
        }
        break;
    }
  });

  // Settings change listeners
  document.querySelectorAll('[data-setting]').forEach(el => {
    el.addEventListener('change', () => {
      const key = el.dataset.setting;
      let value;
      if (el.type === 'checkbox') {
        value = el.checked;
      } else if (key === 'timer') {
        value = parseInt(el.value, 10);
      } else {
        value = el.value;
      }
      Storage.saveSetting(key, value);
      if (key === 'theme') applyTheme(value);
      if (key === 'sound') updateSoundToggleButton();
    });
  });

  // Apply saved settings on load
  applySettings();

  // Wire community puzzle submission form
  initSubmitPuzzleForm();

  // Wire admin moderation screen
  initModerationScreen();

  // Handle ?room=CODE deep links
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const codeInput = document.getElementById('join-room-code');
    if (codeInput) codeInput.value = roomParam.toUpperCase();
    // Clean URL without reload
    window.history.replaceState({}, '', window.location.pathname);
    // If logged in, go to multiplayer; otherwise go to auth first
    if (isLoggedIn()) {
      showScreen('multiplayer');
    } else {
      showScreen('auth');
    }
  } else {
    showScreen('home');
  }
}

/** Apply the theme to the root element. */
function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.dataset.theme = 'light';
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** Apply all saved settings on load. */
function applySettings() {
  const settings = Storage.getSettings();
  applyTheme(settings.theme);
  updateSoundToggleButton();
}

/** Update the sound toggle button icon to reflect current state. */
function updateSoundToggleButton() {
  const btn = document.querySelector('[data-action="toggle-sound"]');
  if (!btn) return;
  btn.textContent = Storage.getSettings().sound ? '🔊' : '🔇';
}

/** Load current settings values into the settings form. */
function loadSettingsUI() {
  const settings = Storage.getSettings();
  const soundEl = document.getElementById('setting-sound');
  const themeEl = document.getElementById('setting-theme');
  const timerEl = document.getElementById('setting-timer');
  if (soundEl) soundEl.checked = settings.sound;
  if (themeEl) themeEl.value = settings.theme;
  if (timerEl) timerEl.value = String(settings.timer);
}

let leaderboardMode = 'freeplay';
// CS52-6 § Decision #6: public LBs default to `Ranked` (the competitive
// view). User flips between Ranked / Offline / All via the segmented
// control. Multiplayer hides the source tabs (no offline path).
let leaderboardSource = 'ranked';

/** Fetch and render personal bests section on the leaderboard screen. */
async function fetchPersonalBests() {
  const container = document.querySelector('[data-bind="personal-bests"]');
  if (!container) return;

  const signinHTML = '<div class="personal-bests-signin">🔑 Sign in to track your scores</div>';

  if (!isLoggedIn()) {
    container.innerHTML = signinHTML;
    return;
  }

  try {
    const res = await apiFetch('/api/scores/me');
    if (res.status === 401) {
      container.innerHTML = signinHTML;
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderPersonalBests(data.stats || []);
  } catch {
    container.innerHTML = '';
  }
}

/** Render personal bests card from stats data. */
function renderPersonalBests(stats) {
  const container = document.querySelector('[data-bind="personal-bests"]');
  if (!container) return;

  const freeplay = stats.find(s => s.mode === 'freeplay');
  const multiplayer = stats.find(s => s.mode === 'multiplayer');

  if (!freeplay && !multiplayer) {
    container.innerHTML = '<div class="personal-bests-card"><p class="personal-bests-empty">Play some Free Play or Multiplayer games to see your stats here! 🎮</p></div>';
    return;
  }

  let html = '<div class="personal-bests-card"><h3 class="personal-bests-title">📊 My Personal Bests</h3><div class="personal-bests-grid">';

  if (freeplay) {
    html += `<div class="personal-bests-stat">
      <span class="personal-bests-label">🎮 Free Play</span>
      <span class="personal-bests-value">${Number(freeplay.high_score).toLocaleString()}</span>
      <span class="personal-bests-detail">${Number(freeplay.games_played)} games · ${Number(freeplay.avg_score).toLocaleString()} avg</span>
    </div>`;
  }

  if (multiplayer) {
    html += `<div class="personal-bests-stat">
      <span class="personal-bests-label">⚔️ Multiplayer</span>
      <span class="personal-bests-value">${Number(multiplayer.high_score).toLocaleString()}</span>
      <span class="personal-bests-detail">${Number(multiplayer.games_played)} games · 🔥 ${Number(multiplayer.best_streak)} streak</span>
    </div>`;
  }

  html += '</div></div>';
  container.innerHTML = html;
}

/** Set the active leaderboard mode tab visually. */
function setActiveLeaderboardMode(mode) {
  document.querySelectorAll('.leaderboard-mode-tab').forEach(tab => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
  });
  // CS52-6: source tabs only apply to single-player LBs (multiplayer is
  // server-validated only — no offline path).
  const sourceTabs = document.querySelector('[data-bind="leaderboard-source-tabs"]');
  if (sourceTabs) {
    sourceTabs.style.display = mode === 'multiplayer' ? 'none' : '';
  }
}

/** Set the active leaderboard source tab (Ranked / Offline / All) visually. */
function setActiveLeaderboardSource(source) {
  document.querySelectorAll('.leaderboard-source-tab').forEach(tab => {
    const isActive = tab.dataset.source === source;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
  });
}

/** Set the active leaderboard tab visually. */
function setActiveLeaderboardTab(period) {
  document.querySelectorAll('.leaderboard-tab').forEach(tab => {
    const isActive = tab.dataset.period === period;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive);
  });
}

/** Fetch leaderboard data from the backend API and render it. */
async function fetchLeaderboard(period) {
  const container = document.querySelector('[data-bind="leaderboard-table"]');

  // CS52-6 § Public leaderboard contract:
  //   GET /api/scores/leaderboard?variant=freeplay|daily&source=ranked|offline|all
  //   GET /api/scores/leaderboard/multiplayer?source=ranked|offline|all
  // `variant` is REQUIRED on the non-multiplayer endpoint (server returns
  // 400 if missing). `source` defaults to 'ranked' but we always pass it
  // explicitly so the response carries the echo we expect.
  const url = leaderboardMode === 'multiplayer'
    ? `/api/scores/leaderboard/multiplayer?source=${leaderboardSource}&period=${period}`
    : `/api/scores/leaderboard?variant=${leaderboardMode}&source=${leaderboardSource}&period=${period}`;

  const data = await progressiveLoad(
    async (signal) => {
      const res = await apiFetch(url, { signal });
      await throwIfRetryable(res);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    container,
    MESSAGE_SETS.leaderboard,
    { onRetry: () => fetchLeaderboard(period) },
  );

  if (data) {
    // Server returns both `rows` (CS52-6 canonical) and `leaderboard`
    // (legacy alias). Prefer `rows`.
    const entries = data.rows || data.leaderboard || [];
    if (leaderboardMode === 'multiplayer') {
      renderMultiplayerLeaderboard(entries);
    } else {
      renderLeaderboard(entries);
    }
  }
}

// CS52-5: submitScore() / buildScorePayload() were replaced by the
// unified /api/sync flow via public/js/sync-client.js. The legacy
// /api/scores route still exists server-side for backward-compat.

/** Show a subtle sync status indicator. */
function showSyncIndicator(message) {
  let indicator = document.querySelector('.sync-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'sync-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    document.body.appendChild(indicator);
  }
  indicator.textContent = message;
  indicator.classList.add('visible');
  clearTimeout(indicator._hideTimer);
  indicator._hideTimer = setTimeout(() => {
    indicator.classList.remove('visible');
  }, 3000);
}

/**
 * Render a CS52-6 provenance badge for a score row.
 * - 'ranked'  → green/primary (server-validated)
 * - 'offline' → amber (self-reported)
 * - 'legacy'  → muted (pre-CS52; profile-only)
 */
function provenanceBadgeHTML(source) {
  if (!source) return '';
  const labels = { ranked: 'Ranked', offline: 'Offline', legacy: 'Legacy' };
  const label = labels[source];
  if (!label) return '';
  return `<span class="provenance-badge provenance-${source}" data-source="${source}" aria-label="Score source: ${label}">${label}</span>`;
}

/** Render leaderboard rows from API data. */
function renderLeaderboard(entries) {
  const container = document.querySelector('[data-bind="leaderboard-table"]');

  if (!entries || entries.length === 0) {
    container.innerHTML = '<div class="leaderboard-empty">No scores yet — be the first! 🎮</div>';
    return;
  }

  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

  container.innerHTML = entries.map((entry, i) => {
    const rank = entry.rank ?? i + 1;
    const medal = medals[rank] || '';
    const rankClass = rank <= 3 ? ` rank-${rank}` : '';
    const isUser = entry.isCurrentUser || (isLoggedIn() && authUsername && entry.username === authUsername);
    const userClass = isUser ? ' current-user' : '';
    const name = escapeHTML(entry.username || 'Anonymous');
    const score = entry.score ?? 0;
    const badge = provenanceBadgeHTML(entry.source);

    return `<div class="leaderboard-row${rankClass}${userClass}" role="listitem">
      ${medal ? `<span class="leaderboard-medal">${medal}</span>` : `<span class="leaderboard-rank">${rank}</span>`}
      <span class="leaderboard-name">${name}${isUser ? ' <span class="you-badge">You</span>' : ''}${badge}</span>
      <span class="leaderboard-score">${score.toLocaleString()}</span>
    </div>`;
  }).join('');
}

/** Render multiplayer leaderboard with wins, W/L, avg score. */
function renderMultiplayerLeaderboard(entries) {
  const container = document.querySelector('[data-bind="leaderboard-table"]');

  if (!entries || entries.length === 0) {
    container.innerHTML = '<div class="leaderboard-empty">No multiplayer matches yet — challenge someone! ⚔️</div>';
    return;
  }

  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

  container.innerHTML = entries.map((entry, i) => {
    const rank = entry.rank ?? i + 1;
    const medal = medals[rank] || '';
    const rankClass = rank <= 3 ? ` rank-${rank}` : '';
    const isUser = entry.isCurrentUser || (isLoggedIn() && authUsername && entry.username === authUsername);
    const userClass = isUser ? ' current-user' : '';
    const name = escapeHTML(entry.username || 'Anonymous');
    // CS52-6: multiplayer rows are server-validated only; render the
    // `Ranked` provenance badge for visual consistency with the other LBs.
    const badge = provenanceBadgeHTML(entry.source || 'ranked');

    return `<div class="leaderboard-row${rankClass}${userClass}" role="listitem">
      ${medal ? `<span class="leaderboard-medal">${medal}</span>` : `<span class="leaderboard-rank">${rank}</span>`}
      <span class="leaderboard-name">${name}${isUser ? ' <span class="you-badge">You</span>' : ''}${badge}</span>
      <span class="leaderboard-stats">
        <span class="leaderboard-wins">${entry.wins}W</span>
        <span class="leaderboard-winrate">${entry.winRate}%</span>
        <span class="leaderboard-matches">${entry.matchesPlayed} played</span>
      </span>
      <span class="leaderboard-score">${(entry.avgScore ?? 0).toLocaleString()} avg</span>
    </div>`;
  }).join('');
}

/** Escape HTML to prevent XSS when rendering user-supplied text. */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Return ordinal string for a number (1st, 2nd, 3rd, …). */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ===========================
   Achievements Module
   =========================== */

/** Fetch and render all achievements. */
async function fetchAchievements() {
  const container = document.querySelector('[data-bind="achievements-grid"]');
  if (!container) return;

  const data = await progressiveLoad(
    async (signal) => {
      const res = await apiFetch('/api/achievements', { signal });
      if (res.status === 401) return null;
      await throwIfRetryable(res);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    container,
    MESSAGE_SETS.achievements,
    { onRetry: () => fetchAchievements() },
  );

  if (data) {
    renderAchievements(data.achievements);
  }
}

/** Render the achievements grid. */
function renderAchievements(achievements) {
  const container = document.querySelector('[data-bind="achievements-grid"]');
  if (!container) return;

  if (!achievements || achievements.length === 0) {
    container.innerHTML = '<div class="achievements-loading">No achievements yet — keep playing!</div>';
    return;
  }

  container.innerHTML = achievements.map(a => {
    const state = a.unlocked ? 'unlocked' : 'locked';
    return `<div class="achievement-card ${state}">
      <span class="achievement-icon">${a.icon}</span>
      <div class="achievement-info">
        <span class="achievement-name">${escapeHTML(a.name)}</span>
        <span class="achievement-desc">${escapeHTML(a.description)}</span>
      </div>
      ${a.unlocked ? '<span class="achievement-check">✅</span>' : '<span class="achievement-lock">🔒</span>'}
    </div>`;
  }).join('');
}

/** Show toast notifications for newly unlocked achievements. */
function showAchievementToasts(achievements) {
  achievements.forEach((a, i) => {
    setTimeout(() => {
      const toast = document.createElement('div');
      toast.className = 'achievement-toast';
      toast.innerHTML = `<span class="achievement-toast-icon">${a.icon}</span> <strong>${escapeHTML(a.name)}</strong> unlocked!`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3500);
    }, i * 1200);
  });
}

/* ===========================
   Multiplayer Module
   =========================== */

let ws = null;
let authToken = localStorage.getItem('gwn_auth_token');
let authUsername = localStorage.getItem('gwn_auth_username');
let authRole = localStorage.getItem('gwn_auth_role');

/** Decode a JWT payload (no verification — server enforces that). */
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const remainder = padded.length % 4;
    if (remainder === 1) return null;
    const fullyPadded = padded + '='.repeat((4 - remainder) % 4);
    return JSON.parse(atob(fullyPadded));
  } catch { return null; }
}

/** Current signed-in user_id from the JWT, or null when signed-out. */
function getCurrentUserId() {
  if (!authToken) return null;
  const payload = decodeJwtPayload(authToken);
  return payload && Number.isFinite(payload.id) ? payload.id : null;
}
let currentAuthMode = 'login';
const DEFAULT_FEATURE_FLAGS = Object.freeze({
  submitPuzzle: false,
});
let featureFlags = { ...DEFAULT_FEATURE_FLAGS };
let authReturnScreen = null;
let matchState = {
  roomCode: null,
  players: [],
  lobbyPlayers: [],
  isHost: false,
  isSpectator: false,
  spectatorCount: 0,
  myName: null,
  scores: {},
  disconnectedPlayers: new Set(),
  totalRounds: 5,
  currentRound: 0,
  roundStartedAt: null,
  roundTimer: null,
};

/** Check if user is logged in. */
function isLoggedIn() {
  return !!authToken;
}

function resetFeatureFlags() {
  featureFlags = { ...DEFAULT_FEATURE_FLAGS };
}

function isFeatureEnabled(featureName) {
  return !!featureFlags[featureName];
}

function getFeatureAwarePath(path) {
  const params = new URLSearchParams(window.location.search);
  const featureParams = new URLSearchParams();

  for (const [key, value] of params.entries()) {
    if (key.startsWith('ff_')) {
      featureParams.append(key, value);
    }
  }

  const query = featureParams.toString();
  if (!query) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}

async function refreshFeatureFlags() {
  try {
    const res = await apiFetch(getFeatureAwarePath('/api/features'));
    if (!res.ok) {
      resetFeatureFlags();
      updateHomeAuthDisplay();
      if (currentScreen === 'community') updateCommunityAuthDisplay();
      return;
    }

    const data = await res.json();
    featureFlags = {
      ...DEFAULT_FEATURE_FLAGS,
      ...(data.features || {}),
    };
  } catch {
    resetFeatureFlags();
  }

  updateHomeAuthDisplay();
  if (currentScreen === 'community') updateCommunityAuthDisplay();
}

/** Update auth top bar and home screen to reflect auth state. */
function updateHomeAuthDisplay() {
  // Update persistent top bar
  const loggedOutBar = document.querySelector('[data-bind="auth-bar-logged-out"]');
  const loggedInBar = document.querySelector('[data-bind="auth-bar-logged-in"]');
  const usernameText = document.querySelector('[data-bind="auth-bar-username-text"]');
  const communityBtn = document.querySelector('[data-action="show-community"]');

  if (isLoggedIn() && authUsername) {
    if (loggedOutBar) loggedOutBar.style.display = 'none';
    if (loggedInBar) loggedInBar.style.display = '';
    if (usernameText) usernameText.textContent = authUsername;
    refreshNotificationBadge();
  } else {
    if (loggedOutBar) loggedOutBar.style.display = '';
    if (loggedInBar) loggedInBar.style.display = 'none';
    updateNotificationBadge(0);
  }

  // CS20-3: Hide multiplayer button when not logged in
  const mpBtn = document.querySelector('[data-action="start-multiplayer"]');
  if (mpBtn) mpBtn.style.display = isLoggedIn() ? '' : 'none';
  // Community Puzzles button hidden when submitPuzzle flag is off
  if (communityBtn) communityBtn.style.display = isFeatureEnabled('submitPuzzle') ? '' : 'none';
}

/** Switch auth screen between login and register modes. */
function setAuthMode(mode) {
  const normalizedMode = mode === 'register' ? 'register' : 'login';
  currentAuthMode = normalizedMode;
  const title = document.querySelector('[data-bind="auth-screen-title"]');
  const subtitle = document.querySelector('[data-bind="auth-screen-subtitle"]');
  const submitBtn = document.querySelector('[data-bind="auth-submit-btn"]');
  const togglePrompt = document.querySelector('[data-bind="auth-toggle-prompt"]');
  const toggleLink = document.querySelector('[data-bind="auth-toggle-link"]');

  if (normalizedMode === 'register') {
    if (title) title.textContent = 'Create Account';
    if (subtitle) subtitle.textContent = 'Register a new account for multiplayer';
    if (submitBtn) { submitBtn.textContent = 'Register'; submitBtn.setAttribute('aria-label', 'Create account'); }
    if (togglePrompt) togglePrompt.textContent = 'Already have an account?';
    if (toggleLink) toggleLink.textContent = 'Login';
  } else {
    if (title) title.textContent = 'Sign In';
    if (subtitle) subtitle.textContent = 'Log in to access multiplayer';
    if (submitBtn) { submitBtn.textContent = 'Login'; submitBtn.setAttribute('aria-label', 'Log in'); }
    if (togglePrompt) togglePrompt.textContent = "Don\u2019t have an account?";
    if (toggleLink) toggleLink.textContent = 'Register';
  }

  bindText('auth-error', '');
}

/** Update community screen to reflect auth + feature flag state. */
function updateCommunityAuthDisplay() {
  const createBtn = document.querySelector('[data-bind="community-create-btn"]');
  const mySubBtn = document.querySelector('[data-bind="my-submissions-btn"]');
  const modBtn = document.querySelector('[data-bind="moderation-btn"]');

  // Create Puzzle is gated behind submitPuzzle flag (visible only when flag is on)
  if (createBtn) createBtn.style.display = isFeatureEnabled('submitPuzzle') ? '' : 'none';
  // My Submissions requires login AND submitPuzzle flag
  if (mySubBtn) mySubBtn.style.display = (isLoggedIn() && isFeatureEnabled('submitPuzzle')) ? '' : 'none';
  // Moderation requires admin/system role
  if (modBtn) {
    modBtn.style.display = (isLoggedIn() && (authRole === 'admin' || authRole === 'system')) ? '' : 'none';
  }
}

/** Log out: clear credentials, close WS, and return to home.
 *
 * CS52-5 § Sign-out semantics: clear L2 entirely, demote L1 user_id → null
 * (records become guest records and re-surface in the claim prompt on next
 * sign-in), abort any in-flight sync.
 */
function logout() {
  // CS52-5: clear L2, demote L1, abort in-flight (must run BEFORE clearing
  // authToken so the in-flight controller signal still has the user context).
  try { syncHandleSignOut(); } catch { /* localStorage may be unavailable */ }
  authToken = null;
  authUsername = null;
  authRole = null;
  authReturnScreen = null;
  resetFeatureFlags();
  localStorage.removeItem('gwn_auth_token');
  localStorage.removeItem('gwn_auth_username');
  localStorage.removeItem('gwn_auth_role');
  if (ws) { disconnectWebSocket(); }
  updateHomeAuthDisplay();
  showScreen('home');
}

/** Central API fetch wrapper — adds auth header and handles 401 automatically.
 *
 * Set ``options.skipAuthHandling`` to ``true`` to suppress the 401-triggered
 * ``logout()`` / toast / screen-change side effects. Used by the boot-time
 * stored-token validator (CS53-4) which must silently clear an invalid token
 * without dragging the user to the auth screen before any user interaction.
 */
async function apiFetch(url, options = {}) {
  const opts = { ...options };
  const skipAuthHandling = opts.skipAuthHandling === true;
  delete opts.skipAuthHandling;
  opts.headers = { ...opts.headers };
  if (authToken) {
    opts.headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, opts);
  if (res.status === 401 && authToken && !skipAuthHandling) {
    logout();
    showToast('Session expired — please log in again');
    showScreen('auth');
  }
  return res;
}

// CS52-5: legacy `gwn_pending_scores` queue + queueScoreForSync() were
// replaced by the unified L1 store in public/js/sync-client.js. The one-time
// migrateLegacyQueues() drain (called from auth-boot's onValidated and from
// the sign-in success path) folds any pre-existing entries into L1.

/**
 * CS52-5 § Claim prompt: when L1 contains records that need to be re-attributed
 * to the just-signed-in user (unattached guest records, or records left over
 * from a prior signed-in session), surface a single combined confirm prompt.
 *
 * Decline → records stay untouched and re-surface on next sign-in.
 */
async function maybeShowClaimPrompt() {
  const userId = getCurrentUserId();
  if (userId == null) return;
  let claimable;
  try { claimable = findClaimableRecords(userId); }
  catch { return; }
  const total = claimable.unattached.length + claimable.mismatched.length;
  if (total === 0) return;
  // CS52-4 § Claim prompt — accessible custom modal (replaces MVP confirm()).
  // Decline leaves records untouched; they re-surface on next sign-in.
  const decision = await showClaimPromptModal({
    total,
    unattachedCount: claimable.unattached.length,
    mismatchedCount: claimable.mismatched.length,
  });
  if (decision === 'accept') {
    try { applyClaim(userId); } catch { /* ignore */ }
  }
}

/** Progressive messages shown on the submit button during slow auth requests. */
const AUTH_PROGRESSIVE_MESSAGES = {
  login: [
    { delay: 0, text: 'Signing in\u2026' },
    { delay: 4000, text: 'Still working on it\u2026' },
    { delay: 9000, text: 'The server is waking up \u2615' },
    { delay: 16000, text: 'Almost there \u2014 warming up the database \ud83d\ude34' },
    { delay: 25000, text: 'Hang tight \u2014 first login of the day takes a moment! \ud83c\udfb2' },
  ],
  register: [
    { delay: 0, text: 'Creating your account\u2026' },
    { delay: 4000, text: 'Setting things up\u2026' },
    { delay: 9000, text: 'The server is stretching after a nap \u2615' },
    { delay: 16000, text: 'Almost ready \u2014 just warming up! \ud83d\ude34' },
    { delay: 25000, text: 'First user of the day \u2014 the database is waking up for you! \ud83c\udfb2' },
  ],
};

const AUTH_TIMEOUT_MS = 45000;
// CS53-17: cold-start retry loop deadline. Aligned with progressive-loader
// MAX_WARMUP_BUDGET_MS so a single auth click can succeed across an Azure
// SQL serverless cold-start (~30-90s). AUTH_TIMEOUT_MS still bounds each
// individual fetch attempt; the retry loop terminates whichever fires first.
const AUTH_WARMUP_DEADLINE_MS = 120000;
// CS53-17 v3 (rubber-duck #3): minimum time we'll allocate to a fresh fetch
// attempt. If less than this remains in the warmup budget after a sleep, bail
// out cleanly instead of starting a near-zero-timeout attempt that will almost
// certainly abort and surface a misleading "Request timed out" error.
const AUTH_MIN_ATTEMPT_MS = 1500;
let authSubmitting = false;
let authProgressiveTimers = [];

/** Disable all auth form interactive elements and start progressive messages. */
function lockAuthForm(action) {
  const authScreen = document.getElementById('screen-auth');
  if (authScreen) {
    authScreen.classList.add('auth-submitting');
    authScreen.setAttribute('aria-busy', 'true');
  }

  const submitBtn = document.querySelector('[data-bind="auth-submit-btn"]');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const toggleLink = document.querySelector('[data-action="auth-toggle-mode"]');
  const backBtn = authScreen?.querySelector('[data-action="go-home"]');
  const statusEl = document.querySelector('[data-bind="auth-status"]');

  if (submitBtn) submitBtn.disabled = true;
  if (usernameInput) usernameInput.disabled = true;
  if (passwordInput) passwordInput.disabled = true;
  if (toggleLink) toggleLink.disabled = true;
  if (backBtn) backBtn.disabled = true;

  // Start progressive button text escalation
  const messages = AUTH_PROGRESSIVE_MESSAGES[action] || AUTH_PROGRESSIVE_MESSAGES.login;
  for (const { delay, text } of messages) {
    if (delay === 0) {
      if (submitBtn) submitBtn.textContent = text;
      if (statusEl) statusEl.textContent = text;
    } else {
      const timerId = setTimeout(() => {
        if (submitBtn) submitBtn.textContent = text;
        if (statusEl) statusEl.textContent = text;
      }, delay);
      authProgressiveTimers.push(timerId);
    }
  }
}

/** Re-enable all auth form interactive elements and restore button text. */
function unlockAuthForm(action) {
  const authScreen = document.getElementById('screen-auth');
  if (authScreen) {
    authScreen.classList.remove('auth-submitting');
    authScreen.removeAttribute('aria-busy');
  }

  // Clear progressive message timers
  for (const id of authProgressiveTimers) clearTimeout(id);
  authProgressiveTimers = [];

  const submitBtn = document.querySelector('[data-bind="auth-submit-btn"]');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const toggleLink = document.querySelector('[data-action="auth-toggle-mode"]');
  const backBtn = authScreen?.querySelector('[data-action="go-home"]');
  const statusEl = document.querySelector('[data-bind="auth-status"]');

  if (submitBtn) submitBtn.disabled = false;
  if (usernameInput) usernameInput.disabled = false;
  if (passwordInput) passwordInput.disabled = false;
  if (toggleLink) toggleLink.disabled = false;
  if (backBtn) backBtn.disabled = false;
  if (statusEl) statusEl.textContent = '';

  // Restore button text + aria-label via setAuthMode (avoids duplicating labels)
  setAuthMode(action);

  authSubmitting = false;
}

/** Perform login or register. */
async function authAction(action) {
  if (authSubmitting) return;

  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  bindText('auth-error', '');

  if (!username || !password) {
    bindText('auth-error', 'Username and password required');
    return;
  }

  authSubmitting = true;
  lockAuthForm(action);

  const endpoint = action === 'login' ? '/api/auth/login' : '/api/auth/register';
  const warmupDeadline = Date.now() + AUTH_WARMUP_DEADLINE_MS;

  // CS53-17: cold-start aware retry. On 503 + Retry-After (server warming up),
  // sleep and retry inside AUTH_WARMUP_DEADLINE_MS instead of leaking the raw
  // "Database not yet initialized" message to the user. Each fetch attempt
  // gets its own AbortController bounded by AUTH_TIMEOUT_MS so individual
  // hangs still fail fast; the warmup deadline bounds the overall loop.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const parseRetryAfterMs = (res, body) => {
    const header = res.headers.get('Retry-After');
    if (header) {
      const s = parseInt(header, 10);
      if (!isNaN(s) && s >= 0) return s * 1000;
    }
    if (body && typeof body.retryAfter === 'number' && body.retryAfter >= 0) {
      return body.retryAfter * 1000;
    }
    return null;
  };

  // CS53-17 v3 (rubber-duck #1): for register, terminal warmup-class failures
  // are ambiguous — POST /api/auth/register can have already inserted the
  // user even if we saw a 502/504/AbortError. Nudging the user to "try again"
  // would risk a misleading "username taken" on the next attempt. Steer them
  // toward login instead.
  const authWarmupExhaustedMessage = (act) => act === 'register'
    ? 'Service temporarily unavailable. If your account may already have been created, try logging in.'
    : 'Server is warming up — please try again in a moment';
  const authGatewayMessage = (act) => act === 'register'
    ? 'Service temporarily unavailable. If your account may already have been created, try logging in.'
    : 'Service temporarily unavailable — please try again';

  let activeController = null;
  let activeTimeoutId = null;
  // Clears the per-attempt timeout and drops the controller reference. Does
  // NOT call activeController.abort() — by the time we call this, either the
  // fetch already settled (so abort is a no-op) or we deliberately want to
  // let an in-flight retry sleep complete cleanly. Named to match behavior
  // (Copilot review round 2, 2026-04-25).
  const clearActiveTimeout = () => {
    if (activeTimeoutId) { clearTimeout(activeTimeoutId); activeTimeoutId = null; }
    activeController = null;
  };

  try {
    let res, data, lastError;
    while (true) {
      // Cap per-attempt timeout by remaining warmup budget so total wall-clock
      // never overshoots AUTH_WARMUP_DEADLINE_MS by up to 45s (rubber-duck #1).
      const remainingBudget = warmupDeadline - Date.now();
      if (remainingBudget <= 0) {
        unlockAuthForm(action);
        bindText('auth-error', authWarmupExhaustedMessage(action));
        return;
      }
      const attemptTimeout = Math.min(AUTH_TIMEOUT_MS, remainingBudget);
      activeController = new AbortController();
      activeTimeoutId = setTimeout(() => activeController.abort(), attemptTimeout);
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          signal: activeController.signal,
        });
        data = await res.json().catch(() => ({}));
        lastError = null;
      } catch (err) {
        lastError = err;
        res = null;
        data = null;
      } finally {
        if (activeTimeoutId) { clearTimeout(activeTimeoutId); activeTimeoutId = null; }
      }

      // Non-warmup success or definitive failure → exit loop and let downstream
      // logic handle the response/error. Warmup-retryable statuses are
      // 503 (origin warming up) and 502/504 (gateway/proxy can't reach origin
      // — common during App Service cold-start swaps). For 502/504 we may not
      // get a Retry-After header (Caddy/Azure FD don't always send one), so
      // fall back to a 5s default.
      const isWarmupRetryable = res && (res.status === 503 || res.status === 502 || res.status === 504);
      if (res && !isWarmupRetryable) break;

      // 503 from the cold-start gate is safe to retry for register because
      // the gate runs BEFORE the route handler — the request did NOT hit any
      // state-mutating code. The gate is identified by `phase:'cold-start'`
      // in the response body. A 503 from the central error handler (e.g.
      // transient DB error during the INSERT inside POST /api/auth/register)
      // does NOT carry that field — and the request may have actually
      // succeeded server-side, so retrying could surface a misleading
      // "username taken" on the next attempt (code-review finding,
      // 2026-04-25). 502/504 (gateway) and AbortError have the same
      // ambiguity. Login is idempotent (no server-side state change on
      // failure) so all warmup-class statuses retry.
      if (action !== 'login') {
        if (lastError) break;                                // AbortError on register
        if (res && res.status !== 503) break;                // 502/504 on register
        if (res && res.status === 503 && (!data || data.phase !== 'cold-start')) break;
      } else if (lastError && lastError.name !== 'AbortError') {
        break;                                               // non-Abort error on login
      }

      // From here on we have either a warmup-retryable response or an
      // AbortError on login. Compute wait: prefer Retry-After header, else
      // server-supplied retryAfter body field, else default (5s for 503 to
      // match the server's gate; 5s for 502/504 since gateway has no signal).
      // Rubber-duck #2: server-provided Retry-After is authoritative — only
      // clamp the fallback path. Cap header-derived values at the remaining
      // warmup budget instead of an arbitrary 10s ceiling.
      let retryAfterMs;
      let waitFromServer = false;
      if (res) {
        retryAfterMs = parseRetryAfterMs(res, data);
        if (retryAfterMs === null) {
          // 503 without retry signal is terminal (likely not our warmup gate),
          // but 502/504 are inherently retryable so use a default.
          if (res.status === 503) break;
          retryAfterMs = 5000;
        } else {
          waitFromServer = true;
        }
      } else {
        retryAfterMs = 5000;
      }
      const wait = waitFromServer
        ? Math.max(retryAfterMs, 1000)
        : Math.min(Math.max(retryAfterMs, 1000), 10000);
      const remaining = warmupDeadline - Date.now();
      // Rubber-duck #3: bail if a post-sleep attempt would have less than
      // MIN_ATTEMPT_MS to actually run. Otherwise the final attempt aborts
      // immediately and surfaces a misleading "Request timed out" error.
      if (remaining <= wait + AUTH_MIN_ATTEMPT_MS) {
        unlockAuthForm(action);
        bindText('auth-error', authWarmupExhaustedMessage(action));
        return;
      }
      // Progressive messaging during retry is handled by lockAuthForm's
      // in-button text escalation (AUTH_PROGRESSIVE_MESSAGES). We deliberately
      // do NOT touch the auth-error slot here — it should only show terminal
      // errors, never transient progress.
      await sleep(wait);
    }
    clearActiveTimeout();

    if (lastError) {
      // Re-throw to the outer catch which preserves the existing AbortError /
      // network-error UX for non-warmup failures.
      throw lastError;
    }

    if (!res.ok) {
      unlockAuthForm(action);
      // CS53-17: don't leak internal server prose for warmup-class statuses
      // that fall through here (e.g. retry budget exhausted, or register
      // hitting 502/504 which we don't auto-retry for idempotency reasons).
      // 503 is the server's own gate; 502/504 are gateway/proxy errors.
      if (res.status === 503) {
        let friendly;
        const hasWarmupSignal =
          (typeof res.headers?.get === 'function' && res.headers.get('Retry-After')) ||
          (data && typeof data.retryAfter === 'number');
        if (data && data.unavailable && data.message) {
          // Permanent unavailability with server-supplied user-facing message.
          friendly = data.message;
        } else if (hasWarmupSignal) {
          // Our cold-start gate sends Retry-After + retryAfter. Trust it.
          friendly = authWarmupExhaustedMessage(action);
        } else {
          // Generic 503 (no warmup signal): don't pretend it's warmup.
          friendly = authGatewayMessage(action);
        }
        bindText('auth-error', friendly);
      } else if (res.status === 502 || res.status === 504) {
        // Gateway/proxy errors: response body is typically text/html from the
        // proxy, not actionable for the user. Show the same warmup-style
        // message as 503 since the cause is the same class of problem
        // (origin not reachable). For register, message also nudges toward
        // login because the request may have reached origin (rubber-duck #1).
        bindText('auth-error', authGatewayMessage(action));
      } else {
        bindText('auth-error', (data && data.error) || 'Something went wrong');
      }
      return;
    }

    authToken = data.token;
    authUsername = data.user.username;
    authRole = data.user.role || 'user';
    localStorage.setItem('gwn_auth_token', authToken);
    localStorage.setItem('gwn_auth_username', authUsername);
    localStorage.setItem('gwn_auth_role', authRole);

    // Clear form fields but keep form locked until navigation completes
    usernameInput.value = '';
    passwordInput.value = '';
    bindText('auth-error', '');

    await refreshFeatureFlags();

    // CS52-5 § Sync trigger #1: sign-in success IS a real user gesture, so
    // fire a single batched /api/sync. Migrate any pre-CS52 legacy queues
    // first, surface the claim prompt for any unattached / mismatched
    // records, then sync.
    try { migrateLegacyQueues(); } catch { /* ignore */ }
    await maybeShowClaimPrompt();
    syncNow({
      apiFetch,
      trigger: 'sign-in',
      currentUserId: getCurrentUserId(),
    }).then(result => {
      if (result && result.status === 200 && result.acked && result.acked.length > 0) {
        showSyncIndicator('Scores synced ✓');
      }
    }).catch(() => { /* surfaced via state machine + banner */ });

    // Unlock form only after post-login work completes
    unlockAuthForm(action);

    if (authReturnScreen) {
      const returnTo = authReturnScreen;
      authReturnScreen = null;
      if (returnTo === 'submit-puzzle' && isFeatureEnabled('submitPuzzle')) {
        openSubmitPuzzleScreen();
      } else if (returnTo === 'submit-puzzle') {
        showScreen('home');
        showToast('Puzzle submissions are not enabled for your account yet');
      } else {
        showScreen(returnTo);
      }
    } else {
      showScreen('multiplayer');
    }
  } catch (err) {
    unlockAuthForm(action);
    if (err && err.name === 'AbortError') {
      // Rubber-duck #1: register's terminal AbortError is ambiguous (the
      // request may have reached origin and created the user). Steer them
      // toward login instead of "try again".
      bindText('auth-error', action === 'register'
        ? 'Request timed out. If your account may already have been created, try logging in.'
        : 'Request timed out — please try again');
    } else {
      bindText('auth-error', 'Network error — is the server running?');
    }
  } finally {
    clearActiveTimeout();
  }
}

/** Connect WebSocket to the server. */
function connectWebSocket() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws?token=${encodeURIComponent(authToken)}`;
    ws = new WebSocket(url);

    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')));

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch { /* ignore malformed */ }
    });

    ws.addEventListener('close', () => {
      const wasInMatch = currentScreen === 'match' || currentScreen === 'match-result' || currentScreen === 'match-over';
      ws = null;
      if (wasInMatch && matchState.roomCode) {
        startReconnect();
      }
    });
  });
}

/** Disconnect WebSocket cleanly. */
function disconnectWebSocket() {
  reconnectState.active = false;
  if (ws) {
    ws.close();
    ws = null;
  }
}

/** Route incoming WebSocket messages. */
function handleWSMessage(msg) {
  switch (msg.type) {
    case 'connected':
      break;
    case 'joined':
      onJoined(msg);
      break;
    case 'player-joined':
      onPlayerJoined(msg);
      break;
    case 'lobby-state':
      onLobbyState(msg);
      break;
    case 'match-start':
      onMatchStart(msg);
      break;
    case 'round':
      onRound(msg);
      break;
    case 'answer-received':
      // No sound here — this event is sent to the answering player, not the opponent
      break;
    case 'roundResult':
      onRoundResult(msg);
      break;
    case 'gameOver':
      onGameOver(msg);
      break;
    case 'player-left':
      onPlayerLeft(msg);
      break;
    case 'reconnected':
      onReconnected(msg);
      break;
    case 'opponent-disconnected':
    case 'player-disconnected':
      onPlayerDisconnected(msg);
      break;
    case 'opponent-reconnected':
    case 'player-reconnected':
      onPlayerReconnected(msg);
      break;
    case 'player-forfeited':
      onPlayerForfeited(msg);
      break;
    case 'host-transferred':
      onHostTransferred(msg);
      break;
    case 'rematch-offered':
      onRematchOffered(msg);
      break;
    case 'rematch-ready':
      onRematchReady(msg);
      break;
    case 'rematch-start':
      onRematchStart(msg);
      break;
    case 'achievements-unlocked':
      if (msg.achievements && msg.achievements.length > 0) {
        showAchievementToasts(msg.achievements);
      }
      break;
    case 'spectator-joined':
      onSpectatorJoined(msg);
      break;
    case 'spectator-count':
      onSpectatorCount(msg);
      break;
    case 'error':
      showToast(msg.message || 'Server error');
      break;
  }
}

/** Create a new room via the API. */
async function createRoom() {
  try {
    await connectWebSocket();
  } catch {
    showToast('Could not connect to server');
    return;
  }

  try {
    const res = await apiFetch('/api/matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // CS52-7b: rounds / round_timer_ms / inter_round_delay_ms are
        // server-authoritative (sourced from game_configs); the client only
        // controls maxPlayers.
        maxPlayers: Number(document.getElementById('room-max-players')?.value) || 2,
      }),
    });
    const data = await res.json();
    if (res.status === 401) return;
    if (!res.ok) {
      showToast(data.error || 'Failed to create room');
      return;
    }

    matchState.roomCode = data.roomCode;
    matchState.myName = authUsername;
    matchState.players = [authUsername];
    matchState.maxPlayers = data.maxPlayers || 2;

    // Join via WebSocket
    ws.send(JSON.stringify({ type: 'join', roomCode: data.roomCode }));

    // Show lobby
    bindText('lobby-room-code', data.roomCode);
    bindText('lobby-player-count', `Players: 1/${matchState.maxPlayers}`);
    bindText('lobby-status', 'Waiting for opponent...');
    renderLobbyPlayers();
    showScreen('lobby');
  } catch {
    showToast('Network error — is the server running?');
  }
}

/** Join an existing room. */
async function joinRoom(code) {
  const roomCode = code.trim().toUpperCase();
  if (!roomCode) {
    showToast('Enter a room code');
    return;
  }

  try {
    await connectWebSocket();
  } catch {
    showToast('Could not connect to server');
    return;
  }

  try {
    const res = await apiFetch('/api/matches/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ roomCode }),
    });
    const data = await res.json();
    if (res.status === 401) return;
    if (!res.ok) {
      showToast(data.error || 'Failed to join room');
      return;
    }

    matchState.roomCode = data.roomCode || roomCode;
    matchState.myName = authUsername;

    // Join via WebSocket — server will assign player or spectator role
    ws.send(JSON.stringify({ type: 'join', roomCode: matchState.roomCode }));

    // Show lobby; spectator-joined WS message will transition to match screen
    bindText('lobby-room-code', matchState.roomCode);
    bindText('lobby-status', data.status === 'spectator' ? 'Joining as spectator...' : 'Joining room...');
    showScreen('lobby');
  } catch {
    showToast('Network error — is the server running?');
  }
}

/** Handle 'joined' — we successfully joined the room. */
function onJoined(msg) {
  matchState.roomCode = msg.roomCode;
  matchState.isSpectator = false;
  matchState.spectatorCount = 0;
  updateSpectatorUI();
  updateSpectatorCountDisplay();
  if (!matchState.players.includes(authUsername)) {
    matchState.players.push(authUsername);
  }
  // Render local player list as a placeholder until lobby-state arrives
  renderLobbyPlayers();
}

/** Handle 'player-joined' — another player joined. */
function onPlayerJoined(msg) {
  if (!matchState.players.includes(msg.username)) {
    matchState.players.push(msg.username);
  }
  // lobby-state follows immediately with authoritative data
  renderLobbyPlayers();
}

/** Handle 'lobby-state' — authoritative player list from server. */
function onLobbyState(msg) {
  matchState.lobbyPlayers = msg.players || [];
  matchState.maxPlayers = msg.maxPlayers || matchState.maxPlayers || 2;
  matchState.isHost = msg.players.some(p => p.username === authUsername && p.isHost);

  const count = matchState.lobbyPlayers.length;
  const max = matchState.maxPlayers;
  bindText('lobby-player-count', `Players: ${count}/${max}`);

  if (matchState.isHost) {
    bindText('lobby-status', count >= 2 ? 'Ready to start!' : 'Waiting for players...');
  } else {
    bindText('lobby-status', count >= 2 ? 'Waiting for host to start...' : 'Waiting for players...');
  }

  renderLobbyPlayers();
  updateStartButton();
}

/** Render the lobby player list from server-authoritative data. */
function renderLobbyPlayers() {
  const container = document.querySelector('[data-bind="lobby-players"]');
  if (!container) return;

  const players = matchState.lobbyPlayers.length > 0
    ? matchState.lobbyPlayers
    : matchState.players.map(name => ({ username: name, isHost: false }));

  container.innerHTML = players.map((p, i) => {
    const isYou = p.username === authUsername;
    return `<div class="lobby-player-row" role="listitem">
      <span class="lobby-player-number">${i + 1}.</span>
      <span class="lobby-player-icon">${p.isHost ? '👑' : '⚔️'}</span>
      <span class="lobby-player-name">${escapeHTML(p.username)}</span>
      ${p.isHost ? '<span class="lobby-player-tag host-tag">Host</span>' : ''}
      ${isYou ? '<span class="lobby-player-tag">You</span>' : ''}
    </div>`;
  }).join('');
}

/** Show/hide the start button based on host status and player count. */
function updateStartButton() {
  const btn = document.querySelector('[data-action="start-match"]');
  if (!btn) return;
  btn.style.display = (matchState.isHost && matchState.lobbyPlayers.length >= 2) ? '' : 'none';
}

/** Handle 'match-start' — transition to match screen. */
function onMatchStart(msg) {
  matchState.players = msg.players || [];
  matchState.totalRounds = msg.totalRounds || 5;
  matchState.currentRound = 0;

  // Initialize scores for all players
  matchState.scores = {};
  matchState.players.forEach(name => { matchState.scores[name] = 0; });

  bindText('match-round', `Round 1/${matchState.totalRounds}`);
  renderMatchScoreboard();

  showScreen('match');
  GameAudio.playMatchStart();
}

/** Render the dynamic scoreboard sorted by score. */
function renderMatchScoreboard() {
  const container = document.querySelector('[data-bind="match-scoreboard"]');
  if (!container) return;

  const sorted = Object.entries(matchState.scores)
    .sort((a, b) => b[1] - a[1]);

  container.innerHTML = sorted.map(([name, score], i) => {
    const isYou = name === authUsername;
    const isDc = matchState.disconnectedPlayers.has(name);
    const dcClass = isDc ? ' disconnected' : '';
    const dcIcon = isDc ? ' <span class="sb-dc-icon" title="Disconnected">🔌</span>' : '';
    return `<div class="match-sb-row${isYou ? ' is-you' : ''}${dcClass}">
      <span class="match-sb-rank">#${i + 1}</span>
      <span class="match-sb-name">${escapeHTML(name)}${isYou ? ' (you)' : ''}${dcIcon}</span>
      <span class="match-sb-score">${score}</span>
    </div>`;
  }).join('');
}

/** Handle 'round' — render the puzzle in the match screen. */
function onRound(msg) {
  matchState.currentRound = msg.roundNum;
  matchState.roundStartedAt = Date.now();

  bindText('match-round', `Round ${msg.roundNum + 1}/${msg.totalRounds}`);

  // Reset timer
  const timerBar = document.querySelector('[data-bind="match-timer-bar"]');
  if (timerBar) {
    timerBar.style.width = '100%';
    timerBar.style.backgroundColor = '';
    timerBar.classList.remove('warning');
  }

  // Sequence
  const seqContainer = document.querySelector('[data-bind="match-sequence"]');
  seqContainer.innerHTML = '';
  const puzzle = msg.puzzle;
  puzzle.sequence.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'sequence-item';
    el.style.setProperty('--seq-i', index);
    if (puzzle.type === 'image') {
      el.innerHTML = `<img src="${item}" alt="sequence item">`;
    } else {
      el.textContent = item;
    }
    seqContainer.appendChild(el);
  });

  const mystery = document.createElement('div');
  mystery.className = 'sequence-item mystery';
  mystery.textContent = '?';
  mystery.style.setProperty('--seq-i', puzzle.sequence.length);
  seqContainer.appendChild(mystery);

  // Puzzle credit (community submissions)
  const creditEl = document.querySelector('[data-bind="match-puzzle-credit"]');
  if (creditEl) {
    creditEl.textContent = puzzle.submitted_by
      ? `\u{1F4DD} Submitted by: ${puzzle.submitted_by}`
      : '';
  }

  // Options (shuffled client-side to prevent position bias)
  const optContainer = document.querySelector('[data-bind="match-options"]');
  optContainer.innerHTML = '';
  const shuffledMatchOptions = shuffle(puzzle.options);
  shuffledMatchOptions.forEach((option, index) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.style.setProperty('--opt-i', index);
    if (puzzle.type === 'image') {
      btn.innerHTML = `<img src="${option}" alt="option">`;
    } else {
      btn.textContent = option;
    }
    // Spectators cannot interact with options
    if (matchState.isSpectator) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => handleMatchOptionClick(option, btn));
    }
    optContainer.appendChild(btn);
  });

  // Start a local timer animation (20 seconds)
  startMatchTimer(20000);

  showScreen('match');
}

/** Timer animation for the match. */
function startMatchTimer(durationMs) {
  if (matchState.roundTimer) clearInterval(matchState.roundTimer);
  const startTime = Date.now();
  const bar = document.querySelector('[data-bind="match-timer-bar"]');
  let lastTickSecond = -1;

  matchState.roundTimer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const ratio = Math.max(0, 1 - elapsed / durationMs);
    if (bar) {
      bar.style.width = `${ratio * 100}%`;
      if (ratio < 0.25) {
        bar.style.backgroundColor = 'var(--color-wrong)';
        bar.classList.add('warning');
      } else if (ratio < 0.5) {
        bar.style.backgroundColor = '#e17055';
        bar.classList.remove('warning');
      } else {
        bar.style.backgroundColor = '';
        bar.classList.remove('warning');
      }
    }
    // Countdown tick in last 5 seconds
    const remainingSeconds = Math.ceil((durationMs - elapsed) / 1000);
    if (remainingSeconds <= 5 && remainingSeconds > 0 && remainingSeconds !== lastTickSecond) {
      lastTickSecond = remainingSeconds;
      GameAudio.playCountdownTick();
    }
    if (ratio <= 0) {
      clearInterval(matchState.roundTimer);
      matchState.roundTimer = null;
    }
  }, 50);
}

/** Handle clicking an option during a match round. */
function handleMatchOptionClick(answer, btnEl) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Disable all option buttons
  const allBtns = document.querySelectorAll('[data-bind="match-options"] .option-btn');
  allBtns.forEach(b => { b.disabled = true; });

  btnEl.classList.add('selected');
  btnEl.style.borderColor = 'var(--color-primary)';

  const timeMs = Date.now() - matchState.roundStartedAt;

  ws.send(JSON.stringify({
    type: 'answer',
    answerId: answer,
    timeMs,
  }));

  // Stop timer
  if (matchState.roundTimer) {
    clearInterval(matchState.roundTimer);
    matchState.roundTimer = null;
  }
}

/** Handle 'roundResult' — show round result briefly. */
function onRoundResult(msg) {
  if (matchState.roundTimer) {
    clearInterval(matchState.roundTimer);
    matchState.roundTimer = null;
  }

  const scores = msg.scores;

  // Update all players' scores from server data
  for (const [name, data] of Object.entries(scores)) {
    if (data && typeof data.total === 'number') {
      matchState.scores[name] = data.total;
    }
  }
  renderMatchScoreboard();

  const myResult = scores[authUsername];
  const myCorrect = myResult ? myResult.correct : false;
  bindText('match-result-icon', myCorrect ? '✅' : '❌');
  bindText('match-result-title', myCorrect ? 'Correct!' : 'Wrong!');

  // Render all players' results sorted by total score
  const container = document.querySelector('[data-bind="match-round-scores"]');
  const entries = Object.entries(scores).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
  let html = '';

  for (const [name, data] of entries) {
    const icon = data.correct ? '✅' : '❌';
    const isYou = name === authUsername;
    html += `<div class="match-score-row${isYou ? ' is-you' : ''}">
      <span class="player-name">${escapeHTML(name)}${isYou ? ' (you)' : ''}</span>
      <span class="player-result">
        <span class="player-answer-icon">${icon}</span>
        <span class="player-points">+${data.points}</span>
      </span>
    </div>`;
  }

  // Correct answer line
  html += `<div class="match-score-row" style="border-top:1px solid var(--color-surface-border);padding-top:0.5rem;margin-top:0.25rem">
    <span class="player-name" style="color:var(--color-text-muted)">Correct answer</span>
    <span class="player-result"><span class="player-points">${escapeHTML(String(msg.correctAnswer))}</span></span>
  </div>`;

  container.innerHTML = html;
  bindText('match-result-info', 'Next round starting...');

  showScreen('match-result');
}

/** Handle 'gameOver' — show final results. */
function onGameOver(msg) {
  if (matchState.roundTimer) {
    clearInterval(matchState.roundTimer);
    matchState.roundTimer = null;
  }

  const scores = msg.scores || {};
  const winner = msg.winner;
  const forfeit = msg.forfeit || false;
  const rankings = msg.rankings;

  // Use rankings if available (N-player), fallback to legacy 2-player fields
  let outcomeIcon, outcomeTitle;
  if (rankings && rankings.length) {
    const myEntry = rankings.find(r => r.isYou);
    const myRank = myEntry ? myEntry.rank : null;
    const totalPlayers = msg.totalPlayers || rankings.length;

    if (matchState.isSpectator || !myEntry) {
      outcomeIcon = '👀';
      outcomeTitle = 'Match Over';
    } else if (myRank === 1 && msg.isDraw) {
      outcomeIcon = '🤝';
      outcomeTitle = "It's a Tie!";
    } else if (myRank === 1) {
      outcomeIcon = '🏆';
      outcomeTitle = forfeit ? 'You Win! (Opponent left)' : 'You Win!';
    } else {
      outcomeIcon = myRank <= 3 ? '🎉' : '😢';
      outcomeTitle = myRank === 1 ? 'You Win!' : `${ordinal(myRank)} Place`;
    }

    // Show placement (skip for spectators)
    const placementEl = document.querySelector('[data-bind="match-placement"]');
    if (placementEl) {
      if (matchState.isSpectator || !myEntry) {
        placementEl.style.display = 'none';
      } else {
        placementEl.textContent = `Your placement: ${ordinal(myRank)} of ${totalPlayers} player${totalPlayers === 1 ? '' : 's'}`;
        placementEl.style.display = '';
      }
    }

    // Render rankings table
    const container = document.querySelector('[data-bind="match-final-scores"]');
    container.innerHTML = rankings.map(entry => {
      const isYou = entry.isYou;
      const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : '';
      const rankClass = entry.rank <= 3 ? ` rank-${entry.rank}` : '';
      return `<div class="match-final-row${isYou ? ' is-you' : ''}${rankClass}" role="listitem">
        <span class="final-player-icon">${medal}</span>
        <span class="final-player-rank">${ordinal(entry.rank)}</span>
        <span class="final-player-name">${escapeHTML(entry.username)}${isYou ? ' (you)' : ''}</span>
        <span class="final-player-score">${entry.score}</span>
      </div>`;
    }).join('');
  } else {
    // Legacy 2-player fallback
    if (!winner) {
      outcomeIcon = '🤝';
      outcomeTitle = "It's a Tie!";
    } else if (winner === authUsername) {
      outcomeIcon = '🏆';
      outcomeTitle = forfeit ? 'You Win! (Opponent left)' : 'You Win!';
    } else {
      outcomeIcon = '😢';
      outcomeTitle = 'You Lose!';
    }

    const placementEl = document.querySelector('[data-bind="match-placement"]');
    if (placementEl) placementEl.style.display = 'none';

    const results = msg.results || Object.entries(scores).map(([username, score]) => ({ username, score }));
    results.sort((a, b) => b.score - a.score);

    const container = document.querySelector('[data-bind="match-final-scores"]');
    container.innerHTML = results.map((entry, i) => {
      const isWinner = winner && entry.username === winner;
      const isYou = entry.username === authUsername;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      return `<div class="match-final-row${isYou ? ' is-you' : ''}${isWinner ? ' rank-1' : ''}" role="listitem">
        <span class="final-player-icon">${medal}</span>
        <span class="final-player-name">${escapeHTML(entry.username)}${isYou ? ' (you)' : ''}</span>
        <span class="final-player-score">${entry.score}</span>
      </div>`;
    }).join('');
  }

  const iconEl = document.querySelector('[data-bind="match-over-icon"]');
  if (iconEl) iconEl.textContent = outcomeIcon;
  const titleEl = document.querySelector('[data-bind="match-over-title"]');
  if (titleEl) titleEl.textContent = outcomeTitle;

  // Track host status from server
  const gameOverIsHost = msg.isHost || false;
  matchState.isHost = gameOverIsHost;
  // Show host indicator
  const hostIndicator = document.querySelector('[data-bind="rematch-host-indicator"]');
  if (hostIndicator) {
    hostIndicator.style.display = '';
    if (gameOverIsHost) {
      hostIndicator.textContent = '👑 You are the host — start a rematch when ready';
      hostIndicator.className = 'rematch-host-indicator host-you';
    } else {
      hostIndicator.textContent = `⏳ ${escapeHTML(msg.hostUsername || 'Host')} controls the rematch`;
      hostIndicator.className = 'rematch-host-indicator host-other';
    }
  }

  // Reset rematch UI
  rematchSent = false;
  const rematchBtn = document.querySelector('[data-action="rematch"]');
  if (rematchBtn) {
    rematchBtn.textContent = gameOverIsHost ? '🔄 New Match' : '✅ Ready for Rematch';
    rematchBtn.disabled = false;
    rematchBtn.style.display = (forfeit || matchState.isSpectator) ? 'none' : '';
  }
  const startRematchBtn = document.querySelector('[data-action="start-rematch"]');
  if (startRematchBtn) {
    startRematchBtn.style.display = 'none';
    startRematchBtn.disabled = true;
  }
  const rematchPlayersDiv = document.querySelector('[data-bind="rematch-players"]');
  if (rematchPlayersDiv) {
    rematchPlayersDiv.style.display = 'none';
    rematchPlayersDiv.innerHTML = '';
  }
  const rematchStatus = document.querySelector('[data-bind="rematch-status"]');
  if (rematchStatus) {
    rematchStatus.style.display = 'none';
    rematchStatus.textContent = '';
  }

  // For spectators, update the placement text and ensure title/icon are correct
  if (matchState.isSpectator) {
    const placementEl = document.querySelector('[data-bind="match-placement"]');
    if (placementEl) {
      placementEl.textContent = '\u{1F440} You were spectating this match';
      placementEl.style.display = '';
    }
    if (iconEl) iconEl.textContent = '👀';
    if (titleEl) titleEl.textContent = 'Match Over';
    if (hostIndicator) {
      hostIndicator.style.display = 'none';
    }
  }

  showScreen('match-over');

  // Play win/loss sound based on outcome
  if (outcomeIcon === '🏆') {
    GameAudio.playWinFanfare();
  } else if (outcomeIcon === '😢') {
    GameAudio.playLossSound();
  }

  // Do NOT disconnect WebSocket — keep it alive for rematch
}

/** Handle 'player-left' — opponent disconnected. */
function onPlayerLeft(msg) {
  matchState.players = matchState.players.filter(n => n !== msg.username);
  renderLobbyPlayers();

  if (currentScreen === 'lobby') {
    bindText('lobby-status', 'Opponent disconnected');
  } else if (currentScreen === 'match') {
    showToast('Opponent disconnected — waiting for result...');
  }
}

/** Reset match state for a new game. */
function resetMatchState() {
  matchState = {
    roomCode: null,
    players: [],
    lobbyPlayers: [],
    isHost: false,
    isSpectator: false,
    spectatorCount: 0,
    myName: null,
    scores: {},
    disconnectedPlayers: new Set(),
    totalRounds: 5,
    currentRound: 0,
    roundStartedAt: null,
    roundTimer: null,
  };
}

/* ===========================
   Reconnection Logic
   =========================== */

let reconnectState = { active: false, attempts: 0 };
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_INTERVAL_MS = 3000;

/** Show the reconnection overlay and begin auto-retrying. */
function startReconnect() {
  if (reconnectState.active) return;
  reconnectState = { active: true, attempts: 0 };

  const overlay = document.getElementById('reconnect-overlay');
  if (overlay) overlay.style.display = '';
  bindText('reconnect-message', 'Connection lost — reconnecting...');
  const homeBtn = document.querySelector('.reconnect-home-btn');
  if (homeBtn) homeBtn.style.display = 'none';
  const spinner = document.querySelector('.reconnect-spinner');
  if (spinner) spinner.style.display = '';

  attemptReconnect();
}

/** Attempt a single reconnection. */
function attemptReconnect() {
  if (!reconnectState.active) return;

  reconnectState.attempts++;
  const attempt = reconnectState.attempts;
  bindText('reconnect-message', `Reconnecting... (${attempt}/${MAX_RECONNECT_ATTEMPTS})`);

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws?token=${encodeURIComponent(authToken)}`;
  const socket = new WebSocket(url);

  const timeout = setTimeout(() => {
    socket.close();
  }, RECONNECT_INTERVAL_MS - 200);

  socket.addEventListener('open', () => {
    clearTimeout(timeout);
    ws = socket;
    reconnectState.active = false;

    // Re-attach message handler
    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
      } catch { /* ignore malformed */ }
    });

    ws.addEventListener('close', () => {
      const wasInMatch = currentScreen === 'match' || currentScreen === 'match-result' || currentScreen === 'match-over';
      ws = null;
      if (wasInMatch && matchState.roomCode) {
        startReconnect();
      }
    });

    // Re-join the room to trigger server-side reconnection
    ws.send(JSON.stringify({ type: 'join', roomCode: matchState.roomCode }));

    hideReconnectOverlay();
    showToast('Reconnected!');
  });

  socket.addEventListener('error', () => {
    clearTimeout(timeout);
    socket.close();
  });

  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    if (!reconnectState.active) return;

    if (reconnectState.attempts >= MAX_RECONNECT_ATTEMPTS) {
      reconnectState.active = false;
      bindText('reconnect-message', 'Disconnected — could not reconnect');
      const spinner2 = document.querySelector('.reconnect-spinner');
      if (spinner2) spinner2.style.display = 'none';
      const homeBtn2 = document.querySelector('.reconnect-home-btn');
      if (homeBtn2) homeBtn2.style.display = '';
    } else {
      setTimeout(() => attemptReconnect(), RECONNECT_INTERVAL_MS);
    }
  });
}

/** Hide the reconnection overlay. */
function hideReconnectOverlay() {
  const overlay = document.getElementById('reconnect-overlay');
  if (overlay) overlay.style.display = 'none';
}

/** Handle 'reconnected' — server restored our session. */
function onReconnected(msg) {
  matchState.roomCode = msg.roomCode;
  matchState.currentRound = msg.currentRound || 0;
  matchState.totalRounds = msg.totalRounds || 5;

  // Restore scores from players array or legacy scores
  if (msg.players && msg.players.length) {
    matchState.scores = {};
    matchState.disconnectedPlayers = new Set();
    matchState.players = [];
    for (const p of msg.players) {
      matchState.scores[p.username] = p.score;
      matchState.players.push(p.username);
      if (!p.connected) {
        matchState.disconnectedPlayers.add(p.username);
      }
    }
  } else if (msg.scores) {
    matchState.scores = msg.scores;
  } else if (typeof msg.myScore === 'number') {
    matchState.scores[authUsername] = msg.myScore;
  }

  if (msg.droppedPlayers && msg.droppedPlayers.length) {
    for (const name of msg.droppedPlayers) {
      matchState.disconnectedPlayers.add(name);
    }
  }

  renderMatchScoreboard();
  bindText('match-round', `Round ${matchState.currentRound + 1}/${matchState.totalRounds}`);

  hideReconnectOverlay();
}

/** Handle 'player-disconnected' — show toast and update scoreboard. */
function onPlayerDisconnected(msg) {
  matchState.disconnectedPlayers.add(msg.username);
  renderMatchScoreboard();
  showToast(`🔌 ${msg.username} disconnected — ${msg.remainingCount || '?'} player${(msg.remainingCount || 0) !== 1 ? 's' : ''} remaining`);
}

/** Handle 'player-reconnected' — show toast and update scoreboard. */
function onPlayerReconnected(msg) {
  matchState.disconnectedPlayers.delete(msg.username);
  renderMatchScoreboard();
  showToast(`✅ ${msg.username} reconnected!`);
}

/** Handle 'player-forfeited' — player's reconnect timer expired. */
function onPlayerForfeited(msg) {
  matchState.disconnectedPlayers.delete(msg.username);
  delete matchState.scores[msg.username];
  matchState.players = matchState.players.filter(n => n !== msg.username);
  renderMatchScoreboard();
  showToast(`❌ ${msg.username} forfeited (disconnect timeout)`);
}

/** Handle 'host-transferred' — new host assigned. */
function onHostTransferred(msg) {
  showToast(`👑 ${msg.newHost} is now the host`);
  matchState.isHost = (msg.newHost === authUsername);
}

/* ===========================
   Spectator Logic
   =========================== */

/** Handle 'spectator-joined' — we are now spectating this match. */
function onSpectatorJoined(msg) {
  matchState.isSpectator = true;
  matchState.roomCode = msg.roomCode;
  matchState.spectatorCount = msg.spectatorCount || 0;
  matchState.totalRounds = msg.totalRounds || 5;
  matchState.currentRound = msg.currentRound || 0;

  // Use player list to populate scores and track disconnected players
  if (msg.players && Array.isArray(msg.players)) {
    matchState.scores = {};
    matchState.players = [];
    matchState.disconnectedPlayers = new Set();
    msg.players.forEach(p => {
      matchState.scores[p.username] = p.score || 0;
      matchState.players.push(p.username);
      if (p.connected === false) {
        matchState.disconnectedPlayers.add(p.username);
      }
    });
  } else {
    matchState.scores = msg.scores || {};
    matchState.players = Object.keys(matchState.scores);
  }

  bindText('match-round', `Round ${matchState.currentRound + 1}/${matchState.totalRounds}`);
  renderMatchScoreboard();
  updateSpectatorUI();

  showScreen('match');
}

/** Handle 'spectator-count' — updated spectator count. */
function onSpectatorCount(msg) {
  matchState.spectatorCount = msg.count || 0;
  updateSpectatorCountDisplay();
}

/** Update spectator UI elements (badge, disabled controls). */
function updateSpectatorUI() {
  const badge = document.querySelector('[data-bind="spectator-badge"]');
  if (badge) {
    badge.style.display = matchState.isSpectator ? '' : 'none';
  }
  updateSpectatorCountDisplay();
  if (matchState.isSpectator) {
    const optContainer = document.querySelector('[data-bind="match-options"]');
    if (optContainer) {
      optContainer.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
      });
    }
  }
}

/** Update the spectator count display across all screens. */
function updateSpectatorCountDisplay() {
  const count = matchState.spectatorCount;
  const text = count > 0 ? `👀 ${count} watching` : '';

  document.querySelectorAll('[data-bind="spectator-count"]').forEach(el => {
    el.textContent = text;
    el.style.display = count > 0 ? '' : 'none';
  });
  document.querySelectorAll('[data-bind="lobby-spectator-count"]').forEach(el => {
    el.textContent = text;
    el.style.display = count > 0 ? '' : 'none';
  });
}

/* ===========================
   Rematch Logic
   =========================== */

let rematchSent = false;

/** Send a rematch request (ready up) via WebSocket. */
function sendRematchRequest() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Connection lost — cannot send rematch request');
    return;
  }
  if (rematchSent) return;

  rematchSent = true;
  ws.send(JSON.stringify({ type: 'rematch-request' }));

  const btn = document.querySelector('[data-action="rematch"]');
  if (btn) {
    btn.textContent = '✅ Ready!';
    btn.disabled = true;
  }
  const status = document.querySelector('[data-bind="rematch-status"]');
  if (status) {
    status.style.display = '';
    status.textContent = 'Waiting for other players...';
  }
}

/** Handle 'rematch-offered' — legacy/backward compat; treat as rematch-ready signal. */
function onRematchOffered(_msg) {
  // Handled by rematch-ready in the N-player flow; no-op
}

/** Handle 'rematch-ready' — update ready player list on match-over screen. */
function onRematchReady(msg) {
  const readyPlayers = msg.readyPlayers || [];
  const totalPlayers = msg.totalPlayers || 0;

  const container = document.querySelector('[data-bind="rematch-players"]');
  if (container) {
    container.style.display = '';
    container.innerHTML =
      `<div class="rematch-players-title">Ready (${readyPlayers.length}/${totalPlayers})</div>` +
      readyPlayers.map(name =>
        `<div class="rematch-player-row"><span class="ready-icon">✅</span> ${escapeHTML(name)}</div>`
      ).join('');
  }

  const status = document.querySelector('[data-bind="rematch-status"]');
  if (status) {
    status.style.display = '';
    if (matchState.isHost) {
      status.textContent = readyPlayers.length >= 2
        ? 'All ready — click Start Rematch!'
        : `${readyPlayers.length} of ${totalPlayers} players ready`;
    } else {
      status.textContent = readyPlayers.length >= 2
        ? 'Waiting for host to start...'
        : `${readyPlayers.length} of ${totalPlayers} players ready`;
    }
  }

  // Show start button to host when ≥2 ready
  const startBtn = document.querySelector('[data-action="start-rematch"]');
  if (startBtn) {
    if (matchState.isHost && readyPlayers.length >= 2) {
      startBtn.style.display = '';
      startBtn.disabled = false;
    } else {
      startBtn.style.display = 'none';
    }
  }

  // Update host status if host transferred
  if (msg.hostUsername && msg.hostUsername === authUsername && !matchState.isHost) {
    matchState.isHost = true;
    const hostIndicator = document.querySelector('[data-bind="rematch-host-indicator"]');
    if (hostIndicator) {
      hostIndicator.textContent = '👑 You are now the host';
      hostIndicator.className = 'rematch-host-indicator host-you';
    }
    if (startBtn && readyPlayers.length >= 2) {
      startBtn.style.display = '';
      startBtn.disabled = false;
    }
  }
}

/** Send rematch-start-confirm (host only). */
function sendRematchStartConfirm() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Connection lost');
    return;
  }
  ws.send(JSON.stringify({ type: 'rematch-start-confirm' }));
}

/** Handle 'rematch-start' — transition to the new match. */
function onRematchStart(msg) {
  rematchSent = false;

  // Reset match state for new match
  matchState.roomCode = msg.roomCode;
  matchState.scores = {};
  matchState.currentRound = 0;

  // Re-join the new room
  ws.send(JSON.stringify({ type: 'join', roomCode: msg.roomCode }));

  bindText('lobby-room-code', msg.roomCode);
  bindText('lobby-status', 'Starting rematch...');
  showScreen('lobby');
}

/* ===========================
   Player Profile
   =========================== */

/** Fetch all profile data in parallel and render the profile screen. */
async function fetchProfile() {
  const container = document.querySelector('[data-bind="profile-content"]');
  if (!container) return;

  const results = await progressiveLoad(
    async (signal) => {
      // Fetch all four endpoints independently — partial success is OK
      const [meResult, scoresResult, achievementsResult, historyResult] = await Promise.allSettled([
        apiFetch('/api/auth/me', { signal }).then(async (res) => {
          if (res.status === 401) return null;
          await throwIfRetryable(res);
          if (!res.ok) throw new Error(`me: ${res.status}`);
          return res.json();
        }),
        apiFetch('/api/scores/me', { signal }).then(async (res) => {
          if (res.status === 401) return null;
          await throwIfRetryable(res);
          if (!res.ok) throw new Error(`scores: ${res.status}`);
          return res.json();
        }),
        apiFetch('/api/achievements', { signal }).then(async (res) => {
          if (res.status === 401) return null;
          await throwIfRetryable(res);
          if (!res.ok) throw new Error(`achievements: ${res.status}`);
          return res.json();
        }),
        apiFetch('/api/matches/history', { signal }).then(async (res) => {
          if (res.status === 401) return null;
          await throwIfRetryable(res);
          if (!res.ok) throw new Error(`history: ${res.status}`);
          return res.json();
        }),
      ]);

      // If any returned 401 (mapped to null), the user is not logged in
      const settledResults = [meResult, scoresResult, achievementsResult, historyResult];
      const anyAuth401 = settledResults.some(r => r.status === 'fulfilled' && r.value === null);
      if (anyAuth401) return null;

      // If any sub-request rejected with UnavailableError, promote the whole
      // batch to UnavailableError so the loader renders a banner (no retry).
      const unavailables = settledResults
        .filter(r => r.status === 'rejected' && r.reason instanceof UnavailableError);
      if (unavailables.length > 0) {
        const u = unavailables[0].reason;
        throw new UnavailableError(u.message, u.reason);
      }

      // If any sub-request rejected with RetryableError, promote the whole batch
      const retryables = settledResults
        .filter(r => r.status === 'rejected' && r.reason instanceof RetryableError);
      if (retryables.length > 0) {
        const maxRetryMs = Math.max(...retryables.map(r => r.reason.retryAfterMs));
        throw new RetryableError('Server warming up (batch)', maxRetryMs);
      }

      const meData = meResult.status === 'fulfilled' ? meResult.value : null;

      // If all requests rejected (e.g. all aborted on timeout), rethrow to show Retry button
      const allRejected = settledResults
        .every(r => r.status === 'rejected');
      if (allRejected) throw meResult.reason || new Error('All profile requests failed');

      return {
        meData: meData || { user: {} },
        scoresData: scoresResult.status === 'fulfilled' && scoresResult.value ? scoresResult.value : { stats: [] },
        achievementsData: achievementsResult.status === 'fulfilled' && achievementsResult.value ? achievementsResult.value : { achievements: [] },
        historyData: historyResult.status === 'fulfilled' && historyResult.value ? historyResult.value : { history: [] },
      };
    },
    container,
    MESSAGE_SETS.profile,
    { maxRetries: 0, onRetry: () => fetchProfile() },
  );

  if (results) {
    renderProfile(results.meData, results.scoresData, results.achievementsData, results.historyData);
  }
}

/** Render all profile sections from the fetched data. */
function renderProfile(meData, scoresData, achievementsData, historyData) {
  const container = document.querySelector('[data-bind="profile-content"]');
  if (!container) return;

  const user = meData.user || {};
  const stats = scoresData.stats || [];
  const achievements= (achievementsData.achievements || []).filter(a => a.unlocked);
  const history = historyData.history || [];

  // Player info
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // Stats summary
  const totalGames = stats.reduce((sum, s) => sum + (s.games_played || 0), 0) + history.length;
  const bestScore = stats.reduce((max, s) => Math.max(max, s.high_score || 0), 0);
  const bestStreak = stats.reduce((max, s) => Math.max(max, s.best_streak || 0), 0);
  const matchWins = history.filter(h => h.result === 'win').length;
  const winRate = history.length > 0 ? Math.round((matchWins / history.length) * 100) : 0;

  // Recent achievements (last 5, sorted by unlock date)
  const recentAchievements = [...achievements]
    .sort((a, b) => new Date(b.unlockedAt || 0) - new Date(a.unlockedAt || 0))
    .slice(0, 5);

  // Recent matches (last 5)
  const recentMatches = history.slice(0, 5);

  let html = '';

  // Player Info section
  html += `<div class="profile-section">
    <div class="profile-info-row">
      <span class="profile-username">${escapeHTML(user.username || authUsername || 'Player')}</span>
      ${memberSince ? `<span class="profile-member-since">Member since ${memberSince}</span>` : ''}
    </div>
  </div>`;

  // Stats section
  html += `<div class="profile-section">
    <div class="profile-section-header">
      <span class="profile-section-title">📊 Stats Summary</span>
    </div>
    <div class="profile-stats-grid">
      <div class="profile-stat">
        <span class="profile-stat-value">${totalGames}</span>
        <span class="profile-stat-label">Games Played</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-value">${bestScore.toLocaleString()}</span>
        <span class="profile-stat-label">Best Score</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-value">${winRate}%</span>
        <span class="profile-stat-label">Win Rate</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-value">${bestStreak}</span>
        <span class="profile-stat-label">Best Streak</span>
      </div>
    </div>
  </div>`;

  // CS52-6 § Decision #6: profile shows ALL rows with badges including
  // legacy. No toggle, no separate section, no onboarding banner — just
  // the per-row provenance label so a returning user can recognise their
  // pre-CS52 scores ("Legacy") without filtering them out.
  const recentScores = (scoresData.scores || []).slice(0, 5);
  html += `<div class="profile-section">
    <div class="profile-section-header">
      <span class="profile-section-title">🎮 Recent Games</span>
    </div>`;
  if (recentScores.length > 0) {
    html += recentScores.map(s => {
      const dateStr = s.played_at
        ? new Date(s.played_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
      const modeLabel = s.mode === 'daily' ? '📅 Daily' : '🎮 Free Play';
      return `<div class="profile-score-row">
        <span class="profile-score-mode">${modeLabel}</span>
        <span class="profile-score-value">${Number(s.score || 0).toLocaleString()}</span>
        ${provenanceBadgeHTML(s.source)}
        ${dateStr ? `<span class="profile-score-date">${dateStr}</span>` : ''}
      </div>`;
    }).join('');
  } else {
    html += '<div class="profile-empty">No games yet — start playing!</div>';
  }
  html += '</div>';

  // Recent Achievements section
  html += `<div class="profile-section">
    <div class="profile-section-header">
      <span class="profile-section-title">🏅 Recent Achievements</span>
      <button class="profile-view-all" data-action="show-achievements">View All →</button>
    </div>`;
  if (recentAchievements.length > 0) {
    html += recentAchievements.map(a => {
      const dateStr = a.unlockedAt
        ? new Date(a.unlockedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
      return `<div class="profile-achievement-row">
        <span class="profile-achievement-icon">${a.icon}</span>
        <div class="profile-achievement-info">
          <span class="profile-achievement-name">${escapeHTML(a.name)}</span>
          ${dateStr ? `<span class="profile-achievement-date">${dateStr}</span>` : ''}
        </div>
      </div>`;
    }).join('');
  } else {
    html += '<div class="profile-empty">No achievements yet — keep playing!</div>';
  }
  html += '</div>';

  // Recent Match History section
  html += `<div class="profile-section">
    <div class="profile-section-header">
      <span class="profile-section-title">⚔️ Recent Matches</span>
      <button class="profile-view-all" data-action="show-match-history">View All →</button>
    </div>`;
  if (recentMatches.length > 0) {
    html += recentMatches.map(entry => {
      const resultLabel = entry.result === 'win' ? 'Win' : entry.result === 'tie' ? 'Tie' : 'Loss';
      const resultClass = entry.result === 'win' ? 'win' : entry.result === 'tie' ? 'tie' : 'loss';
      const dateStr = entry.date
        ? new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
      return `<div class="profile-match-row">
        <span class="profile-match-result ${resultClass}">${resultLabel}</span>
        <div class="profile-match-info">
          <span class="profile-match-opponent">vs ${escapeHTML(entry.opponent)}</span>
          <span class="profile-match-score">${entry.myScore} – ${entry.oppScore}</span>
        </div>
        ${dateStr ? `<span class="profile-match-date">${dateStr}</span>` : ''}
      </div>`;
    }).join('');
  } else {
    html += '<div class="profile-empty">No matches yet — challenge someone!</div>';
  }
  html += '</div>';

  container.innerHTML = html;
}

/* ===========================
   Match History
   =========================== */

/** Fetch match history from the server and render it. */
async function fetchMatchHistory() {
  const container = document.querySelector('[data-bind="match-history-list"]');
  if (!container) return;
  container.innerHTML = '<div class="leaderboard-loading">Loading</div>';

  try {
    const res = await apiFetch('/api/matches/history');
    if (res.status === 401) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderMatchHistory(data.history || []);
  } catch {
    container.innerHTML =
      '<div class="leaderboard-error">Match history unavailable — is the server running?</div>';
  }
}

/** Render match history entries. */
function renderMatchHistory(history) {
  const container = document.querySelector('[data-bind="match-history-list"]');
  if (!container) return;

  if (!history.length) {
    container.innerHTML = '<div class="leaderboard-empty">No matches yet — play some games! ⚔️</div>';
    return;
  }

  container.innerHTML = history.map(entry => {
    const resultClass = entry.result === 'win' ? 'history-win' : entry.result === 'tie' ? 'history-tie' : 'history-loss';
    const resultLabel = entry.result === 'win' ? 'Win' : entry.result === 'tie' ? 'Tie' : 'Loss';
    const resultIcon = entry.result === 'win' ? '🏆' : entry.result === 'tie' ? '🤝' : '😢';
    const dateStr = entry.date ? new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    return `<div class="match-history-entry ${resultClass}" role="listitem">
      <div class="history-result-badge">${resultIcon} ${resultLabel}</div>
      <div class="history-details">
        <span class="history-opponent">vs ${escapeHTML(entry.opponent)}</span>
        <span class="history-score">${entry.myScore} – ${entry.oppScore}</span>
      </div>
      <div class="history-date">${dateStr}</div>
    </div>`;
  }).join('');
}

/* ===========================
   My Submissions Dashboard
   =========================== */

/** Format a date as relative time (e.g., "2 days ago"). */
function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return days === 1 ? '1 day ago' : `${days} days ago`;
  if (hours > 0) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  if (minutes > 0) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  return 'just now';
}

/** Render difficulty as star characters (e.g., ★★☆ for difficulty 2). */
function renderDifficultyStars(difficulty) {
  const filled = Math.min(Math.max(Number(difficulty) || 0, 0), 3);
  return '★'.repeat(filled) + '☆'.repeat(3 - filled);
}

/** Render the empty-state HTML for My Submissions (with optional Create CTA). */
function renderSubmissionsEmptyState() {
  const createBtn = isFeatureEnabled('submitPuzzle')
    ? '<button class="btn btn-primary" data-action="create-puzzle">Create your first puzzle →</button>'
    : '';
  return `<div class="my-submissions-empty" role="listitem">
      <div class="my-submissions-empty-icon" aria-hidden="true">📭</div>
      <p class="my-submissions-empty-text">No submissions yet</p>
      ${createBtn}
    </div>`;
}

/** Render a single submission card. */
function renderSubmissionCard(submission) {
  const seq = Array.isArray(submission.sequence) ? submission.sequence : [];
  const preview = seq.length > 3
    ? seq.slice(0, 3).map(item => escapeHTML(String(item))).join(', ') + ', …'
    : seq.map(item => escapeHTML(String(item))).join(', ');

  const VALID_STATUSES = ['pending', 'approved', 'rejected'];
  const safeStatus = VALID_STATUSES.includes(submission.status) ? submission.status : 'pending';
  const statusClass = `status-${safeStatus}`;
  const statusLabels = { pending: '🟡 Pending', approved: '🟢 Approved', rejected: '🔴 Rejected' };
  const statusLabel = statusLabels[safeStatus];

  const safeId = Number(submission.id) || 0;
  const createdAgo = formatRelativeTime(submission.created_at);

  let datesHtml = `<span>Submitted ${escapeHTML(createdAgo)}</span>`;
  if (submission.reviewed_at) {
    const reviewedDate = new Date(submission.reviewed_at).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    datesHtml += `<span>Reviewed ${escapeHTML(reviewedDate)}</span>`;
  }

  let notesHtml = '';
  if (submission.reviewer_notes) {
    notesHtml = `
      <div class="submission-reviewer-notes">
        <button class="submission-notes-toggle" data-action="toggle-reviewer-notes" aria-expanded="false">📝 Reviewer notes ▸</button>
        <div class="submission-notes-content">${escapeHTML(submission.reviewer_notes)}</div>
      </div>`;
  }

  // Action buttons: pending + feature enabled → Edit + Delete; otherwise → Delete only
  let actionsHtml = '<div class="submission-card-actions">';
  if (safeStatus === 'pending' && isFeatureEnabled('submitPuzzle')) {
    actionsHtml += `<button class="btn btn-sm btn-secondary" data-action="edit-submission" data-submission-id="${safeId}">✏️ Edit</button>`;
  }
  actionsHtml += `<button class="btn btn-sm btn-danger" data-action="delete-submission" data-submission-id="${safeId}">🗑️ Delete</button>`;
  actionsHtml += '</div>';

  return `<div class="submission-card" data-submission-id="${safeId}" role="listitem">
    <div class="submission-card-header">
      <span class="submission-sequence-preview">${preview}</span>
      <span class="submission-status-badge ${statusClass}">${statusLabel}</span>
    </div>
    <div class="submission-card-meta">
      <span class="submission-category-badge">${escapeHTML(submission.category)}</span>
      <span class="submission-difficulty">${renderDifficultyStars(submission.difficulty)}</span>
    </div>
    <div class="submission-card-dates">${datesHtml}</div>
    ${notesHtml}
    ${actionsHtml}
  </div>`;
}

/** Cache of current user's submissions for edit pre-population. */
let mySubmissionsCache = [];

// ── Notification state ──────────────────────────────────────────────
//
// CS53: We deliberately do NOT poll on a timer. The unread-count query
// (GET /api/notifications/count → SELECT COUNT(*) FROM notifications
//  WHERE user_id = ? AND is_read = 0) hits the DB and resets Azure SQL
// serverless's auto-pause idle timer; a single open tab polling on a
// timer would prevent the DB from ever pausing and exhaust the Free Tier
// monthly compute allowance.
//
// Instead the badge is refreshed at three legitimate moments:
//   1. Once on login (refreshNotificationBadge below).
//   2. Whenever the user opens the My Submissions screen — loadNotifications()
//      calls GET /api/notifications and updates the badge as a side effect.
//   3. After mark-read / mark-all-read actions (already wired locally).
//
// Real-time freshness is intentionally out of scope here; planned CS55
// (WebSocket-pushed notifications + server-side caching) will add
// real-time updates without adding any DB-keepalive polling.

/** Update the notification badge on the My Submissions button. */
function updateNotificationBadge(count) {
  const badge = document.querySelector('[data-bind="notification-badge"]');
  if (!badge) return;
  const btn = badge.closest('button');
  if (count > 0) {
    const visibleCount = count > 99 ? '99+' : String(count);
    badge.textContent = visibleCount;
    badge.setAttribute('aria-label', `${count} unread notifications`);
    badge.style.display = '';
    if (btn) btn.setAttribute('aria-label', `View My Submissions (${count} unread notifications)`);
  } else {
    badge.style.display = 'none';
    badge.setAttribute('aria-label', '');
    if (btn) btn.setAttribute('aria-label', 'View My Submissions');
  }
}

/** Fetch unread notification count and update badge (one-shot, no timer). */
async function refreshNotificationBadge() {
  if (!isLoggedIn()) return;
  try {
    const res = await apiFetch('/api/notifications/count');
    if (res.ok) {
      const data = await res.json();
      // Logout may have happened while the request was in flight;
      // skip the DOM update so a stale unread count can't render on
      // the logged-out UI.
      if (!isLoggedIn()) return;
      updateNotificationBadge(data.unread_count || 0);
    }
  } catch { /* ignore badge-refresh errors */ }
}

/** Render a single notification item. */
function renderNotificationItem(notification) {
  const icon = notification.type === 'submission_approved' ? '✅' : '❌';
  const readClass = notification.read ? 'notification-read' : 'notification-unread';
  const timeAgo = formatRelativeTime(notification.created_at);
  const subId = notification.data && notification.data.submissionId ? notification.data.submissionId : '';

  let markReadBtn = '';
  if (!notification.read) {
    markReadBtn = `<button class="btn-link notification-mark-read" data-action="mark-notification-read" data-notification-id="${notification.id}">Mark read</button>`;
  }

  return `<div class="notification-item ${readClass}" data-notification-id="${notification.id}" data-submission-id="${subId}" role="listitem" tabindex="0" aria-label="${escapeHTML(notification.message)}">
    <span class="notification-icon" aria-hidden="true">${icon}</span>
    <div class="notification-content">
      <p class="notification-message">${escapeHTML(notification.message)}</p>
      <span class="notification-time">${escapeHTML(timeAgo)}</span>
    </div>
    ${markReadBtn}
  </div>`;
}

/** Fetch and display notifications in the my-submissions screen. */
async function loadNotifications() {
  const section = document.querySelector('[data-bind="notifications-section"]');
  const list = document.querySelector('[data-bind="notifications-list"]');
  const countLabel = document.querySelector('[data-bind="notifications-unread-count"]');
  if (!section || !list) return;

  try {
    const res = await apiFetch('/api/notifications');
    if (!res.ok) {
      section.style.display = 'none';
      return;
    }
    const data = await res.json();
    const notifications = data.notifications || [];
    const unreadCount = data.unread_count || 0;

    if (notifications.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    if (countLabel) countLabel.textContent = String(unreadCount);
    list.innerHTML = notifications.map(renderNotificationItem).join('');
    updateNotificationBadge(unreadCount);
  } catch {
    section.style.display = 'none';
  }
}

/** Mark a single notification as read via API. */
async function markNotificationRead(notificationId) {
  try {
    const res = await apiFetch(`/api/notifications/${notificationId}/read`, { method: 'PUT' });
    if (res.ok) {
      const item = document.querySelector(`.notification-item[data-notification-id="${notificationId}"]`);
      if (item) {
        item.classList.remove('notification-unread');
        item.classList.add('notification-read');
        const btn = item.querySelector('[data-action="mark-notification-read"]');
        if (btn) btn.remove();
      }
      // Update unread count
      const countLabel = document.querySelector('[data-bind="notifications-unread-count"]');
      if (countLabel) {
        const current = parseInt(countLabel.textContent, 10) || 0;
        const next = Math.max(0, current - 1);
        countLabel.textContent = String(next);
        updateNotificationBadge(next);
      }
    }
  } catch { /* ignore */ }
}

/** Mark all notifications as read via API. */
async function markAllNotificationsRead() {
  try {
    const res = await apiFetch('/api/notifications/read-all', { method: 'PUT' });
    if (res.ok) {
      document.querySelectorAll('.notification-item.notification-unread').forEach(item => {
        item.classList.remove('notification-unread');
        item.classList.add('notification-read');
        const btn = item.querySelector('[data-action="mark-notification-read"]');
        if (btn) btn.remove();
      });
      const countLabel = document.querySelector('[data-bind="notifications-unread-count"]');
      if (countLabel) countLabel.textContent = '0';
      updateNotificationBadge(0);
    }
  } catch { /* ignore */ }
}

/** Highlight a submission card when a notification is clicked. */
function highlightSubmissionFromNotification(submissionId) {
  if (!submissionId) return;
  const card = document.querySelector(`.submission-card[data-submission-id="${submissionId}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('submission-highlight');
    setTimeout(() => card.classList.remove('submission-highlight'), 2000);
  }
}

/** Fetch and display the current user's submissions. */
async function showMySubmissions() {
  showScreen('my-submissions');

  const container = document.querySelector('[data-bind="my-submissions-list"]');
  if (!container) return;
  container.innerHTML = '<p class="my-submissions-loading" role="listitem">Loading submissions…</p>';

  // Load notifications in parallel
  loadNotifications();

  try {
    const res = await apiFetch('/api/submissions');
    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = `<p class="my-submissions-error" role="listitem">${escapeHTML(data.error || 'Failed to load submissions')}</p>`;
      return;
    }

    const submissions = data.submissions || [];
    mySubmissionsCache = submissions;
    if (submissions.length === 0) {
      container.innerHTML = renderSubmissionsEmptyState();
      return;
    }

    container.innerHTML = submissions.map(renderSubmissionCard).join('');
  } catch {
    container.innerHTML = '<p class="my-submissions-error" role="listitem">Network error — please try again.</p>';
  }
}

/** Derive category list from the existing submit-puzzle select element. */
function getEditCategories() {
  const select = document.querySelector('#sp-category');
  if (!select) return [];
  return Array.from(select.options)
    .map(o => o.value)
    .filter(v => v && v !== '');
}

/** Open an inline edit form inside the submission card. */
function openEditSubmission(submissionId) {
  const submission = mySubmissionsCache.find(s => s.id === submissionId);
  if (!submission) return;

  const card = document.querySelector(`.submission-card[data-submission-id="${submissionId}"]`);
  if (!card) return;

  // Already editing — don't open again
  if (card.querySelector('.submission-edit-form')) return;

  const seq = Array.isArray(submission.sequence) ? submission.sequence.join(', ') : '';
  const opts = Array.isArray(submission.options) ? submission.options : ['', '', '', ''];
  const categoryOptions = getEditCategories().map(cat =>
    `<option value="${escapeHTML(cat)}"${cat === submission.category ? ' selected' : ''}>${escapeHTML(cat)}</option>`
  ).join('');
  const typeEmoji = submission.type === 'text' ? '' : ' selected';
  const typeText = submission.type === 'text' ? ' selected' : '';

  const formHtml = `
    <div class="submission-edit-form">
      <div class="form-group">
        <label for="edit-type-${submissionId}">Type</label>
        <select id="edit-type-${submissionId}" class="edit-type">
          <option value="emoji"${typeEmoji}>Emoji</option>
          <option value="text"${typeText}>Text</option>
        </select>
      </div>
      <div class="form-group">
        <label for="edit-category-${submissionId}">Category</label>
        <select id="edit-category-${submissionId}" class="edit-category">${categoryOptions}</select>
      </div>
      <div class="form-group">
        <label for="edit-difficulty-${submissionId}">Difficulty</label>
        <select id="edit-difficulty-${submissionId}" class="edit-difficulty">
          <option value="1"${submission.difficulty === 1 ? ' selected' : ''}>Easy</option>
          <option value="2"${submission.difficulty === 2 ? ' selected' : ''}>Medium</option>
          <option value="3"${submission.difficulty === 3 ? ' selected' : ''}>Hard</option>
        </select>
      </div>
      <div class="form-group">
        <label for="edit-sequence-${submissionId}">Sequence (comma-separated)</label>
        <input type="text" id="edit-sequence-${submissionId}" class="edit-sequence" value="${escapeHTML(seq)}">
      </div>
      <div class="form-group">
        <label for="edit-answer-${submissionId}">Answer</label>
        <input type="text" id="edit-answer-${submissionId}" class="edit-answer" value="${escapeHTML(String(submission.answer || ''))}">
      </div>
      <div class="form-group">
        <label>Options (4 choices)</label>
        <div class="edit-options">
          <input type="text" class="edit-option" data-idx="0" value="${escapeHTML(opts[0] || '')}" placeholder="Option 1" aria-label="Option 1">
          <input type="text" class="edit-option" data-idx="1" value="${escapeHTML(opts[1] || '')}" placeholder="Option 2" aria-label="Option 2">
          <input type="text" class="edit-option" data-idx="2" value="${escapeHTML(opts[2] || '')}" placeholder="Option 3" aria-label="Option 3">
          <input type="text" class="edit-option" data-idx="3" value="${escapeHTML(opts[3] || '')}" placeholder="Option 4" aria-label="Option 4">
        </div>
      </div>
      <div class="form-group">
        <label for="edit-explanation-${submissionId}">Explanation</label>
        <textarea id="edit-explanation-${submissionId}" class="edit-explanation" rows="2">${escapeHTML(submission.explanation || '')}</textarea>
      </div>
      <div class="submission-edit-actions">
        <button class="btn btn-primary btn-sm" data-action="save-edit-submission">Save Changes</button>
        <button class="btn btn-secondary btn-sm" data-action="cancel-edit-submission">Cancel</button>
      </div>
      <p class="submission-edit-status" role="status" aria-live="polite"></p>
    </div>`;

  // Hide the card body and show the edit form
  const cardContent = card.querySelectorAll(':scope > :not(.submission-edit-form)');
  cardContent.forEach(el => el.style.display = 'none');
  card.insertAdjacentHTML('beforeend', formHtml);
}

/** Cancel inline edit and restore the card. */
function cancelEditSubmission(card) {
  const form = card.querySelector('.submission-edit-form');
  if (form) form.remove();
  const cardContent = card.querySelectorAll(':scope > *');
  cardContent.forEach(el => { el.style.display = ''; });
}

/** Save inline edit and refresh the card. */
async function saveEditSubmission(card) {
  const submissionId = card.dataset.submissionId;
  const form = card.querySelector('.submission-edit-form');
  if (!form || !submissionId) return;

  const status = form.querySelector('.submission-edit-status');
  const sequenceRaw = form.querySelector('.edit-sequence').value.trim();
  const answer = form.querySelector('.edit-answer').value.trim();
  const explanation = form.querySelector('.edit-explanation').value.trim();
  const difficulty = parseInt(form.querySelector('.edit-difficulty').value, 10);
  const category = form.querySelector('.edit-category').value;
  const type = form.querySelector('.edit-type').value;

  const sequence = sequenceRaw.split(',').map(s => s.trim()).filter(Boolean);
  const optionInputs = form.querySelectorAll('.edit-option');
  const optionVals = [];
  optionInputs.forEach(el => optionVals.push(el.value.trim()));
  const nonEmpty = optionVals.filter(Boolean);
  // Require all 4 or none — reject partial fills
  if (nonEmpty.length > 0 && nonEmpty.length < 4) {
    if (status) { status.textContent = 'Please fill in all 4 options or leave them all empty.'; status.className = 'submission-edit-status error'; }
    return;
  }
  // If all 4 filled: use them. If all empty and submission had options: send null to clear. Otherwise: omit.
  const cachedSub = mySubmissionsCache.find(s => String(s.id) === submissionId);
  const hadOptions = cachedSub && Array.isArray(cachedSub.options) && cachedSub.options.length > 0;
  const options = nonEmpty.length === 4 ? optionVals : (nonEmpty.length === 0 && hadOptions ? null : undefined);

  if (sequence.length < 3) {
    if (status) { status.textContent = 'Sequence must have at least 3 items.'; status.className = 'submission-edit-status error'; }
    return;
  }
  if (!answer) {
    if (status) { status.textContent = 'Answer is required.'; status.className = 'submission-edit-status error'; }
    return;
  }
  if (!explanation) {
    if (status) { status.textContent = 'Explanation is required.'; status.className = 'submission-edit-status error'; }
    return;
  }
  // If all 4 options are provided, validate answer is included
  if (options && !options.includes(answer)) {
    if (status) { status.textContent = 'Options must include the answer.'; status.className = 'submission-edit-status error'; }
    return;
  }

  const payload = { sequence, answer, explanation, difficulty, category, type };
  if (options !== undefined) payload.options = options;

  try {
    const res = await apiFetch(getFeatureAwarePath(`/api/submissions/${submissionId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      // Refresh submissions list to show updated card
      showMySubmissions();
    } else {
      if (status) { status.textContent = data.error || 'Save failed.'; status.className = 'submission-edit-status error'; }
    }
  } catch {
    if (status) { status.textContent = 'Network error — please try again.'; status.className = 'submission-edit-status error'; }
  }
}

/** Show a delete confirmation overlay inside the card. */
function showDeleteConfirmation(submissionId) {
  const card = document.querySelector(`.submission-card[data-submission-id="${submissionId}"]`);
  if (!card) return;

  // Don't show if already visible
  if (card.querySelector('.submission-delete-confirm')) return;

  const submission = mySubmissionsCache.find(s => s.id === submissionId);
  const approvedNote = submission && submission.status === 'approved'
    ? '<p class="delete-approved-note">The puzzle will remain live even if you delete this submission.</p>'
    : '';

  const confirmHtml = `
    <div class="submission-delete-confirm" role="dialog" aria-modal="true" aria-labelledby="delete-label-${submissionId}">
      <p id="delete-label-${submissionId}" class="delete-confirm-text">Delete this submission? This cannot be undone.</p>
      ${approvedNote}
      <div class="delete-confirm-actions">
        <button class="btn btn-danger btn-sm" data-action="confirm-delete-submission" data-submission-id="${submissionId}">Delete</button>
        <button class="btn btn-secondary btn-sm" data-action="cancel-delete-submission">Cancel</button>
      </div>
    </div>`;

  card.insertAdjacentHTML('beforeend', confirmHtml);
  // Focus the cancel button for keyboard accessibility
  const cancelBtn = card.querySelector('[data-action="cancel-delete-submission"]');
  if (cancelBtn) cancelBtn.focus();
}

/** Execute the deletion and remove the card with animation. */
async function confirmDeleteSubmission(submissionId) {
  const card = document.querySelector(`.submission-card[data-submission-id="${submissionId}"]`);
  if (!card) return;

  try {
    const res = await apiFetch(`/api/submissions/${submissionId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      const removeCard = () => {
        card.remove();
        mySubmissionsCache = mySubmissionsCache.filter(s => s.id !== submissionId);
        // If no cards remain, show empty state
        const container = document.querySelector('[data-bind="my-submissions-list"]');
        if (container && !container.querySelector('.submission-card')) {
          container.innerHTML = renderSubmissionsEmptyState();
        }
      };
      card.classList.add('card-removing');
      card.addEventListener('animationend', removeCard, { once: true });
      // Fallback: remove after 500ms if animation doesn't fire (e.g., reduced motion)
      setTimeout(() => { if (card.parentNode) removeCard(); }, 500);
    } else {
      showToast(data.error || 'Delete failed');
      const overlay = card.querySelector('.submission-delete-confirm');
      if (overlay) overlay.remove();
    }
  } catch {
    showToast('Network error — please try again');
    const overlay = card.querySelector('.submission-delete-confirm');
    if (overlay) overlay.remove();
  }
}

/* ===========================
   Community Gallery
   =========================== */

let galleryPuzzles = [];
let galleryPage = 1;
let galleryTotalPages = 0;
let galleryCategory = '';
let galleryDifficulty = 'all';
let galleryReturnScreen = null;

/** Populate the category dropdown from the shared category list. */
function populateGalleryCategoryFilter() {
  const select = document.getElementById('gallery-category-filter');
  if (!select || select.options.length > 1) return;

  const categories = [
    'Nature', 'Math & Numbers', 'Colors & Patterns', 'General Knowledge',
    'Emoji Sequences', 'Music', 'Flags', 'Science', 'Sports', 'Food',
    'Animals', 'Pop Culture', 'Letter & Word Patterns', 'Logic Sequences',
    'Visual & Spatial', 'Creative & Mixed', 'Geography', 'History',
    'Technology', 'Art & Design', 'Language & Grammar',
  ];
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
}

/** Render a single gallery puzzle card. */
function renderGalleryCard(puzzle) {
  const seq = Array.isArray(puzzle.sequence) ? puzzle.sequence : [];
  const preview = seq.slice(0, 4).map(item => escapeHTML(String(item))).join(' ');
  const safeId = escapeHTML(String(puzzle.id || ''));
  const author = puzzle.submitted_by ? escapeHTML(puzzle.submitted_by) : 'Unknown';

  return `<div class="gallery-card" role="listitem" data-puzzle-id="${safeId}">
    <div class="gallery-card-sequence">${preview}</div>
    <div class="gallery-card-meta">
      <span class="gallery-card-category">${escapeHTML(puzzle.category || '')}</span>
      <span class="gallery-card-difficulty">${renderDifficultyStars(puzzle.difficulty)}</span>
    </div>
    <div class="gallery-card-author">By: ${author}</div>
    <button class="gallery-card-play" data-action="gallery-play" data-puzzle-id="${safeId}">▶ Play</button>
  </div>`;
}

/** Fetch community puzzles and render the gallery. */
async function loadGallery(append = false) {
  const grid = document.querySelector('[data-bind="gallery-grid"]');
  const paginationEl = document.querySelector('[data-bind="gallery-pagination"]');
  if (!grid) return;

  if (!append) {
    galleryPuzzles = [];
    galleryPage = 1;
  }

  if (append) {
    // For paginated loads, use simple loading indicator
    const loadingP = document.createElement('p');
    loadingP.className = 'gallery-loading';
    loadingP.setAttribute('role', 'listitem');
    loadingP.textContent = 'Loading more...';
    grid.appendChild(loadingP);
  }

  const fetchData = async (signal) => {
    const params = new URLSearchParams({ page: galleryPage, limit: 20 });
    if (galleryCategory) params.set('category', galleryCategory);
    if (galleryDifficulty && galleryDifficulty !== 'all') params.set('difficulty', galleryDifficulty);

    // CS53-4: route through apiFetch so 503 warmup + UnavailableError signals
    // bubble to the surrounding progressiveLoad wrapper (see line ~3664).
    const res = await apiFetch(`/api/puzzles/community?${params}`, { signal });
    await throwIfRetryable(res);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load puzzles');
    return data;
  };

  let data;
  if (append) {
    // Appended pages don't get progressive messages — just a simple fetch
    try {
      data = await fetchData();
    } catch {
      const loadingEl = grid.querySelector('.gallery-loading');
      if (loadingEl) loadingEl.remove();
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }
  } else {
    data = await progressiveLoad(fetchData, grid, MESSAGE_SETS.community, {
      onRetry: () => loadGallery(false),
    });
  }

  if (!data) {
    if (paginationEl) paginationEl.style.display = 'none';
    return;
  }

  const puzzles = data.puzzles || [];
  galleryTotalPages = data.pagination?.pages || 0;

  if (append) {
    galleryPuzzles = galleryPuzzles.concat(puzzles);
  } else {
    galleryPuzzles = puzzles;
  }

  if (galleryPuzzles.length === 0) {
    grid.innerHTML = `
      <div class="gallery-empty" role="listitem">
        <div class="gallery-empty-icon" aria-hidden="true">🌍</div>
        <p class="gallery-empty-text">No community puzzles yet — be the first to create one!</p>
      </div>`;
    if (paginationEl) paginationEl.style.display = 'none';
    return;
  }

  if (!append) {
    grid.innerHTML = '';
  } else {
    const loadingEl = grid.querySelector('.gallery-loading');
    if (loadingEl) loadingEl.remove();
  }

  const fragment = document.createDocumentFragment();
  const newPuzzles = append ? puzzles : galleryPuzzles;
  newPuzzles.forEach(p => {
    const temp = document.createElement('div');
    temp.innerHTML = renderGalleryCard(p);
    fragment.appendChild(temp.firstElementChild);
  });
  grid.appendChild(fragment);

  if (paginationEl) {
    paginationEl.style.display = galleryPage < galleryTotalPages ? '' : 'none';
  }
}

/** Open the community gallery screen. */
function showCommunityGallery() {
  showScreen('community-gallery');
  populateGalleryCategoryFilter();

  const select = document.getElementById('gallery-category-filter');
  if (select) select.value = galleryCategory;
  document.querySelectorAll('[data-gallery-difficulty]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.galleryDifficulty === galleryDifficulty);
  });

  galleryPage = 1;
  loadGallery();
}

/** Play a community puzzle from the gallery. */
function playGalleryPuzzle(puzzleId) {
  const puzzle = galleryPuzzles.find(p => String(p.id) === String(puzzleId));
  if (!puzzle) return;

  galleryReturnScreen = 'community-gallery';
  Game.startFreePlay([puzzle], null, ui, 'all');
}

/* ===========================
   Community Puzzle Submissions
   ===========================*/

const ONBOARDING_DISMISSED_KEY = 'gwn_submit_onboarding_dismissed';

/** Navigate to the submit-puzzle screen, resetting form and showing onboarding. */
function openSubmitPuzzleScreen() {
  showScreen('submit-puzzle');
  resetSubmitPuzzleForm();
  showOnboarding();
}

/** Show the onboarding explainer if not previously dismissed. */
function showOnboarding() {
  const el = document.getElementById('submit-onboarding');
  if (!el) return;
  try {
    if (localStorage.getItem(ONBOARDING_DISMISSED_KEY) === 'true') {
      el.style.display = 'none';
      return;
    }
  } catch {
    // localStorage unavailable — show onboarding
  }
  el.style.display = '';
  el.classList.remove('collapsed');
  const toggle = el.querySelector('.onboarding-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
}

/** Toggle the onboarding explainer open/closed. */
function toggleOnboarding() {
  const el = document.getElementById('submit-onboarding');
  if (!el) return;
  const isCollapsed = el.classList.toggle('collapsed');
  const toggle = el.querySelector('.onboarding-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', String(!isCollapsed));
}

/** Dismiss the onboarding explainer and persist via localStorage. */
function dismissOnboarding() {
  const el = document.getElementById('submit-onboarding');
  if (el) el.style.display = 'none';
  try {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, 'true');
  } catch {
    // localStorage unavailable — dismissal is best-effort
  }
}

/** Show a temporary "coming soon" tooltip on a button. */
function showComingSoonTooltip(target) {
  if (!target) return;
  target.classList.add('coming-soon-tooltip', 'show-tooltip');
  setTimeout(() => {
    target.classList.remove('show-tooltip');
    setTimeout(() => target.classList.remove('coming-soon-tooltip'), 200);
  }, 2000);
}

/** Currently selected puzzle type for the authoring form. */
let selectedPuzzleType = 'emoji';

/** Image data storage for the authoring form. */
const imageFormState = {
  sequence: [],   // Array of { file, dataUri, objectUrl }
  answer: null,   // { file, dataUri, objectUrl }
  distractors: [null, null, null], // Array of { file, dataUri, objectUrl } or null
};

const IMAGE_MAX_SIZE = 500 * 1024; // 500KB
const IMAGE_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];

/** Convert a File to a base64 data URI. */
function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/** Revoke an object URL if present. */
function revokeObjectUrl(entry) {
  if (entry && entry.objectUrl) {
    URL.revokeObjectURL(entry.objectUrl);
    entry.objectUrl = null;
  }
}

/** Clean up all image form state object URLs. */
function clearImageFormState() {
  imageFormState.sequence.forEach(revokeObjectUrl);
  imageFormState.sequence = [];
  revokeObjectUrl(imageFormState.answer);
  imageFormState.answer = null;
  imageFormState.distractors.forEach(revokeObjectUrl);
  imageFormState.distractors = [null, null, null];
}

/** Toggle form fields between text/emoji and image mode. */
function toggleImageMode(isImage) {
  const textGroups = ['sp-sequence-group', 'sp-answer-group', 'sp-options-group'];
  const imageGroups = ['sp-image-sequence-group', 'sp-image-answer-group', 'sp-image-distractors-group'];
  textGroups.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = isImage ? 'none' : '';
    el.querySelectorAll('input, select, textarea').forEach(ctrl => { ctrl.disabled = isImage; });
  });
  imageGroups.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = isImage ? '' : 'none';
    el.querySelectorAll('input, select, textarea').forEach(ctrl => { ctrl.disabled = !isImage; });
  });
  // Clean up image state when switching away from image mode
  if (!isImage) {
    clearImageFormState();
    rebuildSequenceImageGrid();
  }
}

/** Validate a file for image upload. Returns error string or null. */
function validateImageFile(file) {
  if (!file) return 'No file selected';
  if (!IMAGE_ACCEPTED_TYPES.includes(file.type)) {
    return `Unsupported format: ${file.type || 'unknown'}. Use PNG, JPG, GIF, SVG, or WebP.`;
  }
  if (file.size > IMAGE_MAX_SIZE) {
    return `File too large (${(file.size / 1024).toFixed(0)}KB). Max 500KB.`;
  }
  return null;
}

/** Process an uploaded image file — validate, create preview, convert to data URI. */
async function processImageFile(file) {
  const error = validateImageFile(file);
  if (error) return { error };
  const dataUri = await fileToDataUri(file);
  const objectUrl = URL.createObjectURL(file);
  return { file, dataUri, objectUrl };
}

/** Render an image drop zone with optional preview. */
function renderDropZone(container, entry, label) {
  container.innerHTML = '';
  container.classList.toggle('has-image', !!entry);
  if (entry) {
    const img = document.createElement('img');
    img.src = entry.objectUrl || entry.dataUri;
    img.alt = label;
    img.className = 'image-preview-thumb';
    img.loading = 'lazy';
    container.appendChild(img);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'image-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `Remove ${label}`);
    container.appendChild(removeBtn);
  } else {
    const span = document.createElement('span');
    span.className = 'drop-zone-text';
    span.textContent = label;
    container.appendChild(span);
  }
  // Always render file input so delegated change handlers can fire
  const input = document.createElement('input');
  input.type = 'file';
  input.className = 'image-file-input';
  input.accept = '.png,.jpg,.jpeg,.gif,.svg,.webp';
  input.setAttribute('aria-label', `Upload ${label}`);
  container.appendChild(input);
}

/** Rebuild the sequence image upload grid from state. */
function rebuildSequenceImageGrid() {
  const grid = document.getElementById('sp-image-sequence');
  if (!grid) return;
  grid.innerHTML = '';
  imageFormState.sequence.forEach((entry, i) => {
    const zone = document.createElement('div');
    zone.className = 'image-drop-zone';
    zone.dataset.imageSlot = `seq-${i}`;
    renderDropZone(zone, entry, `Sequence ${i + 1}`);
    grid.appendChild(zone);
  });
  // Enable/disable add button
  const addBtn = document.getElementById('sp-add-seq-image');
  if (addBtn) addBtn.style.display = imageFormState.sequence.length >= 6 ? 'none' : '';
  updateImageValidation();
  updateSubmitButtonState();
  schedulePreviewUpdate();
}

/** Update image field validation messages. */
function updateImageValidation() {
  const seqErr = document.querySelector('[data-error="image-sequence"]');
  if (seqErr) {
    if (imageFormState.sequence.length > 0 && imageFormState.sequence.length < 3) {
      seqErr.textContent = 'Need at least 3 sequence images';
    } else {
      seqErr.textContent = '';
    }
  }
  // Answer error is managed by the upload handler, not here — don't clear it
  const distErr = document.querySelector('[data-error="image-distractors"]');
  if (distErr) {
    const filled = imageFormState.distractors.filter(Boolean).length;
    if (filled > 0 && filled < 3) {
      distErr.textContent = 'All 3 distractor images are required';
    } else {
      distErr.textContent = '';
    }
  }
}

/** Reset the submit-puzzle form and status message. */
function resetSubmitPuzzleForm() {
  const form = document.getElementById('submit-puzzle-form');
  if (form) form.reset();
  const status = document.querySelector('[data-bind="submit-puzzle-status"]');
  if (status) { status.textContent = ''; status.className = 'submit-puzzle-status'; }
  // Reset type selector to emoji
  selectedPuzzleType = 'emoji';
  document.querySelectorAll('.type-card').forEach(card => {
    card.classList.toggle('active', card.dataset.type === 'emoji');
  });
  // Clear field errors
  document.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });
  // Clear option inputs
  document.querySelectorAll('.option-input').forEach(el => { el.value = ''; el.classList.remove('has-error'); });
  // Reset submit button
  const submitBtn = document.getElementById('sp-submit-btn');
  if (submitBtn) submitBtn.disabled = true;
  // Reset image state via the standard mode toggle path
  toggleImageMode(false);
  // Reset answer/distractor drop zones
  const answerZone = document.querySelector('#sp-image-answer .image-drop-zone');
  if (answerZone) renderDropZone(answerZone, null, 'Click or drag to upload');
  document.querySelectorAll('#sp-image-distractors .image-drop-zone').forEach((zone, i) => {
    renderDropZone(zone, null, `Distractor ${i + 1}`);
  });
  // Reset preview
  updatePuzzlePreview();
}

/**
 * Render a puzzle preview into a container.
 * Reusable function — used by authoring form and will be reused by gallery/moderation.
 * @param {{type?: string, sequence?: string[], answer?: string, options?: string[], explanation?: string}} data
 * @returns {string} HTML string for the preview
 */
function renderPuzzlePreview({ type: pType, sequence, answer, options, explanation }) {
  if (!sequence || sequence.length === 0) {
    return '<p class="preview-empty">Fill in the form to see a live preview</p>';
  }
  const isImage = pType === 'image';
  let html = '<div class="preview-sequence">';
  for (const item of sequence) {
    if (isImage && (typeof item === 'string') && (item.startsWith('data:') || item.startsWith('blob:'))) {
      html += `<span class="preview-sequence-item"><img src="${item}" alt="sequence item" loading="lazy"></span>`;
    } else {
      html += `<span class="preview-sequence-item">${escapeHTML(String(item))}</span>`;
    }
  }
  html += '<span class="preview-sequence-item" style="opacity:0.4">?</span>';
  html += '</div>';
  html += '<p class="preview-question">What comes next?</p>';
  if (options && options.length > 0) {
    html += '<div class="preview-options">';
    for (const opt of options) {
      const isCorrect = answer && opt === answer;
      if (isImage && (typeof opt === 'string') && (opt.startsWith('data:') || opt.startsWith('blob:'))) {
        html += `<div class="preview-option-btn${isCorrect ? ' correct' : ''}"><img src="${opt}" alt="option" loading="lazy"></div>`;
      } else {
        const correctClass = answer && opt.trim() === (typeof answer === 'string' ? answer.trim() : answer);
        html += `<div class="preview-option-btn${correctClass ? ' correct' : ''}">${escapeHTML(String(opt))}</div>`;
      }
    }
    html += '</div>';
  }
  if (explanation && explanation.trim()) {
    html += `<p class="preview-explanation">💡 ${escapeHTML(explanation)}</p>`;
  }
  return html;
}

/** Debounce timer for preview updates. */
let previewDebounceTimer = null;

/** Schedule a debounced preview update (300ms). */
function schedulePreviewUpdate() {
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
  previewDebounceTimer = setTimeout(updatePuzzlePreview, 300);
}

/** Read current form state and update the live preview panel. */
function updatePuzzlePreview() {
  const container = document.querySelector('[data-bind="preview-content"]');
  if (!container) return;

  if (selectedPuzzleType === 'image') {
    const sequence = imageFormState.sequence.map(e => e.objectUrl || e.dataUri);
    const answer = imageFormState.answer ? (imageFormState.answer.objectUrl || imageFormState.answer.dataUri) : '';
    const options = [];
    if (answer) options.push(answer);
    imageFormState.distractors.forEach(d => { if (d) options.push(d.objectUrl || d.dataUri); });
    const explanation = (document.getElementById('sp-explanation')?.value || '').trim();
    container.innerHTML = renderPuzzlePreview({
      type: 'image',
      sequence,
      answer,
      options: options.length > 0 ? options : undefined,
      explanation,
    });
    return;
  }

  const sequenceRaw = (document.getElementById('sp-sequence')?.value || '').trim();
  const answer = (document.getElementById('sp-answer')?.value || '').trim();
  const explanation = (document.getElementById('sp-explanation')?.value || '').trim();
  const sequence = sequenceRaw.split(',').map(s => s.trim()).filter(Boolean);
  const options = [];
  document.querySelectorAll('.option-input').forEach(el => {
    const v = el.value.trim();
    if (v) options.push(v);
  });
  container.innerHTML = renderPuzzlePreview({
    type: selectedPuzzleType,
    sequence,
    answer,
    options: options.length > 0 ? options : undefined,
    explanation,
  });
}

/** Validate a single form field and show inline error. Returns true if valid. */
function validateField(name) {
  const errorEl = document.querySelector(`[data-error="${name}"]`);
  let valid = true;
  let msg = '';

  if (name === 'sequence') {
    const raw = (document.getElementById('sp-sequence')?.value || '').trim();
    const items = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!raw) { msg = ''; } // Don't show an error when the sequence is empty.
    else if (items.length < 3) { msg = 'Sequence needs at least 3 items'; valid = false; }
  } else if (name === 'answer') {
    const val = (document.getElementById('sp-answer')?.value || '').trim();
    if (val.length === 0 && document.getElementById('sp-answer') === document.activeElement) { msg = ''; }
    else if (val.length === 0) { msg = 'Answer is required'; valid = false; }
  } else if (name === 'explanation') {
    const val = (document.getElementById('sp-explanation')?.value || '').trim();
    if (val.length === 0 && document.getElementById('sp-explanation') === document.activeElement) { msg = ''; }
    else if (val.length === 0) { msg = 'Explanation is required'; valid = false; }
  } else if (name === 'category') {
    const val = document.getElementById('sp-category')?.value || '';
    if (!val) { msg = 'Please select a category'; valid = false; }
  } else if (name === 'options') {
    const inputs = document.querySelectorAll('.option-input');
    const vals = [];
    inputs.forEach(el => { vals.push(el.value.trim()); el.classList.remove('has-error'); });
    const answer = (document.getElementById('sp-answer')?.value || '').trim();
    const nonEmpty = vals.filter(Boolean);
    // Treat a single auto-synced answer option as "no custom options"
    const hasOnlyAutoSyncedOption = answer && nonEmpty.length === 1 && nonEmpty[0] === answer;

    if (nonEmpty.length > 0 && nonEmpty.length < 4 && !hasOnlyAutoSyncedOption) {
      msg = 'All 4 options are required';
      valid = false;
      inputs.forEach(el => { if (!el.value.trim()) el.classList.add('has-error'); });
    } else if (nonEmpty.length === 4) {
      const unique = new Set(vals);
      if (unique.size !== 4) { msg = 'Options must not contain duplicates'; valid = false; }
      else if (answer && !vals.includes(answer)) { msg = 'Options must include the answer'; valid = false; }
    }
  }

  if (errorEl) errorEl.textContent = msg;
  return valid;
}

/** Check if the entire form is valid and enable/disable submit button. */
function updateSubmitButtonState() {
  const btn = document.getElementById('sp-submit-btn');
  if (!btn) return;

  const explanation = (document.getElementById('sp-explanation')?.value || '').trim();
  const category = document.getElementById('sp-category')?.value || '';

  if (selectedPuzzleType === 'image') {
    const seqOk = imageFormState.sequence.length >= 3;
    const ansOk = !!imageFormState.answer;
    const distOk = imageFormState.distractors.filter(Boolean).length === 3;
    const isValid = seqOk && ansOk && distOk && explanation && category;
    btn.disabled = !isValid;
    return;
  }

  const sequenceRaw = (document.getElementById('sp-sequence')?.value || '').trim();
  const answer = (document.getElementById('sp-answer')?.value || '').trim();
  const sequence = sequenceRaw.split(',').map(s => s.trim()).filter(Boolean);

  const optionVals = [];
  document.querySelectorAll('.option-input').forEach(el => optionVals.push(el.value.trim()));
  const nonEmptyOptions = optionVals.filter(Boolean);
  // Treat a single auto-synced answer option as "no custom options"
  const hasOnlyAutoSyncedAnswerOption = answer && nonEmptyOptions.length === 1 && nonEmptyOptions[0] === answer;
  const hasValidCustomOptions = nonEmptyOptions.length === 4 &&
    new Set(optionVals).size === 4 &&
    optionVals.includes(answer);
  const optionsValid = nonEmptyOptions.length === 0 || hasOnlyAutoSyncedAnswerOption || hasValidCustomOptions;

  const isValid = sequence.length >= 3 && answer && explanation && category && optionsValid;
  btn.disabled = !isValid;
}

/** Initialize a single image drop zone with upload, drag-drop, and remove handlers. */
function initImageDropZone(selector, onUpload, onRemove) {
  const zone = document.querySelector(selector);
  if (!zone) return;
  zone.addEventListener('click', (e) => {
    if (e.target.closest('.image-remove-btn')) {
      onRemove();
      return;
    }
    // If zone already has image, don't open file dialog on zone click
    if (zone.classList.contains('has-image')) return;
  });
  zone.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('image-file-input')) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const parent = zone.closest('.form-group');
    const errEl = parent?.querySelector('.field-error');
    const result = await processImageFile(file);
    if (result.error) {
      if (errEl) errEl.textContent = result.error;
      return;
    }
    if (errEl) errEl.textContent = '';
    onUpload(result);
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const parent = zone.closest('.form-group');
    const errEl = parent?.querySelector('.field-error');
    const result = await processImageFile(file);
    if (result.error) {
      if (errEl) errEl.textContent = result.error;
      return;
    }
    if (errEl) errEl.textContent = '';
    onUpload(result);
  });
}

/** Wire submit-puzzle form handler inside init (called once). */
function initSubmitPuzzleForm() {
  const form = document.getElementById('submit-puzzle-form');
  if (!form) return;

  // Type selector — use native radio change events
  document.querySelectorAll('input[name="puzzle-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      selectedPuzzleType = radio.value;
      document.querySelectorAll('.type-card').forEach(card => {
        card.classList.toggle('active', card.dataset.type === radio.value);
      });
      toggleImageMode(radio.value === 'image');
      updateSubmitButtonState();
      schedulePreviewUpdate();
    });
  });

  // Image upload — sequence add button
  const addSeqBtn = document.getElementById('sp-add-seq-image');
  if (addSeqBtn) {
    addSeqBtn.addEventListener('click', () => {
      if (imageFormState.sequence.length >= 6) return;
      // Create a temporary file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.png,.jpg,.jpeg,.gif,.svg,.webp';
      input.addEventListener('change', async () => {
        if (!input.files || !input.files[0]) return;
        const result = await processImageFile(input.files[0]);
        if (result.error) {
          const errEl = document.querySelector('[data-error="image-sequence"]');
          if (errEl) errEl.textContent = result.error;
          return;
        }
        imageFormState.sequence.push(result);
        rebuildSequenceImageGrid();
      });
      input.click();
    });
  }

  // Image upload — delegated events for sequence grid
  const seqGrid = document.getElementById('sp-image-sequence');
  if (seqGrid) {
    seqGrid.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.image-remove-btn');
      if (removeBtn) {
        const zone = removeBtn.closest('.image-drop-zone');
        const slot = zone?.dataset.imageSlot;
        if (slot && slot.startsWith('seq-')) {
          const idx = parseInt(slot.replace('seq-', ''), 10);
          revokeObjectUrl(imageFormState.sequence[idx]);
          imageFormState.sequence.splice(idx, 1);
          rebuildSequenceImageGrid();
        }
        return;
      }
    });
    seqGrid.addEventListener('change', async (e) => {
      if (!e.target.classList.contains('image-file-input')) return;
      const zone = e.target.closest('.image-drop-zone');
      const slot = zone?.dataset.imageSlot;
      if (!slot || !slot.startsWith('seq-')) return;
      const idx = parseInt(slot.replace('seq-', ''), 10);
      const file = e.target.files?.[0];
      if (!file) return;
      const result = await processImageFile(file);
      if (result.error) {
        const errEl = document.querySelector('[data-error="image-sequence"]');
        if (errEl) errEl.textContent = result.error;
        return;
      }
      revokeObjectUrl(imageFormState.sequence[idx]);
      imageFormState.sequence[idx] = result;
      rebuildSequenceImageGrid();
    });
    // Drag-and-drop for sequence grid
    seqGrid.addEventListener('dragover', (e) => {
      e.preventDefault();
      const zone = e.target.closest('.image-drop-zone');
      if (zone) zone.classList.add('drag-over');
    });
    seqGrid.addEventListener('dragleave', (e) => {
      const zone = e.target.closest('.image-drop-zone');
      if (zone) zone.classList.remove('drag-over');
    });
    seqGrid.addEventListener('drop', async (e) => {
      e.preventDefault();
      const zone = e.target.closest('.image-drop-zone');
      if (zone) zone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const result = await processImageFile(file);
      if (result.error) {
        const errEl = document.querySelector('[data-error="image-sequence"]');
        if (errEl) errEl.textContent = result.error;
        return;
      }
      const slot = zone?.dataset.imageSlot;
      if (slot && slot.startsWith('seq-')) {
        const idx = parseInt(slot.replace('seq-', ''), 10);
        revokeObjectUrl(imageFormState.sequence[idx]);
        imageFormState.sequence[idx] = result;
      } else {
        if (imageFormState.sequence.length >= 6) return;
        imageFormState.sequence.push(result);
      }
      rebuildSequenceImageGrid();
    });
  }

  // Image upload — answer drop zone
  initImageDropZone('#sp-image-answer .image-drop-zone', (entry) => {
    revokeObjectUrl(imageFormState.answer);
    imageFormState.answer = entry;
    const zone = document.querySelector('#sp-image-answer .image-drop-zone');
    if (zone) renderDropZone(zone, entry, 'Click or drag to upload');
    updateSubmitButtonState();
    schedulePreviewUpdate();
  }, () => {
    revokeObjectUrl(imageFormState.answer);
    imageFormState.answer = null;
    const zone = document.querySelector('#sp-image-answer .image-drop-zone');
    if (zone) renderDropZone(zone, null, 'Click or drag to upload');
    updateSubmitButtonState();
    schedulePreviewUpdate();
  });

  // Image upload — distractor drop zones
  document.querySelectorAll('#sp-image-distractors .image-drop-zone').forEach((zone, i) => {
    initImageDropZone(`#sp-image-distractors .image-drop-zone[data-image-slot="distractor-${i}"]`, (entry) => {
      revokeObjectUrl(imageFormState.distractors[i]);
      imageFormState.distractors[i] = entry;
      renderDropZone(zone, entry, `Distractor ${i + 1}`);
      updateImageValidation();
      updateSubmitButtonState();
      schedulePreviewUpdate();
    }, () => {
      revokeObjectUrl(imageFormState.distractors[i]);
      imageFormState.distractors[i] = null;
      renderDropZone(zone, null, `Distractor ${i + 1}`);
      updateImageValidation();
      updateSubmitButtonState();
      schedulePreviewUpdate();
    });
  });

  // Answer field → auto-sync to the currently selected correct option
  const answerInput = document.getElementById('sp-answer');
  if (answerInput) {
    answerInput.addEventListener('input', () => {
      const correctRadio = document.querySelector('input[name="correct-option"]:checked');
      if (correctRadio) {
        const targetOption = document.querySelector(`.option-input[data-option="${correctRadio.value}"]`);
        if (targetOption) targetOption.value = answerInput.value;
      }
      validateField('answer');
      validateField('options');
      updateSubmitButtonState();
      schedulePreviewUpdate();
    });
    answerInput.addEventListener('blur', () => validateField('answer'));
  }

  // Sequence field
  const seqInput = document.getElementById('sp-sequence');
  if (seqInput) {
    seqInput.addEventListener('input', () => {
      validateField('sequence');
      updateSubmitButtonState();
      schedulePreviewUpdate();
    });
    seqInput.addEventListener('blur', () => validateField('sequence'));
  }

  // Explanation field
  const expInput = document.getElementById('sp-explanation');
  if (expInput) {
    expInput.addEventListener('input', () => {
      validateField('explanation');
      updateSubmitButtonState();
      schedulePreviewUpdate();
    });
    expInput.addEventListener('blur', () => validateField('explanation'));
  }

  // Category field
  const catSelect = document.getElementById('sp-category');
  if (catSelect) {
    catSelect.addEventListener('change', () => {
      validateField('category');
      updateSubmitButtonState();
    });
  }

  // Difficulty field
  const diffSelect = document.getElementById('sp-difficulty');
  if (diffSelect) {
    diffSelect.addEventListener('change', updateSubmitButtonState);
  }

  // Options editor inputs
  document.querySelectorAll('.option-input').forEach(input => {
    input.addEventListener('input', () => {
      validateField('options');
      updateSubmitButtonState();
      schedulePreviewUpdate();
    });
    input.addEventListener('blur', () => validateField('options'));
  });

  // Radio buttons for correct answer — sync answer field to match selected option
  document.querySelectorAll('input[name="correct-option"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const selectedIdx = radio.value;
      const selectedOption = document.querySelector(`.option-input[data-option="${selectedIdx}"]`);
      if (selectedOption && selectedOption.value.trim()) {
        const answerField = document.getElementById('sp-answer');
        if (answerField) answerField.value = selectedOption.value;
      }
      validateField('answer');
      validateField('options');
      updateSubmitButtonState();
      schedulePreviewUpdate();
    });
  });

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.querySelector('[data-bind="submit-puzzle-status"]');
    const explanation = document.getElementById('sp-explanation').value.trim();
    const difficulty = parseInt(document.getElementById('sp-difficulty').value, 10);
    const category = document.getElementById('sp-category').value;

    if (!explanation) {
      if (status) { status.textContent = 'Explanation is required.'; status.className = 'submit-puzzle-status error'; }
      return;
    }
    if (!category) {
      if (status) { status.textContent = 'Please select a category.'; status.className = 'submit-puzzle-status error'; }
      return;
    }

    let payload;

    if (selectedPuzzleType === 'image') {
      // Image mode — build payload from image state
      if (imageFormState.sequence.length < 3) {
        if (status) { status.textContent = 'Need at least 3 sequence images.'; status.className = 'submit-puzzle-status error'; }
        return;
      }
      if (!imageFormState.answer) {
        if (status) { status.textContent = 'Answer image is required.'; status.className = 'submit-puzzle-status error'; }
        return;
      }
      const distractorsFilled = imageFormState.distractors.filter(Boolean);
      if (distractorsFilled.length < 3) {
        if (status) { status.textContent = 'All 3 distractor images are required.'; status.className = 'submit-puzzle-status error'; }
        return;
      }
      const sequence = imageFormState.sequence.map(e => e.dataUri);
      const answer = imageFormState.answer.dataUri;
      const options = shuffle([answer, ...imageFormState.distractors.map(d => d.dataUri)]);
      payload = { sequence, answer, explanation, difficulty, category, type: 'image', options };
    } else {
      // Text/emoji mode
      const sequenceRaw = document.getElementById('sp-sequence').value.trim();
      const answer = document.getElementById('sp-answer').value.trim();
      const sequence = sequenceRaw.split(',').map(s => s.trim()).filter(Boolean);

      const optionVals = [];
      document.querySelectorAll('.option-input').forEach(el => optionVals.push(el.value.trim()));
      const nonEmptyOptions = optionVals.filter(Boolean);
      const options = nonEmptyOptions.length === 4 ? shuffle(optionVals) : undefined;

      if (sequence.length < 3) {
        if (status) { status.textContent = 'Sequence must have at least 3 items.'; status.className = 'submit-puzzle-status error'; }
        return;
      }
      if (!answer) {
        if (status) { status.textContent = 'Answer is required.'; status.className = 'submit-puzzle-status error'; }
        return;
      }

      payload = { sequence, answer, explanation, difficulty, category, type: selectedPuzzleType };
      if (options) payload.options = options;
    }

    try {
      const res = await apiFetch(getFeatureAwarePath('/api/submissions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        resetSubmitPuzzleForm();
        if (status) {
          status.innerHTML = 'Puzzle submitted for review! <button type="button" class="btn-link" data-action="show-my-submissions">View My Submissions →</button>';
          status.className = 'submit-puzzle-status success';
        }
      } else {
        if (status) { status.textContent = data.error || 'Submission failed.'; status.className = 'submit-puzzle-status error'; }
      }
    } catch {
      if (status) { status.textContent = 'Network error — please try again.'; status.className = 'submit-puzzle-status error'; }
    }
  });
}

/* ====================
   Admin Moderation UI
   ==================== */

/** Set of selected submission IDs for bulk operations. */
const modSelectedIds = new Set();

/** Refresh the bulk action bar visibility and counts. */
function updateBulkActionBar() {
  const bar = document.querySelector('[data-bind="mod-bulk-actions"]');
  const countEl = document.querySelector('[data-bind="mod-bulk-count"]');
  if (!bar) return;
  const n = modSelectedIds.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  if (countEl) countEl.textContent = `${n} selected`;
  // Update approve/reject button labels
  const approveBtn = bar.querySelector('[data-action="bulk-approve"]');
  const rejectBtn = bar.querySelector('[data-action="bulk-reject"]');
  if (approveBtn) approveBtn.textContent = `✅ Approve Selected (${n})`;
  if (rejectBtn) rejectBtn.textContent = `❌ Reject Selected (${n})`;
}

/** Update the select-all checkbox state based on individual checkboxes. */
function syncSelectAllCheckbox() {
  const selectAll = document.querySelector('[data-bind="mod-select-all"]');
  if (!selectAll) return;
  const checkboxes = document.querySelectorAll('.mod-card-checkbox');
  if (checkboxes.length === 0) { selectAll.checked = false; selectAll.indeterminate = false; return; }
  const allChecked = [...checkboxes].every(cb => cb.checked);
  const someChecked = [...checkboxes].some(cb => cb.checked);
  selectAll.checked = allChecked;
  selectAll.indeterminate = someChecked && !allChecked;
}

/** Fetch and display submission statistics. */
async function loadModerationStats() {
  try {
    const res = await apiFetch('/api/submissions/stats');
    if (!res.ok) return;
    const data = await res.json();
    const pending = document.querySelector('[data-bind="stat-pending"]');
    const approved = document.querySelector('[data-bind="stat-approved"]');
    const rejected = document.querySelector('[data-bind="stat-rejected"]');
    const today = document.querySelector('[data-bind="stat-today"]');
    if (pending) pending.textContent = data.pending;
    if (approved) approved.textContent = data.approved;
    if (rejected) rejected.textContent = data.rejected;
    if (today) today.textContent = `${data.today.submitted} submitted, ${data.today.reviewed} reviewed`;
  } catch { /* best effort */ }
}

/** Initialize moderation tab switching. */
function initModerationTabs() {
  document.querySelectorAll('[data-mod-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.modTab;
      document.querySelectorAll('[data-mod-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.modTab === tab);
        b.setAttribute('aria-selected', b.dataset.modTab === tab ? 'true' : 'false');
      });
      document.querySelectorAll('[data-mod-panel]').forEach(p => {
        p.style.display = p.dataset.modPanel === tab ? '' : 'none';
      });
      if (tab === 'users') loadUserManagement();
      if (tab === 'submissions') loadModerationSubmissions();
    });
  });
}

/** Fetch and display pending submissions in the moderation panel. */
async function loadModerationSubmissions() {
  const container = document.querySelector('[data-bind="moderation-list"]');
  if (!container) return;
  container.innerHTML = '<p class="moderation-loading">Loading submissions…</p>';
  modSelectedIds.clear();
  updateBulkActionBar();

  try {
    const res = await apiFetch('/api/submissions/pending');
    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = `<p class="moderation-error">${escapeHTML(data.error || 'Failed to load')}</p>`;
      const bh = document.querySelector('[data-bind="mod-bulk-header"]');
      if (bh) bh.style.display = 'none';
      return;
    }
    const submissions = data.submissions || [];
    if (submissions.length === 0) {
      container.innerHTML = '<p class="moderation-empty">No pending submissions.</p>';
      const bh = document.querySelector('[data-bind="mod-bulk-header"]');
      if (bh) bh.style.display = 'none';
      return;
    }

    // Show bulk header
    const bulkHeader = document.querySelector('[data-bind="mod-bulk-header"]');
    if (bulkHeader) bulkHeader.style.display = '';

    container.innerHTML = submissions.map(s => {
      const seqDisplay = Array.isArray(s.sequence) ? s.sequence.map(item => escapeHTML(String(item))).join(', ') : escapeHTML(String(s.sequence));
      const optionsDisplay = Array.isArray(s.options) ? s.options.map(o => escapeHTML(String(o))).join(', ') : '';
      return `
      <div class="moderation-card" data-submission-id="${s.id}">
        <div class="mod-card-header">
          <label class="mod-checkbox-label">
            <input type="checkbox" class="mod-card-checkbox" data-mod-select="${s.id}" aria-label="Select submission ${s.id}">
          </label>
          <span class="mod-badge mod-badge-${s.difficulty === 1 ? 'easy' : s.difficulty === 2 ? 'medium' : 'hard'}">${s.difficulty === 1 ? 'Easy' : s.difficulty === 2 ? 'Medium' : 'Hard'}</span>
          <span class="mod-category">${escapeHTML(s.category)}</span>
          <span class="mod-type-badge">${escapeHTML(s.type || 'emoji')}</span>
          <span class="mod-author">by ${escapeHTML(s.submitted_by)}</span>
        </div>
        <div class="mod-card-body" data-mod-body="${s.id}">
          <p><strong>Sequence:</strong> ${seqDisplay}</p>
          <p><strong>Answer:</strong> ${escapeHTML(String(s.answer))}</p>
          ${optionsDisplay ? `<p><strong>Options:</strong> ${optionsDisplay}</p>` : ''}
          <p><strong>Explanation:</strong> ${escapeHTML(s.explanation)}</p>
        </div>
        <div class="mod-card-preview" data-mod-preview="${s.id}" style="display:none">
          ${renderPuzzlePreview({ type: s.type, sequence: s.sequence, answer: String(s.answer), options: s.options, explanation: s.explanation })}
        </div>
        <div class="mod-card-actions" data-mod-actions="${s.id}">
          <button class="btn btn-secondary btn-sm" data-mod-toggle-preview="${s.id}" aria-expanded="false">👁️ Preview</button>
          <button class="btn btn-secondary btn-sm" data-mod-edit="${s.id}">✏️ Edit</button>
          <button class="btn btn-approve" data-mod-action="approved" data-mod-id="${s.id}">✅ Approve</button>
          <button class="btn btn-reject" data-mod-action="rejected" data-mod-id="${s.id}">❌ Reject</button>
        </div>
      </div>`;
    }).join('');

    // Store submission data for edit functionality
    container._submissionsData = submissions;
    syncSelectAllCheckbox();
  } catch {
    container.innerHTML = '<p class="moderation-error">Network error — please try again.</p>';
    const bh = document.querySelector('[data-bind="mod-bulk-header"]');
    if (bh) bh.style.display = 'none';
  }
}

/** Handle approve/reject actions on submissions. */
async function handleModerationAction(id, status) {
  const statusEl = document.querySelector('[data-bind="moderation-status"]');
  let reviewerNotes = null;
  if (status === 'rejected') {
    reviewerNotes = prompt('Reviewer notes (optional):');
    if (reviewerNotes === null) return; // cancelled
  }

  try {
    const body = { status };
    if (reviewerNotes) body.reviewerNotes = reviewerNotes;
    const res = await apiFetch(`/api/submissions/${id}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      if (statusEl) { statusEl.textContent = data.message || `Submission ${status}`; statusEl.className = 'moderation-status success'; }
      loadModerationSubmissions();
      loadModerationStats();
    } else {
      if (statusEl) { statusEl.textContent = data.error || `Failed to ${status}`; statusEl.className = 'moderation-status error'; }
    }
  } catch {
    if (statusEl) { statusEl.textContent = 'Network error — please try again.'; statusEl.className = 'moderation-status error'; }
  }
}

/** Handle bulk approve/reject for selected submissions. */
async function handleBulkReview(status) {
  const statusEl = document.querySelector('[data-bind="moderation-status"]');
  const ids = [...modSelectedIds];
  if (ids.length === 0) return;

  const action = status === 'approved' ? 'Approve' : 'Reject';
  if (!confirm(`${action} ${ids.length} submission${ids.length > 1 ? 's' : ''}?`)) return;

  let reviewerNotes = null;
  if (status === 'rejected') {
    reviewerNotes = prompt('Reviewer notes (optional):');
    if (reviewerNotes === null) return;
  }

  if (statusEl) { statusEl.textContent = `Processing ${ids.length} submissions…`; statusEl.className = 'moderation-status'; }

  try {
    const body = { ids, status };
    if (reviewerNotes) body.reviewerNotes = reviewerNotes;
    const res = await apiFetch('/api/submissions/bulk-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      const succeeded = data.results.filter(r => !r.error).length;
      const failed = data.results.filter(r => r.error).length;
      let msg = `${succeeded} ${status}`;
      if (failed > 0) msg += `, ${failed} failed`;
      if (statusEl) { statusEl.textContent = msg; statusEl.className = succeeded > 0 ? 'moderation-status success' : 'moderation-status error'; }
      loadModerationSubmissions();
      loadModerationStats();
    } else {
      if (statusEl) { statusEl.textContent = data.error || 'Bulk operation failed'; statusEl.className = 'moderation-status error'; }
    }
  } catch {
    if (statusEl) { statusEl.textContent = 'Network error — please try again.'; statusEl.className = 'moderation-status error'; }
  }
}

/** Toggle inline preview for a submission card. */
function toggleModPreview(id) {
  const preview = document.querySelector(`[data-mod-preview="${id}"]`);
  if (!preview) return;
  const visible = preview.style.display !== 'none';
  preview.style.display = visible ? 'none' : '';
  const btn = document.querySelector(`[data-mod-toggle-preview="${id}"]`);
  if (btn) {
    btn.textContent = visible ? '👁️ Preview' : '👁️ Hide Preview';
    btn.setAttribute('aria-expanded', String(!visible));
  }
}

/** Enter edit mode for a submission card. */
function startModEdit(id) {
  const container = document.querySelector('[data-bind="moderation-list"]');
  const submissions = container?._submissionsData;
  if (!submissions) return;
  const s = submissions.find(sub => sub.id === Number(id) || sub.id === id);
  if (!s) return;

  const body = document.querySelector(`[data-mod-body="${id}"]`);
  const actions = document.querySelector(`[data-mod-actions="${id}"]`);
  if (!body || !actions) return;

  const seqVal = Array.isArray(s.sequence) ? s.sequence.join(', ') : String(s.sequence);
  const optVals = Array.isArray(s.options) ? s.options : ['', '', '', ''];

  body.innerHTML = `
    <div class="mod-edit-form">
      <label>Sequence (comma-separated): <textarea class="mod-edit-sequence" rows="2">${escapeHTML(seqVal)}</textarea></label>
      <label>Answer: <input type="text" class="mod-edit-answer" value="${escapeHTML(String(s.answer))}"></label>
      <label>Explanation: <textarea class="mod-edit-explanation" rows="2">${escapeHTML(s.explanation)}</textarea></label>
      <label>Difficulty:
        <select class="mod-edit-difficulty">
          <option value="1" ${s.difficulty === 1 ? 'selected' : ''}>Easy</option>
          <option value="2" ${s.difficulty === 2 ? 'selected' : ''}>Medium</option>
          <option value="3" ${s.difficulty === 3 ? 'selected' : ''}>Hard</option>
        </select>
      </label>
      <label>Options (4):
        <div class="mod-edit-options">
          ${[0,1,2,3].map(i => `<input type="text" class="mod-edit-option" data-idx="${i}" value="${escapeHTML(optVals[i] || '')}" placeholder="Option ${i+1}">`).join('')}
        </div>
      </label>
    </div>`;

  actions.innerHTML = `
    <button class="btn btn-approve btn-sm" data-mod-save="${id}">💾 Save</button>
    <button class="btn btn-secondary btn-sm" data-mod-cancel="${id}">Cancel</button>`;
}

/** Save edits for a submission card. */
async function saveModEdit(id) {
  const statusEl = document.querySelector('[data-bind="moderation-status"]');
  const card = document.querySelector(`[data-submission-id="${id}"]`);
  if (!card) return;

  const seqRaw = card.querySelector('.mod-edit-sequence')?.value || '';
  const answer = card.querySelector('.mod-edit-answer')?.value || '';
  const explanation = card.querySelector('.mod-edit-explanation')?.value || '';
  const difficulty = Number(card.querySelector('.mod-edit-difficulty')?.value || 1);
  const optionEls = card.querySelectorAll('.mod-edit-option');
  const options = [...optionEls].map(el => el.value.trim());
  const filledOptionCount = options.filter(Boolean).length;
  const sequence = seqRaw.split(',').map(s => s.trim()).filter(Boolean);

  if (filledOptionCount > 0 && filledOptionCount < options.length) {
    if (statusEl) {
      statusEl.textContent = 'Please fill in all answer options before saving.';
      statusEl.className = 'moderation-status error';
    }
    return;
  }

  const body = { sequence, answer, explanation, difficulty };
  if (options.length === 4 && filledOptionCount === 4) body.options = options;

  try {
    const res = await apiFetch(`/api/submissions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      if (statusEl) { statusEl.textContent = 'Submission updated'; statusEl.className = 'moderation-status success'; }
      loadModerationSubmissions();
    } else {
      if (statusEl) { statusEl.textContent = data.error || 'Failed to save'; statusEl.className = 'moderation-status error'; }
    }
  } catch {
    if (statusEl) { statusEl.textContent = 'Network error — please try again.'; statusEl.className = 'moderation-status error'; }
  }
}

/** Fetch and display users for admin management. */
async function loadUserManagement() {
  const container = document.querySelector('[data-bind="user-management-list"]');
  if (!container) return;
  container.innerHTML = '<p class="moderation-loading">Loading users…</p>';

  try {
    const res = await apiFetch('/api/users');
    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = `<p class="moderation-error">${escapeHTML(data.error || 'Failed to load users')}</p>`;
      return;
    }
    const users = data.users || [];
    container.innerHTML = users.map(u => {
      const isSystem = u.role === 'system';
      const isSelf = u.username === authUsername;
      const toggleLabel = u.role === 'admin' ? 'Demote to User' : 'Promote to Admin';
      const toggleRole = u.role === 'admin' ? 'user' : 'admin';
      const disabled = isSystem || isSelf ? 'disabled' : '';
      return `
        <div class="moderation-card user-card">
          <div class="mod-card-header">
            <span class="mod-username">${escapeHTML(u.username)}</span>
            <span class="mod-badge mod-badge-${u.role}">${u.role}</span>
          </div>
          <div class="mod-card-actions">
            <button class="btn btn-secondary btn-sm" data-role-action="${toggleRole}" data-user-id="${u.id}" ${disabled}>${toggleLabel}</button>
          </div>
        </div>`;
    }).join('');
  } catch {
    container.innerHTML = '<p class="moderation-error">Network error — please try again.</p>';
  }
}

/** Handle role change action. */
async function handleRoleChange(userId, newRole) {
  const statusEl = document.querySelector('[data-bind="moderation-status"]');
  try {
    const res = await apiFetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json();
    if (res.ok) {
      if (statusEl) { statusEl.textContent = data.message || 'Role updated'; statusEl.className = 'moderation-status success'; }
      loadUserManagement();
    } else {
      if (statusEl) { statusEl.textContent = data.error || 'Failed to update role'; statusEl.className = 'moderation-status error'; }
    }
  } catch {
    if (statusEl) { statusEl.textContent = 'Network error — please try again.'; statusEl.className = 'moderation-status error'; }
  }
}

/** Wire moderation screen event delegation. */
function initModerationScreen() {
  initModerationTabs();

  // Select-all checkbox
  const selectAll = document.querySelector('[data-bind="mod-select-all"]');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const checked = selectAll.checked;
      selectAll.indeterminate = false;
      document.querySelectorAll('.mod-card-checkbox').forEach(cb => {
        cb.checked = checked;
        const id = cb.dataset.modSelect;
        if (checked) modSelectedIds.add(id); else modSelectedIds.delete(id);
      });
      updateBulkActionBar();
    });
  }

  document.addEventListener('click', (e) => {
    // Individual approve/reject
    const modAction = e.target.dataset.modAction;
    if (modAction && e.target.dataset.modId) {
      handleModerationAction(e.target.dataset.modId, modAction);
      return;
    }
    // Role management
    const roleAction = e.target.dataset.roleAction;
    if (roleAction && e.target.dataset.userId) {
      handleRoleChange(e.target.dataset.userId, roleAction);
      return;
    }
    // Preview toggle
    const previewId = e.target.dataset.modTogglePreview;
    if (previewId) {
      toggleModPreview(previewId);
      return;
    }
    // Edit button
    const editId = e.target.dataset.modEdit;
    if (editId) {
      startModEdit(editId);
      return;
    }
    // Save edit
    const saveId = e.target.dataset.modSave;
    if (saveId) {
      saveModEdit(saveId);
      return;
    }
    // Cancel edit
    const cancelId = e.target.dataset.modCancel;
    if (cancelId) {
      loadModerationSubmissions();
      return;
    }
    // Bulk approve
    if (e.target.dataset.action === 'bulk-approve') {
      handleBulkReview('approved');
      return;
    }
    // Bulk reject
    if (e.target.dataset.action === 'bulk-reject') {
      handleBulkReview('rejected');
      return;
    }
  });

  // Checkbox changes (individual)
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('mod-card-checkbox')) {
      const id = e.target.dataset.modSelect;
      if (e.target.checked) modSelectedIds.add(id); else modSelectedIds.delete(id);
      updateBulkActionBar();
      syncSelectAllCheckbox();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
