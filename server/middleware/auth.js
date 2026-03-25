/**
 * Auth middleware — JWT token verification and API key auth.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'gwn-dev-secret-change-in-production';
const SYSTEM_API_KEY = process.env.SYSTEM_API_KEY || 'gwn-dev-system-key';

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
    req.user = { id: payload.id, username: payload.username, role: payload.role || 'user' };
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
      req.user = { id: payload.id, username: payload.username, role: payload.role || 'user' };
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
