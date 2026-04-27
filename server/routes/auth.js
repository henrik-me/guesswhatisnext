/**
 * Auth routes — register, login, token refresh.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { getDbAdapter } = require('../db');
const { generateToken, requireAuth } = require('../middleware/auth');
const { isReservedUsername } = require('../reserved-usernames');
const logger = require('../logger');
const { bootQuietContext, logBootQuiet } = require('../services/boot-quiet');

const router = express.Router();

const rateLimitHandler = (req, res, _next, options) => {
  logger.warn({ ip: req.ip }, 'Auth rate limit exceeded');
  res.status(options.statusCode).json(options.message);
};

const registerBurstLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many registration attempts, try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const registerHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: 'Hourly registration limit reached, try again later' },
  standardHeaders: false,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const registerDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 50,
  message: { error: 'Daily registration limit reached, try again tomorrow' },
  standardHeaders: false,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** POST /api/auth/register */
router.post('/register', registerDailyLimiter, registerHourlyLimiter, registerBurstLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }
    if (isReservedUsername(username)) {
      return res.status(400).json({ error: "Username prefix 'gwn-smoke-' is reserved" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const db = await getDbAdapter();

    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);

    const user = { id: result.lastId, username, role: 'user' };
    const token = generateToken(user);

    logger.info({ username }, 'User registered');

    res.status(201).json({ user: { id: user.id, username, role: 'user' }, token });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/login */
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const db = await getDbAdapter();
    const user = await db.get('SELECT id, username, password_hash, role FROM users WHERE username = ?', [username]);

    if (!user) {
      logger.warn({ username }, 'Login failed: user not found');
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      logger.warn({ username }, 'Login failed: invalid password');
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken({ id: user.id, username: user.username, role: user.role });
    logger.info({ username: user.username, userId: user.id }, 'User logged in');
    res.json({ user: { id: user.id, username: user.username, role: user.role }, token });
  } catch (err) {
    next(err);
  }
});

/** GET /api/auth/me — get current user from token.
 *
 * Boot-quiet contract (CS53-19): the JWT is validated in-memory by
 * `requireAuth` middleware (no DB). The DB lookup of the user record is
 * SKIPPED for header-less non-system requests — the JWT-derived `req.user`
 * shape (id, username, role) is sufficient for boot-time UI ("logged in
 * as X"). When `X-User-Activity: 1` IS present (or system-key caller),
 * we look up `created_at` and any other DB-only fields. The SPA tolerates
 * `created_at: null` on the boot-time response and re-fetches with the
 * activity header on the first user gesture.
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const ctx = bootQuietContext(req);
    if (!ctx.allowDb) {
      logBootQuiet('/api/auth/me', ctx, false);
      return res.json({
        user: {
          ...req.user,
          created_at: null,
        },
      });
    }
    const db = await getDbAdapter();
    const row = await db.get('SELECT created_at FROM users WHERE id = ?', [req.user.id]);
    logBootQuiet('/api/auth/me', ctx, true);
    res.json({
      user: {
        ...req.user,
        created_at: row?.created_at || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
