# CS52 — Server-Authoritative Scoring with Offline-First Local Mode

**Status:** 🔄 In Review (CS52-1 design lock-down PR open)
**Owner:** yoga-gwn-c5 (claimed 2026-04-25T18:45Z for CS52-1 design lock-down)
**Goal:** Address [issue #198](https://github.com/henrik-me/guesswhatisnext/issues/198) finding F2 / Recommendation 1 / Roadmap B — make scoring server-authoritative for ranked play — while preserving offline play as a first-class capability and treating offline scores as **personal data synced across the player's devices** rather than as second-class leaderboard entries.

**Origin:** Issue #198 architecture review and a planning conversation on 2026-04-22 with rubber-duck critique. The reframing insight (gameplay-mode split rather than scoring-layer fix) came out of the user observing that you cannot meaningfully separate "scoring" from "gameplay loop" — offline play and server-validated play are different game shapes, not the same loop with different submit endpoints.

---

## Problem

`POST /api/scores` ([`server/routes/scores.js`](../../../server/routes/scores.js)) accepts client-computed aggregates (`score`, `correctCount`, `bestStreak`) and stores them as-is. The leaderboard, profile stats, and achievements all derive from these client-trusted rows. Anyone willing to script against the API can forge any score, any streak, any achievement.

The simple fix — "have the server compute the score" — collides with a hard product requirement: the game must remain playable offline (flights, no-network areas, server outages). That requirement is not negotiable.

Trying to layer server validation onto today's single gameplay loop produces a half-measure: either we still trust client aggregates (cosmetic) or we break offline play (regression). The honest fix is to recognise that **offline play and server-validated play are different gameplay modes**, with scoring authority following from which mode the player is in.

## Approach: two distinct gameplay modes

| Mode | Puzzle source | Answer key | Score authority | Connectivity | Public leaderboard |
|------|---------------|------------|-----------------|--------------|---------------------|
| **Local Free Play** | Bundled in client | Bundled in client | Client | Offline OK | Yes — `source=offline`, hidden by default filter |
| **Local Daily** | Bundled (date seed) | Bundled | Client | Offline OK | Yes — `source=offline`, hidden by default filter |
| **Ranked Free Play** | **Server-only pool** | Server | Server (per-event) | Online required | Yes — Free Play LB (default `source=ranked`) |
| **Ranked Daily** | Server (date-bound, UTC) | Server | Server (per-event) | Online required | Yes — Daily LB (default `source=ranked`) |
| **Multiplayer** | Server (existing) | Server (existing) | Server (existing) | Online required | Yes (existing, unchanged) |

**Public leaderboards** (Free Play, Daily, Multiplayer) ship with a **3-way source filter**: `Ranked only` (default — the competitive view), `Offline only`, or `All (Ranked + Offline)`. Every row carries a clear **provenance badge** so a user looking at the mixed view immediately sees which scores were server-validated and which were self-reported. Free Play and Daily get separate leaderboards because their round counts and timing differ — comparing them is meaningless. Ranked Free Play uses a single canonical config (proposed: 10 rounds × 15s) so within-leaderboard scores are comparable; Local Free Play stays freeform (any timer, any round count) — Local rows still show on the Offline/All views with a badge that surfaces the config used so the user knows the comparison isn't apples-to-apples.

**Offline / Local play** remains fully functional with no connectivity. Offline scores are **synced server-side via an idempotent record format** so when the player signs in on another device they see their full history (Ranked + Local + Legacy) in their profile, *and* so other players can opt in to comparing against them via the leaderboard's `Offline` / `All` filter. Offline scores are explicitly **not** treated as competitive — they are not policed, not validated, and the badge + default filter make that contract visible.

**Server achievements** unlock only from ranked sessions and multiplayer match completions (server-computed outcomes). Local play does not unlock server achievements in MVP — the alternative ("local-only trophy cabinet") is deliberately deferred to keep the clickstop bounded.

## Key design decisions

1. **Server-only ranked puzzle pool with fresh-content seed.** The answer key for ranked puzzles must never reach the client — otherwise a cheater reads the client-bundled answers and the server's validation is theatre. The ranked pool is a **separate, server-only `ranked_puzzles` table** never shipped in the client bundle. Initial seed is **~50 freshly-authored puzzles** curated in CS52-2 (not a copy-pasted subset of the existing bundled corpus, to avoid the "I recognise this from Local mode" leak). Subsequent additions are authored Ranked-first; once a puzzle is considered spoiled (screen-recorded walkthrough, used heavily, operator decision) it can be demoted into the bundled Local corpus.
2. **Ranked Daily = one verified attempt/day/user; Local Daily = unlimited practice.** Same date-seeded puzzle in both modes. Trade-off: Local Daily becomes a rehearsal opportunity. Accepted because the alternative (different daily puzzles per mode) breaks the mental model and costs more than it gains.
3. **Day boundary = server UTC.** Ranked Daily's "today" is server-side. Local Daily can use client local date — it's personal anyway.
4. **Canonical configs for all three server-authoritative modes.** The code-level constants below are the source of truth at boot (see decision #10); `game_configs` rows can override per environment.

   | Mode | `rounds` | `round_timer_ms` | `inter_round_delay_ms` | Rationale |
   |---|---|---|---|---|
   | `ranked_freeplay` | 10 | 15000 | n/a | Matches the existing single-player default (`MAX_ROUNDS=10`, default 15s timer); zero migration shock for single-player regulars. |
   | `ranked_daily` | 10 | 15000 | n/a | Same shape as `ranked_freeplay` — one mental model across single-player Ranked surfaces. Daily's specialness comes from one-attempt + seeded puzzle, not from a different shape. |
   | `multiplayer` | 5 | 20000 | 3000 | **Matches today's MP behaviour** (`ROUND_TIMEOUT_MS=20000`, `NEXT_ROUND_DELAY_MS=3000`, default `total_rounds=5`). CS52-7b already removes the host-picks-rounds dropdown override; do not stack a second behaviour change in the same release. Retuning is a single `UPDATE game_configs` away. |

   Local Free Play / Local Daily stay freeform (per-Settings timer slider, any round count). Only Ranked is locked to the canonical config.

5. **Immutable offline records with idempotency.** Each offline game is an immutable record: `{client_game_id, mode, variant, score, correct_count, total_rounds, best_streak, fastest_answer_ms, completed_at, schema_version}`. `schema_version` is a **single integer** (start at `1`); future bumps follow the same migration policy as DB migrations (additive only). Server upserts on `(user_id, client_game_id)` so retries and multi-device replays don't double-count. **Conflict rule:** if `(user_id, client_game_id)` already exists, server compares the hash of immutable fields — match → return as `acked` (idempotent retry); mismatch → return as `rejected: "conflict_with_existing"` and log `warn` for operator visibility. This record format replaces the two ad-hoc client queues that exist today (`gwn_pending_scores` in `app.js` + the ProgressiveLoader queue).
6. **Provenance flag on every score row.** `source ∈ {ranked, offline, legacy}`. Public leaderboard endpoints accept a `source` filter (`ranked` default, `offline`, or `all`); each leaderboard row carries a provenance badge in the UI. Personal profile endpoints show all rows including legacy with a "Legacy" badge — **no toggle, no separate section, no onboarding banner**. Legacy rows backfilled at migration time and excluded from all public leaderboard filters (legacy is profile-only — it predates the validated/self-reported distinction).
7. **Anti-cheat bar.** Realistic target: defeat trivial DevTools / API cheating **for the ranked leaderboard**. Not bot-proof. Necessary controls: server-held answer key (decision #1), monotonic answer order, plausible per-answer timing bounds (>50ms, <2× round timer), session expiry, one active ranked session per user, rate limiting on session creation. Offline scores are deliberately not validated — the contract surfaced via the badge + filter is "self-reported, view at your own discretion".
8. **Multiplayer config alignment + storage/scoring unification, both in this CS.** Multiplayer adopts the canonical fixed config from decision #4 (`rounds=5`, `roundTimerMs=20000`, `interRoundDelayMs=3000`) sourced from `game_configs`, not overridable by the client. Multiplayer also moves onto the unified storage + scoring path: a completed match persists as **one `ranked_sessions` row per (match, player)** plus per-answer `ranked_session_events` rows, batch-written in a single transaction on match completion via the shared core scoring service that the WS handler and the HTTP `/sessions/:id/finish` endpoint both call. The "row per (match, player)" shape means the leaderboard query for MP is identical to single-player Ranked (no special join), at the cost of duplicating four small fields (`room_code, match_id, started_at, finished_at`) across participant rows — kept consistent by the single transaction. WebSocket transport stays — only the persistence + scoring layer is shared. Half/abandoned matches do not persist (existing behaviour: disconnect mid-match = no score row).
9. **DB-aware degradation via a unified connectivity state machine.** The split between Local and Ranked is meaningful only if Ranked degrades cleanly when the DB is unavailable (cold-start, free-tier exhaustion, outage). The client maintains a single enum `connectivity.state ∈ {ok, network-down, auth-expired, db-unavailable}` with derived `canRank = (state === 'ok')` and `canSync = (state in {'ok', 'db-unavailable'})`. Each non-`ok` state shows a state-specific banner; Ranked entry points are disabled in every non-`ok` state; Local stays fully playable in every non-`ok` state. Server: any `POST /api/sessions/:id/finish` or `POST /api/sync` write that arrives while `getDbUnavailability()` is non-null persists the payload to a durable per-request file (returns `202 Accepted` with the queued `requestId`). A drain worker, triggered by the next successful DB write or self-init success log line (no timer), replays the queue idempotently using the `(user_id, client_game_id)` upsert from decision #5. **Mid-Ranked-session disconnect = hard fail** (no soft-downgrade), and the abandoned `ranked_sessions` row gets `status='abandoned'` and **does not count** against the user's "one Ranked Daily/day" or "one active session" limits — a single Wi-Fi blip must not lock a player out of Ranked Daily for 24h. No new background timers; no client-side polling — rely on CS53's existing 503-with-Retry-After warmup signal and on the user's next gesture.

10. **Game shape config lives in the database with code defaults as fallback, edited via an admin route.** A `game_configs` table holds one row per server-authoritative mode (`ranked_freeplay`, `ranked_daily`, `multiplayer`, …) with columns for `rounds`, `round_timer_ms`, `inter_round_delay_ms`, plus `updated_at`. The **code-level constants are the source of truth at boot** — when no row exists for a mode, the loader returns the defaults so a fresh DB always boots to a working game. A row in `game_configs` is an override applied at session creation. The change mechanism is a **minimal admin-only HTTP route** `PUT /api/admin/game-configs/:mode` gated by `SYSTEM_API_KEY` (existing pattern), with payload validation (`rounds ∈ [1, 50]`, `round_timer_ms ∈ [5000, 60000]`, `inter_round_delay_ms ∈ [0, 10000]`) — a hand-typed `UPDATE game_configs SET rounds=0` would otherwise brick the mode. The loader uses an **in-process `Map` cache with 24h TTL** (these tunables change rarely; multi-instance propagation is deferred until horizontal scale); the admin route **busts the local cache on write** so operators see their change take effect immediately on the same instance.

## Identity & client sync model

The CS extends today's offline-scores plumbing into a unified, gesture-driven sync layer that handles guest play, signed-in-offline play, network outages, auth expiry, and DB unavailability through a single state machine. This section locks the client-side contract referenced from decisions #5, #6, and #9.

### Identity model (guest vs signed-in-offline)

Records carry `user_id` (or `null` for guest). Two distinct write paths share one storage shape:

- **Guest** — no signed-in user; records written with `user_id=null`.
- **Signed-in-offline** — authenticated user but no live server reachability; records written with the active `user_id`.

**On sign-in**, the client validates each stored record's `user_id` against the currently signed-in user:

| Stored `user_id` | Action |
|---|---|
| Matches current user | Sync as-is. |
| `null` (guest record) | Surface in claim prompt. |
| Different user (mismatch — someone else was signed in here previously) | Reassign to current user; surface in claim prompt. Best-effort; the ambiguity is unavoidable and we don't try to be clever about it. |

Unattached + mismatched records are surfaced via a **single combined confirm prompt** ("N pending offline games will be added to your account") rather than two separate prompts — simpler UX, same safety surface.

### localStorage scope

The client maintains two layers in localStorage; both survive page reload, both are cleared on sign-out per the rule below.

- **L1 — Score submission queue.** The immutable record format from decision #5. Records stay until acked. Rejected records (per the conflict rule in decision #5) move to a separate "rejected" bucket the user can review.
- **L2-broad — Read cache.** Profile stats, own score history, last-seen leaderboards, last-seen achievements, last-seen notifications. Each L2 entity is tagged with `lastUpdatedAt` so the UI can show "last updated HH:MM" while disconnected, and each is bounded (e.g., last 100 LB rows, last 50 own scores, last 20 notifications) to prevent unbounded growth.

L2 reads on boot satisfy the boot-quiet contract automatically (localStorage only, no DB touch). L2 composes cleanly with the planned [CS56 server-side stale-while-revalidate cache](../planned/planned_cs56_server-cache-and-cold-db-fallback.md) — server cache reduces DB load on revalidation; client cache hides latency entirely while disconnected.

Game content (puzzles) is NOT in L2 — Local uses the existing client bundle; Ranked refuses to start while disconnected (decision #9).

### Sync triggers + single-flight

Sync is **strictly user-action-triggered**; no timers, no `setInterval`, no auto-fire on the `online` event. Triggers:

1. Sign-in / token refresh succeeds.
2. Score submission (any mode).
3. App regains connectivity (`navigator.onLine` true) — **deferred until the next user gesture**, never fires on the `online` event itself (preserves boot-quiet contract).
4. Navigation to a screen whose L2 entity is stale.
5. Explicit "Sync now" affordance on the offline banner.

**Single-flight policy: coalesce.** At most one sync RPC in flight globally. New triggers during an in-flight sync set a "needs another pass" flag; on completion, fire one more sync if the flag is set. This captures real "score submit then immediately navigate to leaderboard" sequences without unbounded queueing.

### `POST /api/sync` contract

A single batched RPC carries both L1 writes and L2 revalidations. Combining them keeps the single-flight gate trivial and avoids redundant round-trips.

```
POST /api/sync
Authorization: Bearer <token>
X-User-Activity: 1
{
  "queuedRecords": [
    { "client_game_id": "...", "mode": "...", "variant": "...", "score": 1234,
      "correct_count": 8, "total_rounds": 10, "best_streak": 5,
      "fastest_answer_ms": 1234, "completed_at": "2026-04-25T12:34:56Z",
      "schema_version": 1 },
    ...
  ],
  "revalidate": {
    "leaderboard:freeplay": { "since": "<server-cursor-or-null>" },
    "profile":              { "since": "<ts-or-null>" },
    "achievements":         { "since": "<ts-or-null>" },
    "notifications":        { "since": "<ts-or-null>" }
  }
}

→ 200 OK
{
  "acked":     [ "<client_game_id>", ... ],
  "rejected":  [ { "client_game_id": "...", "reason": "conflict_with_existing" }, ... ],
  "entities":  {
    "leaderboard:freeplay": { "rows": [...], "cursor": "<new>", "updatedAt": "<ts>" },
    "profile":              { "stats": {...},                    "updatedAt": "<ts>" },
    ...
  }
}

→ 202 Accepted   (only when getDbUnavailability() is non-null)
{
  "queuedRequestIds": [ "<id>", ... ],
  "retryAfterMs": 5000
}
```

Client behaviour on response:

- **Acked** → record removed from L1 queue; corresponding own-history row in L2 stays, marked `synced=true`. User's offline history view never goes blank.
- **Rejected** → soft non-blocking notice + persistent badge until viewed; record moves to L1's rejected bucket; never silently lost.
- **Entities** → replace the matching L2 cache wholesale, bump `lastUpdatedAt`.
- **202** → records stay in L1 (idempotency on `(user_id, client_game_id)` makes re-send safe); state transitions to `db-unavailable`; banner shows.
- **401** → state transitions to `auth-expired`; client clears in-memory `user_id`; L1+L2 stay intact; sign-in surfaces on next gesture.
- **Network error** → state transitions to `network-down`; no records lost.

### Connectivity state machine

| State | Banner copy | Local play | Ranked entry | Sync RPC | Triggered by |
|---|---|---|---|---|---|
| `ok` | (none) | ✅ | ✅ | ✅ | (default) |
| `network-down` | "Offline — your games still count" | ✅ | Disabled | ❌ (no transport) | `offline` event or fetch network failure |
| `auth-expired` | "Signed out — sign in to save your games" | ✅ as guest | Disabled | ❌ (no auth) | server `401` |
| `db-unavailable` | "Online scoring paused — your games are queued" | ✅ | Disabled | ✅ (server returns `202`) | server `503` with CS53 `UnavailableError` payload |

`ok` is restored by the next successful sync RPC (gesture-driven). When multiple layers fail simultaneously, the state reflects whichever signal is observed first; the next RPC re-evaluates.

### Sign-out semantics

Privacy default: sign-out means "remove my stuff from this device".

- **L2** is cleared entirely on sign-out.
- **L1** records have their `user_id` **demoted to `null`** (records become guest records). Next sign-in goes through the claim flow above naturally — no special "previous user" code path.
- **In-flight sync** is aborted; the response, if it arrives, is dropped. In-flight records are still in L1 (now demoted) and will be re-synced on next sign-in.

## Schema migration sketch

All migrations are additive (per the LEARNINGS.md migration policy — backward-compatible).

### Existing `scores` table — additive columns

```sql
ALTER TABLE scores ADD COLUMN source            TEXT    NOT NULL DEFAULT 'legacy';
                   -- 'ranked' | 'offline' | 'legacy'
ALTER TABLE scores ADD COLUMN variant           TEXT;
                   -- e.g. 'freeplay' | 'daily' | 'multiplayer' (mode-specific sub-variant)
ALTER TABLE scores ADD COLUMN client_game_id    TEXT;
                   -- UUID minted client-side for offline records; NULL for ranked/legacy
ALTER TABLE scores ADD COLUMN schema_version    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE scores ADD COLUMN payload_hash      TEXT;
                   -- hash of immutable fields, used for E-β conflict detection

CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_user_clientgame
  ON scores(user_id, client_game_id) WHERE client_game_id IS NOT NULL;
```

Backfill (CS52-2): `UPDATE scores SET source = 'legacy' WHERE source IS NULL OR source = '';`

### New `ranked_sessions` table

```sql
CREATE TABLE ranked_sessions (
  id              TEXT    PRIMARY KEY,    -- server-issued session UUID
  user_id         TEXT    NOT NULL,
  mode            TEXT    NOT NULL,        -- 'ranked_freeplay' | 'ranked_daily' | 'multiplayer'
  config_snapshot TEXT    NOT NULL,        -- JSON of {rounds, round_timer_ms, inter_round_delay_ms} at session creation
  match_id        TEXT,                    -- non-null only for multiplayer rows; same value across all participant rows of one match
  room_code       TEXT,                    -- multiplayer only
  status          TEXT    NOT NULL,        -- 'in_progress' | 'finished' | 'abandoned' | 'expired'
  score           INTEGER,                 -- server-computed at finish; NULL until finished
  correct_count   INTEGER,
  best_streak     INTEGER,
  started_at      TEXT    NOT NULL,
  finished_at     TEXT,
  expires_at      TEXT    NOT NULL
);
CREATE INDEX idx_ranked_sessions_user_mode_finished ON ranked_sessions(user_id, mode, finished_at DESC);
CREATE INDEX idx_ranked_sessions_match              ON ranked_sessions(match_id) WHERE match_id IS NOT NULL;
```

Note: I-β shape (one row per `(match, player)` for multiplayer). Match metadata (`room_code`, `match_id`, `started_at`, `finished_at`) is duplicated across participant rows of the same match; the single match-completion transaction keeps them consistent.

### New `ranked_session_events` table

```sql
CREATE TABLE ranked_session_events (
  session_id   TEXT    NOT NULL REFERENCES ranked_sessions(id),
  round_num    INTEGER NOT NULL,
  puzzle_id    TEXT    NOT NULL,
  answer       TEXT    NOT NULL,           -- the option index/value the player submitted
  correct      INTEGER NOT NULL,           -- 0 or 1, server-computed against the held answer key
  time_ms      INTEGER NOT NULL,           -- client-reported per-event time; server validates within bounds
  received_at  TEXT    NOT NULL,           -- server arrival time
  PRIMARY KEY (session_id, round_num)
);
```

### New `ranked_puzzles` table

```sql
CREATE TABLE ranked_puzzles (
  id              TEXT    PRIMARY KEY,
  category        TEXT    NOT NULL,
  prompt          TEXT    NOT NULL,         -- JSON or markdown payload, mode-appropriate
  options         TEXT    NOT NULL,         -- JSON array
  answer          TEXT    NOT NULL,         -- the secret; never returned through any client-facing endpoint
  difficulty      INTEGER,
  status          TEXT    NOT NULL,         -- 'active' | 'retired' | 'demoted_to_local'
  created_at      TEXT    NOT NULL,
  retired_at      TEXT
);
CREATE INDEX idx_ranked_puzzles_status ON ranked_puzzles(status);
```

### New `game_configs` table

```sql
CREATE TABLE game_configs (
  mode                  TEXT    PRIMARY KEY,    -- 'ranked_freeplay' | 'ranked_daily' | 'multiplayer'
  rounds                INTEGER NOT NULL,
  round_timer_ms        INTEGER NOT NULL,
  inter_round_delay_ms  INTEGER NOT NULL DEFAULT 0,
  updated_at            TEXT    NOT NULL
);
```

No seed rows — empty table is the default state, and the loader returns code-level constants when no row exists.

### New `pending_writes` durable queue (CS52-7e)

For `db-unavailable` 202-path writes. Per-request file under a mounted volume so they survive container restarts and image swaps.

```sql
-- Logical shape; on-disk implementation is one file per request under <DATA_DIR>/pending-writes/
{
  "request_id":   "<uuid>",
  "endpoint":     "/api/sessions/:id/finish" | "/api/sync",
  "user_id":      "...",
  "payload":      { ... },
  "queued_at":    "<iso ts>"
}
```

Drained on next successful DB write or self-init-success log line (no timer); replay is idempotent via the `(user_id, client_game_id)` upsert.

## API contract sketch

All endpoints assume the existing JWT auth middleware. Session-bearing endpoints additionally require an active, non-expired `ranked_sessions` row owned by the authenticated user.

### Ranked session lifecycle (CS52-3)

```
POST /api/sessions
  body: { mode: "ranked_freeplay" | "ranked_daily" }
  → 200 { sessionId, expiresAt, config: {rounds, roundTimerMs, interRoundDelayMs}, puzzles: [{id, prompt, options}, ...] }
  → 409 if user already has an active ranked session, or already played Ranked Daily today
  → 503 if db-unavailable (Ranked entry should already be disabled client-side; this is a defence-in-depth)

POST /api/sessions/:id/answer
  body: { round_num, puzzle_id, answer, time_ms }
  → 200 { correct: bool, runningScore: int }
  → 400 if out-of-order, timing impossible, puzzle_id mismatched

POST /api/sessions/:id/finish
  body: {}        // server already has all events; client just signals "done"
  → 200 { score, correctCount, bestStreak, fastestAnswerMs }
  → 202 (db-unavailable path) { queuedRequestId }
```

### Unified offline sync (CS52-5)

Shape locked above under "Identity & client sync model § `POST /api/sync` contract".

### Public leaderboard (CS52-6)

```
GET /api/scores/leaderboard?source=ranked|offline|all   (default: ranked)
GET /api/scores/leaderboard/multiplayer?source=...      (default: ranked)
  → 200 { rows: [{ user, score, source: 'ranked'|'offline', config: {...}, ... }, ...] }
```

Legacy rows (`source='legacy'`) are excluded from every public-LB filter; they remain visible only in personal `/api/scores/me` and profile.

### Admin (CS52-7c)

```
PUT /api/admin/game-configs/:mode
  Auth: x-api-key: <SYSTEM_API_KEY>
  body: { rounds, round_timer_ms, inter_round_delay_ms? }
  → 200 { mode, rounds, round_timer_ms, inter_round_delay_ms, updated_at }
  → 400 if validation fails (rounds ∉ [1,50], timer ∉ [5000,60000], delay ∉ [0,10000])
  Side effect: bust local in-process cache for this mode; next session creation reads the new row.
```

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS52-1 | **Design lock-down.** Finalise: provenance vocabulary; `scores` schema migration (`source`, `variant`, `client_game_id`, `schema_version`, `payload_hash` columns); new tables (`ranked_sessions`, `ranked_session_events`, `ranked_puzzles`, `game_configs`); ranked puzzle pool sourcing (server-only, fresh-content seed); canonical configs for `ranked_freeplay` / `ranked_daily` / `multiplayer`; `game_configs` change mechanism (admin route + 24h TTL cache); identity & client sync model (guest vs signed-in-offline, claim prompt, single-flight gesture-driven `POST /api/sync`); connectivity state machine; mid-Ranked-disconnect rule; sign-out semantics; offline sync conflict rule (payload-hash). **Output: this design PR — no application code yet.** | ✅ Complete (this PR) | Sequencing prereq for everything else. |
| CS52-2 | **Schema migration + ranked puzzle pool.** Apply the CS52-1 schema (additive only, per LEARNINGS.md migration policy). Create the server-only `ranked_puzzles` pool seeded with **~50 freshly-authored puzzles**. Backfill existing `scores` rows with `source='legacy'`. The existing bundled puzzle corpus stays as-is; no answer-stripping needed because Ranked puzzles never come from the bundle. | ⬜ Pending | Backwards-compatible; no behaviour change yet. |
| CS52-3 | **Ranked session API.** Implement `POST /api/sessions` (creates session, returns puzzles without `answer`), `POST /api/sessions/:id/answer` (per-event validation), `POST /api/sessions/:id/finish` (server computes final score, persists `source='ranked'`). Enforce: monotonic round order, timing bounds (>50ms, <2× round timer), session expiry, one active session per user, one Ranked Daily/day/user. Abandoned sessions (`status='abandoned'`) do NOT count against the daily / active-session limits. The scoring logic lives in a **shared core scoring service** (not inline in the route) so CS52-7d can reuse it from the WS handler. | ⬜ Pending | Server-side only; client integration in CS52-4. Shared service is the seam for multiplayer unification. |
| CS52-4 | **Client mode picker, Ranked flow, connectivity state machine + claim prompt.** Refactor `public/js/game.js` to accept either a local puzzle queue or a server session. Add Ranked entry points to Free Play and Daily screens (alongside existing Local entry points — Local renamed to Practice in UI for clarity). Implement the `connectivity.state` enum and per-state banners; disable Ranked entry points in every non-`ok` state. Implement the single combined claim prompt that fires on first sign-in when L1 has unattached or mismatched records. Mid-Ranked-disconnect handler shows the "Lost connection — Ranked session abandoned" overlay (hard fail, no soft-downgrade). | ⬜ Pending | First user-visible change. |
| CS52-5 | **Unified offline record + idempotent sync.** Replace both existing client queues (`gwn_pending_scores` + ProgressiveLoader queue) with the L1 immutable record format from CS52-1. Implement `POST /api/sync` per the contract sketch — single batched RPC carrying `queuedRecords` + `revalidate` map; single-flight client-side with **coalesce** policy; gesture-driven triggers only (no timers, no `online`-event auto-fire). Server upserts on `(user_id, client_game_id)`; **payload-hash conflict rule**: identical hash → `acked` (idempotent); mismatch → `rejected: "conflict_with_existing"` + `warn` log. Implement L2-broad client read cache (profile, history, leaderboards, achievements, notifications) with `lastUpdatedAt` and per-entity bounds. Sign-out: clear L2, demote L1 `user_id → null`, abort in-flight sync. Verify cross-device sync E2E. | ⬜ Pending | Personal cross-device sync is the user-facing acceptance criterion. |
| CS52-6 | **Leaderboard source filter + provenance UI.** Public leaderboard endpoints (`/api/scores/leaderboard`, `/api/scores/leaderboard/multiplayer`) accept a `source` query param: `ranked` (default), `offline`, `all`. Personal endpoints (`/api/scores/me`, profile) unchanged — show everything including legacy. Leaderboard UI gets a 3-way toggle (`Ranked` / `Offline` / `All`); each row shows a provenance badge ("Ranked" / "Offline"). Profile rows show the same badges plus "Legacy" for pre-CS52 rows (no toggle, no separate section, no onboarding banner). Legacy rows excluded from all three public-LB filters (profile-only). | ⬜ Pending | Where the offline / ranked split becomes visible to the player. |
| CS52-7 | **Achievement hardening.** Server achievements unlock only from `POST /api/sessions/:id/finish` (ranked) and existing multiplayer match-end. `POST /api/sync` (offline submission path) explicitly skips achievement evaluation. Document the rule in `INSTRUCTIONS.md` or `LEARNINGS.md`. | ⬜ Pending | Closes the integrity gap — the original F2 fix. |
| CS52-7b | **Multiplayer config alignment (read from DB).** Have `matchHandler.js` / `matchService.js` source `rounds`, `roundTimerMs`, and `interRoundDelayMs` from the DB-backed `game_configs` row added in CS52-7c, with the code-level defaults from CS52-1 used as fallback. Reject or ignore client-supplied overrides for these fields; remove the host-picks-rounds dropdown from the room-creation UI. Add a server-side test that asserts a client cannot influence round count or inter-round delay. | ⬜ Pending | Depends on CS52-7c. |
| CS52-7c | **DB-backed game shape config + admin route.** Implement the `game_configs` table from CS52-1: one row per mode (`ranked_freeplay`, `ranked_daily`, `multiplayer`, others as needed) with columns for `rounds`, `round_timer_ms`, `inter_round_delay_ms`, plus an `updated_at` audit column. Loader uses an **in-process `Map` cache with 24h TTL**; on cache miss, reads the row and falls back to the **code-level default constants** when no row exists so a fresh DB always boots to a working game. Implement the admin route `PUT /api/admin/game-configs/:mode` gated by `SYSTEM_API_KEY` with payload validation (`rounds ∈ [1,50]`, `round_timer_ms ∈ [5000,60000]`, `inter_round_delay_ms ∈ [0,10000]`); the route busts the local cache on write so operators see their change take effect immediately on the same instance. Wire Ranked Free Play (CS52-3) and Ranked Daily to read from this loader. | ⬜ Pending | Foundation for runtime configurability across all server-authoritative modes. Code default is the source of truth at boot; DB row overrides per environment. |
| CS52-7d | **Multiplayer storage + scoring path unification.** Refactor `server/ws/matchHandler.js` so a completed match writes through the shared core scoring service from CS52-3 and persists as **one `ranked_sessions` row per (match, player)** plus N `ranked_session_events` rows (per-player, per-answer), batch-written in a single transaction on match completion. Match metadata (`match_id`, `room_code`, `started_at`, `finished_at`) is duplicated across the participant rows of the same match — that's the I-β tradeoff for query parity with single-player Ranked. WS handler keeps the live in-process state machine (transport stays WS); only the persistence + scoring layer is shared. Half/abandoned matches do not persist (existing behaviour — disconnect mid-match = no score row). The legacy `POST /api/scores` write path from multiplayer is removed. Multiplayer leaderboard query updates if needed to read from the unified rows. | ⬜ Pending | Depends on CS52-3 (shared scoring service must exist). Eventual write on match completion is acceptable; no per-event WS→DB writes during play. |
| CS52-7e | **DB-aware degradation server-side queue (per decision #9).** Server: any `POST /api/sessions/:id/finish` or `POST /api/sync` request that arrives while `getDbUnavailability()` is non-null persists the payload to a durable per-request file under a mounted volume (returns `202 Accepted` with the queued `requestId`). A drain worker, triggered by the next successful DB write or self-init success log line (no timer), replays the queue idempotently using the `(user_id, client_game_id)` upsert from CS52-5. The `unavailable` reason and friendly messages are centralised so CS56's stale-cache fallback can reuse them. (Client-side `connectivity.state` machine + Ranked-entry-point disabling is implemented in CS52-4.) | ⬜ Pending | Depends on CS52-5 (idempotent record) and CS52-3 (sessions API). Closes the cold-DB / free-tier UX gap exposed in CS53; folds in what was briefly drafted as CS57. |
| CS52-8 | **Tests + closeout.** E2E coverage: Ranked Free Play happy path, Ranked Daily one-shot enforcement, offline → sync → cross-device visibility, anti-cheat rejections (out-of-order, impossible timing, expired, double session, daily replay), abandoned-session-doesn't-count-vs-daily-limit, leaderboard filter (`ranked` / `offline` / `all` produces the expected row sets), multiplayer config locked (client override ignored), multiplayer match completion writes correct number of `ranked_sessions` rows + event rows, DB config override changes round count for the next session, DB config row missing → code defaults applied, admin route validation rejects out-of-bounds payloads, admin route cache-bust takes effect immediately, `/api/sync` payload-hash conflict returns rejected, sign-out demotes L1 to guest. Schema migration test (legacy backfill). Move clickstop to `done/`, comment on #198, update CONTEXT.md. | ⬜ Pending | Closeout depends on all prior tasks merging. |

## Will not be done (deliberate)

- **Local-only achievement cabinet.** Two parallel achievement systems (server + local) is confusing UX and triples the surface area for what is already an integrity-driven CS. If a "Practice achievements" feature is wanted, file it as a separate clickstop after CS52 lands.
- **Per-configuration leaderboards** (one leaderboard per `(rounds, timer)` tuple). Ranked has one canonical config per mode (sourced from `game_configs`); players who want freeform play stay in Local. Local rows on the mixed-filter view show the config they used in their badge metadata, so users can read the row in context without us splitting the leaderboard.
- **Bot / automation defence beyond timing, ordering, server-held answers, session expiry, rate limiting.** Determined adversaries can drive a real browser. The MVP target is "defeat trivial DevTools / API cheating on the *ranked* leaderboard", not "stop scripted browsers."
- **Replay validation of offline scores.** Offline scores appear on the public leaderboard only under the explicit `Offline` / `All` filters and always carry a provenance badge. They are not policed — the contract surfaced to the user is "self-reported, fun comparison, not a competitive ranking". Cheating offline scores doesn't pollute the default ranked view.
- **Per-event multiplayer persistence during the match.** Multiplayer writes once on match completion (CS52-7d). Mid-match crashes lose the in-progress match, which matches today's behaviour and the user-stated rule that half-played games are not preserved.
- **Admin UI for editing `game_configs`.** Initial mechanism is direct SQL or a minimal admin route (decided in CS52-1). A full admin UI is out of scope.

## Acceptance criteria

- New Ranked Free Play and Ranked Daily flows work end-to-end with server-authoritative scoring; the `score` value persisted is computed server-side from per-answer events, not accepted from the client.
- Public leaderboards default to `source='ranked'`. The `Offline` and `All` filters surface offline scores with a clear provenance badge on every row. Legacy rows do not appear in any public-LB filter.
- Offline play continues to work with no connectivity. Offline scores sync to the server via idempotent records and appear on every device the player signs in to.
- Existing `scores` rows are tagged `source='legacy'` and remain visible only in personal profile with a "Legacy" badge.
- Server-side validation rejects: out-of-order answer events, impossibly fast or impossibly slow timings, expired sessions, multiple concurrent ranked sessions per user, second Ranked Daily attempt per day per user.
- Server achievements unlock only from ranked sessions and multiplayer matches.
- **Multiplayer reads its `rounds` / `roundTimerMs` / `interRoundDelayMs` from `game_configs` (with code-level fallback) and rejects client overrides.**
- **A completed multiplayer match persists as one `ranked_sessions` row + per-player per-answer `ranked_session_events` rows, written via the shared core scoring service. The legacy `POST /api/scores` write path from multiplayer is gone.**
- **Updating a `game_configs` row changes the shape of the next session for that mode without a redeploy. Deleting a `game_configs` row falls back cleanly to the code-level defaults.** The admin route `PUT /api/admin/game-configs/:mode` busts the local in-process cache on write so the change takes effect immediately on the same instance.
- **Identity & sync:** guest play works without sign-in (records `user_id=null`); first sign-in surfaces a single combined "claim N pending offline games" prompt covering both unattached and mismatched records (mismatched = stored `user_id` differs from current signed-in user; reassigned best-effort).
- **Connectivity state machine:** the SPA tracks `connectivity.state ∈ {ok, network-down, auth-expired, db-unavailable}`. `canRank` is true only in `ok`; `canSync` is true in `ok` and `db-unavailable` (the 202 path). All non-`ok` states show a state-specific banner; Local play remains fully enabled in every non-`ok` state.
- **Mid-Ranked-session disconnect** triggers a hard-fail "Ranked session abandoned" overlay; the server marks the row `status='abandoned'` and **does not count it** against the user's "one Ranked Daily/day" or "one active session" limits.
- **Sign-out** clears L2 entirely, demotes L1 records' `user_id → null` (becoming guest records), and aborts any in-flight sync RPC.
- **Offline sync conflict** (same `client_game_id` re-submitted): server compares the hash of immutable fields. Match → returned as `acked` (idempotent retry). Mismatch → returned as `rejected: "conflict_with_existing"` and surfaced via a soft non-blocking notice in the client; `warn` log line on the server.
- All tests pass (`npm run lint && npm test && npm run test:e2e`); `npm run check:docs:strict` is clean.

## Open questions for CS52-1 to resolve

✅ **All resolved in this design lock-down PR.** The decisions are inlined above (Key design decisions §1–10, Identity & client sync model, Schema migration sketch, API contract sketch). For future-context reference, the questions and where each was answered:

| Question | Answer | Captured in |
|---|---|---|
| Canonical Ranked Free Play / Daily / Multiplayer configs | RFP=10×15s, RD=10×15s, MP=5×20s+3s delay | Decision #4 |
| Ranked puzzle pool sourcing | Server-only `ranked_puzzles`; ~50 fresh-authored seed | Decision #1 |
| Legacy row visibility | Profile shows with badge; no toggle, no banner | Decision #6 |
| Offline sync conflict (same `client_game_id`, different payload) | First-write-wins on payload-hash match; reject + surface on mismatch | Decision #5 + `POST /api/sync` contract |
| `schema_version` shape | Single integer, start at 1 | Decision #5 |
| `game_configs` change mechanism | Admin route `PUT /api/admin/game-configs/:mode` (SYSTEM_API_KEY) with payload validation | Decision #10 + API contract sketch |
| `game_configs` cache strategy | In-process `Map` with 24h TTL; admin route busts local cache on write | Decision #10 |
| Multiplayer session row shape | One `ranked_sessions` row per (match, player); shape parity with single-player Ranked | Decision #8 + Schema sketch |
| Identity model (guest vs signed-in-offline) | Distinct states; single combined claim prompt covers unattached + mismatched | Identity & client sync model |
| Sync triggers + single-flight policy | 5 gesture-driven triggers; coalesce | Identity & client sync model |
| Connectivity state machine | `{ok, network-down, auth-expired, db-unavailable}`; `canRank`/`canSync` derived | Identity & client sync model + Decision #9 |
| Mid-Ranked-session disconnect | Hard fail; abandoned doesn't count vs daily/active limits | Decision #9 + CS52-3 task |
| Sign-out semantics | Clear L2; demote L1 `user_id → null`; abort in-flight sync | Identity & client sync model |

## Cross-references

- [Issue #198 — Architecture review](https://github.com/henrik-me/guesswhatisnext/issues/198) — F2, Recommendation 1, Roadmap B.
- [`server/routes/scores.js`](../../../server/routes/scores.js) — current client-trusted submission path.
- [`public/js/app.js`](../../../public/js/app.js) — current `submitScore`, `queueScoreForSync`, `gwn_pending_scores` queue.
- [`public/js/progressive-loader.js`](../../../public/js/progressive-loader.js) — second client queue (CS38) that CS52-5 will fold into the unified record format.
- [`server/ws/matchHandler.js`](../../../server/ws/matchHandler.js) — multiplayer authority model that ranked single-player will mirror.
- [`active_cs53_prod-cold-start-retry-investigation.md`](../active/active_cs53_prod-cold-start-retry-investigation.md) — defines the `UnavailableError` signal and `getDbUnavailability()` helper that CS52-7e consumes for DB-aware degradation.
- [`planned_cs56_server-cache-and-cold-db-fallback.md`](../planned/planned_cs56_server-cache-and-cold-db-fallback.md) — read-side cold-DB fallback (stale-while-revalidate); CS52-7e is the write-side counterpart for ranked submissions.
