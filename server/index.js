/**
 * Server entry point.
 * Express app serving static files + API routes + WebSocket.
 */

const express = require('express');
const path = require('path');
const http = require('http');
const { initDb } = require('./db/connection');
const { requireAuth, requireSystem } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const scoreRoutes = require('./routes/scores');
const matchRoutes = require('./routes/matches');
const puzzleRoutes = require('./routes/puzzles');
const { initWebSocket } = require('./ws/matchHandler');

const PORT = process.env.PORT || 3000;

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

// Health check (system access only)
app.get('/api/health', requireSystem, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback — serve index.html for non-API routes
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Initialize database and start server
initDb();
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`🧩 Guess What's Next server running on http://localhost:${PORT}`);
});

module.exports = { app, server };
