/**
 * App factory — creates Express app + HTTP server without listening.
 * Used by both the entry point (index.js) and test harness.
 */

const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { config } = require('./config');
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
const { initWebSocket, rooms } = require('./ws/matchHandler');

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
    console.log('🔑 System account seeded');
  }

  // Bootstrap: promote ADMIN_USERNAME to admin if set AND the system API key
  // is explicitly configured to a non-default value.
  const adminUsername = process.env.ADMIN_USERNAME;
  const keyExplicitlySet = !!process.env.SYSTEM_API_KEY && process.env.SYSTEM_API_KEY !== 'gwn-dev-system-key';
  if (adminUsername && keyExplicitlySet) {
    const adminUser = await db.get('SELECT id, role FROM users WHERE username = ?', [adminUsername]);
    if (adminUser && adminUser.role === 'user') {
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [adminUser.id]);
      console.log(`👑 Auto-promoted ${adminUsername} to admin`);
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

  console.log('📦 Database initialized');
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

  // Middleware
  app.use(express.json());

  // Serve static files from public/
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Request tracking middleware — gates API access on DB readiness
  app.use((req, res, next) => {
    if (req.path === '/healthz' || req.path === '/api/health' || req.path.startsWith('/api/admin/')) return next();

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
      console.log(`🔌 Database connection closed (drain: ${result.status})`);
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
      console.log('📦 Database initialized (via admin endpoint)');
      res.json({ status: 'initialized' });
    } catch (err) {
      try { await closeDbAdapter(); } catch { /* ignore */ }
      draining = true;
      dbInitialized = false;
      console.error('❌ Database init failed:', err.message);
      res.status(500).json({ error: 'Database initialization failed', message: err.message });
    }
  });

  // SPA fallback — serve index.html for non-API routes
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
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
        console.log(`📦 Database self-initialized on attempt ${selfInitAttempt}`);
      } catch (err) {
        dbInitialized = false;
        const isLockError = err.code === 'SQLITE_BUSY' ||
          err.code === 'SQLITE_LOCKED' ||
          err.code === 'SQLITE_BUSY_SNAPSHOT';
        if (!isLockError) {
          try { await closeDbAdapter(); } catch { /* ignore */ }
          draining = true;
          console.error(`❌ Self-init failed with non-retryable error: ${err.message}`);
          console.error('Call POST /api/admin/init-db after fixing the underlying issue.');
        } else if (selfInitAttempt < SELF_INIT_MAX_ATTEMPTS) {
          console.warn(
            `⏳ Self-init attempt ${selfInitAttempt}/${SELF_INIT_MAX_ATTEMPTS} failed: ${err.message}. Retrying in ${SELF_INIT_INTERVAL_MS / 1000}s...`
          );
          setTimeout(attemptSelfInit, SELF_INIT_INTERVAL_MS);
        } else {
          try { await closeDbAdapter(); } catch { /* ignore */ }
          draining = true;
          console.error(
            `❌ Self-init failed after ${SELF_INIT_MAX_ATTEMPTS} attempts. Call POST /api/admin/init-db to initialize manually.`
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
        console.error('❌ Database initialization failed:', err.message);
        console.error(err.stack);
        process.exit(1);
      }
    })();
  }
  initWebSocket(server, () => dbInitialized && !draining);

  return { app, server, dbReady: dbReadyPromise };
}

module.exports = { createServer };
