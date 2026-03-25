/**
 * App — Entry point and screen navigation.
 * Manages which screen is visible and delegates to game modules.
 */

import { Game } from './game.js';
import { puzzles, getCategories } from './puzzles.js';
import { Storage } from './storage.js';

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

/** Initialize screen references and wire up navigation. */
function init() {
  document.querySelectorAll('[data-screen]').forEach(el => {
    screens[el.dataset.screen] = el;
  });

  // Update high score display
  const highScore = Storage.getHighScore();
  bindText('high-score', highScore);

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
        Game.startDaily(puzzles, { showScreen, bindText });
        showScreen('game');
        break;
      case 'go-home':
        showScreen('home');
        bindText('high-score', Storage.getHighScore());
        break;
      case 'next-round':
        Game.nextRound({ showScreen, bindText });
        break;
      case 'play-again':
        showScreen('category');
        renderCategories();
        break;
      case 'share-result':
        Game.shareResult();
        break;
    }
  });

  showScreen('home');
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
    Game.startFreePlay(puzzles, null, { showScreen, bindText });
    showScreen('game');
  });
  container.appendChild(randomBtn);

  // Category buttons
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      Game.startFreePlay(puzzles, cat, { showScreen, bindText });
      showScreen('game');
    });
    container.appendChild(btn);
  });
}

/** Update a data-bind element's text content. */
function bindText(key, value) {
  document.querySelectorAll(`[data-bind="${key}"]`).forEach(el => {
    el.textContent = value;
  });
}

document.addEventListener('DOMContentLoaded', init);
