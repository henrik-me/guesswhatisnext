# Project Context — Guess What's Next

This file tracks the current state of the project: what's been done, what's next, and any active decisions or blockers.

> **Last updated:** 2026-03-25

---

## Project Status: ✅ Phase 1 & Phase 2 Complete — Phase 3 In Progress — Phase 4 Planned

---

## Phase 1 — Client-Side Game

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 1 | Project setup | ✅ Done | — | File structure, index.html, link CSS/JS |
| 2 | Puzzle data | ✅ Done | 1 | 20 puzzles across 5 categories |
| 3 | UI screens & CSS | ✅ Done | 1 | Accessibility, aria, visual polish |
| 4 | Game engine | ✅ Done | 2, 3 | Full game loop, scoring, timer, answer handling |
| 5 | Timer & scoring | ✅ Done | 4 | Score breakdown, speed bonus, streak multiplier |
| 6 | Free-play mode | ✅ Done | 4 | Category select, random order, 10 rounds |
| 7 | Daily challenge | ✅ Done | 4 | Date-seeded, one attempt, Wordle-style share |
| 8 | LocalStorage | ✅ Done | 6, 7 | High scores, daily state, stats persisted |
| 9 | Polish | ✅ Done | 8 | Animations, keyboard, mobile, reduced-motion |
| 10 | Image puzzles | ✅ Done | 4 | 12 SVGs, 2 image-type puzzles |

**Parallelism:** 2 & 3 parallel → 4 → 5, 6, 7, 10 parallel → 8 → 9

## Phase 2 — Backend & Multiplayer

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 11 | Backend setup | ✅ Done | 10 | Express + SQLite + WS, files moved to public/ |
| 12 | Database schema | ✅ Done | 11 | users, scores, matches tables with indexes |
| 13 | Auth system | ✅ Done | 12 | Register/login, JWT, bcrypt, middleware |
| 14 | Score API | ✅ Done | 13 | Submit scores, leaderboard (all/weekly/daily) |
| 15 | Leaderboard UI | ⬜ Pending | 14 | Rankings display, user highlighting |
| 16 | Matchmaking | ✅ Done | 13 | Room codes, create/join endpoints |
| 17 | WebSocket server | ✅ Done | 11 | Room-based WS connections on /ws |
| 18 | Head-to-head engine | ✅ Done | 16, 17 | Server match logic, scoring, puzzle sync |
| 19 | Multiplayer UI | ✅ Done | 18 | Auth, lobby, live match, result screens |
| 20 | Multiplayer polish | ✅ Done | 15, 19 | Reconnect, rematch, match history, forfeit |

**Parallelism:** 14 & 16 parallel; 16 & 17 parallel → 18; 15 & 19 → 20

## Phase 3 — Security & Game Features

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 21 | Auth hardening | ✅ Done | — | System account, API key auth, rate limiting, all endpoints auth'd |
| 22 | Enhanced health endpoint | ⬜ Pending | 21 | Deep checks (DB, WS, disk, uptime), system-auth only |
| 23 | Local container dev | ✅ Done | — | Dockerfile, docker-compose.yml, .dockerignore, local dev in container |
| 27 | Puzzles to DB | ⬜ Pending | 21 | Puzzles table, seed script, API endpoint, client fetch |
| 28 | Puzzle expansion | ⬜ Pending | 27 | 60+ new puzzles, 7 new categories |
| 29 | Achievements | ⬜ Pending | 21 | Achievements table, unlock logic, 10+ badges |
| 30 | Player profiles | ⬜ Pending | 29 | Profile screen, stats, achievements, match history |
| 31 | Settings & audio | ⬜ Pending | — | Sound effects, theme, timer duration, settings screen |
| 32 | Game enhancements | ⬜ Pending | 27 | Difficulty selector, skip, answer animation, confetti |

**Parallelism:** 22, 27, 29, 31 can all start now (no unfinished deps). 28+32 after 27. 30 after 29.

## Phase 4 — Infrastructure & Deployment

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 24 | Azure infrastructure | ⬜ Pending | 23 | Container Apps Environment + gwn-staging + gwn-prod apps, GHCR |
| 25 | CI/CD pipeline | ⬜ Pending | 24 | Build once → staging → approval → promote to prod → verify → rollback |
| 26 | Health monitor | ⬜ Pending | 22, 25 | GH Actions cron every 5 min, creates issues on failure |

**Parallelism:** Phase 4 runs independently from Phases 3 & 5. Step 26 bridges Phases 3 & 4 (needs health endpoint from Phase 3 + CI/CD from Phase 4).

## Phase 5 — Multi-Player Expansion (2→10 Players)

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 33 | Room & lobby protocol | ⬜ Pending | — | Schema (max_players, host_user_id), lobby-state broadcasts, host start-match, join validation |
| 34 | N-player game logic | ⬜ Pending | 33 | Rewrite endMatch for rankings, disconnect→drop, match continues with ≥2 players |
| 35 | Lobby UI for N players | ⬜ Pending | 33 | Host controls (max players, rounds, start button), player roster, waiting for host |
| 36 | N-player match UI | ⬜ Pending | 34, 35 | Dynamic scoreboard, N-player round results, placement-based match-over |
| 37 | Reconnection & edge cases | ⬜ Pending | 34, 36 | Full state restore, host transfer, full-room rejection, last-player-standing |
| 38 | N-player rematch | ⬜ Pending | 37 | Host "New Match" flow, ready-up for non-hosts, auto-join lobby |
| 39 | Testing & polish | ⬜ Pending | 36, 37, 38 | N-player server tests, lobby/match UI tests, animations |

**Parallelism:** 34 & 35 parallel after 33; 36 after both; 37+38 sequential; 39 after all. Phase 5 can run in parallel with Phases 3 & 4.

### Deployment Architecture

```
  Developer pushes to main
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
  │  GitHub Actions CI/CD Pipeline                                                               │
  │                                                                                              │
  │  [Lint+Test] → [Build Docker] → [Staging] → [Smoke] → [Approval] → [Prod] → [Verify/Roll.] │
  └──────────────────────────────────┬───────────────────────────────────┬────────────────────────┘
                                     │                                   │
                                     ▼                                   ▼
                          ┌───────────────────────┐       ┌───────────────────────┐
                          │  STAGING               │       │  PRODUCTION           │
                          │  gwn-staging            │       │  gwn-prod             │
                          │  Container Apps        │       │  Container Apps       │
                          │  Consumption plan      │       │  Consumption plan     │
                          │  Same Docker image     │       │  Same Docker image    │
                          │  Scale-to-zero ($0)    │       │  Scale-to-zero ($0+)  │
                          └───────────────────────┘       │  Auto-rollback on fail│
                                                          └───────────────────────┘
                                                                   ▲
  GitHub Actions Health Monitor (every 5 min) ─────────────────────┘
         │ on failure
         ▼
  GitHub Issue: "service health issue: {error}"
```

### Key Design Decisions (Phase 3 — Security & Game Features)

| Decision | Choice | Rationale |
|---|---|---|
| System auth | API key (X-API-Key header) | Simple, no JWT expiry concerns for automated clients |

### Key Design Decisions (Phase 4 — Infrastructure & Deployment)

| Decision | Choice | Rationale |
|---|---|---|
| Staging host | Container Apps (Consumption) | Environment parity with prod, scale-to-zero, full WebSocket support |
| Production host | Container Apps (Consumption) | Pay-per-use, scale-to-zero, WebSocket support |
| Container registry | GitHub Container Registry | Free for private repos, integrated with GH Actions |
| Staging→Prod gate | GH Environment manual approval | Prevents untested code reaching production |
| Health monitoring | GitHub Actions cron | No extra infra, creates issues in same repo |

### Key Design Decisions (Phase 5 — Multi-Player Expansion)

| Decision | Choice | Rationale |
|---|---|---|
| Max players per room | 2–10 (host configurable) | Flexible; 2 preserves current behavior, 10 caps complexity |
| Room host model | Creator is host, controls start | Clean UX; host decides when enough players have joined |
| Host disconnect (lobby) | Auto-transfer to next player | Prevents room death from host leaving |
| Player disconnect (active) | 30s reconnect → drop (score frozen) | Match continues for remaining players (≥2) |
| Winner logic | Full ranking with tie handling | Placements (1st/2nd/3rd…) instead of binary win/lose |
| Spectator mode | Deferred | Not needed for initial N-player support; add later |
| Rematch flow | Host "New Match" → auto-join lobby | Simpler than N-player ready-up counting |

---

## Key Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Frontend stack | Vanilla HTML/CSS/JS | No build tools, fast iteration, lightweight |
| Backend stack | Node.js + Express | Same language as frontend, easy WebSocket support |
| Database | SQLite → PostgreSQL | Start simple, migrate when scaling |
| Multiplayer | Both async + real-time | Leaderboards for casual, head-to-head for competitive |
| Multi-player rooms | 2–10 players, host-controlled | Host creates room, configures settings, starts when ready |
| Multi-player disconnect | Drop after 30s, match continues | Avoids ending match for all when one player leaves |
| Multi-player rankings | Full placement with ties | More meaningful than binary win/lose for N players |
| Puzzle format | Emoji/text + images | Start with emoji, layer in images |
| Timing | Timed rounds, speed bonus | Adds excitement and skill differentiation |
| Staging infra | Container Apps (not F1) | Environment parity with prod, same Dockerfile + deploy method |
| Production infra | Container Apps (Consumption) | Pay-per-use, scale-to-zero, WebSocket support |
| Container registry | GitHub Container Registry | Free for private repos, integrated with GH Actions |
| CI/CD promotion | Build once, promote image | Same image bytes in staging and prod — no rebuild, no drift |
| Staging→Prod gate | GH Environment manual approval | Prevents untested code reaching production |
| AI orchestration | Copilot CLI (not Squad) | Squad evaluated but deferred — see below |

## Tools Evaluated

### Squad (bradygaster/squad) — Evaluated 2026-03-25, Deferred

[Squad](https://github.com/bradygaster/squad) is a multi-agent AI orchestration framework for GitHub Copilot. It defines a team of AI agent specialists (Lead, Frontend, Backend, Tester, etc.) that persist in the repo as `.squad/` files, accumulate knowledge across sessions, run in parallel, and route tasks automatically.

**Why not now:**
- **Alpha software** — APIs and CLI commands may change between releases
- **Overhead for project size** — Single developer, 12 well-defined remaining tasks with clear dependency chains. Squad is designed for larger teams/projects with many parallel workstreams
- **Existing documentation overlap** — INSTRUCTIONS.md, CONTEXT.md, and plan.md already serve the role of Squad's `decisions.md` + agent `history.md`
- **Limited parallelism benefit** — Most of our tasks have dependency chains; few are truly independent
- **Setup cost** — Defining agents, routing rules, and casting configuration takes time better spent implementing

**Where it could help (future):**
- Puzzle content expansion — a "Content Creator" agent that learns puzzle schema
- If the project goes open-source with multiple contributors
- Long-running maintenance phase with many parallel feature tracks

**Revisit criteria:**
- Squad reaches beta/stable release
- Project gains multiple active contributors
- We enter an open-ended feature development phase without clear dependency chains

## Active Design Notes

These should be kept in mind throughout Phase 1 development:

- [ ] Game engine accepts puzzles as arguments (not hardcoded imports)
- [ ] Score/result objects are plain JSON-serializable
- [ ] Answer submission uses callbacks (not direct DOM writes)
- [ ] Screen navigation supports adding new screens without refactoring
- [ ] No global mutable state — single state object pattern

---

## Blockers / Open Questions

*None currently.*
