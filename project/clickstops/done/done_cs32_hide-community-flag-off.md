# CS32 — Hide Community Section When Feature Flag Is Off

**Status:** ⬜ Planned
**Goal:** The "🌍 Community Puzzles" button on the home screen should be hidden when the `submitPuzzle` feature flag is off. Currently, the button is always visible and leads to a community hub that only has "Browse" (with no community content since submissions are disabled). This creates a confusing UX — showing a feature that has no content.

---

## Problem

The home screen always shows "🌍 Community Puzzles" (line 32 of `public/index.html`). When `submitPuzzle` is off:
- Community hub only shows "Browse Community" (Create/My Submissions hidden by CS27)
- The gallery is empty since no one can submit puzzles
- Users see a dead-end feature prominently on the home page

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS32-1 | Hide Community Puzzles home button when flag is off | ⬜ Pending | Gate `[data-action="show-community"]` behind `submitPuzzle` flag in the home screen UI update logic |
| CS32-2 | Hide community hub description text when flag off | ⬜ Pending | The "Browse, create, and share puzzles" text is misleading when creation is disabled |
| CS32-3 | Update E2E tests | ⬜ Pending | Verify community button hidden on home when flag off, visible when on |

## Design Decisions

- When `submitPuzzle` is on: show Community Puzzles on home, show full community hub
- When `submitPuzzle` is off: hide Community Puzzles button entirely from home screen
- This is a display-only change — no API/backend changes needed
