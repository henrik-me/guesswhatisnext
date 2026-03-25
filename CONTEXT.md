# Project Context — Guess What's Next

This file tracks the current state of the project: what's been done, what's next, and any active decisions or blockers.

> **Last updated:** 2026-03-25

---

## Project Status: ✅ Phase 1 Complete — Ready for Phase 2

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
| 18 | Head-to-head engine | ⬜ Pending | 16, 17 | Synced puzzles, round scoring |
| 19 | Multiplayer UI | ⬜ Pending | 18 | Lobby, live match, opponent view |
| 20 | Multiplayer polish | ⬜ Pending | 15, 19 | Reconnect, forfeit, rematch, history |

**Parallelism:** 14 & 16 parallel; 16 & 17 parallel → 18; 15 & 19 → 20

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
