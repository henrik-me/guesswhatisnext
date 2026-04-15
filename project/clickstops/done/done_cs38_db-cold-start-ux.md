# Clickstop CS38: DB Cold Start UX (ProgressiveLoader)

**Status:** ✅ Complete
**Goal:** Implement graceful handling of Azure SQL cold start delays (10-30s). Replace silent failures and static "Loading..." with progressive messaging, manual retry button, and local-first score submission.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS38-1 | Create ProgressiveLoader module | ✅ Done | — | `public/js/progressive-loader.js` — timed message escalation, 15s timeout, retry button. PR #163. |
| CS38-2 | Add retry with backoff to apiFetch | ✅ Done | — | AbortController timeout, structured errors. PR #163. |
| CS38-3 | Apply ProgressiveLoader to leaderboard | ✅ Done | CS38-1, CS38-2 | PR #163. |
| CS38-4 | Apply ProgressiveLoader to profile/achievements | ✅ Done | CS38-1, CS38-2 | Profile uses Promise.allSettled for partial success. PR #163, #174. |
| CS38-5 | Apply ProgressiveLoader to community gallery | ✅ Done | CS38-1, CS38-2 | PR #163. |
| CS38-6 | Local-first score submission | ✅ Done | CS38-2 | localStorage queue with background sync. PR #163. |
| CS38-7 | Add CSS for progressive loading states | ✅ Done | CS38-1 | Fade transitions, retry button, spinner. PR #163. |
| CS38-8 | Tests | ✅ Done | CS38-1 through CS38-7 | 393 unit tests (incl. progressive-loader + delay), 67 E2E tests. PRs #163, #174, #175. |
| CS38-9 | Delay simulation middleware | ✅ Done | — | `server/middleware/delay.js` — fixed delay + cycling pattern (time-window-based). PRs #164, #172, #175. |
| CS38-10 | Container manual testing | ✅ Done | CS38-9, CS38-8 | Validated with patterns and fixed delays. PR #175. |
| CS38-11 | Auth form cold start UX | ✅ Done | — | Progressive button text, disable inputs, double-submit prevention. PR #167. |

## PRs

| PR | Description |
|----|-------------|
| #163 | ProgressiveLoader + retry + local-first scores |
| #164 | Delay simulation middleware |
| #167 | Auth form progressive login/register feedback |
| #172 | Cycling delay pattern + docs |
| #174 | Fix retry UX — show button immediately instead of auto-retrying |
| #175 | Fix delay pattern to advance per-navigation not per-request |

## Completion Checklist

- [x] All tasks done and merged (11/11)
- [x] README updated (cold start testing docs)
- [x] INSTRUCTIONS.md updated (container validation, cold start simulation)
- [x] LEARNINGS.md updated (Auto-Pause UX Strategy marked implemented)
- [x] Tests added (393 unit, 67 E2E)
- [x] User manual testing completed and approved

## Design Decisions

### ProgressiveLoader Message Sets (from LEARNINGS.md)
Each screen gets context-appropriate messages:
- **Leaderboard:** "Fetching rankings..." → "Tallying scores..." → "The leaderboard keeper is on a coffee break ☕"
- **Profile:** "Loading profile..." → "Gathering your stats..." → "Your profile data is warming up ☕"
- **Achievements:** "Checking your trophy case..." → "Polishing your badges... ✨"
- **Community:** "Loading community puzzles..." → "Gathering submissions..."

### Retry Strategy
- 3 attempts with exponential backoff (1s, 3s, 9s)
- 30s total timeout per operation
- After all retries exhausted: show retry button + cached data if available
- Score submission: unlimited background retries (localStorage queue)

### Local-First Score Submission
1. Game ends → save to localStorage immediately → user sees result
2. Background POST to /api/scores with retry
3. Subtle sync indicator: "Score saved ✓" → "Syncing to leaderboard..." → "Synced ✓"
4. If server is cold, queue and retry — user never waits

## Prerequisites
- None — this is a client-side UX improvement

## Notes
- Home screen + single-player game need zero DB calls (puzzles are bundled locally)
- Only DB-backed features affected: leaderboard, profile, achievements, multiplayer, score submission, community
- Future Option B (cached UI) would build on this retry infrastructure
