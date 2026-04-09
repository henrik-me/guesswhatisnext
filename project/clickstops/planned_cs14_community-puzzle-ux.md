# Clickstop CS14: Community Puzzle Submission UX

**Status:** ⬜ Planned
**Goal:** Improve the community puzzle submission experience for both submitters and admins, adding discovery, authoring tools, moderation, and notifications.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS14-80 | Submission discovery & onboarding | ⬜ Pending | — | Add visible "Community" or "Create" entry point on home screen for all users (logged-out users see CTA to log in). Add brief explainer of how submissions work (submit → review → goes live). |
| CS14-81 | My Submissions dashboard | ⬜ Pending | CS14-80 | New screen showing user's own submissions with status (pending/approved/rejected), reviewer notes, and timestamps. Uses existing `GET /api/submissions` endpoint. |
| CS14-82 | Enhanced puzzle authoring form | ⬜ Pending | CS14-80 | Puzzle type selector (emoji/text/image). Custom options editor (4 options, must include answer). Live preview of how the puzzle will look to players. Validation feedback before submit. |
| CS14-83 | Public community gallery | ⬜ Pending | CS14-81 | Browse approved community puzzles with attribution (submitted by username). Filter by category/difficulty. New API endpoint `GET /api/puzzles/community`. |
| CS14-84 | Admin moderation improvements | ⬜ Pending | CS14-82 | Live puzzle preview in moderation screen. Bulk approve/reject. Edit puzzle before approval (fix typos, adjust options). Submission stats (total pending, approved, rejected). |
| CS14-85 | Submission editing & deletion | ⬜ Pending | CS14-81 | Users can edit pending submissions and delete their own submissions. API endpoints `PUT /api/submissions/:id` and `DELETE /api/submissions/:id` with ownership checks. |
| CS14-86 | Submission notifications | ⬜ Pending | CS14-84 | Notify submitters when their puzzle is approved/rejected (in-app notification or badge on submissions screen). Track unread review results. |
| CS14-87 | Image puzzle submissions | ⬜ Pending | CS14-82 | Image upload support for image-type puzzles. Server-side validation (size, format). Storage (local in dev, Azure Blob in prod). Preview in authoring form and moderation. |

## Design Decisions

**Feature flag gating (PR #91):** `submitPuzzle` is gated by a small central feature-flag system on the PR #91 branch so the feature can stay hidden by default while rollout and UX work continue. Evaluation order: feature-specific request override (only when that feature allows it in the current environment) → default state → explicit user targeting → deterministic percentage rollout → disabled.

**Planned `submitPuzzle` configuration (PR #91):** hidden/disabled by default; can be enabled for explicit users and/or a rollout percentage; request overrides are allowed only outside `production` and `staging`; override names are query param `ff_submit_puzzle` and header `x-gwn-feature-submit-puzzle`. Overrides are opt-in per feature, not a global bypass. `main` does not have that central flag path until PR #91 merges.

> **Note:** Puzzle authoring format reference is in the [CS9 archive](done_cs9_content-growth.md).

## Notes

**Parallelism:** Tasks CS14-81 and CS14-82 can run in parallel after CS14-80. Tasks CS14-83, CS14-84, CS14-85 can run in parallel after their dependencies. Task CS14-87 is independent of CS14-83–86 but requires CS14-82.
