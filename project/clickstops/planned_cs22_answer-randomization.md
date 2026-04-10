# CS22 — Answer Randomization Fix

**Status:** ⬜ Planned
**Goal:** Fix the bias where the correct answer is overwhelmingly placed as the first option. Add proper randomization of answer positions before display to prevent players from exploiting the pattern.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS22-1 | Implement Fisher-Yates shuffle for options | ⬜ Pending | Add a shuffle utility function and apply it to `puzzle.options` before rendering in `renderRound()` (freeplay) and multiplayer answer display. Must track which shuffled index maps to the correct answer. |
| CS22-2 | Apply shuffle in multiplayer mode | ⬜ Pending | Ensure the same shuffle is applied in `matchHandler.js` or client-side multiplayer rendering. Each player should see a different random ordering. |
| CS22-3 | Fix puzzle submission form bias | ⬜ Pending | The puzzle creator UI defaults correct answer to option 1 and image submissions build `options = [answer, ...distractors]`. Update to randomize the position of the correct answer in submitted puzzles. |
| CS22-4 | Add unit tests for shuffle fairness | ⬜ Pending | Test that the shuffle function produces all permutations using a seeded RNG or by enumerating permutations for small n. Verify Fisher-Yates properties deterministically. Test that correct answer tracking works after shuffle. |
| CS22-5 | Update existing tests | ⬜ Pending | Some tests use `puzzle.options[0]` as the answer (e.g., `nplayer.test.js`, `reconnection.test.js`). Update to use `puzzle.answer` instead of assuming position. |

---

## Design Decisions

- **Shuffle algorithm:** Use Fisher-Yates (Knuth) shuffle — proven unbiased O(n) algorithm. Implement as a utility function in `game.js` or a shared module.
- **Where to shuffle:** Client-side before display, not in the stored data. The puzzle data format remains unchanged (answer field stays the same). Shuffle is applied at render time.
- **Multiplayer fairness:** Each client independently shuffles options. Since answer validation uses the answer value (not index), different orderings per player don't affect correctness.
- **Backward compatibility:** No changes to puzzle data schema, API responses, or database. Purely a display-layer change.

## Current State (from investigation)

- **379 of 504 puzzles** (75%) have the correct answer at index 0 in the data.
- `renderRound()` in `app.js` iterates `puzzle.options.forEach(...)` in array order — no shuffling.
- `Game.startFreePlay()` shuffles the puzzle queue (which puzzles to show) but NOT the options within each puzzle.
- The puzzle submission form defaults correct answer to the first option position.
- Tests in `nplayer.test.js` and `reconnection.test.js` submit `puzzle.options[0]` as the answer, which works today due to the bias but would break if options were shuffled at the data level.