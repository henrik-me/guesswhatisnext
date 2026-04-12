# CS27 — Complete submitPuzzle Feature Flag Gating

**Status:** ⬜ Planned
**Goal:** Ensure all community puzzle creation/submission UI is fully hidden when the `submitPuzzle` feature flag is off. Currently the flag correctly hides the "Create Puzzle" button in the Community hub, but other entry points leak.

---

## Problem

The `submitPuzzle` feature flag gates the Create Puzzle button in the community hub, but several other UI elements bypass the flag:

1. **My Submissions button** — visible to any logged-in user in the community hub, regardless of flag state
2. **My Submissions empty state** — shows "Create your first puzzle →" button without checking the flag
3. **My Submissions delete empty state** — also shows "Create your first puzzle →" without flag check
4. **Submit Puzzle links** — "View My Submissions" link on the submit screen is accessible if the user navigates there directly

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS27-1 | Gate My Submissions button behind submitPuzzle flag | ⬜ Pending | `public/js/app.js` line ~1227: change from `isLoggedIn()` to `isLoggedIn() && isFeatureEnabled('submitPuzzle')` |
| CS27-2 | Gate empty state Create buttons behind flag | ⬜ Pending | Lines ~2918 and ~3136: conditionally render the "Create your first puzzle" button only when flag is on |
| CS27-3 | Audit all submitPuzzle entry points | ⬜ Pending | Search for all `create-puzzle`, `show-submit-puzzle`, `show-my-submissions` actions and verify each is properly gated |
| CS27-4 | Add E2E test for flag-off state | ⬜ Pending | Test that community hub shows only Browse when flag is off (no Create, no My Submissions) |

## Design Decisions

- The Community hub ("Browse Community") should remain visible regardless of flag — browsing is not gated
- Only creation/submission flows should be hidden when the flag is off
- The Moderation button is correctly gated behind admin role — no change needed
