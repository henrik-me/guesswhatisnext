# Project Context — Guess What's Next

This file tracks the current state of the project: what's been done, what's next, and any active decisions or blockers.

> **Last updated:** 2026-03-30

---

## Project Status: ✅ Phases 1–5 Complete, Phase 6/8/10 Mostly Done — Phases 7/9 Planned

### Development Workflow

Parallel work uses **fixed worktree slots** (`wt-1` through `wt-4`) with task-specific branch names.
Each agent pushes its branch to origin and merges to main remotely. The main agent pulls after each merge.

Worktree root folders are named `gwn<suffix>-worktrees` where `<suffix>` is the remaining text
after removing the repo name from the clone folder (see INSTRUCTIONS.md § Parallel Agent Workflow).

| Slot | Path | Port | Status |
|---|---|---|---|
| main | `C:\src\guesswhatisnext<suffix>` | 3000 | Orchestration, sequential work |
| wt-1 | `C:\src\gwn<suffix>-worktrees\wt-1` | 3001 | Available |
| wt-2 | `C:\src\gwn<suffix>-worktrees\wt-2` | 3002 | Available |
| wt-3 | `C:\src\gwn<suffix>-worktrees\wt-3` | 3003 | Available |
| wt-4 | `C:\src\gwn<suffix>-worktrees\wt-4` | 3004 | Available |

**Current workflow (pre-branch-protection):** Agent pushes branch → merges to main on remote → pushes main.
**Future workflow (post-branch-protection):** Agent pushes branch → creates PR → CI + review → merge via GH UI.

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
| 15 | Leaderboard UI | ✅ Done | 14 | Rankings display integrated into leaderboard screen |
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
| 22 | Enhanced health endpoint | ✅ Done | 21 | Deep checks (DB, WS, disk, uptime), version, environment |
| 23 | Local container dev | ✅ Done | — | Dockerfile, docker-compose.yml, .dockerignore, local dev in container |
| 27 | Puzzles to DB | ✅ Done | 21 | Puzzles table, auto-seed 22 puzzles, API with filters, client fetch with fallback |
| 28 | Puzzle expansion | ✅ Done | 27 | 287 puzzles across 16 categories (was 22 across 5) |
| 29 | Achievements | ✅ Done | 21 | 12 achievements, unlock logic, API, frontend grid, toast notifications |
| 30 | Player profiles | ✅ Done | 29 | Unified profile screen with stats, achievements, match history |
| 31 | Settings & audio | ✅ Done | — | Web Audio API sounds, light/dark theme, timer duration, settings screen |
| 32 | Game enhancements | ✅ Done | 27 | Difficulty selector, skip button, confetti celebration |

**Parallelism:** All Phase 3 work complete.

## Phase 4 — Infrastructure & Deployment

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 24 | Azure infrastructure | ✅ Done | 23 | CI/CD pipeline, GHCR, staging + prod Container Apps |
| 25 | CI/CD pipeline | ✅ Done | 24 | ESLint, CODEOWNERS, PR template, path filters |
| 26 | Health monitor | ✅ Done | 22, 25 | Retry logic, deep checks, local health-check scripts |

**Parallelism:** All Phase 4 work complete.

## Phase 5 — Multi-Player Expansion (2→10 Players)

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 33 | Room & lobby protocol | ✅ Done | — | maxPlayers (2-10), host start-match, lobby-state, host transfer |
| 34 | N-player game logic | ✅ Done | 33 | Rankings, disconnect handling, last-player-standing, ties |
| 35 | Lobby UI for N players | ✅ Done | 33 | Host controls (max players, rounds), player roster, start button |
| 36 | N-player match UI | ✅ Done | 34, 35 | Dynamic scoreboard, medals, N-player round results |
| 37 | Reconnection & edge cases | ✅ Done | 34, 36 | Reconnect state restore, host transfer, toast notifications |
| 38 | N-player rematch | ✅ Done | 37 | N-player rematch with host control, ready-up flow, 4 tests |
| 39 | Testing & polish | ✅ Done | 38 | Integration tests, CSS cleanup, doc updates |

**Parallelism:** All Phase 5 work complete.

## Phase 6 — Production Hardening

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 40 | Remove debug logging | ✅ Done | — | Stripped debug console.log from client code (PR #14) |
| 41 | Environment variables | ✅ Done | — | server/config.js centralizes env vars with startup validation (PR #14) |
| 42 | HTTPS & secure cookies | ⬜ Pending | 41 | TLS enforcement, WSS, secure headers |

## Phase 7 — Quality & Testing

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 43 | Browser E2E tests | ⬜ Pending | 40 | Playwright tests for full UI flows |
| 44 | Load testing | ⬜ Pending | 41 | k6/Artillery for concurrent WS + API stress |

## Phase 8 — User Experience

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 45 | Mobile PWA | ✅ Done | — | manifest.json, service worker, offline fallback (PR #15) |
| 46 | Share links | ✅ Done | — | Deep link ?room=CODE, copy-link button (PR #15) |
| 47 | Multiplayer sound effects | ✅ Done | — | Opponent answered, countdown, win/loss fanfare (PR #15) |
| 48 | Spectator mode | ⬜ Pending | 42 | Read-only WS, spectator count in lobby |

## Phase 9 — Content & Growth

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 49 | Puzzle expansion (200+) | ⬜ Pending | — | AI-assisted generation, broader categories |
| 50 | Community puzzle submissions | ⬜ Pending | 49 | Submit form, moderation queue, attribution |

**Parallelism:** Phase 6 is sequential. Phase 7 can start now; its dependencies (40 and 41) are done. Phase 8 tasks 45–47 done; 48 depends on 42. Phase 9 can start anytime. In Phase 10, the only remaining item is task 56.

## Phase 10 — CI/CD Pipeline Rework

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 51 | Simplify Dockerfile | ✅ Done | — | Single-stage node:22-slim; better-sqlite3 has prebuilds, no build tools needed |
| 52 | Slim down PR CI checks | ✅ Done | 51 | New ci.yml with parallel lint + test only; no Docker build in PR checks |
| 53 | Remove push-to-main deploy pipeline | ✅ Done | 52 | ci-cd.yml gutted to disabled placeholder; push to main no longer triggers any deployment |
| 54 | Staging deploy on merge | ✅ Done | 53 | New staging-deploy.yml: triggers on push to main, builds Docker image, pushes to GHCR, runs ephemeral smoke tests, fast-forwards release/staging, then (with manual approval) deploys to Azure staging |
| 55 | Manual production deploy workflow | ✅ Done | 54 | prod-deploy.yml: manual workflow_dispatch with image tag + confirmation, validates image exists in GHCR, deploys to production environment (with approval gate), runs health verification, auto-rollback on failure (PR #21) |
| 56 | Unified infra setup script | ⬜ Pending | 55 | Merge deploy.sh + setup-github.sh into one script: auto-generates secrets, creates Azure service principal, sets all GitHub secrets/variables, runs verification health check |

**Parallelism:** Tasks 51–56 are sequential. Phase 10 is independent of Phases 6–9.

## Phase 11 — Test Infrastructure Integration

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 57 | E2E tests in PR CI | ⬜ Pending | 43 | Add Playwright job to ci.yml: install browsers, start server, run E2E alongside lint+test |
| 58 | E2E tests in staging validation | ⬜ Pending | 57 | Run Playwright against ephemeral staging container in staging-deploy.yml after smoke tests |
| 59 | Load test integration | ⬜ Pending | 44 | Decide where/when load tests run: on-demand workflow_dispatch, nightly schedule, or pre-prod gate |

**Parallelism:** Tasks 57 and 58 are sequential. Task 59 is independent and can start anytime after 44 merges. Phase 11 depends on PRs #32 (task 43) and #34 (task 44) being merged first.

### Deployment Architecture

```
  Developer pushes to main
         │
         ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  PR checks (ci.yml)                                         │
  │  [Lint] + [Test]  (parallel)                                │
  └──────────────────────────────────────────────────────────────┘

  On merge to main (staging-deploy.yml)
         │  (concurrency: cancel superseded)
         ▼
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │  Staging Pipeline                                                                │
  │                                                                                  │
  │  [Build+Push to GHCR] → [Ephemeral smoke tests] → [ff release/staging]          │
  │                           (container in CI)              │                       │
  │                                                   [⏸️ Approval]                  │
  │                                                          │                       │
  │                                                [Deploy Azure staging → Verify]   │
  └──────────────────────────────────────────────────────────────┬───────────────────┘
                                                                 │
                                                                 ▼
                                                      ┌───────────────────────┐
                                                      │  STAGING              │
                                                      │  gwn-staging          │
                                                      │  Container Apps       │
                                                      │  Scale-to-zero ($0)   │
                                                      └───────────────────────┘

  Manual trigger (prod-deploy.yml)
         │  (convention: only deploy images validated in staging)
         ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Production Pipeline                                                │
  │                                                                     │
  │  [Deploy same image to prod] → [Verify] → [Auto-rollback on fail]  │
  └──────────────────────────────────────────┬──────────────────────────┘
                                             │
                                             ▼
                                  ┌───────────────────────┐
                                  │  PRODUCTION           │
                                  │  gwn-production       │
                                  │  Container Apps       │
                                  │  Auto-rollback on fail│
                                  └───────────────────────┘
                                             ▲
  GitHub Actions Health Monitor (every 5 min)┘
         │ on failure → GitHub Issue
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

### Key Design Decisions (Phase 10 — CI/CD Pipeline Rework)

| Decision | Choice | Rationale |
|---|---|---|
| Docker base image | node:22-slim (single-stage) | better-sqlite3 ships prebuilt binaries; no python3/make/g++ needed. Simpler Dockerfile at cost of ~200MB vs ~100MB image |
| PR CI checks | Lint + test only (no Docker build) | Docker build is slow, hits Docker Hub rate limits, and isn't needed for PR validation |
| Push to main | No deployment triggered | Push to main only validates via PR checks; deployment is decoupled and goes through staging first |
| Staging branch strategy | Fast-forward release/staging to main HEAD | Simpler than cherry-picking; no history divergence; staging always matches main |
| Staging trigger | On merge to main (with concurrency cancel) | Immediate feedback; concurrency group cancels superseded runs for rapid merges |
| Ephemeral staging | Docker container in GitHub Actions | $0 infra cost; sufficient for automated smoke tests (health, auth, scores) |
| Azure staging | Behind manual approval after ephemeral passes | Persistent environment for manual QA; only promoted after automated validation |
| Production deploy | Manual workflow_dispatch from release/staging | Production only deploys code that has been validated in staging; never directly from main |
| Production gate | Requires staging environment green | Cannot trigger prod deploy unless the latest staging deployment succeeded |

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

- [x] Game engine accepts puzzles as arguments (not hardcoded imports)
- [x] Score/result objects are plain JSON-serializable
- [x] Answer submission uses callbacks (not direct DOM writes)
- [x] Screen navigation supports adding new screens without refactoring
- [x] No global mutable state — single state object pattern

---

## Blockers / Open Questions

*None currently.*
