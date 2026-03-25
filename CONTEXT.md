# Project Context — Guess What's Next

This file tracks the current state of the project: what's been done, what's next, and any active decisions or blockers.

> **Last updated:** 2026-03-25

---

## Project Status: ✅ Phase 1 & Phase 2 Complete — Phase 3 Planned

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

## Phase 3 — Azure, Security, Content & Monitoring

| # | Task | Status | Depends On | Notes |
|---|---|---|---|---|
| 21 | Auth hardening | ⬜ Pending | — | System account, API key auth, rate limiting, all endpoints auth'd |
| 22 | Enhanced health endpoint | ⬜ Pending | 21 | Deep checks (DB, WS, disk, uptime), system-auth only |
| 23 | Local container dev | ⬜ Pending | — | Dockerfile, docker-compose.yml, .dockerignore, local dev in container |
| 24 | Azure infrastructure | ⬜ Pending | 23 | F1 staging (zip deploy) + Container Apps Consumption prod (Docker/GHCR) |
| 25 | CI/CD pipeline | ⬜ Pending | 24 | GH Actions: lint → test → staging (auto) → approval gate → prod |
| 26 | Health monitor | ⬜ Pending | 22, 25 | GH Actions cron every 5 min, creates issues on failure |
| 27 | Puzzles to DB | ⬜ Pending | 21 | Puzzles table, seed script, API endpoint, client fetch |
| 28 | Puzzle expansion | ⬜ Pending | 27 | 60+ new puzzles, 7 new categories |
| 29 | Achievements | ⬜ Pending | 21 | Achievements table, unlock logic, 10+ badges |
| 30 | Player profiles | ⬜ Pending | 29 | Profile screen, stats, achievements, match history |
| 31 | Settings & audio | ⬜ Pending | — | Sound effects, theme, timer duration, settings screen |
| 32 | Game enhancements | ⬜ Pending | 27 | Difficulty selector, skip, answer animation, confetti |

**Parallelism:** 21, 23, 31 start immediately; 22+27+29 after 21; 24 after 23; 25 after 24; 26 after 22+25

### Deployment Architecture

```
  Developer pushes to main
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  GitHub Actions CI/CD Pipeline                                         │
  │                                                                        │
  │  [Lint & Test] → [Deploy Staging] → [Smoke Test] → [Approval] → [Prod]│
  └──────────────────┬──────────────────────────────────┬──────────────────┘
                     │                                  │
                     ▼                                  ▼
          ┌──────────────────┐              ┌───────────────────────┐
          │  STAGING (F1)    │              │  PRODUCTION           │
          │  App Service     │              │  Container Apps       │
          │  $0/month        │              │  Consumption plan     │
          │  Zip deploy      │              │  Docker from GHCR     │
          │  60 CPU min/day  │              │  Scale-to-zero ($0+)  │
          └──────────────────┘              └───────────────────────┘
                                                     ▲
  GitHub Actions Health Monitor (every 5 min) ───────┘
         │ on failure
         ▼
  GitHub Issue: "service health issue: {error}"
```

### Key Design Decisions (Phase 3)

| Decision | Choice | Rationale |
|---|---|---|
| Staging host | App Service F1 (Free) | $0 cost, good enough for testing |
| Production host | Container Apps (Consumption) | Pay-per-use, scale-to-zero, WebSocket support |
| Container registry | GitHub Container Registry | Free for private repos, integrated with GH Actions |
| Staging→Prod gate | GH Environment manual approval | Prevents untested code reaching production |
| Health monitoring | GitHub Actions cron | No extra infra, creates issues in same repo |
| System auth | API key (X-API-Key header) | Simple, no JWT expiry concerns for automated clients |

---

## Key Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Frontend stack | Vanilla HTML/CSS/JS | No build tools, fast iteration, lightweight |
| Backend stack | Node.js + Express | Same language as frontend, easy WebSocket support |
| Database | SQLite → PostgreSQL | Start simple, migrate when scaling |
| Multiplayer | Both async + real-time | Leaderboards for casual, head-to-head for competitive |
| Puzzle format | Emoji/text + images | Start with emoji, layer in images |
| Timing | Timed rounds, speed bonus | Adds excitement and skill differentiation |

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
