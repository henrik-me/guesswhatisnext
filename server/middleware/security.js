/**
 * Security middleware — HTTPS redirect and security headers via helmet.
 */

const helmet = require('helmet');
const { config } = require('../config');

/**
 * HTTPS redirect middleware for production behind a reverse proxy.
 * Uses req.secure / req.protocol (which honour trust proxy) for robust
 * handling of X-Forwarded-Proto (including comma-separated lists).
 * Only active when NODE_ENV === 'production'.
 */
function httpsRedirect(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    const isSecure = req.secure || req.protocol === 'https';
    if (!isSecure) {
      const host = config.CANONICAL_HOST;
      if (!host || !/^[\w][\w.-]*(:\d+)?$/.test(host)) {
        // Fail closed: refuse to redirect without a valid hostname.
        return res.status(421).send('Misdirected Request');
      }
      return res.redirect(308, `https://${host}${req.originalUrl}`);
    }
  }
  next();
}

/**
 * Security headers middleware using helmet.
 * CSP allows inline styles, WebSocket connections, data URIs, and self-hosted resources.
 * Permissions-Policy is set manually since helmet does not emit it.
 */
function securityHeaders(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  helmetMiddleware(req, res, next);
}

const isProduction = config.NODE_ENV === 'production' || config.NODE_ENV === 'staging';

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  // HSTS only in production/staging to avoid browser caching issues in dev
  strictTransportSecurity: isProduction
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xXssProtection: false,
});

module.exports = { httpsRedirect, securityHeaders };
