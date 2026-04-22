# CS52 — Server-Authoritative Scoring with Offline-First Local Mode

**Status:** ⬜ Planned
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
| **Local Free Play** | Bundled in client | Bundled in client | Client | Offline OK | No — personal only |
| **Local Daily** | Bundled (date seed) | Bundled | Client | Offline OK | No — personal only |
| **Ranked Free Play** | **Server-only pool** | Server | Server (per-event) | Online required | Yes — Free Play LB |
| **Ranked Daily** | Server (date-bound, UTC) | Server | Server (per-event) | Online required | Yes — Daily LB |
| **Multiplayer** | Server (existing) | Server (existing) | Server (existing) | Online required | Yes (existing, unchanged) |

**Public leaderboards** (Free Play, Daily, Multiplayer) become **ranked-only**. They surface scores the server itself produced and can stand behind. Free Play and Daily get separate leaderboards because their round counts and timing differ — comparing them is meaningless. Ranked Free Play uses a single canonical config (proposed: 10 rounds × 15s) so within-leaderboard scores are comparable; Local Free Play stays freeform (any timer, any round count).

**Offline / Local play** remains fully functional with no connectivity. Offline scores are **personal data**: visible only to the player who created them, never published, but **synced server-side via an idempotent record format** so when the player signs in on another device they see their full history (Ranked + Local + Legacy) in their profile.

**Server achievements** unlock only from ranked sessions and multiplayer match completions (server-computed outcomes). Local play does not unlock server achievements in MVP — the alternative ("local-only trophy cabinet") is deliberately deferred to keep the clickstop bounded.

## Key design decisions

1. **Server-only ranked puzzle pool.** The answer key for ranked puzzles must never reach the client. Otherwise a cheater just reads the client-bundled answers and submits perfect per-answer events; the server's validation is theatre. Either curate a separate ranked pool or strip `answer` from any client-facing puzzle response when the puzzle is being used in a ranked session.
2. **Ranked Daily = one verified attempt/day/user; Local Daily = unlimited practice.** Same date-seeded puzzle in both modes. Trade-off: Local Daily becomes a rehearsal opportunity. Accepted because the alternative (different daily puzzles per mode) breaks the mental model and costs more than it gains.
3. **Day boundary = server UTC.** Ranked Daily's "today" is server-side. Local Daily can use client local date — it's personal anyway.
4. **One canonical Ranked Free Play config.** Proposed: `rounds=10`, `timer=15s`. Locked in CS52-1. Players who prefer custom configs play Local Free Play.
5. **Immutable offline records with idempotency.** Each offline game is an immutable record: `{client_game_id, mode, variant, score, correct_count, total_rounds, best_streak, fastest_answer_ms, completed_at, schema_version}`. Server upserts on `(user_id, client_game_id)` so retries and multi-device replays don't double-count. Replaces the two ad-hoc client queues that exist today (`gwn_pending_scores` in `app.js` + the ProgressiveLoader queue).
6. **Provenance flag on every score row.** `source ∈ {ranked, offline, legacy}`. Public leaderboard endpoints filter to `ranked`. Personal profile endpoints show all. Existing rows backfilled to `legacy` and hidden from public leaderboards by default.
7. **Anti-cheat bar.** Realistic target: defeat trivial DevTools / API cheating. Not bot-proof. Necessary controls: server-held answer key, monotonic answer order, plausible per-answer timing bounds (>50ms, <2× round timer), session expiry, one active ranked session per user, rate limiting on session creation.
8. **Multiplayer left alone in MVP.** It is already server-authoritative for puzzle/score/achievement flow (the WS handler computes everything in-process and broadcasts; client `timeMs` is the one residual trust). Aligning it onto the new sessions schema is a follow-on clickstop, not part of CS52.

## Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| CS52-1 | **Design lock-down.** Finalise: provenance vocabulary; `scores` schema migration (`source`, `variant`, `client_game_id`, `schema_version` columns); new tables (`ranked_sessions`, `ranked_session_events`); server-only ranked puzzle pool strategy (curated subset vs. answer-stripping); canonical Ranked Free Play config; anti-cheat validation rules. **Output is a design PR with the schema migration sketch and API contract — no application code yet.** | ⬜ Pending | Sequencing prereq for everything else. |
| CS52-2 | **Schema migration + ranked puzzle pool.** Apply the CS52-1 schema (additive only, per LEARNINGS.md migration policy). Create the server-only ranked pool. Backfill existing `scores` rows with `source='legacy'`. Strip `answer` from any client-facing puzzle response when the puzzle is part of a ranked session. | ⬜ Pending | Backwards-compatible; no behaviour change yet. |
| CS52-3 | **Ranked session API.** Implement `POST /api/sessions` (creates session, returns puzzles without answers), `POST /api/sessions/:id/answer` (per-event submission with server validation), `POST /api/sessions/:id/finish` (server computes final score, persists `source='ranked'`). Enforce: monotonic round order, timing bounds, session expiry, one active session per user, one Ranked Daily/day/user. | ⬜ Pending | Server-side only; client integration in CS52-4. |
| CS52-4 | **Client mode picker + Ranked flow.** Refactor `public/js/game.js` to accept either a local puzzle queue or a server session. Add Ranked entry points to Free Play and Daily screens (alongside existing Local entry points — Local is renamed to Practice in UI for clarity). Disable Ranked entry points when offline with an explanatory message. | ⬜ Pending | First user-visible change. |
| CS52-5 | **Unified offline record + idempotent sync.** Replace both existing client queues (`gwn_pending_scores` + ProgressiveLoader queue) with the immutable record format from CS52-1. Sync endpoint accepts batch upserts on `(user_id, client_game_id)`. Verify cross-device sync: play offline on device A, sign in on device B, see the offline scores in profile. | ⬜ Pending | Personal cross-device sync is the user-facing acceptance criterion. |
| CS52-6 | **Personal vs public surface separation.** Public leaderboard endpoints (`/api/scores/leaderboard`, `/api/scores/leaderboard/multiplayer`) filter to `source='ranked'`. Personal endpoints (`/api/scores/me`, profile screen) show everything. Add UI badges on profile score rows: "Ranked" / "Practice" / "Legacy". | ⬜ Pending | Where the offline / ranked split becomes visible to the player. |
| CS52-7 | **Achievement hardening.** Server achievements unlock only from `POST /api/sessions/:id/finish` (ranked) and existing multiplayer match-end. `POST /api/scores` (offline submission path) explicitly skips achievement evaluation. Document the rule in `INSTRUCTIONS.md` or `LEARNINGS.md`. | ⬜ Pending | Closes the integrity gap — the original F2 fix. |
| CS52-8 | **Tests + closeout.** E2E coverage: Ranked Free Play happy path, Ranked Daily one-shot enforcement, offline → sync → cross-device visibility, anti-cheat rejections (out-of-order, impossible timing, expired, double session, daily replay). Schema migration test (legacy backfill). Move clickstop to `done/`, comment on #198, update CONTEXT.md. | ⬜ Pending | Closeout depends on all prior tasks merging. |

## Will not be done (deliberate)

- **Local-only achievement cabinet.** Two parallel achievement systems (server + local) is confusing UX and triples the surface area for what is already an integrity-driven CS. If a "Practice achievements" feature is wanted, file it as a separate clickstop after CS52 lands.
- **Multiplayer unification with the new sessions schema.** Multiplayer is already mostly server-authoritative (the residual trust is client-reported `timeMs`, which is the same trust we apply to ranked single-player). A unification CS can come later if duplication becomes painful.
- **Per-configuration leaderboards** (one leaderboard per `(rounds, timer)` tuple). Ranked has one canonical config; players who want freeform play stay in Local. The complexity of per-config leaderboards isn't justified by the player base size.
- **Bot / automation defence beyond timing, ordering, server-held answers, session expiry, rate limiting.** Determined adversaries can drive a real browser. The MVP target is "defeat trivial DevTools / API cheating", not "stop scripted browsers."
- **Replay validation of offline scores.** Offline scores are accepted at face value because they are not on the public leaderboard — there is nothing to defend. Cheating your own personal stats hurts no-one else.

## Acceptance criteria

- New Ranked Free Play and Ranked Daily flows work end-to-end with server-authoritative scoring; the `score` value persisted to the `scores` row is computed server-side from per-answer events, not accepted from the client.
- Public leaderboards (Free Play, Daily) show only `source='ranked'` rows. Multiplayer leaderboard unchanged. Legacy rows do not appear in any public leaderboard.
- Offline play continues to work with no connectivity. Offline scores are visible only to the player who created them (in profile / personal stats); they sync to the server via idempotent records and appear on every device the player signs in to.
- Existing `scores` rows are tagged `source='legacy'` and excluded from public leaderboards. They remain visible in personal profile with a "Legacy" badge.
- Server-side validation rejects: out-of-order answer events, impossibly fast or impossibly slow timings, expired sessions, multiple concurrent ranked sessions per user, second Ranked Daily attempt per day per user.
- Server achievements unlock only from ranked sessions and multiplayer matches.
- All tests pass (`npm run lint && npm test && npm run test:e2e`); `npm run check:docs:strict` is clean.

## Open questions for CS52-1 to resolve

These are intentionally deferred from the plan to the design task so the design PR is the place where they get a single answer:

- **Canonical Ranked Free Play config:** 10 rounds × 15s is the proposal — confirm or change.
- **Ranked puzzle pool sourcing:** start by reusing the existing puzzle corpus with answers stripped on egress, or curate a separate pool from day one?
- **Legacy row visibility:** show in profile with a "Legacy" badge, or hide entirely behind a "show legacy" toggle?
- **Offline sync conflict:** if the same `client_game_id` is submitted twice from two devices with different payloads (theoretically impossible if records are immutable, but…), accept first-write or fail loudly?
- **Schema version bumps:** is `schema_version` a single integer per record (simple) or a per-field provenance map (overkill but flexible)?

## Cross-references

- [Issue #198 — Architecture review](https://github.com/henrik-me/guesswhatisnext/issues/198) — F2, Recommendation 1, Roadmap B.
- [`server/routes/scores.js`](../../../server/routes/scores.js) — current client-trusted submission path.
- [`public/js/app.js`](../../../public/js/app.js) — current `submitScore`, `queueScoreForSync`, `gwn_pending_scores` queue.
- [`public/js/progressive-loader.js`](../../../public/js/progressive-loader.js) — second client queue (CS38) that CS52-5 will fold into the unified record format.
- [`server/ws/matchHandler.js`](../../../server/ws/matchHandler.js) — multiplayer authority model that ranked single-player will mirror.
