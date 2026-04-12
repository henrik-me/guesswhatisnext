# CS21 — Leaderboard Personal Bests & High Score Cleanup

**Status:** 🔄 Active
**Goal:** Remove high score from the home screen and improve the leaderboard page with a "My Personal Bests" section showing the user's best freeplay and multiplayer scores, plus better current-user highlighting so players can quickly find themselves.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS21-1 | Remove high score from home screen | ⬜ Pending | Remove the `🏆 High Score: N` element from `public/index.html` home footer. Remove `bindText('high-score', ...)` calls from `app.js`. Keep `Storage.getHighScore()` for now (other code may reference it). |
| CS21-2 | Add "My Personal Bests" section to leaderboard | ⬜ Pending | When logged in, show a section at the top of the leaderboard screen with: best freeplay score and best multiplayer score. Fetch from `/api/scores/me` (which already returns per-mode `high_score`). Show "Sign in to track your scores" when not logged in. |
| CS21-3 | Improve current-user highlighting | ⬜ Pending | Make the current user's row in the leaderboard more visually distinct — bolder styling, maybe a "You" badge. Ensure it's immediately visible when the leaderboard loads. |
| CS21-4 | Update tests | ⬜ Pending | Update E2E tests that reference the high score display. Add tests for personal bests section. |

---

## Design Decisions

- **High score removal:** The home screen becomes cleaner. Score info moves to where it belongs — the leaderboard.
- **Personal bests source:** `/api/scores/me` already returns `stats` grouped by mode with `high_score`, `avg_score`, `best_streak`, `games_played`. No new API needed.
- **Current user highlight:** Use `isCurrentUser` flag already returned by the leaderboard API. Add a "You" label/badge and stronger visual styling.
- **Anonymous users:** Leaderboard is viewable without login (CS20 made it `optionalAuth`). Personal bests section shows a sign-in prompt instead.

## Current State

- High score shown in home footer: `public/index.html` line ~47-49, read from localStorage
- Leaderboard highlights current user with `current-user` CSS class (subtle)
- `/api/scores/me` returns per-mode stats including `high_score` — data is available
- `/api/scores/leaderboard` returns `isCurrentUser` flag per entry
