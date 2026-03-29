/**
 * App factory — creates Express app + HTTP server without listening.
 * Used by both the entry point (index.js) and test harness.
 */

const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { config } = require('./config');
const { initDb, getDb } = require('./db/connection');
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

  // Middleware
  app.use(express.json());

  // Serve static files from public/
  app.use(express.static(path.join(__dirname, '..', 'public')));

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

  // SPA fallback — serve index.html for non-API routes
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Initialize database and WebSocket
  initDb();
  initWebSocket(server);

  return { app, server };
}

module.exports = { createServer };
