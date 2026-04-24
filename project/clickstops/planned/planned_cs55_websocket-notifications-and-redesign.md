# CS55 — Real-time notifications via WebSocket + feature redesign

**Status:** ⬜ Planned
**Origin:** During CS53-2 we killed the 60s notification polling timer (it kept Azure SQL serverless awake permanently, single-handedly responsible for blowing through the Free Tier monthly compute allowance). The badge is now refreshed only on login and when the user opens "My Submissions". This is correct for cost but loses real-time freshness. CS55 restores real-time freshness **without** reintroducing DB-keepalive polling, and takes the opportunity to think about whether the notification feature should grow beyond just "your community puzzle was reviewed".

## Goal

1. **Push notification updates over the existing WebSocket connection** so the badge updates in real time without any client-side polling and without any background server-side DB reads.
2. **Add a server-side cache layer for the unread count** so that `GET /api/notifications/count` (still called once on login + as a fallback) never hits the DB on the hot path.
3. **Audit and (re)design the notification feature**: enumerate every place a notification *could* be useful in the app today, decide which to implement, and keep the design DB-write-once + WS-push-many.

## Design constraints (carried over from CS53)

- **Zero background DB reads.** No timer-based polling on either client or server.
- **DB writes are the only DB-touching events** in the notifications path; reads are served from cache or pushed over WS from the write itself.
- **No always-open keepalive workarounds** (e.g., "ping DB every 30s to keep pool warm") — that re-introduces the original problem.
- **Graceful degradation when WS is disconnected**: when the WS reconnects, client requests one fresh count (cache hit, no DB), then resumes WS push.

## Notification feature audit (decide which to build in this CS)

Today only one trigger exists: `submission_approved` / `submission_rejected` (`server/routes/submissions.js:62`). Candidate additions and their DB shape:

| Candidate | Triggered by | DB write needed? | DB read needed? | Worth it? |
|---|---|---|---|---|
| Submission approved/rejected (existing) | Admin reviews submission | Yes (already happens) | No (push payload from write) | ✓ keep |
| Achievement unlocked | Achievement criteria met during gameplay | Already inserts into `user_achievements`; add notification row | No | ✓ probably yes |
| New community puzzle by someone you follow | New `submissions` row with status=approved | Yes | Needs follower table — out of scope | ✗ defer (no follow feature) |
| Multiplayer match invite | WS message from another user | No DB needed (WS-only) | No | ✓ already handled by WS, no notification row needed |
| Daily streak reminder | Server scheduled job | Yes if persisted; better to not persist | Needs last-active query | ✗ defer (cost vs benefit poor; would need cron + DB read) |
| Featured puzzle of the day | Admin curation | Yes | No | △ low value, defer |
| Score sync failed/recovered | Client offline → online transition | No DB needed (client-local) | No | ✓ already shown via toast/sync indicator |
| Admin announcement / system message | Admin posts | Yes | No | △ optional; useful for downtime announcements |
| Leaderboard rank changed | Score insert that crosses a rank threshold | Already inserts into `scores`; add notification row | None if computed at write time | △ noisy; defer |

CS55 scope decision (to be confirmed during planning):
- ✓ **In:** existing approve/reject notifications (move to WS push).
- ✓ **In:** achievement unlocked notifications.
- ✓ **In:** admin announcement notifications (low effort, high value during incidents — operators can post a banner).
- ✗ **Out:** follow / daily streak / featured puzzle / rank change. Defer to a future CS if needed.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS55-1 | Add a `notification` event type to the existing `/ws` connection. Server pushes `{ type: 'notification', notification: {...}, unread_count: N }` to the affected user when `INSERT INTO notifications` runs. Refactor `createReviewNotification` (`server/routes/submissions.js`) to push after insert. | ⬜ Pending | WS already authenticated and per-user routed; reuse existing send path. |
| CS55-2 | Add server-side in-process unread-count cache keyed by `user_id` (e.g., `lru-cache` or a simple `Map` with TTL). Cache invalidation: bump on insert, decrement on mark-read, recompute lazily on cache miss with a single SELECT. `GET /api/notifications/count` reads from cache; only on cold cache or explicit refresh does it hit the DB. | ⬜ Pending | TTL ~5 min as a safety net; primary correctness comes from invalidation. Single-instance only — document that scale-out requires Redis. |
| CS55-3 | Client: listen for `notification` events on the existing WS connection, update badge and (if My Submissions is open) prepend the notification to the list. Remove the one-shot `pollNotificationCount()` on login in favor of a WS `unread_count` push immediately after auth. Keep the HTTP fallback for the case where WS is unavailable. | ⬜ Pending | Hook into existing `ws.onmessage` switch in `public/js/app.js`. |
| CS55-4 | Add achievement-unlocked notifications: when `user_achievements` insert succeeds, also insert a notification row and push via WS. Update achievement type set in `renderNotificationItem` (icon, message). | ⬜ Pending | Re-uses CS55-1/2/3 pipeline. |
| CS55-5 | Add admin-announcement notifications: new `POST /api/admin/announcements { message, dismissible }` (requires admin role). Inserts a notification row for every active user (or a single global row clients filter on) and broadcasts via WS. UI: persistent dismissible banner above the top bar. | ⬜ Pending | Bounded scope — text only, no scheduling, no targeting. |
| CS55-6 | E2E test: create a submission, approve it from a second client, assert the first client's badge updates within ~1s without any HTTP poll observed in the network log. | ⬜ Pending | Use Playwright network inspection to assert no `/api/notifications/count` requests fired. |
| CS55-7 | Documentation: update `INSTRUCTIONS.md` notifications section with the "no polling, WS push + server cache" rule so future contributors don't regress. | ⬜ Pending | Cite this CS. |

## Acceptance criteria

- A logged-in tab open for 24h triggers **zero** `/api/notifications/count` requests after the initial login fetch.
- An admin approving a submission causes the submitter's badge to update within ≤1s, with no client-side polling.
- `GET /api/notifications/count` cache hit ratio > 95% in steady state (measured via a simple counter log line or App Insights metric once CS54 lands).
- Achievement-unlocked notifications fire end-to-end via WS.
- Admin announcement banner can be posted and is visible to all connected clients within ≤1s.

## Will not be done in this clickstop

- Cross-instance cache (Redis). Single-instance is enough until the app horizontally scales.
- Push-notification (browser/web push) for offline users. Out of scope; can be a future CS.
- Migration of all notifications to a denormalized "feed" table. Current schema is fine.

## Relationship to other clickstops

- **CS53** — established the no-polling rule and shipped the bare-minimum fix (badge fetch on login + on opening My Submissions). CS55 restores real-time UX on top of that rule.
- **CS54 (planned)** — App Insights enables proper measurement of cache hit ratio and DB query rate, so CS55's "95% cache hit" acceptance criterion is much easier to verify after CS54 ships.
- **CS56 (planned)** — general server-side caching layer. CS55 introduces the *first* per-user cache; CS56 generalises the pattern to other read-heavy endpoints (leaderboard, feature flags, achievements catalog, etc.) and adds the stale-while-revalidate behaviour for cold-DB resilience.
