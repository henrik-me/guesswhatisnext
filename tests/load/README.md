# Load Testing — Guess What's Next

Load tests for the Guess What's Next API and WebSocket server using [Artillery](https://www.artillery.io/).

## Prerequisites

Artillery is listed as an optional dependency (requires **Node.js >= 22.13.0**).
It will be installed automatically on compatible Node versions:

```bash
npm install          # installs artillery on Node >= 22.13
```

> **Note:** On Node versions below 22.13, `npm install` will skip Artillery
> without failing. To run load tests, you need Node >= 22.13. The rest of the
> project works with Node.js v20+.

Alternatively, install Artillery globally:

```bash
npm install -g artillery
```

## Running Load Tests

### 1. Start the server locally

```bash
# From the project root
PORT=3000 node server/index.js
```

### 2. Run API stress test

```bash
# Uses default target http://localhost:3000
npm run test:load

# Or run directly
npx artillery run tests/load/api-stress.yml
```

### 3. Run WebSocket stress test

```bash
npm run test:load:ws

# Or run directly
npx artillery run tests/load/websocket-stress.yml
```

### 4. Run all load tests

```bash
npm run test:load:all
```

## Running Against Staging

> **Warning:** These load tests create **persistent data** in the target environment
> (e.g. users, scores, match rooms). The `cleanupUserPool` helper only deletes the
> local `.user-pool.json` file and **does not** remove any data from the target
> database. Only run against a disposable or easily resettable staging environment,
> and coordinate with your team before running against shared or long-lived systems.

Set the `LOAD_TEST_TARGET` environment variable:

```bash
# Linux/macOS
LOAD_TEST_TARGET=https://your-staging-url.com npx artillery run tests/load/api-stress.yml

# Windows PowerShell
$env:LOAD_TEST_TARGET="https://your-staging-url.com"
npx artillery run tests/load/api-stress.yml

# Windows CMD
set LOAD_TEST_TARGET=https://your-staging-url.com && npx artillery run tests/load/api-stress.yml
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `LOAD_TEST_TARGET` | `http://localhost:3000` | Server URL to test against |
| `LOAD_TEST_USER_COUNT` | `20` | Number of users to pre-register in setup phase |
| `LOAD_TEST_SETUP_TIMEOUT_MS` | `300000` (5 min) | Max time for user pool setup before aborting |

## Test Scenarios

### API Stress Test (`api-stress.yml`)

| Scenario | Weight | Description |
|---|---|---|
| Auth flow | 10% | Register a new user (tests rate limiting behavior) |
| Score submission | 30% | Submit 3 scores using pre-registered user |
| Leaderboard reads | 35% | Read leaderboard 5× with weekly/all filters |
| Puzzle fetching | 25% | Fetch puzzles with difficulty filters |

**Load profile:**
- **Ramp up**: 1 → 10 virtual users/sec over 30 seconds
- **Sustained**: 10 virtual users/sec for 60 seconds
- **Ramp down**: 10 → 1 virtual users/sec over 10 seconds

### WebSocket Stress Test (`websocket-stress.yml`)

| Scenario | Description |
|---|---|
| Connection and room join | Authenticate → create room → connect WS → join room → close |
| Connect-disconnect cycle | Authenticate → connect → close → reconnect ×3 |

**Load profile:**
- **Ramp up**: 1 → 5 virtual users/sec over 30 seconds
- **Sustained**: 5 virtual users/sec for 60 seconds
- **Ramp down**: 5 → 1 virtual users/sec over 10 seconds

## Rate Limiting & User Pool

The server applies per-IP rate limiting on auth endpoints (5 registrations/min,
10 logins/min). Since load tests run from a single IP, the `before` hook
pre-registers a pool of users before the test starts, persisting tokens to
`.user-pool.json`. Scenario VUs then pick users from this pool in round-robin.

The auth scenario (10% weight) tests direct registration and will naturally
experience some 429 responses — this is expected and validates that rate
limiting works correctly under load.

## Thresholds

### API Stress Test

| Metric | Threshold | Meaning |
|---|---|---|
| `http.response_time.p95` | < 500ms | 95th percentile HTTP response time must be under 500ms |

### WebSocket Stress Test

The WebSocket test does not enforce automated thresholds. HTTP setup calls
(registration, room creation) use a custom Node.js helper and are not captured
in Artillery's `http.response_time` metrics. Review the Artillery summary
output manually for WebSocket-specific metrics (`websocket.send_rate`,
`websocket.messages_sent/received`).

If API test thresholds are breached, Artillery exits with a non-zero code.

## Interpreting Results

After a run, Artillery prints a summary like:

```
Summary report @ 14:32:00
  Scenarios launched:  620
  Scenarios completed: 618
  Requests completed:  3420
  Mean response/sec:   33.5
  Response time (msec):
    min: ............ 2
    max: ............ 340
    median: ......... 12
    p95: ............ 85
    p99: ............ 210
  Codes:
    200: 1890
    201: 1530
```

**Key metrics to watch:**

- **Scenarios completed vs launched** — should be equal (no dropped connections)
- **p95 response time** — must be under 500ms threshold
- **Error codes** — 4xx/5xx codes indicate failures under load
- **429 on auth endpoints** — expected due to rate limiting from single IP
- **Mean response/sec** — throughput; higher is better

## File Structure

```
tests/load/
├── api-stress.yml         # API endpoint load test config
├── websocket-stress.yml   # WebSocket connection load test config
├── helpers.js             # Shared helpers: user pool, HTTP client, setup/teardown
├── ws-helpers.js          # WebSocket-specific helpers: auth, room creation
└── README.md              # This file
```
