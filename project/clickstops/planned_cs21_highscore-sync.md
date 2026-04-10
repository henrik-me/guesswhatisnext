# CS21 — High Score Synchronization

**Status:** ⬜ Planned
**Goal:** Fix high-score display to sync from backend on login rather than relying solely on localStorage, and reposition the high-score display to be embedded with the auth info in the top header.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS21-1 | Sync high score from backend on login | ⬜ Pending | After successful login, fetch `/api/scores/me` and compute the overall maximum from the per-mode `high_score` values returned. Update localStorage `gwn_high_score` with this value. This ensures the displayed high score reflects the actual account data, not stale localStorage. |
| CS21-2 | Move high-score display to top header | ⬜ Pending | Embed the high-score value alongside the auth info in the top bar (from CS20). Show it as a compact stat next to the username. Remove the current footer high-score display. |
| CS21-3 | Handle cross-device score merging | ⬜ Pending | When a user logs in on a new device, take the MAX of localStorage high score and backend high score. Upload the localStorage score if it's higher (via existing score submission), then sync. |
| CS21-4 | Add unit/integration tests for sync | ⬜ Pending | Test that login triggers score fetch and localStorage update. Test cross-device merge logic. Test that high-score display updates after login. |

---

## Design Decisions

- **Sync direction:** Backend is the source of truth. On login, backend high score overwrites localStorage if higher. If localStorage is higher (scores submitted while offline or before account creation), those get submitted first via `submitPendingScores()`, then backend is re-fetched.
- **Per-mode vs global:** The backend tracks per-mode high scores (`MAX(score)` grouped by mode). For the home screen display, show the overall maximum across all modes for simplicity.
- **Dependency on CS20:** The top-bar repositioning depends on CS20's header being implemented first. CS21-2 can be done after CS20-1.

## Current State (from investigation)

- `Storage.setHighScore()` in `public/js/storage.js` stores a single global value in localStorage key `gwn_high_score`.
- Login handler in `public/js/app.js` calls `submitPendingScores()` but does NOT fetch or sync the backend high score.
- `/api/scores/me` returns per-mode `high_score` as `MAX(score)` — data is available but not consumed on login.
- High score is displayed in home screen footer below login controls (`index.html`).
- Profile page shows separate "Best Score" stat from backend data, but this doesn't sync to the home screen display.
