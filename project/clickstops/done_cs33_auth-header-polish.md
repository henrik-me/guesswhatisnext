# CS33 — Auth Header Polish

**Status:** ✅ Complete
**Goal:** Refine the auth header UX introduced in CS20 — streamline login/register flow, restore user icon, reduce visual footprint, and integrate into the logo line.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS33-1 | Show user icon when signed in | ✅ Done | Added 👤 icon next to username in auth header. |
| CS33-2 | Show only "Login" button when not logged in | ✅ Done | Removed Register button from header, only Login shown. |
| CS33-3 | Combine login/register into single screen action | ✅ Done | Single auth screen with toggle link between Login/Register modes. |
| CS33-4 | Use smaller font for auth header | ✅ Done | Reduced font sizes: login 0.7rem, username 0.75rem, logout 0.65rem. |
| CS33-5 | Auth info on same line as logo | ✅ Done | Auth bar positioned absolute top-right, overlays same line as logo. |

---

## Design Decisions

- **User icon:** Restore visual indicator of logged-in state — the icon provides quick recognition.
- **Single "Login" button:** Reduces header clutter. New users discover "Register" on the auth screen.
- **Combined auth screen:** Streamlined UX — one screen, toggle between login/register modes.
- **Compact styling:** Auth info should be subtle, not dominate the header. Match pre-CS20 sizing.
- **Same-line layout:** Avoid adding vertical height to the page header. Auth controls sit alongside the logo.

## Prerequisites

- CS20 (Authentication UX Overhaul) — ✅ Complete (PR #146)

## Completion

- **PR:** #153
- **Merged:** 2026-04-12
- **Files changed:** 9
