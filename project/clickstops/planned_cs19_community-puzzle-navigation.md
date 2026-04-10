# CS19 — Community Puzzle Navigation & Testing

**Status:** ⬜ Planned
**Goal:** Move community puzzle submission from the home screen into its own dedicated sub-page/section, properly gate it behind the existing `submitPuzzle` feature flag, and create E2E tests validated both locally and in Docker (MSSQL).

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS19-1 | Extract puzzle submission to dedicated sub-page | ⬜ Pending | Move community section (Create Puzzle, My Submissions, gallery) from home screen into a navigable sub-page. Home screen should have a single "Community Puzzles" menu item that navigates to the sub-page. |
| CS19-2 | Gate submission/authoring flows behind feature flag | ⬜ Pending | Ensure the `submitPuzzle` feature flag controls visibility of authoring/submission actions (Create Puzzle button, submission form). The Community Puzzles menu item and browse/gallery remain always visible per CS14 design — only the create/submit actions are gated. |
| CS19-3 | Update existing E2E tests for new navigation | ⬜ Pending | Update `community.spec.mjs`, `my-submissions.spec.mjs`, `moderation.spec.mjs` to work with the new sub-page navigation structure. |
| CS19-4 | Add Docker MSSQL E2E validation | ⬜ Pending | Create E2E tests that run against the Docker MSSQL stack (`docker-compose.mssql.yml`). Validate puzzle submission flows work end-to-end with MSSQL backend. Part of ongoing CS18 validation effort. |
| CS19-5 | Clean up home screen layout | ⬜ Pending | After extraction, ensure home screen is clean — no leftover community puzzle UI elements when feature flag is off or on. |

---

## Design Decisions

- **Sub-page vs modal:** Use a full sub-page (new screen section) rather than a modal. This gives room for the gallery, submission form, and my-submissions views to coexist under one navigation context.
- **Feature flag reuse:** Reuse the existing `submitPuzzle` feature flag — no new flag needed. The flag gates authoring/submission actions only; browsing and gallery discovery remain always visible (consistent with CS14 design). The flag already has rollout percentage, user targeting, and environment restrictions.
- **Docker MSSQL testing:** E2E tests against MSSQL validate that SQL rewriting in the adapter handles submission queries correctly. This extends CS18's MSSQL production fixes.

## Current State (from investigation)

- Community puzzle UI is currently embedded directly on the home screen (`index.html`, community section) with buttons for Create Puzzle, My Submissions, and a community section.
- Feature flag `submitPuzzle` exists and gates the submission flow (server + client).
- E2E tests exist in `community.spec.mjs`, `my-submissions.spec.mjs`, `moderation.spec.mjs`.
- The `image` puzzle type is partially wired (client UI exists, server only accepts `emoji`/`text`).
