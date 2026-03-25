/**
 * Auth routes — register, login, token refresh.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/connection');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

/** POST /api/auth/register */
router.post('/register', (req, res) => {
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

  const user = { id: result.lastInsertRowid, username };
  const token = generateToken(user);

  res.status(201).json({ user: { id: user.id, username }, token });
});

/** POST /api/auth/login */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = generateToken({ id: user.id, username: user.username });
  res.json({ user: { id: user.id, username: user.username }, token });
});

/** GET /api/auth/me — get current user from token */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
