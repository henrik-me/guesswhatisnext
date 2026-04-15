# Clickstop CS38: DB Cold Start UX (ProgressiveLoader)

**Status:** 🔄 In Progress
**Goal:** Implement graceful handling of Azure SQL cold start delays (10-30s). Replace silent failures and static "Loading..." with progressive messaging, automatic retry, and local-first score submission.

## Tasks

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| CS38-1 | Create ProgressiveLoader module | ⬜ Pending | — | Reusable JS module that wraps async fetch with timed message escalation (0-2s normal → 3-5s reassurance → 6-10s engaging → 11-20s playful → 20-30s honest → 30s+ retry button). Per LEARNINGS.md design. |
| CS38-2 | Add retry with backoff to apiFetch | ⬜ Pending | — | Add configurable retry (3 attempts, exponential backoff) and timeout (30s) to apiFetch(). Return structured errors so callers can distinguish timeout vs auth vs server error. |
| CS38-3 | Apply ProgressiveLoader to leaderboard | ⬜ Pending | CS38-1, CS38-2 | Replace static "Loading" text with ProgressiveLoader. Show cached data if available. Retry button on failure. |
| CS38-4 | Apply ProgressiveLoader to profile/achievements | ⬜ Pending | CS38-1, CS38-2 | Replace "Loading profile..." and "Loading achievements..." with ProgressiveLoader. |
| CS38-5 | Apply ProgressiveLoader to community gallery | ⬜ Pending | CS38-1, CS38-2 | Replace static loading in community puzzle gallery. |
| CS38-6 | Local-first score submission | ⬜ Pending | CS38-2 | Save score to localStorage immediately after game. Background sync to server with retry. Show "Score saved ✓" → "Syncing..." → "Synced ✓" indicator. |
| CS38-7 | Add CSS for progressive loading states | ⬜ Pending | CS38-1 | Subtle animation for message transitions. Retry button styling. |
| CS38-8 | Tests | ⬜ Pending | CS38-1 through CS38-7 | E2E tests for loading states. Unit tests for ProgressiveLoader and retry logic. |
| CS38-9 | Delay simulation middleware | ⬜ Pending | — | Server middleware that injects artificial delay (0-45s) on `/api/*` when `GWN_DB_DELAY_MS` env var is set. Gated by `NODE_ENV !== 'production'`. For container-based manual and E2E testing of cold start UX. |
| CS38-10 | Container manual testing | ⬜ Pending | CS38-9, CS38-8 | Build container with delay middleware, run E2E tests with simulated delay, leave container running for user manual testing. |

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
