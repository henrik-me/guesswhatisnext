# Guess What's Next

A browser-based puzzle game where you're shown a sequence of items — emoji, text, or images — that follow a pattern, and you must guess what comes next!

Features single-player (free play + daily challenge), global leaderboards, and real-time head-to-head multiplayer.

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
2. **Create Room** — get a room code to share with a friend
3. **Join Room** — enter a friend's room code
4. Play head-to-head: same puzzles, best of 5 rounds
5. After the match: view results, request a rematch, or check match history

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
- Filter by: All Time, Weekly, or Daily
- Requires an account (register via Multiplayer)

---

## Developer Guide

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Git](https://git-scm.com/)

### Getting Started

```bash
# Clone the repository
git clone <repo-url>
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

### Project Structure

```
guesswhatisnext/
├── public/                     # Client (served by Express)
│   ├── index.html              # Game shell — all screens
│   ├── css/style.css           # Styling, responsive, animations
│   ├── js/
│   │   ├── app.js              # Entry point, screen nav, multiplayer UI
│   │   ├── game.js             # Core game engine (scoring, timer, rounds)
│   │   ├── puzzles.js          # 22 puzzles (emoji + image)
│   │   ├── daily.js            # Date-seeded daily challenge logic
│   │   └── storage.js          # LocalStorage persistence
│   └── img/                    # SVG image assets for puzzles
│       ├── shapes/             # Triangle, square, pentagon, hexagon, etc.
│       └── colors/             # Color circles (red → purple)
├── server/
│   ├── index.js                # Express app + HTTP + WebSocket
│   ├── puzzleData.js           # Server-side puzzle pool (multiplayer)
│   ├── routes/
│   │   ├── auth.js             # Register, login, JWT tokens
│   │   ├── scores.js           # Score submission + leaderboards
│   │   ├── matches.js          # Room create/join + match history
│   │   └── puzzles.js          # Puzzle API (placeholder)
│   ├── ws/matchHandler.js      # WebSocket head-to-head engine
│   ├── db/
│   │   ├── schema.sql          # SQLite table definitions
│   │   └── connection.js       # DB init + query helpers
│   └── middleware/auth.js      # JWT verification middleware
├── data/                       # SQLite database (auto-created)
├── package.json
├── INSTRUCTIONS.md             # Architecture & coding guidelines
├── CONTEXT.md                  # Project plan & status tracker
└── README.md                   # This file
```

### API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | No | Health check |
| `POST` | `/api/auth/register` | No | Register (username, password) |
| `POST` | `/api/auth/login` | No | Login → JWT token |
| `GET` | `/api/auth/me` | Yes | Current user info |
| `POST` | `/api/scores` | Yes | Submit a game score |
| `GET` | `/api/scores/leaderboard` | No | Leaderboard (mode, period, limit) |
| `GET` | `/api/scores/me` | Yes | User's score history |
| `POST` | `/api/matches` | Yes | Create a match room |
| `POST` | `/api/matches/join` | Yes | Join by room code |
| `GET` | `/api/matches/:id` | Yes | Match status + players |
| `GET` | `/api/matches/history` | Yes | User's match history |

### WebSocket

Connect to `ws://localhost:3000/ws?token=JWT_TOKEN` for real-time multiplayer.

### Useful Commands

| Command | Description |
|---|---|
| `npm start` | Start the server on port 3000 |
| `npm run dev` | Start with auto-reload (--watch) |
| `npm test` | Run tests |

---

## License

MIT
