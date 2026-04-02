/**
 * App factory — creates Express app + HTTP server without listening.
 * Used by both the entry point (index.js) and test harness.
 */

const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const pinoHttp = require('pino-http');
const { config } = require('./config');
const logger = require('./logger');
const { getDbAdapter, closeDbAdapter, isAdapterInitialized } = require('./db');
const migrations = require('./db/migrations');
const { requireSystem } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const scoreRoutes = require('./routes/scores');
const matchRoutes = require('./routes/matches');
const puzzleRoutes = require('./routes/puzzles');
const achievementRoutes = require('./routes/achievements');
const submissionRoutes = require('./routes/submissions');
const userRoutes = require('./routes/users');
const telemetryRoutes = require('./routes/telemetry');
const { initWebSocket, rooms } = require('./ws/matchHandler');

const { httpsRedirect, securityHeaders } = require('./middleware/security');

const pkg = require('../package.json');

/**
 * Initialize the database: run migrations, seed system account, achievements, and puzzles.
 */
async function initializeDatabase() {
  const db = await getDbAdapter();

  // Migrations and seeding are currently SQLite-specific; fail fast for MSSQL.
  if (db.dialect === 'mssql') {
    throw new Error(
      'MSSQL backend is not yet supported for automatic database initialization. ' +
      'Please implement MSSQL-compatible migrations and seeding before using DB_BACKEND=mssql.'
    );
  }

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

  app.set('trust proxy', 1);

  // DB state tracking for orchestrated deploys
  let dbInitialized = false;
  let draining = false;
  let activeRequests = 0;
  const isAzure = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

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
  ]);

  app.use(pinoHttp({
    logger,
    serializers: {
      req(req) {
        const headers = {};
        for (const [k, v] of Object.entries(req.headers || {})) {
          if (!DROP_REQ_HEADERS.has(k)) headers[k] = v;
        }
        return {
          id: req.id, method: req.method, url: req.url,
          query: req.query, params: req.params,
          headers, remoteAddress: req.remoteAddress, remotePort: req.remotePort,
        };
      },
      res(res) {
        const raw = res.headers || {};
        const headers = {};
        for (const [k, v] of Object.entries(raw)) {
          if (!DROP_RES_HEADERS.has(k)) headers[k] = v;
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
  const defaultJsonParser = express.json();
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/telemetry/')) return next();
    return defaultJsonParser(req, res, next);
  });

  // Serve static files from public/
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Request tracking middleware — gates API access on DB readiness
  app.use((req, res, next) => {
    if (req.path === '/healthz' || req.path === '/api/health' || req.path.startsWith('/api/admin/') || req.path.startsWith('/api/telemetry/')) return next();

    if (draining) {
      return res.status(503).json({ error: 'Server is draining', retryAfter: 5 });
    }

    if (!dbInitialized && req.path.startsWith('/api/')) {
      return res.status(503).json({ error: 'Database not yet initialized', retryAfter: 5 });
    }

    activeRequests++;
    let decremented = false;
    const decrement = () => {
      if (!decremented) { decremented = true; activeRequests = Math.max(0, activeRequests - 1); }
    };
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
  app.use('/api/submissions', submissionRoutes);
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

      // Disk check
      const dbPath = config.GWN_DB_PATH;
      try {
        const stat = fs.statSync(dbPath);
        checks.disk = {
          status: 'ok',
          dbSizeMb: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
        };
      } catch {
        checks.disk = { status: 'error', dbSizeMb: 0 };
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

  // Admin: initialize DB connection (for orchestrated deploys)
  app.post('/api/admin/init-db', requireSystem, async (_req, res, _next) => {
    try {
      await initializeDatabase();
      draining = false;
      dbInitialized = true;
      logger.info('Database initialized (via admin endpoint)');
      res.json({ status: 'initialized' });
    } catch (err) {
      try { await closeDbAdapter(); } catch { /* ignore */ }
      draining = true;
      dbInitialized = false;
      logger.error({ err }, 'Database init failed');
      res.status(500).json({ error: 'Database initialization failed', message: err.message });
    }
  });

  // SPA fallback — serve index.html for non-API routes
  // Note: /{*path} is the correct Express 5 (path-to-regexp v8) catch-all syntax.
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Centralized error handler — must be after all routes
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const logLevel = status >= 500 ? 'error' : 'warn';
    logger[logLevel](
      {
        err,
        status,
        method: req.method,
        url: req.originalUrl || req.url,
        requestId: req.id,
        remoteAddress: req.ip || (req.socket && req.socket.remoteAddress),
      },
      'Unhandled request error'
    );
    if (res.headersSent) {
      return next(err);
    }
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  let dbReadyPromise;

  if (isAzure) {
    // Self-initialize DB in the background with retries. The server starts
    // immediately so /healthz responds to Azure health probes. API endpoints
    // return 503 until initialization succeeds.
    const SELF_INIT_INTERVAL_MS = 5000;
    const SELF_INIT_MAX_ATTEMPTS = 30;
    let selfInitAttempt = 0;

    const attemptSelfInit = async () => {
      if (draining || dbInitialized) return;
      selfInitAttempt++;
      try {
        await initializeDatabase();
        draining = false;
        dbInitialized = true;
        logger.info({ attempt: selfInitAttempt }, 'Database self-initialized');
      } catch (err) {
        dbInitialized = false;
        const isLockError = err.code === 'SQLITE_BUSY' ||
          err.code === 'SQLITE_LOCKED' ||
          err.code === 'SQLITE_BUSY_SNAPSHOT';
        if (!isLockError) {
          try { await closeDbAdapter(); } catch { /* ignore */ }
          draining = true;
          logger.error({ err }, 'Self-init failed with non-retryable error — call POST /api/admin/init-db after fixing the underlying issue');
        } else if (selfInitAttempt < SELF_INIT_MAX_ATTEMPTS) {
          logger.warn(
            { attempt: selfInitAttempt, maxAttempts: SELF_INIT_MAX_ATTEMPTS, err },
            `Self-init attempt failed, retrying in ${SELF_INIT_INTERVAL_MS / 1000}s`
          );
          setTimeout(attemptSelfInit, SELF_INIT_INTERVAL_MS);
        } else {
          try { await closeDbAdapter(); } catch { /* ignore */ }
          draining = true;
          logger.error(
            { attempts: SELF_INIT_MAX_ATTEMPTS },
            'Self-init failed after max attempts — call POST /api/admin/init-db to initialize manually'
          );
        }
      }
    };

    setTimeout(attemptSelfInit, 2000);
    dbReadyPromise = null; // Azure: no single promise to wait on
  } else {
    // Non-Azure: initialize via an async IIFE, expose promise for tests
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
