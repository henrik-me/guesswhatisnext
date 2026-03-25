# Project Context — Guess What's Next

This file tracks the current state of the project: what's been done, what's next, and any active decisions or blockers.

> **Last updated:** 2026-03-25

---

## Project Status: 🟡 Planning Complete — Ready to Build

---

## Phase 1 — Client-Side Game

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Project setup | ⬜ Pending | File structure, index.html, link CSS/JS |
| 2 | Puzzle data | ⬜ Pending | 15–20 starter puzzles (emoji + image) |
| 3 | UI screens & CSS | ⬜ Pending | Home, category select, game, result, game-over |
| 4 | Game engine | ⬜ Pending | Core loop: puzzle → timer → answer → score → next |
| 5 | Timer & scoring | ⬜ Pending | Countdown bar, speed bonus, streak multiplier |
| 6 | Free-play mode | ⬜ Pending | Category select, random order, 10 rounds |
| 7 | Daily challenge | ⬜ Pending | Date-seeded puzzle, one attempt, share result |
| 8 | LocalStorage | ⬜ Pending | High scores, daily state, stats |
| 9 | Polish | ⬜ Pending | Animations, transitions, mobile pass |
| 10 | Image puzzles | ⬜ Pending | Image assets, rendering in engine |

## Phase 2 — Backend & Multiplayer

| # | Task | Status | Notes |
|---|---|---|---|
| 11 | Backend setup | ⬜ Pending | Node.js + Express + SQLite, move to `public/` |
| 12 | Database schema | ⬜ Pending | users, scores, matches tables |
| 13 | Auth system | ⬜ Pending | Register/login, JWT, bcrypt |
| 14 | Score API | ⬜ Pending | Submit scores, leaderboard queries |
| 15 | Leaderboard UI | ⬜ Pending | Rankings display, user highlighting |
| 16 | Matchmaking | ⬜ Pending | Room codes, create/join |
| 17 | WebSocket server | ⬜ Pending | Real-time room connections |
| 18 | Head-to-head engine | ⬜ Pending | Synced puzzles, round scoring |
| 19 | Multiplayer UI | ⬜ Pending | Lobby, live match, opponent view |
| 20 | Multiplayer polish | ⬜ Pending | Reconnect, forfeit, rematch, history |

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
