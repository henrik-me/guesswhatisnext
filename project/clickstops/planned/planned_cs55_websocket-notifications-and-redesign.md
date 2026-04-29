# CS55 — Real-time notifications via WebSocket + feature redesign

**Status:** ⬜ Planned
**Depends on:** CS53-23
**Parallel-safe with:** any
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
| CS55-2 | Server-side in-process unread-count cache for `GET /api/notifications/count` (cache invalidation: bump on insert, decrement on mark-read). Re-scoped 2026-04-25: the v2 rework (Policy 1 compliance + `X-User-Activity` header contract + boot/focus endpoint audit) is the contract foundation that CS53-19 (boot-quiet enforcement) depends on, so it has been **moved to CS53 as row CS53-23** and is being prioritized as P0 there. PR #241 is now the CS53-23 PR. The downstream CS55 work (CS55-1 WS push, CS55-3 client wiring, CS55-4/-5 new notification types, CS55-6 E2E, CS55-7 docs) stays in CS55 and depends on CS53-23 landing. | 🪓 Moved to **CS53-23** (2026-04-25) | See [CS53 active file](../active/active_cs53_prod-cold-start-retry-investigation.md#tasks) row CS53-23 for the live sub-task list. The CS55-2.A–L sub-tasks below remain as the design reference (renumbered to CS53-23.A–L when implemented) and will be removed from CS55 once CS53-23 closes. |
| CS55-3 | Client: listen for `notification` events on the existing WS connection, update badge and (if My Submissions is open) prepend the notification to the list. Remove the one-shot `pollNotificationCount()` on login in favor of a WS `unread_count` push immediately after auth. Keep the HTTP fallback for the case where WS is unavailable. | ⬜ Pending | Hook into existing `ws.onmessage` switch in `public/js/app.js`. |
| CS55-4 | Add achievement-unlocked notifications: when `user_achievements` insert succeeds, also insert a notification row and push via WS. Update achievement type set in `renderNotificationItem` (icon, message). | ⬜ Pending | Re-uses CS55-1/2/3 pipeline. |
| CS55-5 | Add admin-announcement notifications: new `POST /api/admin/announcements { message, dismissible }` (requires admin role). Inserts a notification row for every active user (or a single global row clients filter on) and broadcasts via WS. UI: persistent dismissible banner above the top bar. | ⬜ Pending | Bounded scope — text only, no scheduling, no targeting. |
| CS55-6 | E2E test: create a submission, approve it from a second client, assert the first client's badge updates within ~1s without any HTTP poll observed in the network log. | ⬜ Pending | Use Playwright network inspection to assert no `/api/notifications/count` requests fired. |
| CS55-7 | Documentation: update `INSTRUCTIONS.md` notifications section with the "no polling, WS push + server cache" rule so future contributors don't regress. | ⬜ Pending | Cite this CS. |

## Hard dependency on CS53-23 (2026-04-25)

CS55 was originally planned around CS55-2 (server-side unread-count cache + the `X-User-Activity` header contract that the cache requires for Policy 1 compliance). On 2026-04-25 the contract foundation (CS55-2 v2 sub-tasks A–L) was **moved into CS53 as row CS53-23** because CS53-19 (boot-quiet enforcement across every boot/focus endpoint) blocks on the same contract and CS53 is being driven to closure first. The remaining CS55 work — CS55-1 (WS push), CS55-3 (client wiring), CS55-4 (achievement notifications), CS55-5 (admin announcements), CS55-6 (E2E test), CS55-7 (docs) — all depend on CS53-23 landing. Do not start CS55 implementation until CS53-23 is merged and the contract is stable in `INSTRUCTIONS.md`.

## CS55-2 follow-ups — Policy 1 compliance gap (post PR #241 v1)

PR #241 ("CS55-2 (early)") landed an in-process unread-count cache in front of `GET /api/notifications/count` with a 5-min TTL. CI is green, GPT-5.4 R2 was clean, and bandwidth/CPU dropped 60→1 per user-hour. **However**, against [INSTRUCTIONS.md § Database & Data](../../../INSTRUCTIONS.md#database--data) the design still violates Policy 1:

> "if anything is called from client to server we need to ensure an active otherwise idle tab doesn't hit the db. only regular usage should touch the database."

Concretely:
1. **TTL re-read still wakes the DB.** Every 5 min per stale-tab user, the next request misses and runs a SELECT against the auto-paused Azure SQL Free Tier instance. Wake-rate is non-zero, and stale tabs / mobile / bookmarks / old cached SPAs have no upper bound.
2. **Boot-time JWT validation (`/api/auth/me`) is not covered.** Any tab opened with a valid 7-day JWT immediately reads the user row from the DB even if the user only glances and closes the tab.
3. **No contract distinguishes "real user activity" from "background poll".** The server must be the guard, but it can't tell them apart today.

The current SPA does not poll on a timer (CS53-2 killed it; verified at `public/js/app.js:3367`), so the *current* code paths are safe. CS55-2 exists precisely to defend against **untrusted/legacy clients** the server does not control.

### Sub-tasks for CS55-2 v2 (true Policy 1 compliance)

| # | Task | Notes |
|---|------|-------|
| CS55-2.A | Remove TTL-driven re-read. Cache lifetime = process lifetime. Invalidated **only** by writers (insert / mark-read / mark-all-read). | Eliminates the per-5-min wake. Current 13 unit tests + 4 race tests still apply; TTL test removed/repurposed. |
| CS55-2.B | Decide cold-cache miss policy: (a) return `0`/`null` until first writer seeds it, or (b) lazy DB read only when request is marked as "real user activity" (CS55-2.C). Document the choice in PR body and CS file. | Trade-off: (a) is strictly zero-DB-from-reads but can undercount briefly after process restart; (b) keeps correctness but adds the activity-header dependency. |
| CS55-2.C | Add `X-User-Activity: 1` request-header contract. Missing/false → server **never** issues a DB query on cache miss; serves cached or empty. Genuine user-driven calls set it explicitly. | The single mechanism that lets the server act as the guard against untrusted clients without heuristics. |
| CS55-2.D | Wire SPA's `refreshNotificationBadge()` (`public/js/app.js:3403`), submission-screen open, mark-read, and mark-all-read paths to send `X-User-Activity: 1`. Every other client (legacy SPA, bookmarks, third-party) gets the header-absent treatment. | Backwards-compatible: legacy clients keep working but cannot wake the DB. |
| CS55-2.E | Apply the same contract to `/api/auth/me` (boot JWT validation). Either: verify HMAC signature + expiry **without** DB lookup and trust the token's claims until expiry, or: cache the user row with the same write-invalidation discipline. | Closes the second-largest stale-tab DB-wake source. |
| CS55-2.F | Audit and gate the rest of the "called by clients on tab boot/focus" set: `/api/features`, `/api/notifications` (list), `/api/scores/me`, `/api/achievements`, `/api/matches/history`. Each must be either (a) DB-free, (b) cached + write-invalidated, or (c) explicitly require `X-User-Activity: 1`. | Multi-PR scope likely; track each fix separately. |
| CS55-2.G | Update [INSTRUCTIONS.md § Database & Data](../../../INSTRUCTIONS.md#database--data) with: (i) the active-vs-idle classification rule, (ii) the `X-User-Activity` header contract semantics, (iii) the rule "reads never seed cache from a non-active call". Cross-link from CS53 and CS55. | Future contributors must not regress this. |
| CS55-2.H | Tests: assert `X-User-Activity` absence → zero DB queries. Use a mock adapter call counter / spy on `db.get`. Add to both unit + integration suites. | Regression guard. |
| CS55-2.I | Add `## Container Validation` section to PR #241 body and run `npm run container:validate` before each review request and after each fix push. Required by [Policy 2](../../../INSTRUCTIONS.md#quick-reference-checklist) (touches server runtime + DB code). | Currently absent from PR body. |
| CS55-2.J | Re-run GPT-5.4 local review (R3+) on the policy-compliant design (R2 was clean against the original 5-min-TTL design only). | Per [REVIEWS.md](../../../REVIEWS.md). |
| CS55-2.K | Request Copilot review (`gh pr edit 241 --add-reviewer "@copilot"`); address findings; re-validate after each fix push. | Code PR — Copilot review is required. |
| CS55-2.L | Merge once container-validate, GPT-5.4, and Copilot are all clean. | Then strike PR #241 → CS55-2 ✅ Done. |

### Acceptance for CS55-2 v2 (supersedes the row above)

- A stale browser tab open for 24h, polling `/api/notifications/count` every 60s, causes **zero** DB queries past the first one (or zero total if CS55-2.B option (a) is chosen).
- A tab opened with a 7-day JWT but immediately closed causes **zero** DB queries.
- `X-User-Activity: 1` is present on exactly the legitimate user-activity-driven SPA calls and absent everywhere else; verified by an integration test that fails if a future change strips or spuriously adds the header.
- `INSTRUCTIONS.md § Database & Data` documents the contract.



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

## Acceptance

- Remaining CS55 tasks are complete and validated without reintroducing DB-waking polling.

## Cross-references

- [CS53 active file](../active/active_cs53_prod-cold-start-retry-investigation.md) — boot-quiet contract foundation.
