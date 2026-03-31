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
# Runs against http://localhost:3000 (default in config)
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

Use Artillery's `--target` flag to override the default target URL:

```bash
# Override target (cross-platform)
npx artillery run tests/load/api-stress.yml --target https://your-staging-url.com

# Or set LOAD_TEST_TARGET env var (used by JS helpers for user pool setup)
# Linux/macOS
LOAD_TEST_TARGET=https://your-staging-url.com npx artillery run tests/load/api-stress.yml --target https://your-staging-url.com

# Windows PowerShell
$env:LOAD_TEST_TARGET="https://your-staging-url.com"
npx artillery run tests/load/api-stress.yml --target https://your-staging-url.com
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `LOAD_TEST_TARGET` | `http://localhost:3000` | Base URL for API/WS requests during load test scenarios. Also written into `.user-pool.json` for target validation. |
| `LOAD_TEST_USER_COUNT` | `20` | Number of users to pre-seed in setup phase |
| `LOAD_TEST_SETUP_TIMEOUT_MS` | `300000` (5 min) | Max time to wait for lock during concurrent setup (direct seeding itself completes in < 1s) |
| `GWN_DB_PATH` | `data/game.db` | Path to the server's SQLite database for **local seeding only**. Must point to the same file the running server uses. Not applicable for remote targets. |
| `JWT_SECRET` | *(required for local DB seeding)* | JWT signing secret matching the running server. Only needed when seeding locally via `GWN_DB_PATH`. |
| `LOAD_TEST_ALLOW_REMOTE_SEED` | *(unset)* | Set to `1` to allow direct DB seeding when `LOAD_TEST_TARGET` is not localhost (e.g., in a shared Docker network). |

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
| Connection and room join | Authenticate → create room → connect WS → join room → emit metrics → close |
| Sustained connection | Authenticate → connect → hold 5s → emit metrics → close |

**Load profile:**
- **Ramp up**: 1 → 5 virtual users/sec over 30 seconds
- **Sustained**: 5 virtual users/sec for 60 seconds
- **Ramp down**: 5 → 1 virtual users/sec over 10 seconds

## Rate Limiting & User Pool

The server applies per-IP rate limiting on auth endpoints:
- **Burst**: 5 registrations/minute, 10 logins/minute
- **Hourly**: 20 registrations/hour
- **Daily**: 50 registrations/day

The **burst registration** and **login** limiters use `standardHeaders: true`,
which sends `RateLimit-*` headers and a `Retry-After` header on 429 responses.
The **hourly** and **daily** registration limiters do **not** send these headers
to avoid header clobbering; in practice the burst limiter triggers first.

For **local/dev or same-host runs** where the load test process
can access the server's SQLite database file and `JWT_SECRET`, the `before` hook
seeds users **directly into the database** using `better-sqlite3` and signs JWTs
locally with `jsonwebtoken`. This completes in under 1 second (vs ~4 minutes
with HTTP batching).

The setup uses the following env vars:
- `JWT_SECRET` (required) — must match the running server's secret and be
  available to the load test process
- `GWN_DB_PATH` (optional) — override for the server's SQLite database file
  path, as seen from where the load tests are running (defaults to `data/game.db`)

For **remote/staging environments**, you typically cannot access the DB file or
secret directly from your local machine. In those cases, either:
- run the load tests **inside the same environment** (e.g., a container that has
  access to the DB and `JWT_SECRET`), or
- fall back to an environment-specific seeding job or admin endpoint

Tokens are persisted to `.user-pool.json` and scenario VUs pick users from
this pool in round-robin.

The auth scenario (10% weight) tests direct registration and implements a
**rate-limit dance** that thoroughly validates the server's rate limiter. The
dance pattern is:

1. **Register** — attempt with a unique username. If 201, continue.
2. **Hit 429** — emit `auth.rate_limited`.
3. **Immediate retry** (no wait) — expect 429 again, confirming the limiter is
   enforced even without respecting `Retry-After` (`auth.immediate_retry_blocked`).
4. **Respect Retry-After** — wait the header-specified time (capped at 15 s),
   then retry. Expect 201 (`auth.retry_after_success`).
5. **Continue registering** until 429 repeats, then perform the dance again.

All 429 responses in this flow are **expected** — they validate that the rate
limiter works correctly. The VU never throws an error for a 429. Only truly
unexpected errors (500, network failures) cause VU failures.

Custom metrics emitted:

| Metric | Type | Meaning |
|---|---|---|
| `auth.register_success` | counter | Successful registration (201) |
| `auth.rate_limited` | counter | Hit rate limit (429) — expected |
| `auth.immediate_retry_blocked` | counter | Immediate retry got 429 — limiter enforced ✓ |
| `auth.immediate_retry_leaked` | counter | Immediate retry got 201 — limiter may be broken |
| `auth.retry_after_success` | counter | Registration succeeded after respecting Retry-After |
| `auth.retry_after_still_limited` | counter | Still limited after waiting — window hasn't reset |
| `auth.retry_after_seconds` | histogram | Value of the Retry-After header (seconds) |
| `auth.duplicate_username` | counter | Got 409 — username already taken |
| `auth.network_error` | counter | Network/timeout error |
| `auth.unexpected_error` | counter | Unexpected HTTP status (500, etc.) |

## Thresholds

### API Stress Test

| Metric | Threshold | Meaning |
|---|---|---|
| `http.response_time.p95` | < 500ms | 95th percentile HTTP response time must be under 500ms |
| `vusers.failed` | == 0 | All VUs must complete successfully |

The CI workflow also runs a separate validation step that checks the report JSON
and fails the job if any unexpected VU failures are detected.

### WebSocket Stress Test

The WebSocket test emits custom metrics via `beforeScenario` / `afterScenario` hooks:

| Metric | Type | Description |
|---|---|---|
| `ws.session_duration` | histogram | Total scenario duration from start to completion |
| `ws.connect_time` | histogram | Time from pre-connect setup to post-connect handshake (recorded via `markConnectComplete` step) |

> **Note:** Artillery's WS engine `connect.function` handlers receive
> `(wsArgs, context, done)` — they do **not** receive an event emitter.
> Per-message round-trip timing is also not possible because the WS engine
> does not provide per-message response hooks. The `afterScenario` hook
> (which does receive `events`) is used to emit the collected timestamps
> as histogram metrics that appear in the Artillery report with p50/p95/p99.
> The `markConnectComplete` function step is placed immediately after
> `connect` in the YAML flow to record when the handshake completes.

HTTP setup calls (registration, room creation) use a custom Node.js helper and
are not captured in Artillery's `http.response_time` metrics. Review the
Artillery summary output for WebSocket-specific metrics.

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
