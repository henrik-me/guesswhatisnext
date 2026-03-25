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

    // Sequence display
    const seqContainer = document.querySelector('[data-bind="sequence"]');
    seqContainer.innerHTML = '';
    puzzle.sequence.forEach(item => {
      const el = document.createElement('div');
      el.className = 'sequence-item';
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
    seqContainer.appendChild(mystery);

    // Options grid
    const optContainer = document.querySelector('[data-bind="options"]');
    optContainer.innerHTML = '';
    puzzle.options.forEach(option => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
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

    // Change color as time runs low
    if (ratio < 0.25) {
      bar.style.backgroundColor = 'var(--color-wrong)';
    } else if (ratio < 0.5) {
      bar.style.backgroundColor = '#e17055';
    } else {
      bar.style.backgroundColor = '';
    }
  },

  /** Show the round result screen. */
  showResult(result) {
    bindText('result-icon', result.correct ? '✅' : '❌');
    bindText('result-title', result.correct ? 'Correct!' : 'Wrong!');
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
        showScreen('home');
        bindText('high-score', Storage.getHighScore());
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
    }
  });

  showScreen('home');
}

document.addEventListener('DOMContentLoaded', init);
