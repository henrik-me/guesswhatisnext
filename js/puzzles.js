/**
 * Puzzles — Puzzle data and helpers.
 * Each puzzle is a plain object with a consistent schema.
 */

/** All puzzles. Populated in step 2. */
export const puzzles = [];

/** Get unique category names from the puzzle set. */
export function getCategories(puzzleList) {
  return [...new Set(puzzleList.map(p => p.category))].sort();
}

/** Filter puzzles by category. Returns all if category is null. */
export function filterByCategory(puzzleList, category) {
  if (!category) return [...puzzleList];
  return puzzleList.filter(p => p.category === category);
}

/** Validate a puzzle object has all required fields. */
export function validatePuzzle(puzzle) {
  const required = ['id', 'category', 'difficulty', 'type', 'sequence', 'answer', 'options', 'explanation'];
  const missing = required.filter(f => !(f in puzzle));

  if (missing.length > 0) {
    return { valid: false, error: `Missing fields: ${missing.join(', ')}` };
  }
  if (!puzzle.options.includes(puzzle.answer)) {
    return { valid: false, error: 'Answer not found in options' };
  }
  if (puzzle.options.length !== 4) {
    return { valid: false, error: `Expected 4 options, got ${puzzle.options.length}` };
  }
  return { valid: true };
}
