/**
 * App — Entry point and screen navigation.
 * Manages which screen is visible and delegates to game modules.
 */

import { Game } from './game.js';
import { puzzles, getCategories } from './puzzles.js';
import { Storage } from './storage.js';
import { getTodayString } from './daily.js';

const screens = {};
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

/** Update the innerHTML of a data-bind element. */
function bindHTML(key, html) {
  document.querySelectorAll(`[data-bind="${key}"]`).forEach(el => {
    el.innerHTML = html;
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

    // Persist high score and stats
    Storage.setHighScore(summary.score);
    Storage.updateStats({
      score: summary.score,
      correct: summary.correctCount,
      bestStreak: summary.bestStreak,
    });

    // Show/hide share button based on mode
    const shareBtn = document.querySelector('[data-action="share-result"]');
    if (shareBtn) shareBtn.style.display = '';

    showScreen('gameover');
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
  allBtns.forEach(b => {
    const btnAnswer = b.textContent || b.querySelector('img')?.src;
    if (b === btnEl && answer !== puzzle.answer) {
      b.classList.add('wrong');
    }
    if ((b.textContent === puzzle.answer) || (b.querySelector('img')?.src === puzzle.answer)) {
      b.classList.add('correct');
    }
  });

  // Brief delay to show feedback, then submit
  setTimeout(() => {
    Game.submitAnswer(answer, ui);
  }, 600);
}

/** Render category selection buttons. */
function renderCategories() {
  const container = document.querySelector('[data-bind="category-list"]');
  const categories = getCategories(puzzles);

  container.innerHTML = '';

  // "Random" option
  const randomBtn = document.createElement('button');
  randomBtn.className = 'category-btn';
  randomBtn.textContent = '🎲 Random';
  randomBtn.addEventListener('click', () => {
    Game.startFreePlay(puzzles, null, ui);
  });
  container.appendChild(randomBtn);

  // Category buttons
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      Game.startFreePlay(puzzles, cat, ui);
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

/** Initialize screen references and wire up navigation. */
function init() {
  document.querySelectorAll('[data-screen]').forEach(el => {
    screens[el.dataset.screen] = el;
  });

  // Update high score display
  bindText('high-score', Storage.getHighScore());

  // Update auth display on home screen
  updateHomeAuthDisplay();

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
        Game.startDaily(puzzles, ui);
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
      case 'show-leaderboard':
        showScreen('leaderboard');
        setActiveLeaderboardTab('alltime');
        fetchLeaderboard('alltime');
        break;
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
      case 'leave-lobby':
        disconnectWebSocket();
        resetMatchState();
        showScreen('multiplayer');
        break;
      case 'rematch':
        resetMatchState();
        showScreen('multiplayer');
        break;
    }
  });

  showScreen('home');
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
    const res = await fetch(`/api/scores/leaderboard?mode=freeplay&period=${period}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderLeaderboard(data);
  } catch {
    container.innerHTML =
      '<div class="leaderboard-error">Leaderboard unavailable — start the server to see rankings</div>';
  }
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

/** Escape HTML to prevent XSS when rendering user-supplied text. */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ===========================
   Multiplayer Module
   =========================== */

let ws = null;
let authToken = localStorage.getItem('gwn_auth_token');
let authUsername = localStorage.getItem('gwn_auth_username');
let matchState = {
  roomCode: null,
  players: [],
  myName: null,
  opponentName: null,
  myScore: 0,
  oppScore: 0,
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
  const el = document.querySelector('[data-bind="home-user-display"]');
  if (!el) return;
  if (isLoggedIn() && authUsername) {
    el.textContent = `👤 Logged in as ${authUsername}`;
    el.style.display = '';
  } else {
    el.style.display = 'none';
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
    localStorage.setItem('gwn_auth_token', authToken);
    localStorage.setItem('gwn_auth_username', authUsername);

    // Clear form
    usernameInput.value = '';
    passwordInput.value = '';
    bindText('auth-error', '');

    updateHomeAuthDisplay();
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
      ws = null;
    });
  });
}

/** Disconnect WebSocket cleanly. */
function disconnectWebSocket() {
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
    case 'match-start':
      onMatchStart(msg);
      break;
    case 'round':
      onRound(msg);
      break;
    case 'answer-received':
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
    const res = await fetch('/api/matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ totalRounds: 5 }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to create room');
      return;
    }

    matchState.roomCode = data.roomCode;
    matchState.myName = authUsername;
    matchState.players = [authUsername];

    // Join via WebSocket
    ws.send(JSON.stringify({ type: 'join', roomCode: data.roomCode }));

    // Show lobby
    bindText('lobby-room-code', data.roomCode);
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
    const res = await fetch('/api/matches/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({ roomCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to join room');
      return;
    }

    matchState.roomCode = data.roomCode || roomCode;
    matchState.myName = authUsername;

    // Join via WebSocket
    ws.send(JSON.stringify({ type: 'join', roomCode: matchState.roomCode }));

    // Show lobby
    bindText('lobby-room-code', matchState.roomCode);
    bindText('lobby-status', 'Joining room...');
    showScreen('lobby');
  } catch {
    showToast('Network error — is the server running?');
  }
}

/** Handle 'joined' — we successfully joined the room. */
function onJoined(msg) {
  matchState.roomCode = msg.roomCode;
  if (!matchState.players.includes(authUsername)) {
    matchState.players.push(authUsername);
  }
  bindText('lobby-status',
    msg.playerCount >= 2 ? 'Starting match...' : 'Waiting for opponent...'
  );
  renderLobbyPlayers();
}

/** Handle 'player-joined' — another player joined. */
function onPlayerJoined(msg) {
  if (!matchState.players.includes(msg.username)) {
    matchState.players.push(msg.username);
  }
  bindText('lobby-status', msg.playerCount >= 2 ? 'Starting match...' : 'Waiting for opponent...');
  renderLobbyPlayers();
}

/** Render the lobby player list. */
function renderLobbyPlayers() {
  const container = document.querySelector('[data-bind="lobby-players"]');
  if (!container) return;

  container.innerHTML = matchState.players.map((name, i) => {
    const isYou = name === authUsername;
    return `<div class="lobby-player-row" role="listitem">
      <span class="lobby-player-icon">${i === 0 ? '👑' : '⚔️'}</span>
      <span class="lobby-player-name">${escapeHTML(name)}</span>
      ${isYou ? '<span class="lobby-player-tag">You</span>' : ''}
    </div>`;
  }).join('');
}

/** Handle 'match-start' — transition to match screen. */
function onMatchStart(msg) {
  matchState.players = msg.players || [];
  matchState.totalRounds = msg.totalRounds || 5;
  matchState.currentRound = 0;
  matchState.myScore = 0;
  matchState.oppScore = 0;

  // Figure out opponent name
  matchState.opponentName = matchState.players.find(n => n !== authUsername) || 'Opponent';

  bindText('match-you-name', authUsername);
  bindText('match-opp-name', matchState.opponentName);
  bindText('match-you-score', '0');
  bindText('match-opp-score', '0');
  bindText('match-round', `1/${matchState.totalRounds}`);

  showScreen('match');
}

/** Handle 'round' — render the puzzle in the match screen. */
function onRound(msg) {
  matchState.currentRound = msg.roundNum;
  matchState.roundStartedAt = Date.now();

  bindText('match-round', `${msg.roundNum + 1}/${msg.totalRounds}`);

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
    btn.addEventListener('click', () => handleMatchOptionClick(option, btn));
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
  const myResult = scores[authUsername];
  const oppResult = scores[matchState.opponentName];

  if (myResult) matchState.myScore = myResult.total;
  if (oppResult) matchState.oppScore = oppResult.total;

  bindText('match-you-score', matchState.myScore);
  bindText('match-opp-score', matchState.oppScore);

  const myCorrect = myResult ? myResult.correct : false;
  bindText('match-result-icon', myCorrect ? '✅' : '❌');
  bindText('match-result-title', myCorrect ? 'Correct!' : 'Wrong!');

  // Render both players' results
  const container = document.querySelector('[data-bind="match-round-scores"]');
  let html = '';

  for (const [name, data] of Object.entries(scores)) {
    const icon = data.correct ? '✅' : '❌';
    const isYou = name === authUsername;
    html += `<div class="match-score-row">
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

  // Determine outcome for current player
  let outcomeIcon, outcomeTitle;
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

  const iconEl = document.querySelector('[data-bind="match-over-icon"]');
  if (iconEl) iconEl.textContent = outcomeIcon;
  const titleEl = document.querySelector('[data-bind="match-over-title"]');
  if (titleEl) titleEl.textContent = outcomeTitle;

  // Render final scores
  const results = msg.results || Object.entries(scores).map(([username, score]) => ({ username, score }));
  results.sort((a, b) => b.score - a.score);

  const container = document.querySelector('[data-bind="match-final-scores"]');
  container.innerHTML = results.map((entry, i) => {
    const isWinner = winner && entry.username === winner;
    const isYou = entry.username === authUsername;
    const icon = isWinner ? '🏆' : (i === 0 ? '🥇' : '🥈');
    return `<div class="match-final-row${isWinner ? ' winner' : ''}" role="listitem">
      <span class="final-player-icon">${icon}</span>
      <span class="final-player-name">${escapeHTML(entry.username)}${isYou ? ' (you)' : ''}</span>
      <span class="final-player-score">${entry.score}</span>
    </div>`;
  }).join('');

  showScreen('match-over');

  // Clean up
  disconnectWebSocket();
  resetMatchState();
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
    myName: null,
    opponentName: null,
    myScore: 0,
    oppScore: 0,
    totalRounds: 5,
    currentRound: 0,
    roundStartedAt: null,
    roundTimer: null,
  };
}

document.addEventListener('DOMContentLoaded', init);
