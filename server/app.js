/**
 * App factory — creates Express app + HTTP server without listening.
 * Used by both the entry point (index.js) and test harness.
 */

const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { config } = require('./config');
const { initDb, getDb, closeDb, isDbInitialized } = require('./db/connection');
const { requireSystem } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const scoreRoutes = require('./routes/scores');
const matchRoutes = require('./routes/matches');
const puzzleRoutes = require('./routes/puzzles');
const achievementRoutes = require('./routes/achievements');
const { initWebSocket, rooms } = require('./ws/matchHandler');

const pkg = require('../package.json');

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
    if (req.path === '/healthz' || req.path.startsWith('/api/admin/')) return next();

    if (draining) {
      return res.status(503).json({ error: 'Server is draining', retryAfter: 5 });
    }

    if (!dbInitialized && req.path.startsWith('/api/')) {
      // In Azure environments, DB is initialized only via /api/admin/init-db
      // to prevent race conditions during orchestrated deploys
      if (isAzure) {
        return res.status(503).json({ error: 'Database not yet initialized', retryAfter: 5 });
      }
      // In non-Azure (dev/test), auto-init on first request for convenience
      try {
        initDb();
        dbInitialized = true;
        console.log('📦 Database initialized (on first request)');
      } catch (err) {
        console.error('❌ Database auto-init failed:', err.message);
        return res.status(503).json({ error: 'Database not ready', retryAfter: 5 });
      }
    }

    activeRequests++;
    let counted = true;
    res.on('close', () => {
      if (counted) { activeRequests = Math.max(0, activeRequests - 1); counted = false; }
    });
    next();
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/scores', scoreRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api/puzzles', puzzleRoutes);
  app.use('/api/achievements', achievementRoutes);

  // Health check (system access only)
  app.get('/api/health', requireSystem, (req, res) => {
    const checks = {};

    // Database check
    if (!dbInitialized || !isDbInitialized()) {
      checks.database = { status: 'not_initialized', responseMs: -1 };
    } else {
      try {
        const start = Date.now();
        const db = getDb();
        db.prepare('SELECT 1').get();
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
        for (const p of room.players) {
          if (p.ws && p.ws.readyState === 1) activeConnections++;
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
  });

  // Unauthenticated liveness probe for container orchestrators
  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok');
  });

  // Admin: drain DB connections (for orchestrated deploys)
  app.post('/api/admin/drain', requireSystem, (_req, res) => {
    draining = true;
    let responded = false;

    const finish = (result) => {
      if (responded) return;
      responded = true;
      closeDb();
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
  app.post('/api/admin/init-db', requireSystem, (_req, res) => {
    try {
      draining = false;
      initDb();
      dbInitialized = true;
      console.log('📦 Database initialized (via admin endpoint)');
      res.json({ status: 'initialized' });
    } catch (err) {
      console.error('❌ Database init failed:', err.message);
      res.status(500).json({ error: 'Database initialization failed', message: err.message });
    }
  });

  // SPA fallback — serve index.html for non-API routes
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // In non-Azure environments, init DB eagerly for local dev convenience
  if (!isAzure) {
    try {
      initDb();
      dbInitialized = true;
    } catch (err) {
      console.error('❌ Database initialization failed:', err.message);
      console.error(err.stack);
      process.exit(1);
    }
  }
  initWebSocket(server);

  return { app, server };
}

module.exports = { createServer };
