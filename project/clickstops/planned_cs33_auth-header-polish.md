# CS33 — Auth Header Polish

**Status:** ⬜ Planned
**Goal:** Refine the auth header UX introduced in CS20 — streamline login/register flow, restore user icon, reduce visual footprint, and integrate into the logo line.

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS33-1 | Show user icon when signed in | ⬜ Pending | Restore the 👤 (or similar) icon next to the username in the auth header when the user is logged in. |
| CS33-2 | Show only "Login" button when not logged in | ⬜ Pending | Remove the separate "Register" button from the header. Show only a single "Login" button. Registration should be accessible from the login/register screen itself, not the header. |
| CS33-3 | Combine login/register into single screen action | ⬜ Pending | On the login/register screen, combine into a single flow — e.g., one form with a toggle or link between "Login" and "Register" modes, rather than two separate buttons/forms side by side. |
| CS33-4 | Use smaller font for auth header | ⬜ Pending | Reduce the font size of the login button and user info in the header to match the previous (pre-CS20) smaller styling. The current header text is too prominent. |
| CS33-5 | Auth info on same line as logo | ⬜ Pending | Move the auth controls (login button or user info + logout) to sit on the same line as the puzzle logo/icon, eliminating the extra line the auth header currently occupies. |

---

## Design Decisions

- **User icon:** Restore visual indicator of logged-in state — the icon provides quick recognition.
- **Single "Login" button:** Reduces header clutter. New users discover "Register" on the auth screen.
- **Combined auth screen:** Streamlined UX — one screen, toggle between login/register modes.
- **Compact styling:** Auth info should be subtle, not dominate the header. Match pre-CS20 sizing.
- **Same-line layout:** Avoid adding vertical height to the page header. Auth controls sit alongside the logo.

## Prerequisites

- CS20 (Authentication UX Overhaul) — ✅ Complete (PR #146)
