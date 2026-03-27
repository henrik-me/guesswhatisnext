/**
 * Auth routes — register, login, token refresh.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../db/connection');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many registration attempts, try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** POST /api/auth/register */
router.post('/register', registerLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3-20 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);

  const user = { id: result.lastInsertRowid, username, role: 'user' };
  const token = generateToken(user);

  res.status(201).json({ user: { id: user.id, username, role: 'user' }, token });
});

/** POST /api/auth/login */
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = generateToken({ id: user.id, username: user.username, role: user.role });
  res.json({ user: { id: user.id, username: user.username, role: user.role }, token });
});

/** GET /api/auth/me — get current user from token */
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({
    user: {
      ...req.user,
      created_at: row?.created_at || null,
    },
  });
});

module.exports = router;
