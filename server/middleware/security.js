/**
 * Security middleware — HTTPS redirect and security headers via helmet.
 */

const helmet = require('helmet');

/**
 * HTTPS redirect middleware for production behind a reverse proxy.
 * Uses X-Forwarded-Proto header (requires trust proxy).
 * Only active when NODE_ENV === 'production'.
 */
function httpsRedirect(req, res, next) {
  if (process.env.NODE_ENV === 'production' && req.get('x-forwarded-proto') === 'http') {
    return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  }
  next();
}

/**
 * Security headers middleware using helmet.
 * CSP allows inline styles, WebSocket connections, data URIs, and self-hosted resources.
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
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
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    'interest-cohort': [],
  },
  xXssProtection: false,
});

module.exports = { httpsRedirect, securityHeaders };
