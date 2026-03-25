/**
 * Storage — LocalStorage wrapper.
 * Abstracts persistence for high scores, daily state, and stats.
 */

const KEYS = {
  HIGH_SCORE: 'gwn_high_score',
  DAILY_STATE: 'gwn_daily_state',
  STATS: 'gwn_stats',
};

/** Safely read from localStorage. */
function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Safely write to localStorage. */
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — fail silently
  }
}

export const Storage = {
  getHighScore() {
    return read(KEYS.HIGH_SCORE) || 0;
  },

  setHighScore(score) {
    const current = this.getHighScore();
    if (score > current) {
      write(KEYS.HIGH_SCORE, score);
    }
  },

  /** Get daily challenge state for a given date. */
  getDailyState(dateStr) {
    const state = read(KEYS.DAILY_STATE);
    if (state && state.date === dateStr) {
      return state;
    }
    return null;
  },

  /** Save daily challenge completion. */
  setDailyState(dateStr, result) {
    write(KEYS.DAILY_STATE, { date: dateStr, ...result });
  },

  /** Get cumulative play stats. */
  getStats() {
    return read(KEYS.STATS) || {
      gamesPlayed: 0,
      totalScore: 0,
      totalCorrect: 0,
      bestStreak: 0,
    };
  },

  /** Update stats after a game. */
  updateStats(gameResult) {
    const stats = this.getStats();
    stats.gamesPlayed += 1;
    stats.totalScore += gameResult.score;
    stats.totalCorrect += gameResult.correct;
    stats.bestStreak = Math.max(stats.bestStreak, gameResult.bestStreak);
    write(KEYS.STATS, stats);
  },
};
