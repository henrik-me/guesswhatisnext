# CS20 — Authentication UX Overhaul

**Status:** ✅ Complete
**Goal:** Restructure authentication UI for a cleaner, more intuitive experience. Move auth controls to the top, simplify logged-in/logged-out states, and properly gate features based on auth status.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS20-1 | Move auth controls to top header | ✅ Done | Moved login/register from footer to persistent top bar. |
| CS20-2 | Add logout to profile page | ✅ Done | Added logout action on the profile screen. |
| CS20-3 | Hide multiplayer until logged in | ✅ Done | Multiplayer option hidden entirely when not logged in. |
| CS20-4 | Leaderboard access without login | ✅ Done | Leaderboard viewable without login using optionalAuth middleware. |
| CS20-5 | "To keep score, sign in" prompt | ✅ Done | Non-blocking prompt shown to unauthenticated users in game modes. |
| CS20-6 | Update E2E tests for auth UX | ✅ Done | Updated auth E2E tests for new top bar behavior, multiplayer hiding, and anonymous leaderboard access. |

---

## Additional Changes

- **Docker port isolation:** Added HOST_PORT env var to docker-compose.yml for flexible port binding.
- **Logger resilience:** Improved logger handling when pino-pretty is not available.

## Completion

- **PR:** #146
- **Merged:** 2026-04-12
- **Files changed:** 12 (docker-compose.yml, style.css, index.html, app.js, logger.js, scores.js, auth.spec.mjs, community.spec.mjs, helpers.mjs, leaderboard.spec.mjs, my-submissions.spec.mjs, scores.test.js)
