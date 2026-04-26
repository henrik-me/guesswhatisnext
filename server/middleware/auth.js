/**
 * Auth middleware — JWT token verification and API key auth.
 */

const jwt = require('jsonwebtoken');
const { config } = require('../config');

const JWT_SECRET = config.JWT_SECRET;
const SYSTEM_API_KEY = config.SYSTEM_API_KEY;

/**
 * Coerce a JWT-payload user id to a safe positive integer, OR return
 * `null` if the value can't be safely interpreted as a real user id.
 *
 * Rationale (Copilot R4 + R5):
 * - The JWT is JSON, so a number serialized to a JWT comes back as a
 *   number; but defense-in-depth coercion here keeps every downstream
 *   consumer (DB queries, ownership checks, in-memory caches like
 *   `unread-count-cache`) on a single, comparable type — even if a
 *   non-numeric id ever sneaks into the payload (e.g. UUID-id user
 *   introduced later).
 * - Returning `null` (rather than collapsing to 0) on invalid input
 *   prevents a malformed token from silently authenticating as the
 *   system pseudo-user (id 0). `requireAuth` MUST treat null as a 401
 *   and `optionalAuth` MUST treat it as no auth.
 */
function _coerceUserId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

/** Middleware: require valid auth (JWT Bearer OR X-API-Key). */
function requireAuth(req, res, next) {
  // Check X-API-Key first (for system account)
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    if (apiKey === SYSTEM_API_KEY) {
      req.user = { id: 0, username: 'system', role: 'system' };
      return next();
    }
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Fall back to JWT Bearer
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const coercedId = _coerceUserId(payload.id);
    if (coercedId === null) {
      // Malformed payload (non-numeric / non-positive id) — refuse to
      // authenticate rather than collapsing to id=0 (the system pseudo).
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = { id: coercedId, username: payload.username, role: payload.role || 'user' };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Middleware: require system role (API key auth only). */
function requireSystem(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'system' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'System access required' });
    }
    next();
  });
}

/** Optional auth — sets req.user if token/key present, continues otherwise. */
function optionalAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === SYSTEM_API_KEY) {
    req.user = { id: 0, username: 'system', role: 'system' };
    return next();
  }

  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const coercedId = _coerceUserId(payload.id);
      // Same rule as requireAuth: a malformed id means "no usable auth";
      // continue without setting req.user rather than authenticating as
      // the system pseudo-user.
      if (coercedId !== null) {
        req.user = { id: coercedId, username: payload.username, role: payload.role || 'user' };
      }
    } catch { /* continue without user */ }
  }
  next();
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role || 'user' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { requireAuth, requireSystem, optionalAuth, generateToken, JWT_SECRET };
