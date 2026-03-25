# Guess What's Next

A browser-based puzzle game where you're shown a sequence of items — emoji, text, or images — that follow a pattern, and you must guess what comes next!

🎮 **[Play Now](#)** *(link TBD once deployed)*

## How to Play

1. Choose a game mode:
   - **Free Play** — Pick a category (or random) and complete 10 rounds
   - **Daily Challenge** — One puzzle per day, same for everyone. Can you keep your streak?
2. You'll see a sequence of items. Study the pattern.
3. Pick the correct next item from 4 choices.
4. Answer quickly — faster answers earn more points!

### Scoring

| Component | Points |
|---|---|
| Correct answer | 100 base points |
| Speed bonus | Up to +100 (faster = more) |
| Streak x1.5 | 3–5 correct in a row |
| Streak x2.0 | 6+ correct in a row |
| Wrong answer | 0 points, streak resets |

### Daily Challenge

- One puzzle per day, shared globally
- One attempt only — no retries!
- Share your result with friends (Wordle-style)

---

## Developer Guide

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- [Git](https://git-scm.com/) for version control
- [Node.js](https://nodejs.org/) v18+ *(Phase 2 only — not needed for Phase 1)*
- A local web server for development (e.g., VS Code Live Server extension, or `python -m http.server`)

### Getting Started

```bash
# Clone the repository
git clone <repo-url>
cd guesswhatisnext

# Phase 1: No build step needed — just open index.html
# Option A: VS Code Live Server extension (recommended)
# Option B: Python simple server
python -m http.server 8080

# Phase 2: Install dependencies and start the server
npm install
npm start
```

### Project Structure

#### Phase 1 (Client-only)
```
guesswhatisnext/
├── index.html          # Game shell — all screens
├── css/
│   └── style.css       # Styling, responsive, animations
├── js/
│   ├── app.js          # Entry point, screen navigation
│   ├── game.js         # Core game engine
│   ├── puzzles.js      # Puzzle data (JSON)
│   ├── daily.js        # Daily challenge logic
│   └── storage.js      # LocalStorage persistence
├── img/                # Image assets for puzzles
├── INSTRUCTIONS.md     # Development guidelines
├── CONTEXT.md          # Project status & plan
└── README.md           # This file
```

#### Phase 2 (Backend + Multiplayer)
```
guesswhatisnext/
├── public/             # Client files (moved from root)
├── server/
│   ├── index.js        # Express entry point
│   ├── routes/         # API routes (auth, scores, matches, puzzles)
│   ├── ws/             # WebSocket handlers
│   ├── db/             # Schema + connection helpers
│   └── middleware/      # Auth middleware
├── data/               # SQLite database
├── package.json
└── ...
```

### Running Tests

```bash
# Phase 1: Open tests in browser
# open test/index.html

# Phase 2: Run test suite
npm test
```

### Useful Commands

| Command | Description |
|---|---|
| `npm start` | Start the server (Phase 2) |
| `npm test` | Run tests (Phase 2) |
| `npm run dev` | Start with auto-reload (Phase 2) |

---

## License

MIT
