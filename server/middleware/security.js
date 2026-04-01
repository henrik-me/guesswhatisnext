/**
 * Security middleware — HTTPS redirect and security headers via helmet.
 */

const helmet = require('helmet');

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
      return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
    }
  }
  next();
}

/**
 * Security headers middleware using helmet.
 * CSP allows inline styles/scripts, data URIs, and self-hosted resources.
 * Permissions-Policy is set manually since helmet does not emit it.
 */
function securityHeaders(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );
  helmetMiddleware(req, res, next);
}

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  strictTransportSecurity: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true,
  },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xXssProtection: false,
});

module.exports = { httpsRedirect, securityHeaders };
