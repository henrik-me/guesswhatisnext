# CS71 — Async Friend Challenges

**Status:** ⬜ Planned
**Depends on:** CS52 (server-authoritative scoring — challenge results MUST be computed server-side; client-submitted scores cannot be trusted for friend-vs-friend comparisons)
**Parallel-safe with:** any CS not touching `server/routes/scores.js`, `server/db/migrations/`, or new `server/routes/challenges.js`
**Origin:** Architecture review issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) Roadmap item H ("Asynchronous friend challenges"). Filed by `yoga-gwn-c4` 2026-04-30 after user direction during issue triage. **Product sign-off required before any task in this CS is claimed for implementation** — this is net-new product surface, not maintenance.

## Problem

The app today supports two play modes:

- **Single-player** — score recorded against the user's own history, optionally on the leaderboard.
- **Live multiplayer** — both players must be online at the same time, matched via the multiplayer flow.

There is no way for two friends to play the **same puzzle set** without being online simultaneously. This blocks the most common social interaction in puzzle games: "I just played this — bet you can't beat me." Without async challenges:

- Sharing a result is anecdotal (a screenshot at best).
- There's no head-to-head comparison.
- The viral / share loop has no entry point.

Async challenges close this gap with low operational complexity (no realtime infra) and pair naturally with CS52's server-authoritative scoring (challenge results are trustworthy by construction).

## Goal

Let user A create a **challenge** (a fixed puzzle set + expiration window), share a link with user B, have user B complete the same puzzle set, and present a server-computed comparison to both players when both have finished or the challenge expires.

## Proposed shape

(Subject to product review + rubber-duck plan refinement before tasks are claimed.)

- **Server-owned `challenges` entity:** id (UUID), creator user_id, puzzle_set (frozen list of puzzle IDs), created_at, expires_at, status (`open` / `complete` / `expired`).
- **Server-owned `challenge_results` entity:** challenge_id, user_id, score, correct_count, completed_at — one row per participant. Scores written by the same server-authoritative path as CS52 (game session → server scoring).
- **Shareable link:** `/challenge/:id` — public landing for the challenge; if user is signed in and hasn't played, lets them play the same set; if both have results, shows comparison; if expired without both finishing, shows whichever results exist.
- **Notification:** when challenger's friend finishes, the challenger gets an in-app notification (reuses CS55 WS-push when CS55 lands; before CS55, on-login fetch is acceptable).
- **Expiration:** default 7 days; configurable per challenge at creation (24h / 3d / 7d / 14d).
- **Privacy:** challenge link is unguessable (UUID) but does not require auth to view the comparison summary. Playing requires sign-in.
- **No betting / wagering / leaderboard impact** — challenge results are head-to-head only and do NOT count toward the global leaderboard (avoids gaming via self-issued challenges).

## Tasks

| Task ID | Title | Notes |
|---------|-------|-------|
| CS71-1 | Product review + rubber-duck plan | **Blocks all other tasks.** Confirm scope, expiration policy, leaderboard isolation, share-link privacy model. Output: refined plan committed to this file. |
| CS71-2 | DB schema (challenges, challenge_results) | Migration in both SQLite + MSSQL. Indexed on creator_id + expires_at. |
| CS71-3 | API: create challenge (`POST /api/challenges`) | Server picks puzzle set (deterministic seed + count); returns share URL. |
| CS71-4 | API: list / read challenge (`GET /api/challenges/:id`, `GET /api/challenges/mine`) | Returns participants + results so far. Public read for `/:id`; auth'd list for `/mine`. |
| CS71-5 | API: play challenge (server-authored game session bound to challenge) | Reuses CS52 server-scoring path; result is committed via `challenge_results` writer, not `/api/scores`. |
| CS71-6 | Client: create-challenge UI + share affordance | After single-player game ends, "Challenge a friend" CTA → modal → copyable link. |
| CS71-7 | Client: play-challenge flow | Landing page on `/challenge/:id`; sign-in gate for playing; comparison view when both done or expired. |
| CS71-8 | Notification on friend-completes | Reuses existing notification feature; WS push if CS55 has landed, otherwise on-login fetch. |
| CS71-9 | Expiration sweeper | On read, lazy-mark expired challenges (no DB-waking background job per CONVENTIONS § Database & Data). |
| CS71-10 | E2E coverage | Create → share → second user plays → both see comparison. Includes expired-without-both-finishing path. |
| CS71-11 | Telemetry + KQL | Custom events for challenge_created / challenge_completed / challenge_expired; documented KQL. |

## Acceptance

- A signed-in user can create a challenge from a completed single-player game and receive a shareable link.
- A second signed-in user opening the link can play the same puzzle set and see a head-to-head comparison.
- Challenges expire and surface results-so-far gracefully.
- Challenge results never affect the global leaderboard.
- All scoring is server-authoritative (no client-submitted aggregate accepted for challenge results).
- E2E coverage for the create → play → compare → expire paths.
- Telemetry custom events + documented KQL queries; PR includes `## Container Validation` and `## Telemetry Validation` sections.

## Cross-references

- Architecture review issue [#198](https://github.com/henrik-me/guesswhatisnext/issues/198) Roadmap item H (parent).
- [CS52](../done/done_cs52_server-authoritative-scoring.md) — server-authoritative scoring (hard prerequisite, completed 2026-05-03).
- [CS55](planned_cs55_websocket-notifications-and-redesign.md) — WS notifications (soft dependency for CS71-8 push delivery).
- [CONVENTIONS.md § Database & Data](../../../CONVENTIONS.md#database--data) — no DB-waking background work (informs CS71-9 design).
- [CONVENTIONS.md § 4a Telemetry & Observability](../../../CONVENTIONS.md#4a-telemetry--observability-mandatory-for-all-new-work) — telemetry gate.

## Out of scope

- Group challenges (>2 players) — possible follow-up.
- Wagering / virtual currency.
- Cross-platform shares beyond a copyable URL (e.g. native iOS share sheet).
- Backfilling challenges into the global leaderboard.
- Realtime "watch your friend play" (that is the live multiplayer flow, not async challenges).
