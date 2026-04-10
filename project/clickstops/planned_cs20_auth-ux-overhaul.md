# CS20 — Authentication UX Overhaul

**Status:** ⬜ Planned
**Goal:** Restructure authentication UI for a cleaner, more intuitive experience. Move auth controls to the top, simplify logged-in/logged-out states, and properly gate features based on auth status.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS20-1 | Move auth controls to top header | ⬜ Pending | Move login/register from footer to a persistent top bar. When not logged in, show "Login" and "Register" buttons. When logged in, show username (as a clickable button or underlined text) and a "Logout" button. No duplicate user icons. |
| CS20-2 | Add logout to profile page | ⬜ Pending | Add a logout action/button on the profile screen. Currently logout is only available from the home footer. |
| CS20-3 | Hide multiplayer until logged in | ⬜ Pending | Don't show the "Multiplayer" option on the home screen until the user is logged in. Currently it shows but redirects to auth — instead, hide it entirely. |
| CS20-4 | Leaderboard access without login | ⬜ Pending | Make leaderboard viewable without login. Show unauthenticated user's own scores as "User" in the leaderboard. Server endpoint currently requires auth — add an optional-auth mode for leaderboard. |
| CS20-5 | "To keep score, sign in" prompt | ⬜ Pending | When a not-logged-in user selects Free Play or Daily Challenge, show a non-blocking message: "To keep score, sign in" with a link to sign in/register. Let them continue playing without signing in. |
| CS20-6 | Update E2E tests for auth UX | ⬜ Pending | Update auth E2E tests (`tests/e2e/auth.spec.mjs`) and any tests that depend on the current footer auth layout. Add tests for the new top bar behavior, multiplayer hiding, and leaderboard anonymous access. |

---

## Design Decisions

- **Top bar layout:** Persistent header bar visible on all screens. Login/Register buttons when unauthenticated; "username" (clickable → profile) + "Logout" button when authenticated.
- **No duplicate icons:** Remove the `👤` emoji prefix from user display. Show plain username text.
- **Multiplayer gating:** Hide entirely rather than show-and-redirect. Cleaner UX — users don't see features they can't use.
- **Leaderboard approach:** Use `optionalAuth` middleware on leaderboard endpoints. If authenticated, highlight the user's entries. If not, show their localStorage-tracked scores as "User".
- **Score prompt:** Non-blocking banner/toast above the game area, not a modal. User can dismiss or click to sign in.
## Current State (from investigation)

- Auth controls are in `#screen-home > footer.home-stats` in `index.html` — bottom of home screen.
- `updateHomeAuthDisplay()` in `public/js/app.js` shows/hides user display and buttons based on auth state.
- Multiplayer is already gated client-side (redirects to auth) and server-side (requireAuth middleware).
- Leaderboard endpoints (`/api/scores/leaderboard`, `/api/scores/leaderboard/multiplayer`) both require auth. Client shows "Log in to view the leaderboard 🔒" on 401.
- Profile screen exists but has no logout button.
- No "User" fallback label for unauthenticated users in leaderboard rendering.
