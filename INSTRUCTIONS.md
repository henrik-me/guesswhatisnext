# Development Instructions

This document defines architecture decisions, coding standards, testing strategy, and git workflow for the **Guess What's Next** project.

---

## 1. Architecture Principles

### Separation of Concerns
- **Game engine** (`game.js`) handles logic only — no DOM manipulation
- **App layer** (`app.js`) handles screen navigation and DOM updates
- **Data layer** (`puzzles.js`) is pure data — exportable objects, no side effects
- **Storage layer** (`storage.js`) abstracts all persistence behind a clean API

### Multiplayer-Ready Design (Phase 1 prep)
These rules apply even during Phase 1 to ensure a smooth Phase 2 transition:

1. **Puzzle data as plain objects** — The game engine receives puzzle data as arguments, never imports it directly. This allows swapping from a local JS file to a `fetch()` call without changing the engine.
2. **Serializable score/result objects** — All game results are plain JSON-serializable objects. No DOM references, no circular structures. This enables POSTing to a server later.
3. **Callback-based answer submission** — The game engine accepts an `onAnswer` callback rather than directly writing to the DOM. This lets multiplayer hook in alongside the single-player UI.
4. **Extensible screen navigation** — The screen router must support adding new screens (leaderboard, lobby, match) without refactoring existing ones.
5. **No global mutable state** — Game state lives in a single state object passed through functions. No top-level `let` variables tracking game progress.

### File Organization
- One module per file, one responsibility per module
- Shared constants (timer duration, scoring multipliers, etc.) go in a `config` object at the top of the relevant file
- Image assets organized in `img/` by category: `img/nature/`, `img/math/`, etc.

---

## 2. Coding Guidelines

### Language & Style
- **Vanilla JavaScript** (ES6+ modules) — no frameworks, no transpilers in Phase 1
- Use `const` by default, `let` when reassignment is needed, never `var`
- Use arrow functions for callbacks, regular functions for top-level declarations
- Use template literals over string concatenation
- Use destructuring where it improves readability

### Naming Conventions
| Element | Convention | Example |
|---|---|---|
| Files | kebab-case | `game-engine.js` |
| Functions | camelCase | `calculateScore()` |
| Constants | UPPER_SNAKE | `MAX_ROUNDS` |
| CSS classes | kebab-case | `.game-screen` |
| CSS variables | kebab-case | `--color-primary` |
| DOM IDs | kebab-case | `#timer-bar` |
| Puzzle IDs | kebab-case | `moon-phases` |

### HTML
- Semantic elements (`<main>`, `<section>`, `<button>`, `<header>`)
- All screens are `<section>` elements toggled via CSS class `active`
- Accessibility: all interactive elements must be keyboard-navigable, images must have `alt` text
- Use `data-*` attributes for JS hooks, not classes

### CSS
- CSS custom properties (variables) for theming (colors, fonts, spacing)
- Mobile-first responsive design — base styles for mobile, `@media` queries for larger screens
- No `!important` except as a last resort
- Use `rem` for typography, `px` for borders/shadows, `%`/`vw`/`vh` for layout
- Animations via CSS transitions/keyframes (not JS) where possible

### JavaScript
- Use `<script type="module">` for ES6 module support
- Each file exports its public API; private helpers stay unexported
- Error handling: wrap `localStorage` calls in try/catch, validate puzzle data on load
- No `document.write()`, no inline event handlers in HTML
- DOM queries cached in variables, not repeated

### Comments
- **Do** comment: non-obvious algorithms, scoring formulas, date-seed logic
- **Don't** comment: obvious code, getters/setters, self-describing function names
- Use JSDoc for public function signatures:
  ```js
  /**
   * Calculate the score for a round.
   * @param {boolean} correct - Whether the answer was correct
   * @param {number} timeMs - Time taken to answer in milliseconds
   * @param {number} streak - Current streak count
   * @returns {object} { points, speedBonus, multiplier, total }
   */
  function calculateScore(correct, timeMs, streak) { ... }
  ```

---

## 3. Testing Strategy

### Phase 1 — Manual + Lightweight Unit Tests
Since there's no build system, testing is pragmatic:

1. **Unit tests for pure logic** — Create a `test/` folder with simple test files that import game engine functions and assert expected outputs. Run in the browser via a `test/index.html` page.
   ```
   test/
   ├── index.html          # Test runner page
   ├── test-scoring.js     # Score calculation tests
   ├── test-daily.js       # Date-seed determinism tests
   └── test-puzzles.js     # Puzzle data validation
   ```

2. **What to test:**
   - Scoring: correct/wrong answers, speed bonus at various times, streak multipliers
   - Daily challenge: same date always yields same puzzle, different dates yield different puzzles
   - Puzzle validation: all puzzles have required fields, answer is in options, no duplicates
   - Timer: countdown starts, pauses, resets correctly

3. **Manual testing checklist:**
   - All screens navigate correctly
   - Timer visual matches actual countdown
   - Score displays update in real-time
   - LocalStorage persists across page reload
   - Daily challenge locks after one attempt
   - Works on mobile viewport (Chrome DevTools responsive mode)
   - Keyboard navigation works for all interactive elements

### Phase 2 — Automated Tests
- Use a test framework (e.g., Vitest or Jest) installed via npm
- API endpoint tests with `supertest`
- WebSocket integration tests
- `npm test` runs the full suite
- Tests must pass before merging any PR

---

## 4. Git Workflow

### Repository Setup
- Initialize with `git init` at project root
- `.gitignore` configured for Node.js, OS files, and database files
- Main branch: `main`

### Commit Conventions
Use **conventional commits** for clear, parseable history:

```
<type>: <short description>

[optional body with more detail]
```

**Types:**
| Type | When to use |
|---|---|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `style` | CSS/formatting changes (no logic change) |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `chore` | Config, dependencies, tooling |

**Examples:**
```
feat: add timer countdown with visual progress bar
fix: prevent daily challenge replay after page refresh
refactor: extract scoring logic into pure functions
docs: add puzzle data format to INSTRUCTIONS.md
chore: initialize npm project with express and dependencies
```

### When to Commit
Commit after every meaningful, working change. Specifically:
- After completing each todo/step in the plan
- After adding a new screen or feature
- After fixing a bug
- After adding tests
- **Do not** commit broken/half-done work to `main`

### Branch Strategy
- Phase 1: Work directly on `main` (single developer, rapid iteration)
- Phase 2: Feature branches (`feat/leaderboard`, `feat/websocket`) with PR merges

---

## 5. Puzzle Authoring Guide

When adding new puzzles to `puzzles.js`:

1. Every puzzle must have: `id`, `category`, `difficulty` (1–3), `type`, `sequence`, `answer`, `options`, `explanation`
2. `answer` must appear exactly once in `options`
3. `options` must have exactly 4 items
4. `sequence` must have 3–6 items
5. `difficulty` guide:
   - **1**: Obvious patterns (counting, colors, alphabet)
   - **2**: Requires domain knowledge (moon phases, music scales)
   - **3**: Lateral thinking or obscure patterns
6. For image puzzles: paths are relative to `img/` directory
7. Write a clear `explanation` — players see it after answering

---

## 6. Performance & Accessibility

### Performance
- No heavy libraries — total JS payload should stay under 50KB (Phase 1)
- Images: use compressed formats (WebP preferred, PNG fallback), max 200KB each
- Preload next puzzle's images while current round is active

### Accessibility
- Minimum contrast ratio: 4.5:1 for text
- All buttons/options have visible focus indicators
- Screen reader support: ARIA labels on game state changes
- Reduced motion: respect `prefers-reduced-motion` media query
- Emoji sequences: include `aria-label` describing the item for screen readers
