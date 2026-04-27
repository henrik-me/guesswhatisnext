const express = require('express');
const rateLimit = require('express-rate-limit');
const { optionalAuth } = require('../middleware/auth');
const logger = require('../logger');

const router = express.Router();
const telemetryJsonParser = express.json({ type: 'application/json' });

function parseTelemetryJson(req, res, next) {
  telemetryJsonParser(req, res, (err) => {
    if (!err) return next();
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ error: 'Malformed JSON body' });
    }
    return next(err);
  });
}

const errorReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // req.ip respects trust proxy setting, giving the real client IP behind a reverse proxy
  message: { error: 'Too many error reports, try again later' },
});

router.post('/errors', errorReportLimiter, optionalAuth, parseTelemetryJson, (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const {
    message,
    source,
    lineno,
    colno,
    stack,
    type,
  } = body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const safeString = (val, maxLen) => (typeof val === 'string' ? val.substring(0, maxLen) : undefined);
  const safeInt = (val) => (Number.isFinite(val) ? val : undefined);

  const errorContext = {
    component: 'client',
    type: safeString(type, 50) || 'error',
    source: safeString(source, 500) || 'unknown',
    lineno: safeInt(lineno),
    colno: safeInt(colno),
    userId: req.user?.id || null,
    userAgent: safeString(req.headers['user-agent'], 500),
    remoteAddress: req.ip,
  };

  const truncatedStack = typeof stack === 'string' && stack.length > 0
    ? stack.substring(0, 2000)
    : undefined;

  logger.warn(
    { ...errorContext, ...(truncatedStack ? { stack: truncatedStack } : {}) },
    `Client error: ${message.substring(0, 500)}`
  );

  res.status(204).end();
});

// CS53-13.A: one-shot beacon fired by the auth retry loop in public/js/app.js
// when AUTH_WARMUP_DEADLINE_MS (120s) is exhausted without a 200. The user is
// by definition NOT logged in here (the loop guards login/register POSTs), so
// no auth middleware is applied. Shares `errorReportLimiter` with /errors so a
// pathological client can't bypass per-IP throttling by mixing routes. The
// signal is best-effort observability (input is client-supplied + IP can be
// spoofed) — never use it for security decisions. KQL: docs/observability.md
// § B.15 (auth-warmup-deadline-exhausted incidents per day per action).
router.post('/auth-deadline-exhausted', errorReportLimiter, parseTelemetryJson, (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const { attempts, elapsedMs, lastStatus, action } = body;

  if (action !== 'login' && action !== 'register') {
    return res.status(400).json({ error: 'action must be "login" or "register"' });
  }
  if (!Number.isInteger(attempts) || attempts < 0) {
    return res.status(400).json({ error: 'attempts must be a non-negative integer' });
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return res.status(400).json({ error: 'elapsedMs must be a non-negative number' });
  }
  // lastStatus may be null (no response ever received — all attempts errored
  // or aborted) or an HTTP status integer in the standard 100-599 range.
  if (lastStatus !== null && (!Number.isInteger(lastStatus) || lastStatus < 100 || lastStatus > 599)) {
    return res.status(400).json({ error: 'lastStatus must be null or an HTTP status integer' });
  }

  logger.warn(
    {
      event: 'auth-warmup-deadline-exhausted',
      attempts,
      elapsedMs,
      lastStatus,
      action,
      ip: req.ip,
    },
    'Auth retry loop exhausted AUTH_WARMUP_DEADLINE_MS'
  );

  res.status(204).end();
});

module.exports = router;
