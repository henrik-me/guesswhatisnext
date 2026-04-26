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
7. **Anti-cheat bar with server-derived ranked timing.** Realistic target: defeat trivial DevTools / API cheating **for the ranked leaderboard**. Not bot-proof. Necessary controls: server-held answer key (decision #1), monotonic answer order, **server-derived per-answer elapsed time** (the server records a `round_started_at` timestamp when it dispatches a puzzle and computes `elapsed_ms = received_at - round_started_at` on each answer; the client may report a `client_time_ms` for telemetry only — **it is never used for scoring**), session expiry, one active ranked session per user, rate limiting on session creation. The plausibility bounds (`elapsed_ms > 50ms`, `elapsed_ms < 2× round_timer_ms`) are then a sanity check on top of the server-anchored value, not the primary defence. Offline scores are deliberately not validated — the contract surfaced via the badge + filter is "self-reported, view at your own discretion".
8. **Multiplayer config alignment + storage/scoring unification, both in this CS.** Multiplayer adopts the canonical fixed config from decision #4 (`rounds=5`, `roundTimerMs=20000`, `interRoundDelayMs=3000`) sourced from `game_configs`, not overridable by the client. Multiplayer also moves onto the unified storage + scoring path: a completed match persists as **one `ranked_sessions` row per (match, player)** plus per-answer `ranked_session_events` rows, batch-written in a single transaction on match completion via the shared core scoring service that the WS handler and the HTTP `/sessions/:id/finish` endpoint both call. The "row per (match, player)" shape means the leaderboard query for MP is identical to single-player Ranked (no special join), at the cost of duplicating four small fields (`room_code, match_id, started_at, finished_at`) across participant rows — kept consistent by the single transaction. WebSocket transport stays — only the persistence + scoring layer is shared. Half/abandoned matches do not persist (existing behaviour: disconnect mid-match = no score row).
9. **DB-aware degradation via a unified connectivity state machine.** The split between Local and Ranked is meaningful only if Ranked degrades cleanly when the DB is unavailable (cold-start, free-tier exhaustion, outage). The client maintains a single enum `connectivity.state ∈ {ok, network-down, auth-expired, db-unavailable}` with derived `canRank = (state === 'ok')` and `canSync = (state in {'ok', 'db-unavailable'})`. Each non-`ok` state shows a state-specific banner; Ranked entry points are disabled in every non-`ok` state; Local stays fully playable in every non-`ok` state. Server: any `POST /api/sessions/:id/finish` or `POST /api/sync` write that arrives while `getDbUnavailability()` is non-null persists the payload to a durable per-request file (returns `202 Accepted` with the queued `requestId`). A drain worker, triggered by the next successful DB write or self-init success log line (no timer), replays the queue idempotently using the `(user_id, client_game_id)` upsert from decision #5. **Mid-Ranked-session disconnect = hard fail** (no soft-downgrade), and the abandoned `ranked_sessions` row gets `status='abandoned'` and **does not count** against the user's "one Ranked Daily/day" or "one active session" limits — a single Wi-Fi blip must not lock a player out of Ranked Daily for 24h. No new background timers; no client-side polling — rely on CS53's existing 503-with-Retry-After warmup signal and on the user's next gesture.

10. **Game shape config lives in the database with code defaults as fallback, edited via an admin route.** A `game_configs` table holds one row per server-authoritative mode (`ranked_freeplay`, `ranked_daily`, `multiplayer`, …) with columns for `rounds`, `round_timer_ms`, `inter_round_delay_ms`, plus `updated_at`. The **code-level constants are the source of truth at boot** — when no row exists for a mode, the loader returns the defaults so a fresh DB always boots to a working game. A row in `game_configs` is an override applied at session creation. The change mechanism is a **minimal admin-only HTTP route** `PUT /api/admin/game-configs/:mode` gated by `SYSTEM_API_KEY` (existing pattern), with payload validation (`rounds ∈ [1, 50]`, `round_timer_ms ∈ [5000, 60000]`, `inter_round_delay_ms ∈ [0, 10000]`) — a hand-typed `UPDATE game_configs SET rounds=0` would otherwise brick the mode. The loader uses an **in-process `Map` cache with 24h TTL** (these tunables change rarely; multi-instance propagation is deferred until horizontal scale); the admin route **busts the local cache on write** so operators see their change take effect immediately on the same instance.

    **Operator caveat re: deploy overlap.** A normal Container Apps revision swap can briefly run the old + new revision side-by-side (~30s during traffic shift), and a `game_configs` change made on one revision will not propagate to the other for up to 24h. To force convergence after an admin edit during a deploy window, the operator should either (a) wait for the old revision to be deactivated as part of the normal traffic shift, or (b) `az containerapp revision restart` on the lagging revision. The CS52-7c loader logs `game-configs: cache miss for mode=X, hit DB row updated_at=…` on every cache fill so operators can observe propagation. This caveat is acceptable because (i) `game_configs` edits happen during quiet windows, not during deploys, and (ii) a brief mixed-config window only affects which canonical shape new sessions are created with — sessions in flight already snapshot their config into `ranked_sessions.config_snapshot` at creation time, so no in-flight session can desync mid-game.

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

**Decline semantics:** if the user declines (or dismisses) the claim prompt, records remain in L1 in their current state (guest records stay `user_id=null`; mismatched records keep their stored `user_id`). Nothing is silently deleted, auto-reassigned, or auto-synced. The prompt re-surfaces on each subsequent sign-in until the user explicitly claims or explicitly discards via a per-record action in the rejected/pending bucket UI.

### localStorage scope

The client maintains two layers in localStorage; both survive page reload. **Sign-out behaviour differs**: L2 is cleared entirely; L1 has `user_id` demoted to `null` (records become guest records, kept until next sign-in / claim) — see "Sign-out semantics" below.

- **L1 — Score submission queue.** The immutable record format from decision #5. Records stay until acked. Rejected records (per the conflict rule in decision #5) move to a separate "rejected" bucket the user can review.
- **L2-broad — Read cache.** Profile stats, own score history, last-seen leaderboards, last-seen achievements, last-seen notifications. Each L2 entity is tagged with `lastUpdatedAt` so the UI can show "last updated HH:MM" while disconnected, and each is bounded (e.g., last 100 LB rows, last 50 own scores, last 20 notifications) to prevent unbounded growth.

L2 reads on boot satisfy the boot-quiet contract automatically (localStorage only, no DB touch). L2 composes cleanly with the planned [CS56 server-side stale-while-revalidate cache](../planned/planned_cs56_server-cache-and-cold-db-fallback.md) — server cache reduces DB load on revalidation; client cache hides latency entirely while disconnected.

Game content (puzzles) is NOT in L2 — Local uses the existing client bundle; Ranked refuses to start while disconnected (decision #9).

### Sync triggers + single-flight

Sync is **strictly user-action-triggered**; no timers, no `setInterval`, no auto-fire on the `online` event. Triggers:

1. **Sign-in succeeds** — the user just typed credentials / completed an OAuth round-trip; this IS a real user gesture. **Silent token refresh (no user gesture) is NOT a sync trigger** — boot-time stored-token validation must NOT auto-fire `/api/sync`, per the CS53 boot-quiet contract (server endpoints reject DB-touching requests without `X-User-Activity: 1`). Sync after silent refresh is deferred until the next user gesture from triggers 3–5.
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
    "leaderboard:freeplay:ranked": { "since": "<server-cursor-or-null>" },
    "leaderboard:daily:ranked":    { "since": "<cursor>" },
    "leaderboard:freeplay:offline": { "since": "<cursor>" },
    "leaderboard:daily:offline":   { "since": "<cursor>" },
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
    "leaderboard:freeplay:ranked": { "rows": [...], "cursor": "<new>", "updatedAt": "<ts>" },
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

**202 is mutually exclusive with the 200 fields** — if the server returns `202`, the client must treat the entire batch as queued (no records are acked, no entities are revalidated). The server never returns a mixed response containing both `acked`/`rejected`/`entities` and `queuedRequestIds`.

**Client-side dedupe in `db-unavailable`:** while `connectivity.state === 'db-unavailable'`, gesture-driven triggers must NOT re-post the same `client_game_id` set to the server (would create duplicate per-request files). Concretely: each L1 record carries a `lastQueuedAt` timestamp set when it receives a 202 from the server. On the next sync trigger, the client only includes records whose `lastQueuedAt` is null OR older than the server-supplied `retryAfterMs`. Single-flight + this client-side suppression bound the queue-spam attack surface. The server-side drain worker handles acked records by their `(user_id, client_game_id)` upsert idempotency, so duplicates that do slip through are harmless.

Client behaviour on response:

- **Acked** → record removed from L1 queue; corresponding own-history row in L2 stays, marked `synced=true`. User's offline history view never goes blank.
- **Rejected** → soft non-blocking notice + persistent badge until viewed; record moves to L1's rejected bucket; never silently lost.
- **Entities** → replace the matching L2 cache wholesale, bump `lastUpdatedAt`.
- **202** → records stay in L1 (idempotency on `(user_id, client_game_id)` makes re-send safe); each included record's `lastQueuedAt` is set; state transitions to `db-unavailable`; banner shows.
- **401** → state transitions to `auth-expired`; client clears in-memory `user_id`; L1+L2 stay intact; sign-in surfaces on next gesture.
- **Network error** → state transitions to `network-down`; no records lost.

### Connectivity state machine

| State | Banner copy | Local play | Ranked entry | Sync RPC | Triggered by |
|---|---|---|---|---|---|
| `ok` | (none) | ✅ | ✅ | ✅ | (default) |
| `network-down` | "Offline — your games still count" | ✅ | Disabled | ❌ (no transport) | `offline` event or fetch network failure |
| `auth-expired` | "Signed out — sign in to save your games" | ✅ as guest | Disabled | ❌ (no auth) | server `401` |
| `db-unavailable` | "Online scoring paused — your games are queued" | ✅ | Disabled | ✅ (server returns `202`) | server `503` with CS53 `UnavailableError` payload |

**Deterministic precedence when multiple signals fire near-simultaneously:** `auth-expired` > `network-down` > `db-unavailable` > `ok`. Concretely:

- A real `401` (auth) trumps everything — even if the next request fails with a network error, we should still ask the user to sign in once connectivity returns.
- A `network-down` observation trumps a stale `db-unavailable` (we can't know the DB is still down if we can't reach the server at all).
- `db-unavailable` is the most-recoverable state; `ok` only reasserts after a successful 200/202 RPC.
- `ok` is restored by the next successful sync RPC (gesture-driven). The next RPC always re-evaluates and may transition to a higher-precedence state if its response indicates one.

### Sign-out semantics

**The privacy-vs-data-loss tradeoff:** sign-out should remove a user's *server-cached personal data* from the device, but unconditionally deleting unsynced offline records on sign-out would silently destroy games the user genuinely earned but hasn't yet had connectivity to sync. We resolve this asymmetrically: clear L2 (it's already on the server, fetching it again is cheap and safe); preserve L1 by demoting `user_id → null` (records become guest records, kept until explicitly claimed by the next sign-in or explicitly discarded via the rejected/pending bucket UI). On a shared device, the next person to sign in sees the claim prompt and decides what to do — the records are NOT silently auto-attributed to them.

- **L2** is cleared entirely on sign-out (no game data lost — the server has it).
- **L1** records have their `user_id` **demoted to `null`** (records become guest records). Next sign-in goes through the claim flow above naturally — no special "previous user" code path, and the next signer-in is given an explicit choice.
- **In-flight sync** is aborted; the response, if it arrives, is dropped. In-flight records are still in L1 (now demoted) and will be re-synced on next sign-in.
- **Operator-grade "wipe everything" affordance:** users on a truly shared/public device who want full deletion can use a separate "Sign out and delete unsynced games" affordance in Settings — this is a follow-up enhancement (file as a planned CS once CS52 lands), not part of MVP.

## Schema migration sketch

All migrations are additive (per the LEARNINGS.md migration policy — backward-compatible).

> **Portability note:** the SQL below is a **logical sketch** — implementation in CS52-2 must use the project's dialect-specific migration runner (`server/db/migrations/`) which already handles SQLite / MSSQL differences. In particular, the `IF NOT EXISTS` and `CREATE UNIQUE INDEX ... WHERE` filtered-index syntax shown is SQLite-flavoured; the MSSQL equivalent uses `WHERE` filtered indexes too but without `IF NOT EXISTS` (the migration runner's idempotency check guards re-execution). FK syntax is `INT IDENTITY(1,1)` for new PKs to match `users(id)` (per `server/db/migrations/001-initial.js`).

### Existing `scores` table — additive columns

```sql
ALTER TABLE scores ADD COLUMN source            TEXT    NOT NULL DEFAULT 'legacy';
                   -- 'ranked' | 'offline' | 'legacy'
ALTER TABLE scores ADD COLUMN variant           TEXT;
                   -- e.g. 'freeplay' | 'daily' | 'multiplayer' (mode-specific sub-variant)
ALTER TABLE scores ADD COLUMN client_game_id    TEXT;
                   -- UUID minted client-side for offline records; NULL for ranked/legacy
ALTER TABLE scores ADD COLUMN schema_version    INT     NOT NULL DEFAULT 1;
ALTER TABLE scores ADD COLUMN payload_hash      TEXT;
                   -- hash of immutable fields, used for E-β conflict detection

CREATE UNIQUE INDEX idx_scores_user_clientgame
  ON scores(user_id, client_game_id) WHERE client_game_id IS NOT NULL;
```

Backfill (CS52-2): `UPDATE scores SET source = 'legacy' WHERE source IS NULL OR source = '';`

### New `ranked_sessions` table

`user_id` is `INT` to match the existing `users(id)` PK (`INT IDENTITY(1,1)` per migration 001). All FKs reference existing tables.

```sql
CREATE TABLE ranked_sessions (
  id              TEXT    PRIMARY KEY,    -- server-issued session UUID
  user_id         INT     NOT NULL,
  mode            TEXT    NOT NULL,        -- 'ranked_freeplay' | 'ranked_daily' | 'multiplayer'
  config_snapshot TEXT    NOT NULL,        -- JSON of {rounds, round_timer_ms, inter_round_delay_ms} at session creation
  match_id        TEXT,                    -- non-null only for multiplayer rows; same value across all participant rows of one match
  room_code       TEXT,                    -- multiplayer only
  status          TEXT    NOT NULL,        -- 'in_progress' | 'finished' | 'abandoned' | 'expired'
  score           INT,                     -- server-computed at finish; NULL until finished
  correct_count   INT,
  best_streak     INT,
  started_at      TEXT    NOT NULL,
  finished_at     TEXT,
  expires_at      TEXT    NOT NULL,
  daily_utc_date  TEXT,                    -- non-null only for mode='ranked_daily'; the UTC date of the daily puzzle the session was created against (uniqueness key for once-per-day enforcement)
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_ranked_sessions_user_mode_finished ON ranked_sessions(user_id, mode, finished_at DESC);
CREATE INDEX idx_ranked_sessions_match              ON ranked_sessions(match_id) WHERE match_id IS NOT NULL;
CREATE INDEX idx_ranked_sessions_user_status_expires ON ranked_sessions(user_id, status, expires_at);
CREATE UNIQUE INDEX idx_ranked_sessions_user_daily
  ON ranked_sessions(user_id, daily_utc_date)
  WHERE mode = 'ranked_daily' AND status = 'finished';   -- enforces one finished Ranked Daily per (user, daily-puzzle-date) at the DB layer
CREATE UNIQUE INDEX idx_ranked_sessions_user_active
  ON ranked_sessions(user_id)
  WHERE status = 'in_progress';                         -- DB-layer enforcement of "one active ranked session per user"; closes the race where two near-simultaneous POST /api/sessions calls both observe "no active session"
```

Note: I-β shape (one row per `(match, player)` for multiplayer). Match metadata (`room_code`, `match_id`, `started_at`, `finished_at`) is duplicated across participant rows of the same match; the single match-completion transaction keeps them consistent. The `idx_ranked_sessions_user_status_expires` index supports the in-band reconciliation rule below.

### New `ranked_session_events` table

```sql
CREATE TABLE ranked_session_events (
  session_id        TEXT    NOT NULL REFERENCES ranked_sessions(id),
  round_num         INT     NOT NULL,
  puzzle_id         TEXT    NOT NULL,
  answer            TEXT    NOT NULL,        -- the option index/value the player submitted
  correct           INT     NOT NULL,        -- 0 or 1, server-computed against the held answer key
  round_started_at  TEXT    NOT NULL,        -- server timestamp when the puzzle was dispatched (anti-cheat anchor)
  received_at       TEXT    NOT NULL,        -- server arrival time of this answer
  elapsed_ms        INT     NOT NULL,        -- server-computed: received_at - round_started_at; this is the score input
  client_time_ms    INT,                     -- client-reported, telemetry only — never used for scoring (decision #7)
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
  difficulty      INT,
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
  rounds                INT     NOT NULL,
  round_timer_ms        INT     NOT NULL,
  inter_round_delay_ms  INT     NOT NULL DEFAULT 0,
  updated_at            TEXT    NOT NULL
);
```

No seed rows — empty table is the default state, and the loader returns code-level constants when no row exists.

### New `pending_writes` durable queue (CS52-7e)

For `db-unavailable` 202-path writes. Persisted as one file per request under a mounted volume so they survive container restarts and image swaps. **Replay must be deterministic from the file alone** — no reliance on ambient process state, in-memory session caches, or signed JWTs that may have expired by drain time.

```jsonc
// On-disk layout: <DATA_DIR>/pending-writes/<request_id>.json
//
// Three discriminated-union variants, keyed by `endpoint`:

// Variant A: single-player Ranked finish
{
  "request_id":     "<uuid>",
  "schema_version": 1,
  "endpoint":       "POST /api/sessions/:id/finish",
  "concrete_route": { "session_id": "<ranked_sessions.id>" },
  "user_id":        <int>,
  "payload":        {},                    // /finish has empty body
  "queued_at":      "<iso ts>"
  // Idempotency: drain reads ranked_sessions row for session_id; if status='finished'
  // and score is set, the file is deleted with no DB write.
}

// Variant B: client offline-record sync
{
  "request_id":      "<uuid>",
  "schema_version":  1,
  "endpoint":        "POST /api/sync",
  "concrete_route":  {},
  "user_id":         <int>,
  "payload":         { "queuedRecords": [ ... ], "revalidate": { ... } },
  "client_game_ids": [ "<id>", ... ],      // pre-extracted from payload.queuedRecords for cheap idempotency
  "queued_at":       "<iso ts>"
  // Idempotency: per-record (user_id, client_game_id) upsert, same as the live path.
}

// Variant C: multiplayer match completion (NOT triggered by an HTTP request — the WS
// handler enqueues this synthetic record when getDbUnavailability() is non-null at
// match end)
{
  "request_id":     "<uuid>",
  "schema_version": 1,
  "endpoint":       "INTERNAL multiplayer-match-completion",
  "concrete_route": { "match_id": "<matches.id>", "room_code": "<...>" },
  "user_id":        null,                  // multi-participant; per-participant ids inside
  "queued_at":      "<iso ts>",
  "payload": {
    "config_snapshot": { "rounds": 5, "round_timer_ms": 20000, "inter_round_delay_ms": 3000 },
    "started_at":      "<iso ts>",
    "finished_at":     "<iso ts>",
    "participants": [
      {
        "user_id":              <int>,
        "ranked_session_id":    "<uuid>",   // pre-allocated by the WS handler at queue time
        "score":                <int>,
        "correct_count":        <int>,
        "best_streak":          <int>,
        "events": [
          { "round_num": 0, "puzzle_id": "...", "answer": "...", "correct": 0|1,
            "round_started_at": "<iso ts>", "received_at": "<iso ts>",
            "elapsed_ms": <int>, "client_time_ms": <int|null> },
          ...
        ]
      },
      ...
    ]
  }
  // Idempotency: drain checks if any ranked_sessions row exists with this match_id;
  // if yes (already replayed or live-write succeeded after enqueue), file is deleted
  // with no DB write. Otherwise: single transaction inserts one ranked_sessions row
  // per participant + N ranked_session_events rows per participant.
}
```

**Drain trigger (no background timer):** the drain worker is invoked **only** when one of these two events fires within a normal request:

1. The next successful DB write completes inside any HTTP request handler (post-commit hook).
2. The lazy-init self-init-success path logs `db-init: ok` (i.e. `getDbUnavailability()` transitions back to `null`) — invoked from inside the request that triggered the lazy init.

The drain worker reads the directory, sorts by `queued_at`, and replays each file inside a single request-bound async loop. Replay calls the same internal write functions the original request would have called (NOT a re-issued HTTP fetch back to localhost), with `user_id` taken from the file. Idempotency: `(user_id, client_game_id)` upsert for `/sync`; `ranked_sessions.id` already-finished check for `/finish` (if `status='finished'` and `score` is set, the file is just deleted with no DB write). Successfully-replayed files are deleted; files that fail with a non-retryable error are moved to `<DATA_DIR>/pending-writes/dead/` for operator inspection.

**Multiplayer match-completion writes use the same queue.** When `getDbUnavailability()` is non-null at match-end, the WS handler serialises the planned `ranked_sessions` rows + `ranked_session_events` rows for all participants into a single `pending_writes` file with a synthetic `endpoint: "INTERNAL multiplayer-match-completion"` and replays the same way (this closes the gap that the WS path is otherwise outside CS52-7e's `/finish`+`/sync` scope). The match is not announced as "saved" to the players until either the immediate write succeeds or the queue file is fsynced to disk — this preserves the existing "match finished = score recorded" UX contract even during a DB blip.

## API contract sketch

All endpoints assume the existing JWT auth middleware. Session-bearing endpoints additionally require an active, non-expired `ranked_sessions` row owned by the authenticated user.

### Ranked session lifecycle (CS52-3)

**Round-dispatch model: streaming.** Puzzles are NOT preloaded at session create — the server dispatches one round at a time and timestamps `round_started_at` at the dispatch moment. Tradeoff: +1 RTT per round (~1.5s spread across a 10-round session at typical RTT). Won over the preloaded alternative because (a) the answer key for *all* rounds would otherwise have to be loaded into the session at create time, expanding blast radius if a session is leaked; (b) the dispatch timestamp is unambiguously server-controlled, removing the need for a separate "reveal" handshake; (c) it makes accidental client-controlled timing impossible by construction.

```
POST /api/sessions
  body: { mode: "ranked_freeplay" | "ranked_daily" }
  → 200 { sessionId, expiresAt, config: {rounds, roundTimerMs, interRoundDelayMs},
          round0: { round_num: 0, puzzle: {id, prompt, options}, dispatched_at } }
         // ONLY round 0 is returned; subsequent rounds via /next-round
  → 409 if user already has an active ranked session, or already played Ranked Daily today
         (after applying the in-band reconciliation rule below)
  → 503 if db-unavailable (Ranked entry should already be disabled client-side; this is a defence-in-depth)

  Server side: writes ranked_sessions row with status='in_progress', config_snapshot,
  expires_at = now + rounds × (round_timer_ms + inter_round_delay_ms) + slack.
  The dispatched_at returned to the client is informational (UI countdown anchor);
  the score-input round_started_at is the server's record of that same moment, kept
  in memory + persisted as ranked_session_events.round_started_at when the answer arrives.

POST /api/sessions/:id/answer
  body: { round_num, puzzle_id, answer, client_time_ms }    // client_time_ms is telemetry only
  → 200 { correct: bool, runningScore: int, elapsed_ms: int }   // elapsed_ms is server-computed
  → 400 if out-of-order (round_num != current_round), server-computed elapsed_ms
        outside [50ms, 2× round_timer_ms], puzzle_id mismatched, or session expired

POST /api/sessions/:id/next-round
  body: {}
  → 200 { round_num, puzzle: {id, prompt, options}, dispatched_at }
        // server timestamps round_started_at = dispatched_at; persisted when the
        // answer for this round arrives. Enforces inter_round_delay_ms server-side
        // (returns 425 Too Early if called before previous answer + delay).
  → 409 if there's no current answer to advance from (would have been the previous
        round's /answer call), or if the session is already finished.
  → 425 Too Early if called before inter_round_delay_ms has elapsed since the
        previous /answer.

POST /api/sessions/:id/finish
  body: {}        // server already has all events; client just signals "done"
  → 200 { score, correctCount, bestStreak, fastestAnswerMs }
  → 400 if not all rounds have been answered
  → 202 (db-unavailable path) { queuedRequestId }
```

**Server-side in-band reconciliation (no background sweeper, per the no-DB-waking-work rule):** the "one active ranked session per user" and "one Ranked Daily/day/user" gates are enforced by reconciling at the moment the user takes the next action that would conflict — never by a timer. Concretely, `POST /api/sessions` runs this query first:

```sql
UPDATE ranked_sessions
   SET status      = 'abandoned',
       finished_at = <now>
 WHERE user_id    = <current user>
   AND status     = 'in_progress'
   AND expires_at < <now>;
```

This converts any stale `in_progress` rows whose `expires_at` has passed (i.e. the player walked away or got disconnected and never returned) into `abandoned` rows, freeing the "one active session" slot. Because `abandoned` rows do NOT count against the daily / active-session limits (decision #9), the next `POST /api/sessions` then proceeds normally. The same UPDATE runs at the top of `/answer`, `/next-round`, and `/finish` so a user who comes back inside the expiry window can resume their actual session, but a user whose session lapsed cannot accidentally count it. **No background process touches the DB** — the reconciliation rides on the next user request.

**Ranked-Daily uniqueness is keyed to the daily puzzle date, not `finished_at`.** When a Ranked Daily session is created the server snapshots the daily-puzzle UTC date into `ranked_sessions.daily_utc_date` (NEW column on the table — see schema sketch). The "already played today" check is then `WHERE mode = 'ranked_daily' AND status = 'finished' AND daily_utc_date = today_utc`, NOT `date(finished_at) = today_utc`. This closes the cross-midnight loophole where a session started before UTC-midnight and finished after would otherwise consume the next day's quota while representing the previous day's puzzle. `abandoned` and `expired` rows are still excluded by status, so a single Wi-Fi blip cannot lock the user out.

### Unified offline sync (CS52-5)

Shape locked above under "Identity & client sync model § `POST /api/sync` contract".

### Public leaderboard (CS52-6)

Free Play and Daily are separate leaderboards (decision in §Approach: their round counts and timing differ — comparing them is meaningless). Multiplayer has its own endpoint as today.

```
GET /api/scores/leaderboard?variant=freeplay|daily&source=ranked|offline|all
                                                  (variant required; source default: ranked)
GET /api/scores/leaderboard/multiplayer?source=ranked|offline|all
                                                  (source default: ranked)
  → 200 { rows: [{ user, score, source: 'ranked'|'offline', config: {...}, ... }, ...],
          cursor: "<...>", updatedAt: "<iso ts>" }
  → 400 if variant param missing on the non-multiplayer endpoint
```

The four cache keys revalidated via `/api/sync.revalidate` are `leaderboard:freeplay:ranked`, `leaderboard:freeplay:offline`, `leaderboard:daily:ranked`, `leaderboard:daily:offline` (the `all` filter is computed client-side from the union of the ranked + offline caches — no separate cache to keep coherent).

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

**Per-task review-loop policy (applies to every CS52-2..CS52-11 PR):**

1. Worktree branch: `yoga-gwn-c<N>/cs52-<task>-<short-name>` (or `<machine>-gwn[-cN]/cs52-<task>-<short-name>`).
2. **Container validation** (`npm run container:validate`) before requesting any review, after each fix push, and after each Copilot iteration's fixes — required for every task that touches server/client/DB code (i.e. all of CS52-2..CS52-7e). Capture pass/fail per cycle in PR body's `## Container Validation` section per [INSTRUCTIONS.md § Database & Data](../../../INSTRUCTIONS.md#database--data). CS52-9/10/11 supersede this with their own production-shape validation.
3. **Local review (GPT-5.4 or higher)** via the `code-review` agent before requesting Copilot review per [REVIEWS.md § Local Review Loop](../../../REVIEWS.md#local-review-loop-gpt-54-or-higher). Findings recorded in PR description under `## Local Review`. CS52-2..CS52-7e author may run additional rubber-duck cycles at design/test-design milestones.
4. **Copilot PR review** — request via `gh pr edit <PR#> --add-reviewer Copilot` after local review is clean. Address all valid findings, reply on each thread, resolve all threads. Iterate until Copilot approves with no new comments. Per [REVIEWS.md § Copilot PR Review Policy](../../../REVIEWS.md). CS52-9/10/11 are validation/deploy tasks — if their PRs are docs-only (e.g. CS52-11 closeout), Copilot review may be skipped per the docs-only rule; otherwise required.
5. **CI green** (`npm run lint && npm test && npm run test:e2e` plus `npm run check:docs:strict`).
6. **WORKBOARD updates** at every state transition (`claimed → implementing → local_review → copilot_review → ready_to_merge → merged`).
7. **Merge to main** only after Copilot approves AND CI is green AND the user has approved (branch protection).

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS52-1 | **Design lock-down.** Finalise: provenance vocabulary; `scores` schema migration (`source`, `variant`, `client_game_id`, `schema_version`, `payload_hash` columns); new tables (`ranked_sessions`, `ranked_session_events`, `ranked_puzzles`, `game_configs`); ranked puzzle pool sourcing (server-only, fresh-content seed); canonical configs for `ranked_freeplay` / `ranked_daily` / `multiplayer`; `game_configs` change mechanism (admin route + 24h TTL cache); identity & client sync model (guest vs signed-in-offline, claim prompt, single-flight gesture-driven `POST /api/sync`); connectivity state machine; mid-Ranked-disconnect rule; sign-out semantics; offline sync conflict rule (payload-hash). **Output: this design PR — no application code yet.** | ✅ Complete (this PR) | Sequencing prereq for everything else. |
| CS52-2 | **Schema migration + ranked puzzle pool.** Apply the CS52-1 schema (additive only, per LEARNINGS.md migration policy). Create the server-only `ranked_puzzles` pool seeded with **~50 freshly-authored puzzles**. Backfill existing `scores` rows with `source='legacy'`. The existing bundled puzzle corpus stays as-is; no answer-stripping needed because Ranked puzzles never come from the bundle. | ⬜ Pending | Backwards-compatible; no behaviour change yet. |
| CS52-3 | **Ranked session API.** Implement the **streaming round-dispatch model**: `POST /api/sessions` (creates session, returns ONLY round 0; sets `daily_utc_date` for `mode='ranked_daily'`), `POST /api/sessions/:id/next-round` (dispatches the next puzzle and timestamps `round_started_at`; returns `425 Too Early` if called before `inter_round_delay_ms` has elapsed since previous answer), `POST /api/sessions/:id/answer` (per-event validation; **server computes `elapsed_ms = received_at - round_started_at`** and stores it as the score input — `client_time_ms` is telemetry only, never used for scoring), `POST /api/sessions/:id/finish` (server computes final score from `elapsed_ms` per event, persists `source='ranked'`; rejects with 400 if not all rounds have been answered). Enforce: monotonic round order, server-derived timing bounds (`elapsed_ms ∈ [50, 2× round_timer_ms]`), session expiry, **one active session per user via the `idx_ranked_sessions_user_active` UNIQUE INDEX** (the route does the in-band reconciliation UPDATE first, then attempts the INSERT; if the INSERT still fails on the unique constraint — concurrent races — the route catches and returns `409` rather than racing through application-level checks), **one Ranked Daily per (user, daily_utc_date) — keyed to the puzzle-date snapshot, not to `finished_at`, to close the cross-midnight loophole; enforced by `idx_ranked_sessions_user_daily` UNIQUE INDEX**. Implement the **in-band reconciliation rule** at the top of `/api/sessions`, `/answer`, `/next-round`, and `/finish`: any `in_progress` row for the user with `expires_at < now` is updated to `status='abandoned'` (no background sweeper, per the no-DB-waking-work rule). Abandoned and expired sessions do NOT count against the daily / active-session limits. The scoring logic lives in a **shared core scoring service** (not inline in the route) so CS52-7d can reuse it from the WS handler. | ⬜ Pending | Server-side only; client integration in CS52-4. Shared service is the seam for multiplayer unification. |
| CS52-4 | **Client mode picker, Ranked flow, connectivity state machine + claim prompt.** Refactor `public/js/game.js` to accept either a local puzzle queue or a server session. Add Ranked entry points to Free Play and Daily screens (alongside existing Local entry points — Local renamed to Practice in UI for clarity). Implement the `connectivity.state` enum and per-state banners; disable Ranked entry points in every non-`ok` state. Implement the single combined claim prompt that fires on first sign-in when L1 has unattached or mismatched records. Mid-Ranked-disconnect handler shows the "Lost connection — Ranked session abandoned" overlay (hard fail, no soft-downgrade). | ⬜ Pending | First user-visible change. |
| CS52-5 | **Unified offline record + idempotent sync.** Replace both existing client queues (`gwn_pending_scores` + ProgressiveLoader queue) with the L1 immutable record format from CS52-1. Implement `POST /api/sync` per the contract sketch — single batched RPC carrying `queuedRecords` + `revalidate` map; single-flight client-side with **coalesce** policy; gesture-driven triggers only (no timers, no `online`-event auto-fire). Server upserts on `(user_id, client_game_id)`; **payload-hash conflict rule**: identical hash → `acked` (idempotent); mismatch → `rejected: "conflict_with_existing"` + `warn` log. Implement L2-broad client read cache (profile, history, leaderboards, achievements, notifications) with `lastUpdatedAt` and per-entity bounds. Sign-out: clear L2, demote L1 `user_id → null`, abort in-flight sync. Verify cross-device sync E2E. | ⬜ Pending | Personal cross-device sync is the user-facing acceptance criterion. |
| CS52-6 | **Leaderboard source filter + provenance UI.** Public leaderboard endpoints (`GET /api/scores/leaderboard?variant=freeplay\|daily&source=ranked\|offline\|all` — variant param required; `GET /api/scores/leaderboard/multiplayer?source=…`) accept the `source` query param: `ranked` (default), `offline`, `all`. Personal endpoints (`/api/scores/me`, profile) unchanged — show everything including legacy. Leaderboard UI gets a 3-way toggle (`Ranked` / `Offline` / `All`); each row shows a provenance badge ("Ranked" / "Offline"). Profile rows show the same badges plus "Legacy" for pre-CS52 rows (no toggle, no separate section, no onboarding banner). Legacy rows excluded from all three public-LB filters (profile-only). The four cache keys revalidated via `/api/sync.revalidate` are `leaderboard:freeplay:ranked`, `leaderboard:freeplay:offline`, `leaderboard:daily:ranked`, `leaderboard:daily:offline`; the `all` filter is computed client-side from the union of `ranked` + `offline` (no separate cache). | ⬜ Pending | Where the offline / ranked split becomes visible to the player. |
| CS52-7 | **Achievement hardening.** Server achievements unlock only from `POST /api/sessions/:id/finish` (ranked) and existing multiplayer match-end. `POST /api/sync` (offline submission path) explicitly skips achievement evaluation. Document the rule in `INSTRUCTIONS.md` or `LEARNINGS.md`. | ⬜ Pending | Closes the integrity gap — the original F2 fix. |
| CS52-7b | **Multiplayer config alignment (read from DB).** Have `matchHandler.js` / `matchService.js` source `rounds`, `roundTimerMs`, and `interRoundDelayMs` from the DB-backed `game_configs` row added in CS52-7c, with the code-level defaults from CS52-1 used as fallback. Reject or ignore client-supplied overrides for these fields; remove the host-picks-rounds dropdown from the room-creation UI. Add a server-side test that asserts a client cannot influence round count or inter-round delay. | ⬜ Pending | Depends on CS52-7c. |
| CS52-7c | **DB-backed game shape config + admin route.** Implement the `game_configs` table from CS52-1: one row per mode (`ranked_freeplay`, `ranked_daily`, `multiplayer`, others as needed) with columns for `rounds`, `round_timer_ms`, `inter_round_delay_ms`, plus an `updated_at` audit column. Loader uses an **in-process `Map` cache with 24h TTL**; on cache miss, reads the row and falls back to the **code-level default constants** when no row exists so a fresh DB always boots to a working game. Implement the admin route `PUT /api/admin/game-configs/:mode` gated by `SYSTEM_API_KEY` with payload validation (`rounds ∈ [1,50]`, `round_timer_ms ∈ [5000,60000]`, `inter_round_delay_ms ∈ [0,10000]`); the route busts the local cache on write so operators see their change take effect immediately on the same instance. Wire Ranked Free Play (CS52-3) and Ranked Daily to read from this loader. | ⬜ Pending | Foundation for runtime configurability across all server-authoritative modes. Code default is the source of truth at boot; DB row overrides per environment. |
| CS52-7d | **Multiplayer storage + scoring path unification.** Refactor `server/ws/matchHandler.js` so a completed match writes through the shared core scoring service from CS52-3 and persists as **one `ranked_sessions` row per (match, player)** plus N `ranked_session_events` rows (per-player, per-answer), batch-written in a single transaction on match completion. Match metadata (`match_id`, `room_code`, `started_at`, `finished_at`) is duplicated across the participant rows of the same match — that's the I-β tradeoff for query parity with single-player Ranked. WS handler keeps the live in-process state machine (transport stays WS); only the persistence + scoring layer is shared. Half/abandoned matches do not persist (existing behaviour — disconnect mid-match = no score row). The legacy `POST /api/scores` write path from multiplayer is removed. Multiplayer leaderboard query updates if needed to read from the unified rows. | ⬜ Pending | Depends on CS52-3 (shared scoring service must exist). Eventual write on match completion is acceptable; no per-event WS→DB writes during play. |
| CS52-7e | **DB-aware degradation server-side queue (per decision #9).** Implement the `pending_writes` durable queue at `<DATA_DIR>/pending-writes/` per the schema sketch (one JSON file per request with `request_id`, `endpoint`, **`concrete_route` materialising path params (e.g. `session_id` for `/finish`)**, `user_id` resolved at queue time, `payload`, `client_game_ids`). Three write paths must enqueue when `getDbUnavailability()` is non-null: `POST /api/sessions/:id/finish` (returns `202` with `queuedRequestId`), `POST /api/sync` (returns `202` with `queuedRequestIds`, **mutually exclusive with the 200-response `acked`/`rejected`/`entities` fields**), and **multiplayer match-completion writes from the WS handler** (synthetic `endpoint: "INTERNAL multiplayer-match-completion"`). The drain worker is invoked **only** from inside a real request: post-commit hook on the next successful DB write, or from inside the request that triggered the lazy-init-success transition (no timer, no scheduler). Drain calls the same internal write functions the original request would have called (NOT a re-issued HTTP fetch); idempotency via `(user_id, client_game_id)` upsert for `/sync`, via `ranked_sessions.id` already-finished short-circuit for `/finish`. Failed files move to `<DATA_DIR>/pending-writes/dead/`. The `unavailable` reason and friendly messages are centralised so CS56's stale-cache fallback can reuse them. (Client-side `connectivity.state` machine + Ranked-entry-point disabling is implemented in CS52-4.) | ⬜ Pending | Depends on CS52-5 (idempotent record) and CS52-3 (sessions API). Closes the cold-DB / free-tier UX gap exposed in CS53; folds in what was briefly drafted as CS57. |
| CS52-8 | **Tests.** E2E coverage: Ranked Free Play happy path, **streaming dispatch (round N+1 not visible to client until /next-round; /next-round returns 425 if called before inter_round_delay_ms)**, Ranked Daily one-shot enforcement, **server-derived timing wins over a forged client_time_ms (cheater submitting `client_time_ms=51` for every answer scores per the actual server-measured elapsed_ms)**, **cross-midnight Ranked Daily: session created 23:59 UTC and finished 00:00:30 UTC consumes the previous day's quota and does NOT block the new day's Ranked Daily**, **concurrent active-session race: two near-simultaneous POST /api/sessions for the same user produce exactly one 200 + one 409 (enforced by UNIQUE INDEX, not application logic)**, offline → sync → cross-device visibility, anti-cheat rejections (out-of-order, impossible elapsed_ms, expired, double session, daily replay), **in-band reconciliation: an expired in_progress row is converted to abandoned by the next session-create call (NOT by any timer); abandoned and expired sessions do NOT block the next Ranked Daily**, leaderboard filter (`ranked` / `offline` / `all` produces the expected row sets), **leaderboard variant routing: GET /api/scores/leaderboard?variant=daily returns Daily-only rows; without variant returns 400**, multiplayer config locked (client override ignored), multiplayer match completion writes correct number of `ranked_sessions` rows + event rows, **multiplayer match completion during db-unavailable enqueues a Variant-C pending_writes file and the drain replays correctly when DB returns (correct rows + events for all participants, idempotent on match_id)**, DB config override changes round count for the next session, DB config row missing → code defaults applied, admin route validation rejects out-of-bounds payloads, admin route cache-bust takes effect immediately, `/api/sync` payload-hash conflict returns rejected, **`/api/sync` 202 response never contains acked/rejected/entities (mutual exclusivity)**, **client-side dedupe: while in db-unavailable, repeated sync triggers within retryAfterMs do not re-enqueue the same client_game_id**, **silent token refresh on boot does NOT fire /api/sync (no DB-touching request without a user gesture)**, **connectivity precedence: 401 + simultaneous network failure ends in auth-expired, not network-down**, **claim-prompt decline leaves L1 untouched and re-surfaces on next sign-in**, sign-out demotes L1 to guest + clears L2 + aborts in-flight sync. Schema migration test (legacy backfill, daily_utc_date column added, both new UNIQUE INDEXes present). All of `npm run lint && npm test && npm run test:e2e` pass. | ⬜ Pending | Per-task container validation (`npm run container:validate`) is required for every task that changes server/client/DB code, per [INSTRUCTIONS.md § Database & Data](../../../INSTRUCTIONS.md#database--data). CS52-9 is the production-shape end-to-end gate. |
| CS52-9 | **Local production-shape validation (MSSQL + HTTPS + OTLP).** Run the full `npm run dev:mssql` stack (MSSQL 2022 + app + Caddy HTTPS proxy + OTLP collector — see [INSTRUCTIONS.md § MSSQL Local Development](../../../INSTRUCTIONS.md#mssql-local-development)) and exercise every CS52 surface end-to-end against real MSSQL (not SQLite). Required scenarios: (a) full Ranked Free Play and Ranked Daily flows complete with server-authoritative scoring, including streaming dispatch via Caddy HTTPS; (b) **cold-start (`npm run dev:mssql:coldstart`) → Ranked entry points disabled → Local play succeeds → 202 queue accumulates → DB warms → drain replays all 3 `pending_writes` variants idempotently → no duplicate rows**; (c) multiplayer match completion writes the I-β shape correctly under MSSQL; (d) admin route `PUT /api/admin/game-configs/:mode` survives container restart (cache cold + DB row read), and a deletion of the row falls back cleanly to code defaults; (e) the schema migration runs cleanly against an empty MSSQL DB, and against an MSSQL DB seeded with a snapshot of legacy `scores` rows — backfill produces the expected `source='legacy'` count and the new UNIQUE INDEXes apply without conflict; (f) OTLP collector receives spans for all the new endpoints (`/api/sessions`, `/next-round`, `/answer`, `/finish`, `/api/sync`, admin route) — visible in the local OTLP UI. Capture pass/fail per scenario in CS52-9's PR body; produce a "ready for staging" attestation comment. | ⬜ Pending | Depends on CS52-2 through CS52-8 all merging. Single PR — small (test-script + docs); the bulk of the value is the validation report itself. |
| CS52-10 | **Staging deploy + validation.** Trigger `staging-deploy.yml` (the in-CI Ephemeral Smoke Test job is the enforced pre-prod gate per [INSTRUCTIONS.md Quick Reference](../../../INSTRUCTIONS.md)). After the deploy lands, run **operator validation against `gwn-staging`** (note: staging is at `minReplicas=0` per CS58, so the first request will cold-wake — that's part of the test): (a) end-to-end Ranked Daily completes through Caddy + Container Apps + Azure SQL; (b) Ranked Free Play with concurrent active-session race verified (two parallel `POST /api/sessions` from same user → one 200, one 409); (c) `/api/sync` happy path + cold-DB 202 path + drain replay verified by intentionally hitting an arbitrary write while the replica is asleep; (d) admin route `PUT /api/admin/game-configs/multiplayer` flips `rounds` to 7, next match honours it, then revert; (e) App Insights query confirms requests rows for the new endpoints; (f) **schema migration ran cleanly on Azure SQL** (verify `idx_ranked_sessions_user_active` and `idx_ranked_sessions_user_daily` exist; legacy backfill count matches expected). Record results in CS52-10's PR body or a comment on the staging-deploy run. **No code change in this task — it's the validation gate.** | ⬜ Pending | Depends on CS52-9. Use the operator probe procedure in [OPERATIONS.md § Waking staging for ad-hoc validation](../../../OPERATIONS.md#waking-staging-for-ad-hoc-validation). |
| CS52-11 | **Production deploy + validation + closeout.** Dispatch `prod-deploy.yml` and **surface the approval gate prominently to the user** per [INSTRUCTIONS.md § Production deploys](../../../INSTRUCTIONS.md#production-deploys--approval-gate-is-on-the-user) — the run sits in `waiting` until the user clicks Approve. After deploy lands and traffic shifts: (a) verify Ranked Free Play and Ranked Daily complete end-to-end against prod Azure SQL; (b) verify the new endpoints in App Insights (request count, latency p50/p95, no 5xx surge); (c) verify `idx_ranked_sessions_user_active` and `idx_ranked_sessions_user_daily` exist in prod DB; (d) verify legacy backfill count matches expected; (e) verify the `/api/admin/game-configs/:mode` route is reachable but returns 401 without `SYSTEM_API_KEY`; (f) **soak window (60 minutes minimum):** monitor App Insights + container logs for any drain-worker errors, dead-letter files, or unexpected 409/425 rates. If clean, **closeout:** move clickstop to `project/clickstops/done/`, comment on issue #198 with the resolution and link to the merged PRs, update CONTEXT.md. If anything regresses, roll back per [`prod-deploy.yml` rollback path](../../../.github/workflows/prod-deploy.yml). **No code change in this task — it's deploy-and-validate-and-closeout.** | ⬜ Pending | Depends on CS52-10 (clean staging soak). Production deploy approval is on the user. |

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
- **Server-derived ranked timing:** for every Ranked answer the server computes `elapsed_ms = received_at - round_started_at` and stores that as the score input. A test must demonstrate that a forged client `client_time_ms=51` does NOT produce a maxed-out speed bonus — the score reflects actual server-measured elapsed time.
- **In-band session reconciliation:** at the top of `POST /api/sessions`, `/answer`, and `/finish`, any of the user's `in_progress` rows whose `expires_at < now` is updated to `status='abandoned'`. No background process touches the DB. A test must demonstrate that an expired in-progress Ranked Daily does NOT block the user from starting a new Ranked Daily within the same UTC day.
- **`POST /api/sync` 202 mutual exclusivity:** when the server returns `202`, the response body contains `queuedRequestIds` and `retryAfterMs` only — never `acked`, `rejected`, or `entities`. Client must treat the entire batch as queued.
- **Client-side dedupe in `db-unavailable`:** while the connectivity state is `db-unavailable`, repeated sync triggers within `retryAfterMs` of a record's `lastQueuedAt` must NOT re-include that record in the next request. A test must demonstrate that 5 rapid `Sync now` clicks in `db-unavailable` produce 5 server-side requests but only 1 `pending_writes` file per record.
- **Connectivity precedence:** when multiple failure signals fire near-simultaneously, the resulting state follows the precedence `auth-expired > network-down > db-unavailable > ok`. A test must demonstrate that a request that returns 401 followed by a network drop on retry ends in `auth-expired`, not `network-down`.
- **Multiplayer DB-unavailable replay:** when `getDbUnavailability()` is non-null at multiplayer match end, the WS handler enqueues a `pending_writes` file (synthetic endpoint `INTERNAL multiplayer-match-completion`) and the drain worker, on next successful DB write, persists the planned `ranked_sessions` participant rows + per-player `ranked_session_events` rows correctly. A test must demonstrate end-to-end recovery without losing the match.
- **Claim-prompt decline:** if the user dismisses the "claim N offline games" prompt, no records are deleted, reassigned, or auto-synced; the prompt re-surfaces on the next sign-in.
- **Streaming round-dispatch model:** `POST /api/sessions` returns ONLY round 0; subsequent rounds are obtained via `POST /api/sessions/:id/next-round`; the server timestamps `round_started_at` on dispatch so the score input is unambiguously server-controlled. `next-round` returns `425 Too Early` if called before `inter_round_delay_ms` has elapsed.
- **Ranked Daily uniqueness keyed to `daily_utc_date` (not `finished_at`):** the `ranked_sessions.daily_utc_date` column is set at session creation to the UTC date of the daily puzzle. The "already played today" check uses this column. A session created at 23:59:59 UTC and finished at 00:00:01 UTC of the next day still consumes the previous day's quota (because that's the puzzle it represents). Enforced by `idx_ranked_sessions_user_daily` UNIQUE INDEX at the DB layer.
- **Multiplayer DB-unavailable replay (Variant C of `pending_writes`):** when `getDbUnavailability()` is non-null at multiplayer match end, the WS handler enqueues a `pending_writes` file with `endpoint: "INTERNAL multiplayer-match-completion"` containing the per-participant `ranked_session_id` (pre-allocated), config snapshot, and per-participant events. Drain replays in a single transaction, idempotent on `match_id`.
- **Concurrent active-session race:** two near-simultaneous `POST /api/sessions` calls for the same user must NOT both succeed. Enforced by `idx_ranked_sessions_user_active` UNIQUE INDEX on `ranked_sessions(user_id) WHERE status='in_progress'`. The losing INSERT is caught and converted to a 409 response.
- **Daily LB has its own contract:** `GET /api/scores/leaderboard?variant=daily&source=…`. Daily LB cache keys are `leaderboard:daily:ranked` and `leaderboard:daily:offline`, distinct from `leaderboard:freeplay:*`. The `all` filter is computed client-side from the union of ranked+offline.
- **Boot-quiet trigger discipline:** `/api/sync` is gestured-driven only. **Silent token refresh (no user gesture, e.g. boot-time stored-token validation) is NOT a sync trigger** — must wait for the next user gesture (triggers 3–5).
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
