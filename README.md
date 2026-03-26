# Guess What's Next

A browser-based puzzle game where you're shown a sequence of items — emoji, text, or images — that follow a pattern, and you must guess what comes next!

Features single-player (free play + daily challenge), global leaderboards, and real-time multiplayer (2–10 players).

## How to Play

### Single Player
1. Choose a game mode from the home screen:
   - **🎮 Free Play** — Pick a category (or random) and complete 10 rounds
   - **📅 Daily Challenge** — One puzzle per day, same for everyone. Share your result Wordle-style!
2. You'll see a sequence of items. Study the pattern.
3. Pick the correct next item from 4 choices.
4. Answer quickly — faster answers earn more points!
5. Use keyboard shortcuts **1–4** to select options.

### Multiplayer
1. Click **⚔️ Multiplayer** and log in (or register)
2. **Create Room** — get a room code to share with friends (2–10 players)
3. **Join Room** — enter a friend's room code
4. As host: configure max players and rounds, click **Start Game** when ready
5. All players answer the same puzzles simultaneously
6. After the match: view full rankings, request a rematch, or check match history

> **Note:** The host (room creator) controls when the game starts. Non-hosts see a "Waiting for host" message.

### Scoring

| Component | Points |
|---|---|
| Correct answer | 100 base points |
| Speed bonus | Up to +100 (faster = more) |
| Streak x1.5 | 3–5 correct in a row (single player) |
| Streak x2.0 | 6+ correct in a row (single player) |
| Wrong answer | 0 points, streak resets |

### Leaderboard
- View global rankings from the **🏆 Leaderboard** on the home screen
- Switch between **🎮 Free Play** and **⚔️ Multiplayer** leaderboards
- Filter by: All Time, Weekly, or Daily
- Multiplayer leaderboard shows wins, win rate, and average score
- Requires an account (register via Multiplayer)

---

## Developer Guide

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Git](https://git-scm.com/)
- [Docker](https://www.docker.com/) (optional, for container-based dev)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/henrik-me/guesswhatisnext.git
cd guesswhatisnext

# Install dependencies
npm install

# Start the server
npm start
# → http://localhost:3000
```

For development with auto-reload:
```bash
npm run dev
```

### Running with Docker (Phase 3)

```bash
# Build and run in a container (same image used in production)
docker compose up --build
# → http://localhost:3000

# Stop
docker compose down
```

The container mounts `./data` for SQLite persistence and sets dev environment variables automatically.

### Architecture

**Software Structure:**
```
guesswhatisnext/
├── public/                         # Client (served by Express)
│   ├── index.html                  # Game shell — all screens (SPA)
│   ├── css/style.css               # Styling, responsive, animations
│   ├── js/
│   │   ├── app.js                  # Entry point, screen nav, multiplayer UI
│   │   ├── game.js                 # Core game engine (scoring, timer, rounds)
│   │   ├── puzzles.js              # 22 puzzles (emoji + image)
│   │   ├── daily.js                # Date-seeded daily challenge logic
│   │   └── storage.js              # LocalStorage persistence
│   └── img/                        # SVG image assets for puzzles
│       ├── shapes/                 # Triangle, square, pentagon, hexagon, etc.
│       └── colors/                 # Color circles (red → purple)
├── server/
│   ├── index.js                    # Express app + HTTP + WebSocket bootstrap
│   ├── puzzleData.js               # Server-side puzzle pool (multiplayer)
│   ├── routes/
│   │   ├── auth.js                 # Register, login, JWT tokens
│   │   ├── scores.js               # Score submission + leaderboards
│   │   ├── matches.js              # Room create/join + match history
│   │   └── puzzles.js              # Puzzle API
│   ├── ws/matchHandler.js          # WebSocket head-to-head match engine
│   ├── db/
│   │   ├── schema.sql              # SQLite table definitions
│   │   └── connection.js           # DB init + query helpers
│   └── middleware/auth.js          # JWT + API key verification middleware
├── data/                           # SQLite database (auto-created, git-ignored)
├── Dockerfile                      # Production container image
├── docker-compose.yml              # Local container dev environment
├── .github/workflows/              # CI/CD + health monitor
├── package.json
├── INSTRUCTIONS.md                 # Architecture & coding guidelines
├── CONTEXT.md                      # Project plan & status tracker
└── README.md                       # This file
```

**System Architecture:**
```
  Browser (Client)                     Server (Node.js)
 ┌─────────────────┐               ┌──────────────────────┐
 │  index.html     │               │  Express (port 3000)  │
 │  ┌───────────┐  │   HTTP/REST   │  ┌────────────────┐  │
 │  │  app.js   │──┼──────────────▶│  │ Routes (API)   │  │
 │  │  game.js  │  │               │  │ /api/auth      │  │
 │  │  daily.js │  │   WebSocket   │  │ /api/scores    │  │
 │  │ puzzles.js│  │◀─────────────▶│  │ /api/matches   │  │
 │  │ storage.js│  │               │  │ /api/health    │  │
 │  └───────────┘  │               │  └───────┬────────┘  │
 │  LocalStorage   │               │          │           │
 └─────────────────┘               │  ┌───────▼────────┐  │
                                   │  │ SQLite (WAL)   │  │
                                   │  │ data/game.db   │  │
                                   │  └────────────────┘  │
                                   │  ┌────────────────┐  │
                                   │  │ WebSocket (ws)  │  │
                                   │  │ matchHandler.js │  │
                                   │  └────────────────┘  │
                                   └──────────────────────┘
```

**Deployment Pipeline (Phase 3):**
```
  git push to main
       │
  ┌────▼─────┐  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Lint &   │─▶│ Build    │─▶│ Deploy to │─▶│ Smoke     │─▶│ ⏸️ Manual │─▶│ Deploy to│─▶│ Prod     │
  │ Test     │  │ Docker   │  │ Staging   │  │ Tests     │  │ Approval │  │ Prod     │  │ Verify   │
  └──────────┘  └──────────┘  └───────────┘  └───────────┘  └──────────┘  └──────────┘  └────┬─────┘
                     │              │                                            │             │
                  push to       same image                                  same image     ❌ fail
                   GHCR              │                                          │          ┌────▼─────┐
                (SHA tag)            ▼                                          ▼          │ Rollback │
                              gwn-staging                                  gwn-prod       │ + Issue  │
                              Container Apps                               Container Apps └──────────┘
                                                                               ▲
  Health Monitor (every 5 min) ────────────────────────────────────────────────┘
       │ on failure → GitHub Issue
```

Image is built once → deployed to staging → **same bytes** promoted to prod after approval. No rebuild, no drift.

| Environment | Cost | Trigger | Approval | Rollback |
|---|---|---|---|---|
| Local | Free | `docker compose up` / `npm start` | None | N/A |
| Staging | $0 (scale-to-zero) | Push to `main` | Automatic | Redeploy previous SHA tag |
| Production | $0+ (pay-per-use) | After staging tests pass | Manual (GitHub reviewer) | Auto-rollback to previous SHA tag |

### API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | System (API key) | Health check with deep diagnostics |
| `POST` | `/api/auth/register` | No (rate-limited) | Register (username, password) |
| `POST` | `/api/auth/login` | No (rate-limited) | Login → JWT token |
| `GET` | `/api/auth/me` | Yes (JWT) | Current user info |
| `POST` | `/api/scores` | Yes (JWT) | Submit a game score |
| `GET` | `/api/scores/leaderboard` | Yes (JWT/API key) | Leaderboard (mode, period, limit) |
| `GET` | `/api/scores/me` | Yes (JWT) | User's score history |
| `POST` | `/api/matches` | Yes (JWT) | Create a match room (accepts maxPlayers, totalRounds) |
| `POST` | `/api/matches/join` | Yes (JWT) | Join by room code (validates capacity) |
| `GET` | `/api/matches/:id` | Yes (JWT) | Match status + players |
| `GET` | `/api/matches/history` | Yes (JWT) | User's match history |

> **Auth types:** `JWT` = Bearer token from login; `API key` = `X-API-Key` header (system account); `rate-limited` = IP-based rate limiting

### WebSocket

Connect to `ws://localhost:3000/ws?token=JWT_TOKEN` for real-time multiplayer.

**Key WS message types:**
| Direction | Type | Description |
|---|---|---|
| Client→Server | `join` | Join a room by code |
| Client→Server | `start-match` | Host starts the game (Phase 4) |
| Client→Server | `answer` | Submit answer with timing |
| Server→Client | `lobby-state` | Player roster update (Phase 4) |
| Server→Client | `round` | New round puzzle |
| Server→Client | `roundResult` | Round scores for all players |
| Server→Client | `gameOver` | Final rankings with placements |
| Server→Client | `player-disconnected` | Player left, reconnect window |
| Server→Client | `player-dropped` | Player eliminated (timeout) |

### Useful Commands

| Command | Description |
|---|---|
| `npm start` | Start the server on port 3000 |
| `npm run dev` | Start with auto-reload (--watch) |
| `npm test` | Run tests |

---

## License

MIT
