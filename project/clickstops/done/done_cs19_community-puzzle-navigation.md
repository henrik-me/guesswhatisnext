# CS19 — Community Puzzle Navigation & Testing

**Status:** ✅ Complete
**Goal:** Move community puzzle submission from the home screen into its own dedicated sub-page/section, properly gate it behind the existing `submitPuzzle` feature flag, and create E2E tests validated both locally and in Docker (MSSQL).

**Completed:** PR [#139](https://github.com/henrik-me/guesswhatisnext/pull/139)

---

## Tasks

| ID | Task | Status | Notes |
|----|------|--------|-------|
| CS19-1 | Extract puzzle submission to dedicated sub-page | ✅ Done | Moved community section (Create Puzzle, My Submissions, gallery) from home screen into a navigable sub-page. Home screen has a single "Community Puzzles" menu item that navigates to the sub-page. |
| CS19-2 | Gate submission/authoring flows behind feature flag | ✅ Done | The `submitPuzzle` feature flag controls visibility of authoring/submission actions (Create Puzzle button, submission form). The Community Puzzles menu item and browse/gallery remain always visible per CS14 design — only the create/submit actions are gated. |
| CS19-3 | Update existing E2E tests for new navigation | ✅ Done | Updated `tests/e2e/community.spec.mjs`, `tests/e2e/my-submissions.spec.mjs`, `tests/e2e/moderation.spec.mjs` to work with the new sub-page navigation structure. |
| CS19-4 | Add Docker MSSQL E2E validation | ➡️ Deferred to CS25 | Deferred to [CS25 — MSSQL E2E Testing](done_cs25_mssql-e2e-testing.md). Docker MSSQL E2E testing requires additional infrastructure setup beyond the scope of the CS19 navigation changes. |
| CS19-5 | Clean up home screen layout | ✅ Done | Home screen is clean — no leftover community puzzle UI elements when feature flag is off or on. |

---

## Completion Checklist

- [x] All tasks done and merged (or deferred — see Deferred work policy)
- [x] README updated (if user-facing changes)
- [x] INSTRUCTIONS.md updated (if architectural/workflow changes)
- [x] CONTEXT.md updated with final state
- [x] Tests added/updated, coverage measured
- [ ] Performance/load test evaluation — N/A (UI navigation change, no perf impact)
- [ ] Data structure changes documented — N/A (no schema changes)
- [ ] Staging deployed and verified — N/A (Azure billing suspended)
- [ ] Production deployed and verified — N/A (Azure billing suspended)

---

## Design Decisions

- **Sub-page vs modal:** Use a full sub-page (new screen section) rather than a modal. This gives room for the gallery, submission form, and my-submissions views to coexist under one navigation context.
- **Feature flag reuse:** Reuse the existing `submitPuzzle` feature flag — no new flag needed. The flag gates authoring/submission actions only; browsing and gallery discovery remain always visible (consistent with CS14 design). The flag already has rollout percentage, user targeting, and environment restrictions.
- **Docker MSSQL testing:** E2E tests against MSSQL validate that SQL rewriting in the adapter handles submission queries correctly. This extends CS18's MSSQL production fixes. Deferred to CS25.

## Current State (from investigation)

- Community puzzle UI is currently embedded directly on the home screen (`index.html`, community section) with buttons for Create Puzzle, My Submissions, and a community section.
- Feature flag `submitPuzzle` exists and gates the submission flow (server + client).
- E2E tests exist in `tests/e2e/community.spec.mjs`, `tests/e2e/my-submissions.spec.mjs`, `tests/e2e/moderation.spec.mjs`.
- The `image` puzzle type is partially wired (client UI exists, server only accepts `emoji`/`text`).
