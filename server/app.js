/**
 * App factory — creates Express app + HTTP server without listening.
 * Used by both the entry point (index.js) and test harness.
 */

const express = require('express');
const path = require('path');
const http = require('http');
const pinoHttp = require('pino-http');
const { config } = require('./config');
const { isTransientDbError, getDbUnavailability } = require('./lib/transient-db-error');
const { createInitGuard } = require('./lib/db-init-guard');
const logger = require('./logger');
const { getDbAdapter, closeDbAdapter, isAdapterInitialized } = require('./db');
const migrations = require('./db/migrations');
const { requireSystem } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const scoreRoutes = require('./routes/scores');
const matchRoutes = require('./routes/matches');
const puzzleRoutes = require('./routes/puzzles');
const achievementRoutes = require('./routes/achievements');
const featureRoutes = require('./routes/features');
const submissionRoutes = require('./routes/submissions');
const notificationRoutes = require('./routes/notifications');
const userRoutes = require('./routes/users');
const telemetryRoutes = require('./routes/telemetry');
const { initWebSocket, rooms } = require('./ws/matchHandler');

const { httpsRedirect, securityHeaders } = require('./middleware/security');
const { createDelayMiddleware } = require('./middleware/delay');

const pkg = require('../package.json');

/**
 * Initialize the database: run migrations, seed system account, achievements, and puzzles.
 */
async function initializeDatabase() {
  const db = await getDbAdapter();

  await db.migrate(migrations);

  // Seed system account if it doesn't exist
  const SYSTEM_API_KEY = config.SYSTEM_API_KEY;
  const existing = await db.get('SELECT id FROM users WHERE username = ?', ['system']);
  if (!existing) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync(SYSTEM_API_KEY, 10);
    await db.run("INSERT INTO users (username, password_hash, role) VALUES ('system', ?, 'system')", [hash]);
    logger.info('System account seeded');
  }

  // Bootstrap: promote ADMIN_USERNAME to admin if set AND the system API key
  // is explicitly configured to a non-default value.
  const adminUsername = process.env.ADMIN_USERNAME;
  const keyExplicitlySet = !!process.env.SYSTEM_API_KEY && process.env.SYSTEM_API_KEY !== 'gwn-dev-system-key';
  if (adminUsername && keyExplicitlySet) {
    const adminUser = await db.get('SELECT id, role FROM users WHERE username = ?', [adminUsername]);
    if (adminUser && adminUser.role === 'user') {
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [adminUser.id]);
      logger.info({ username: adminUsername }, 'Auto-promoted user to admin');
    }
  }

  // Seed achievement definitions
  const { seedAchievements } = require('./achievements');
  await seedAchievements();

  // Seed puzzles if table is empty
  const puzzleCount = await db.get('SELECT COUNT(*) AS cnt FROM puzzles');
  if (puzzleCount.cnt === 0) {
    const { seedPuzzles } = require('./db/seed-puzzles');
    await seedPuzzles();
  }

  logger.info('Database initialized');
}

/**
 * Create and configure the full application stack.
 * @returns {{ app: express.Application, server: http.Server }}
 */
function createServer() {
  const app = express();
  const server = http.createServer(app);

  app.set('trust proxy', config.TRUST_PROXY);

  // DB state tracking for orchestrated deploys
  let dbInitialized = false;
  let draining = false;
  let activeRequests = 0;
  // CS53 Bug B: when the most recent init attempt failed with a permanent
  // unavailability (e.g. Azure SQL Free Tier monthly compute allowance
  // exhausted), capture the descriptor here so the request gate below can
  // surface the same { unavailable: true, reason, message } 503 (no
  // Retry-After) that the central error handler emits — instead of the
  // generic "Database not yet initialized" + Retry-After: 5 response that
  // would otherwise keep the SPA's progressive loader cycling forever.
  // Cleared on the next successful init.
  let dbUnavailability = null;
  // CS53-9: when init fails with a "permanent unavailability" descriptor
  // (e.g. Azure SQL Free Tier capacity_exhausted), the gate returns 503 with
  // no Retry-After so the SPA stops retrying. But the underlying condition
  // can clear later (capacity renews, secret rotates), and this PR removed
  // the timer-based self-init loop. To preserve self-healing without
  // reintroducing background DB pings, allow a real inbound request to
  // re-attempt init at most once per `unavailabilityRetryBackoffMs`. The
  // current request still gets the no-retry 503 (banner stays up); the next
  // request after the backoff window may flip the state on success.
  let lastUnavailabilityRetryAt = 0;
  const unavailabilityRetryBackoffMs = 30000;

  // Centralised builder for the "permanent DB unavailability" 503 response
  // (CS53 Bug B). Used by both the request gate (when init has failed) and
  // the central error handler (when a request-time DB op fails). Keeping
  // the shape in one place prevents the two sites from drifting apart over
  // time. NOTE: no Retry-After header — its absence is the SPA's signal to
  // stop retrying and render the unavailable banner.
  function sendDbUnavailable(res, descriptor) {
    return res.status(503).json({
      error: 'Database temporarily unavailable',
      message: descriptor.message,
      unavailable: true,
      reason: descriptor.reason,
    });
  }

  const isAzure = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  // CS53-9 / Policy 1: concurrency guard so /api/admin/init-db and the
  // request-driven lazy init path cannot run `initializeDatabase()` in
  // parallel. Both paths coordinate through `runInit()`; concurrent callers
  // share the in-flight promise instead of starting their own.
  const initGuard = createInitGuard(initializeDatabase);
  async function runInit() {
    try {
      await initGuard.runOnce();
      dbInitialized = true;
      dbUnavailability = null;
      return { ok: true };
    } catch (err) {
      dbInitialized = false;
      // Capture dialect BEFORE closing the adapter — closeDbAdapter() nulls
      // the singleton, which would make the post-close getDbAdapter() path
      // unreachable. Falling back to config.DB_BACKEND when no adapter has
      // been initialized yet (e.g. very-first-request init failure).
      const dialect = isAdapterInitialized()
        ? (await getDbAdapter().catch(() => null))?.dialect ?? config.DB_BACKEND
        : config.DB_BACKEND;
      try { await closeDbAdapter(); } catch { /* ignore close errors */ }
      // Refresh dbUnavailability so the request gate reflects the latest
      // known state (e.g., flips to capacity_exhausted on Azure SQL Free
      // Tier exhaustion; clears stale value on a transient failure that
      // follows a previous unavailability).
      dbUnavailability = getDbUnavailability(err, dialect);
      // Stamp the backoff timer NOW so the very next request after the
      // failure does not immediately re-attempt; the gate's backoff window
      // (`unavailabilityRetryBackoffMs`) is measured from this point.
      if (dbUnavailability) lastUnavailabilityRetryAt = Date.now();
      // Log here so fire-and-forget callers (the request gate) don't need
      // to handle the resolved `{ ok: false }` themselves; the comment on
      // `runInit().catch(...)` at the call sites refers to this log.
      logger.error({ err, dbUnavailability }, 'runInit failed');
      return { ok: false, err };
    }
  }

  // Security middleware — HTTPS redirect (production only) and headers
  app.use(httpsRedirect);
  app.use(securityHeaders);

  // Request logging (before body parsers for consistent access logs)
  const staticExtensions = new Set(['.css', '.js', '.map', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf']);

  // Blocklist noisy headers that are identical across requests (browser fingerprinting + static security headers)
  const DROP_REQ_HEADERS = new Set([
    'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
    'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
    'accept-encoding', 'accept-language', 'connection',
    'upgrade-insecure-requests',
  ]);
  const DROP_RES_HEADERS = new Set([
    'permissions-policy', 'content-security-policy',
    'cross-origin-opener-policy', 'cross-origin-resource-policy',
    'origin-agent-cluster', 'referrer-policy',
    'x-content-type-options', 'x-dns-prefetch-control',
    'x-download-options', 'x-frame-options',
    'x-permitted-cross-domain-policies',
    'strict-transport-security',
  ]);

  app.use(pinoHttp({
    logger,
    serializers: {
      req(req) {
        const headers = {};
        for (const [k, v] of Object.entries(req.headers || {})) {
          if (!DROP_REQ_HEADERS.has(k)) headers[k] = v;
        }
        const remoteAddress = req.ip || req.socket?.remoteAddress;
        const remotePort = req.socket?.remotePort;
        return {
          id: req.id, method: req.method, url: req.url,
          headers, remoteAddress, remotePort,
        };
      },
      res(res) {
        const raw = res.getHeaders?.() || res.headers || {};
        const headers = {};
        for (const [k, v] of Object.entries(raw)) {
          const key = String(k).toLowerCase();
          if (!DROP_RES_HEADERS.has(key)) headers[key] = v;
        }
        return { statusCode: res.statusCode, headers };
      },
    },
    autoLogging: config.NODE_ENV === 'test' ? false : {
      ignore: (req) => {
        if (req.path === '/api/health' || req.path === '/healthz') return true;
        if (req.path.startsWith('/api/telemetry/')) return true;
        const dotIdx = req.path.lastIndexOf('.');
        return dotIdx !== -1 && staticExtensions.has(req.path.substring(dotIdx));
      },
    },
  }));

  // Delay simulation middleware — for cold start UX testing (dev/test only).
  // Mounted after request logging so logged response times reflect the artificial delay.
  const delayMiddleware = createDelayMiddleware();
  if (delayMiddleware) app.use(delayMiddleware);

  const defaultJsonParser = express.json();
  const largeJsonParser = express.json({ limit: '8mb' });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/telemetry/')) return next();
    if (req.path.startsWith('/api/submissions')) return largeJsonParser(req, res, next);
    return defaultJsonParser(req, res, next);
  });

  // Serve static files from public/
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Request tracking middleware — gates API access on DB readiness.
  // CS53-9 / Policy 1: when the DB is not yet initialized, kick off a
  // request-driven lazy init via the init guard (fire-and-forget), then
  // immediately return 503 + Retry-After so the client retries. Concurrent
  // requests during init see `isInFlight()` and do not start a second
  // attempt. There is NO timer/poller/watchdog issuing DB queries on its
  // own — DB contact only happens in response to real traffic, an operator
  // POST /api/admin/init-db, or the eager non-Azure boot path below.
  app.use((req, res, next) => {
    if (req.path === '/healthz' || req.path === '/api/health' || req.path.startsWith('/api/admin/') || req.path.startsWith('/api/telemetry/')) return next();

    if (draining) {
      return res.set('Retry-After', '5').status(503).json({ error: 'Server is draining', retryAfter: 5 });
    }

    if (!dbInitialized && req.path.startsWith('/api/')) {
      if (dbUnavailability) {
        // Backoff-gated retry: a permanent-unavailability state may clear
        // later (capacity renews). Allow a real request to trigger one
        // re-attempt per backoff window without changing the response shape
        // — the SPA still stops retrying for this request.
        if (isAzure && !initGuard.isInFlight()
            && Date.now() - lastUnavailabilityRetryAt >= unavailabilityRetryBackoffMs) {
          lastUnavailabilityRetryAt = Date.now();
          runInit().catch(() => { /* errors already logged inside runInit */ });
        }
        return sendDbUnavailable(res, dbUnavailability);
      }
      // Lazy init — only kick off when in Azure mode (production/staging).
      // Non-Azure environments init eagerly via the IIFE below; if init
      // failed there the process has already exited.
      if (isAzure && !initGuard.isInFlight()) {
        // Fire-and-forget; runInit() catches its own errors. The current
        // request still gets 503 + Retry-After — the next retry from the
        // client will land after init either completes or fails.
        runInit().catch(() => { /* errors already logged inside runInit */ });
      }
      return res.set('Retry-After', '5').status(503).json({ error: 'Database not yet initialized', retryAfter: 5 });
    }

    activeRequests++;
    let decremented = false;
    const decrement = () => {
      if (!decremented) { decremented = true; activeRequests = Math.max(0, activeRequests - 1); }
    };
    // CS53-12: bump per-response listener limit to silence
    // MaxListenersExceededWarning. @opentelemetry/instrumentation-express
    // attaches `res.once('finish', ...)` per Express layer that ends the
    // response asynchronously (see node_modules/@opentelemetry/
    // instrumentation-express/build/src/instrumentation.js:251). With our
    // middleware stack (pino-http + json parser + static + request-gate +
    // auth + route + error handler) plus this module's two listeners, a
    // single response can briefly hold 11+ finish listeners — exceeding
    // Node's default cap of 10 and emitting a per-response warning. The
    // OTel listeners are `.once` and self-remove on the layer's `next()`,
    // so this is a false-positive leak. 32 gives ample headroom while
    // still catching real unbounded leaks (test asserts ≤ 32 under load).
    res.setMaxListeners(32);
    res.on('finish', decrement);
    res.on('close', decrement);
    next();
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/scores', scoreRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api/puzzles', puzzleRoutes);
  app.use('/api/achievements', achievementRoutes);
  app.use('/api/features', featureRoutes);
  app.use('/api/submissions', submissionRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/telemetry', telemetryRoutes);

  // Health check (system access only)
  app.get('/api/health', requireSystem, async (req, res, next) => {
    try {
      const checks = {};

      // Database check
      if (!dbInitialized || !isAdapterInitialized()) {
        checks.database = { status: 'not_initialized', responseMs: -1 };
      } else {
        try {
          const start = Date.now();
          const db = await getDbAdapter();
          await db.get('SELECT 1');
          const responseMs = Date.now() - start;
          checks.database = {
            status: responseMs > 5000 ? 'error' : 'ok',
            responseMs,
          };
        } catch {
          checks.database = { status: 'error', responseMs: -1 };
        }
      }

      // WebSocket check
      let activeConnections = 0;
      for (const room of rooms.values()) {
        if (room.players) {
          for (const ws of room.players.values()) {
            if (ws && ws.readyState === 1) activeConnections++;
          }
        }
      }
      checks.websocket = { status: 'ok', activeConnections };

      // Storage check — delegates to the adapter's healthCheck()
      // (SQLite: file stat / MSSQL: SELECT 1 ping)
      if (dbInitialized && isAdapterInitialized()) {
        try {
          const db = await getDbAdapter();
          checks.storage = await db.healthCheck();
        } catch {
          checks.storage = { status: 'error' };
        }
      }

      // Uptime check
      checks.uptime = { status: 'ok', seconds: Math.floor(process.uptime()) };

      // Overall status
      const statuses = Object.values(checks).map((c) => c.status);
      let status = 'ok';
      if (statuses.includes('error')) status = 'error';
      else if (statuses.includes('degraded')) status = 'degraded';

      res.json({
        status,
        timestamp: new Date().toISOString(),
        checks,
        version: pkg.version,
        environment: process.env.NODE_ENV || 'development',
      });
    } catch (err) {
      next(err);
    }
  });

  // Unauthenticated liveness probe for container orchestrators
  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok');
  });

  // Admin: drain DB connections (for orchestrated deploys)
  app.post('/api/admin/drain', requireSystem, (_req, res) => {
    draining = true;
    let responded = false;

    const finish = async (result) => {
      if (responded) return;
      responded = true;
      try {
        await closeDbAdapter();
      } catch { /* ignore close errors */ }
      dbInitialized = false;
      logger.info({ drainStatus: result.status }, 'Database connection closed');
      res.json(result);
    };

    const timeout = setTimeout(() => {
      finish({ status: 'drained', activeRequests, forced: true });
    }, 30000);

    const poll = () => {
      if (responded) return;
      if (activeRequests <= 0) {
        clearTimeout(timeout);
        finish({ status: 'drained', activeRequests: 0 });
        return;
      }
      setTimeout(poll, 500);
    };
    poll();
  });

  // Admin: initialize DB connection (for orchestrated deploys and for
  // forcing an immediate retry when the lazy request-driven init path is
  // not exercising fast enough).
  app.post('/api/admin/init-db', requireSystem, async (_req, res, _next) => {
    const result = await runInit();
    if (result.ok) {
      // Clear `draining` on init success: a successful admin init implies
      // the operator wants traffic to resume after /api/admin/drain.
      // Failures must not enable draining; see the failure-path note below.
      draining = false;
      logger.info('Database initialized (via admin endpoint)');
      res.json({ status: 'initialized' });
    } else {
      // CS53-1b: do NOT set `draining = true` on failure. Doing so would
      // soft-brick the request-driven lazy init path (which relies on
      // !draining to even attempt init), preventing the container from
      // self-healing at free-tier renewal until someone makes a successful
      // admin call. Reporting the failure to the caller is enough.
      // dbUnavailability is refreshed inside runInit() itself, and runInit()
      // logs the init failure so this endpoint does not duplicate the error log.
      res.status(500).json({ error: 'Database initialization failed', message: result.err.message });
    }
  });

  // SPA fallback — serve index.html for non-API routes
  // Note: /{*path} is the correct Express 5 (path-to-regexp v8) catch-all syntax.
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Centralized error handler — must be after all routes
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;

    // Permanent DB unavailability (e.g., Azure SQL Free Tier monthly allowance
    // exhausted, DB paused by Azure until the 1st of next month) — return 503
    // with a structured body and NO Retry-After. The SPA recognises this shape
    // and renders a banner instead of cycling the warmup loader (CS53 Bug B).
    let unavailability = null;
    if (status >= 500) {
      unavailability = getDbUnavailability(err, config.DB_BACKEND);
    }

    // Convert transient/cold-start DB errors into 503 with Retry-After so the
    // client's CS42-3 ProgressiveLoader can retry, instead of surfacing a
    // generic "Internal server error" (CS45). This matters most for Azure SQL
    // serverless, which auto-pauses while the server still believes the pool
    // is initialized; the next query then times out mid-request.
    let isTransient = false;
    if (!unavailability && status >= 500 && isTransientDbError(err, config.DB_BACKEND)) {
      isTransient = true;
      status = 503;
    } else if (unavailability) {
      status = 503;
    }

    const logLevel = status >= 500 ? 'error' : 'warn';
    logger[logLevel](
      {
        err,
        status,
        transient: isTransient || undefined,
        unavailable: unavailability ? true : undefined,
        unavailabilityReason: unavailability ? unavailability.reason : undefined,
        method: req.method,
        url: req.originalUrl || req.url,
        requestId: req.id,
        remoteAddress: req.ip || (req.socket && req.socket.remoteAddress),
      },
      unavailability
        ? 'Database unavailable — responded 503 (no retry)'
        : isTransient
          ? 'Transient DB error — responded 503'
          : 'Unhandled request error'
    );
    if (res.headersSent) {
      return next(err);
    }
    if (unavailability) {
      return sendDbUnavailable(res, unavailability);
    }
    if (isTransient) {
      return res
        .set('Retry-After', '5')
        .status(503)
        .json({ error: 'Database temporarily unavailable', retryAfter: 5 });
    }
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  let dbReadyPromise;

  if (isAzure) {
    // CS53-9 / Policy 1: NO timer/scheduler/poller. The DB is contacted
    // lazily on the first inbound /api/* request — see the gating
    // middleware above. The server starts immediately so /healthz responds
    // to Azure health probes; /api/* returns 503 + Retry-After until the
    // first request-driven init completes (or returns the no-retry
    // unavailable shape if the underlying condition is permanent).
    // Operators can force an immediate retry via POST /api/admin/init-db.
    dbReadyPromise = null;
  } else {
    // Non-Azure: initialize eagerly via an async IIFE, expose promise for tests
    dbReadyPromise = (async () => {
      try {
        await initializeDatabase();
        dbInitialized = true;
      } catch (err) {
        logger.fatal({ err }, 'Database initialization failed');
        // Allow pino transports to flush, then force exit since WS timers
        // keep the event loop alive.
        setTimeout(() => process.exit(1), 500);
        throw err;
      }
    })();
    dbReadyPromise.catch(() => undefined);
  }
  initWebSocket(server, () => dbInitialized && !draining);

  return { app, server, dbReady: dbReadyPromise };
}

module.exports = { createServer };
