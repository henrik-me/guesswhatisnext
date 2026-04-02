/**
 * App — Entry point and screen navigation.
 * Manages which screen is visible and delegates to game modules.
 */

import { Game } from './game.js';
import { puzzles as localPuzzles, getCategories } from './puzzles.js';
import { Storage } from './storage.js';
import { GameAudio } from './audio.js';

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

    // Options grid
    const optContainer = document.querySelector('[data-bind="options"]');
    optContainer.innerHTML = '';
    puzzle.options.forEach((option, index) => {
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
        <div class="score-row"><span class="label">Base</span><span class="value">+${result.score.points}</span></div>
        <div class="score-row"><span class="label">Speed bonus</span><span class="value">+${result.score.speedBonus}</span></div>`;
      if (result.score.multiplier > 1) {
        html += `<div class="score-row"><span class="label">Streak ×${result.score.multiplier}</span><span class="value"><span class="streak-badge">🔥 ×${result.score.multiplier}</span></span></div>`;
      }
      html += `<div class="score-row total"><span class="label">Total</span><span class="value">+${result.score.total}</span></div>`;
      breakdown.innerHTML = html;
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

    // Submit score to server if logged in, otherwise queue for later
    if (authToken) {
      submitScore(summary).then(data => {
        if (data && data.newAchievements && data.newAchievements.length > 0) {
          showAchievementToasts(data.newAchievements);
        }
      }).catch(() => {});
    } else {
      queuePendingScore(summary);
      showToast('Log in to save your score to the leaderboard');
    }

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
};

/** Handle an option button click — briefly show correct/wrong, then submit. */
function handleOptionClick(answer, btnEl) {
  // Disable all option buttons immediately
  const allBtns = document.querySelectorAll('.option-btn');
  allBtns.forEach(b => { b.disabled = true; });

  // Highlight correct/wrong
  const puzzle = Game.state.currentPuzzle;
  const isCorrect = answer === puzzle.answer;
  allBtns.forEach(b => {
    if (b === btnEl && !isCorrect) {
      b.classList.add('wrong');
    }
    if ((b.textContent === puzzle.answer) || (b.querySelector('img')?.src === puzzle.answer)) {
      b.classList.add('correct');
    }
  });

  // Play sound feedback
  if (isCorrect) {
    GameAudio.playCorrect();
  } else {
    GameAudio.playWrong();
  }

  // Brief delay to show feedback, then submit
  setTimeout(() => {
    Game.submitAnswer(answer, ui);
  }, 600);
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

  // Update high score display
  bindText('high-score', Storage.getHighScore());

  // Update auth display on home screen
  updateHomeAuthDisplay();

  // Validate stored token on startup (non-blocking)
  if (authToken) {
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` },
    }).then(res => {
      if (res.status === 401 || res.status === 403) {
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
      } else if (res.ok) {
        return res.json().then(data => {
          if (data.user && data.user.role) {
            authRole = data.user.role;
            localStorage.setItem('gwn_auth_role', authRole);
            updateHomeAuthDisplay();
          }
        });
      }
    }).catch(() => {
      // Network error — keep token, will validate on next API call
    });
  }

  // Fetch puzzles from server (non-blocking, falls back to local data)
  fetchPuzzlesFromServer();

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

  // Wire up button actions
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    switch (action) {
      case 'start-freeplay':
        showScreen('category');
        renderCategories();
        break;
      case 'start-daily':
        Game.startDaily(localPuzzles, ui);
        break;
      case 'go-home':
        disconnectWebSocket();
        resetMatchState();
        showScreen('home');
        bindText('high-score', Storage.getHighScore());
        updateHomeAuthDisplay();
        break;
      case 'next-round':
        Game.nextRound(ui);
        break;
      case 'play-again':
        showScreen('category');
        renderCategories();
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
        setActiveLeaderboardMode('freeplay');
        setActiveLeaderboardTab('alltime');
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
        if (isLoggedIn()) {
          showScreen('submit-puzzle');
          resetSubmitPuzzleForm();
        } else {
          showScreen('auth');
        }
        break;
      case 'show-moderation':
        if (isLoggedIn() && (authRole === 'admin' || authRole === 'system')) {
          showScreen('moderation');
          loadModerationSubmissions();
        }
        break;
      case 'leaderboard-mode': {
        const mode = e.target.dataset.mode;
        if (mode) {
          leaderboardMode = mode;
          setActiveLeaderboardMode(mode);
          // Show/hide period tabs for multiplayer (they apply to both)
          setActiveLeaderboardTab('alltime');
          fetchLeaderboard('alltime');
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
      case 'auth-login':
        authAction('login');
        break;
      case 'auth-register':
        authAction('register');
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

/** Set the active leaderboard mode tab visually. */
function setActiveLeaderboardMode(mode) {
  document.querySelectorAll('.leaderboard-mode-tab').forEach(tab => {
    const isActive = tab.dataset.mode === mode;
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
  container.innerHTML = '<div class="leaderboard-loading">Loading</div>';

  try {
    const url = leaderboardMode === 'multiplayer'
      ? `/api/scores/leaderboard/multiplayer?period=${period}`
      : `/api/scores/leaderboard?mode=freeplay&period=${period}`;
    const res = await apiFetch(url);
    if (res.status === 401) {
      container.innerHTML =
        '<div class="leaderboard-error">Log in to view the leaderboard 🔒</div>';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (leaderboardMode === 'multiplayer') {
      renderMultiplayerLeaderboard(data.leaderboard);
    } else {
      renderLeaderboard(data.leaderboard);
    }
  } catch {
    container.innerHTML =
      '<div class="leaderboard-error">Leaderboard unavailable — start the server to see rankings</div>';
  }
}

/** Submit a score to the server. */
async function submitScore(summary) {
  const fastestAnswerMs = (summary.results || [])
    .filter(r => r.correct)
    .reduce((min, r) => Math.min(min, r.timeMs), Infinity);
  const res = await apiFetch('/api/scores', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      score: summary.score,
      mode: summary.mode || 'freeplay',
      correctCount: summary.correctCount || 0,
      totalRounds: summary.totalRounds || 0,
      bestStreak: summary.bestStreak || 0,
      fastestAnswerMs: fastestAnswerMs === Infinity ? null : fastestAnswerMs,
    }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Score submit failed: ${res.status}`);
  return res.json();
}

/** Render leaderboard rows from API data. */
function renderLeaderboard(entries) {
  const container = document.querySelector('[data-bind="leaderboard-table"]');

  if (!entries || entries.length === 0) {
    container.innerHTML = '<div class="leaderboard-empty">No scores yet — be the first! 🎮</div>';
    return;
  }

  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const currentUser = Storage.getUsername?.() || null;

  container.innerHTML = entries.map((entry, i) => {
    const rank = entry.rank ?? i + 1;
    const medal = medals[rank] || '';
    const rankClass = rank <= 3 ? ` rank-${rank}` : '';
    const userClass = currentUser && entry.username === currentUser ? ' current-user' : '';
    const name = escapeHTML(entry.username || 'Anonymous');
    const score = entry.score ?? 0;

    return `<div class="leaderboard-row${rankClass}${userClass}" role="listitem">
      ${medal ? `<span class="leaderboard-medal">${medal}</span>` : `<span class="leaderboard-rank">${rank}</span>`}
      <span class="leaderboard-name">${name}</span>
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
  const currentUser = Storage.getUsername?.() || null;

  container.innerHTML = entries.map((entry, i) => {
    const rank = entry.rank ?? i + 1;
    const medal = medals[rank] || '';
    const rankClass = rank <= 3 ? ` rank-${rank}` : '';
    const userClass = currentUser && entry.username === currentUser ? ' current-user' : '';
    const name = escapeHTML(entry.username || 'Anonymous');

    return `<div class="leaderboard-row${rankClass}${userClass}" role="listitem">
      ${medal ? `<span class="leaderboard-medal">${medal}</span>` : `<span class="leaderboard-rank">${rank}</span>`}
      <span class="leaderboard-name">${name}</span>
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
  container.innerHTML = '<div class="achievements-loading">Loading achievements...</div>';

  try {
    const res = await apiFetch('/api/achievements');
    if (res.status === 401) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderAchievements(data.achievements);
  } catch {
    container.innerHTML = '<div class="achievements-loading">Could not load achievements</div>';
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

/** Update home screen to reflect auth state. */
function updateHomeAuthDisplay() {
  const row = document.querySelector('[data-bind="home-user-display"]');
  const label = document.querySelector('[data-bind="home-user-label"]');
  const submitBtn = document.querySelector('[data-bind="submit-puzzle-btn"]');
  const modBtn = document.querySelector('[data-bind="moderation-btn"]');
  if (!row) return;
  if (isLoggedIn() && authUsername) {
    if (label) label.textContent = `👤 Logged in as ${authUsername}`;
    row.style.display = '';
    // Hidden until Phase 14 reworks community puzzle submission UX
    if (submitBtn) submitBtn.style.display = 'none';
    if (modBtn) modBtn.style.display = (authRole === 'admin' || authRole === 'system') ? '' : 'none';
  } else {
    row.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'none';
    if (modBtn) modBtn.style.display = 'none';
  }
}

/** Log out: clear credentials, close WS, and return to home. */
function logout() {
  authToken = null;
  authUsername = null;
  authRole = null;
  localStorage.removeItem('gwn_auth_token');
  localStorage.removeItem('gwn_auth_username');
  localStorage.removeItem('gwn_auth_role');
  if (ws) { disconnectWebSocket(); }
  updateHomeAuthDisplay();
  showScreen('home');
}

/** Central API fetch wrapper — adds auth header and handles 401 automatically. */
async function apiFetch(url, options = {}) {
  const opts = { ...options };
  opts.headers = { ...opts.headers };
  if (authToken) {
    opts.headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, opts);
  if (res.status === 401 && authToken) {
    logout();
    showToast('Session expired — please log in again');
    showScreen('auth');
  }
  return res;
}

const PENDING_SCORES_KEY = 'gwn_pending_scores';
const MAX_PENDING_SCORES = 10;

/** Queue a score for submission after the user logs in. */
function queuePendingScore(summary) {
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_SCORES_KEY) || '[]');
  } catch {
    pending = [];
    try { localStorage.removeItem(PENDING_SCORES_KEY); } catch { /* ignore */ }
  }
  if (!Array.isArray(pending)) {
    pending = [];
    try { localStorage.removeItem(PENDING_SCORES_KEY); } catch { /* ignore */ }
  }
  const fastestAnswerMs = (summary.results || [])
    .filter(r => r.correct)
    .reduce((min, r) => Math.min(min, r.timeMs), Infinity);
  pending.push({
    score: summary.score,
    mode: summary.mode || 'freeplay',
    correctCount: summary.correctCount || 0,
    totalRounds: summary.totalRounds || 0,
    bestStreak: summary.bestStreak || 0,
    fastestAnswerMs: fastestAnswerMs === Infinity ? null : fastestAnswerMs,
  });
  while (pending.length > MAX_PENDING_SCORES) pending.shift();
  try {
    localStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(pending));
  } catch {
    // Storage full or unavailable — score will be lost
  }
}

/** Submit any pending scores that were queued while logged out. */
async function submitPendingScores() {
  let pending;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_SCORES_KEY) || '[]');
  } catch {
    pending = [];
    try { localStorage.removeItem(PENDING_SCORES_KEY); } catch { /* ignore */ }
  }
  if (!Array.isArray(pending)) {
    pending = [];
    try { localStorage.removeItem(PENDING_SCORES_KEY); } catch { /* ignore */ }
  }
  if (pending.length === 0) return;

  while (pending.length > 0) {
    const entry = pending[0];
    try {
      const res = await apiFetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) return; // leave remaining entries for retry
    } catch {
      return; // network error; keep remaining for later
    }
    pending.shift();
    try {
      if (pending.length > 0) {
        localStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(pending));
      } else {
        localStorage.removeItem(PENDING_SCORES_KEY);
      }
    } catch {
      // Storage unavailable — clear stale data to prevent duplicates, then
      // continue submitting remaining entries this session without persisting.
      try { localStorage.removeItem(PENDING_SCORES_KEY); } catch { /* ignore */ }
      continue;
    }
  }
}

/** Perform login or register. */
async function authAction(action) {
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  bindText('auth-error', '');

  if (!username || !password) {
    bindText('auth-error', 'Username and password required');
    return;
  }

  const endpoint = action === 'login' ? '/api/auth/login' : '/api/auth/register';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      bindText('auth-error', data.error || 'Something went wrong');
      return;
    }

    authToken = data.token;
    authUsername = data.user.username;
    authRole = data.user.role || 'user';
    localStorage.setItem('gwn_auth_token', authToken);
    localStorage.setItem('gwn_auth_username', authUsername);
    localStorage.setItem('gwn_auth_role', authRole);

    // Clear form
    usernameInput.value = '';
    passwordInput.value = '';
    bindText('auth-error', '');

    updateHomeAuthDisplay();
    submitPendingScores();
    showScreen('multiplayer');
  } catch {
    bindText('auth-error', 'Network error — is the server running?');
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
        totalRounds: Number(document.getElementById('room-rounds')?.value) || 5,
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

  // Options
  const optContainer = document.querySelector('[data-bind="match-options"]');
  optContainer.innerHTML = '';
  puzzle.options.forEach((option, index) => {
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
  container.innerHTML = '<div class="profile-loading">Loading profile...</div>';

  try {
    const [meRes, scoresRes, achievementsRes, historyRes] = await Promise.all([
      apiFetch('/api/auth/me'),
      apiFetch('/api/scores/me'),
      apiFetch('/api/achievements'),
      apiFetch('/api/matches/history'),
    ]);

    if (meRes.status === 401 || scoresRes.status === 401 ||
        achievementsRes.status === 401 || historyRes.status === 401) return;

    if (!meRes.ok) throw new Error(`me: ${meRes.status}`);
    if (!scoresRes.ok) throw new Error(`scores: ${scoresRes.status}`);
    if (!achievementsRes.ok) throw new Error(`achievements: ${achievementsRes.status}`);
    if (!historyRes.ok) throw new Error(`history: ${historyRes.status}`);

    const [meData, scoresData, achievementsData, historyData] = await Promise.all([
      meRes.json(), scoresRes.json(), achievementsRes.json(), historyRes.json(),
    ]);

    renderProfile(meData, scoresData, achievementsData, historyData);
  } catch {
    container.innerHTML = '<div class="profile-loading">Could not load profile</div>';
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
   Community Puzzle Submissions
   =========================== */

/** Reset the submit-puzzle form and status message. */
function resetSubmitPuzzleForm() {
  const form = document.getElementById('submit-puzzle-form');
  if (form) form.reset();
  const status = document.querySelector('[data-bind="submit-puzzle-status"]');
  if (status) { status.textContent = ''; status.className = 'submit-puzzle-status'; }
}

/** Wire submit-puzzle form handler inside init (called once). */
function initSubmitPuzzleForm() {
  const form = document.getElementById('submit-puzzle-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.querySelector('[data-bind="submit-puzzle-status"]');
    const sequenceRaw = document.getElementById('sp-sequence').value.trim();
    const answer = document.getElementById('sp-answer').value.trim();
    const explanation = document.getElementById('sp-explanation').value.trim();
    const difficulty = parseInt(document.getElementById('sp-difficulty').value, 10);
    const category = document.getElementById('sp-category').value;

    const sequence = sequenceRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (sequence.length < 3) {
      if (status) { status.textContent = 'Sequence must have at least 3 items.'; status.className = 'submit-puzzle-status error'; }
      return;
    }
    if (!answer) {
      if (status) { status.textContent = 'Answer is required.'; status.className = 'submit-puzzle-status error'; }
      return;
    }
    if (!explanation) {
      if (status) { status.textContent = 'Explanation is required.'; status.className = 'submit-puzzle-status error'; }
      return;
    }
    if (!category) {
      if (status) { status.textContent = 'Please select a category.'; status.className = 'submit-puzzle-status error'; }
      return;
    }

    try {
      const res = await apiFetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence, answer, explanation, difficulty, category }),
      });
      const data = await res.json();
      if (res.ok) {
        if (status) { status.textContent = 'Puzzle submitted for review!'; status.className = 'submit-puzzle-status success'; }
        form.reset();
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

  try {
    const res = await apiFetch('/api/submissions/pending');
    const data = await res.json();
    if (!res.ok) {
      container.innerHTML = `<p class="moderation-error">${escapeHTML(data.error || 'Failed to load')}</p>`;
      return;
    }
    const submissions = data.submissions || [];
    if (submissions.length === 0) {
      container.innerHTML = '<p class="moderation-empty">No pending submissions.</p>';
      return;
    }
    container.innerHTML = submissions.map(s => `
      <div class="moderation-card" data-submission-id="${s.id}">
        <div class="mod-card-header">
          <span class="mod-badge mod-badge-${s.difficulty === 1 ? 'easy' : s.difficulty === 2 ? 'medium' : 'hard'}">${s.difficulty === 1 ? 'Easy' : s.difficulty === 2 ? 'Medium' : 'Hard'}</span>
          <span class="mod-category">${escapeHTML(s.category)}</span>
          <span class="mod-author">by ${escapeHTML(s.submitted_by)}</span>
        </div>
        <div class="mod-card-body">
          <p><strong>Sequence:</strong> ${Array.isArray(s.sequence) ? s.sequence.map(item => escapeHTML(String(item))).join(', ') : escapeHTML(String(s.sequence))}</p>
          <p><strong>Answer:</strong> ${escapeHTML(String(s.answer))}</p>
          <p><strong>Explanation:</strong> ${escapeHTML(s.explanation)}</p>
        </div>
        <div class="mod-card-actions">
          <button class="btn btn-approve" data-mod-action="approved" data-mod-id="${s.id}">✅ Approve</button>
          <button class="btn btn-reject" data-mod-action="rejected" data-mod-id="${s.id}">❌ Reject</button>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p class="moderation-error">Network error — please try again.</p>';
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
    } else {
      if (statusEl) { statusEl.textContent = data.error || `Failed to ${status}`; statusEl.className = 'moderation-status error'; }
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
  document.addEventListener('click', (e) => {
    const modAction = e.target.dataset.modAction;
    if (modAction && e.target.dataset.modId) {
      handleModerationAction(e.target.dataset.modId, modAction);
    }
    const roleAction = e.target.dataset.roleAction;
    if (roleAction && e.target.dataset.userId) {
      handleRoleChange(e.target.dataset.userId, roleAction);
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
