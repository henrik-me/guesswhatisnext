/**
 * Daily — Daily challenge logic.
 * Deterministically selects a puzzle based on the current date.
 */

/**
 * Simple hash of a date string to get a deterministic index.
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {number} Hash value
 */
export function hashDate(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get today's date as YYYY-MM-DD string.
 * @returns {string}
 */
export function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Select the daily puzzle from a puzzle list.
 * Same date always returns the same puzzle.
 * @param {Array} puzzleList - Array of puzzle objects
 * @param {string} [dateStr] - Optional date override (for testing)
 * @returns {object} The selected puzzle
 */
export function getDailyPuzzle(puzzleList, dateStr) {
  const date = dateStr || getTodayString();
  const index = hashDate(date) % puzzleList.length;
  return puzzleList[index];
}
