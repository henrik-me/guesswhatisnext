const express = require('express');
const rateLimit = require('express-rate-limit');
const { optionalAuth } = require('../middleware/auth');
const logger = require('../logger');
const { getDeployEnvironment } = require('../config');

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


const UX_EVENT_NAME = 'progressiveLoader.warmupExhausted';
const UX_SCREENS = new Set(['leaderboard', 'profile', 'achievements', 'community']);
const UX_OUTCOMES = new Set(['success', 'cap-exhausted', 'aborted']);
const UX_EVENT_FIELDS = ['event', 'screen', 'outcome', 'attempts', 'totalWaitMs'];

function validateUxEventPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'body must be a JSON object' };
  }

  const extraFields = Object.keys(body).filter((key) => !UX_EVENT_FIELDS.includes(key));
  if (extraFields.length > 0) {
    return { error: `unexpected field: ${extraFields[0]}` };
  }

  const { event, screen, outcome, attempts, totalWaitMs } = body;
  if (event !== UX_EVENT_NAME) {
    return { error: `event must be ${UX_EVENT_NAME}` };
  }
  if (!UX_SCREENS.has(screen)) {
    return { error: `screen must be one of ${Array.from(UX_SCREENS).join(', ')}` };
  }
  if (!UX_OUTCOMES.has(outcome)) {
    return { error: `outcome must be one of ${Array.from(UX_OUTCOMES).join(', ')}` };
  }
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 50) {
    return { error: 'attempts must be an integer from 0 to 50' };
  }
  if (!Number.isInteger(totalWaitMs) || totalWaitMs < 0 || totalWaitMs > 600000) {
    return { error: 'totalWaitMs must be an integer from 0 to 600000' };
  }

  return { value: { event, screen, outcome, attempts, totalWaitMs } };
}

function addUxEventToActiveSpan(attributes) {
  try {
    const { trace } = require('@opentelemetry/api');
    const span = trace && typeof trace.getActiveSpan === 'function'
      ? trace.getActiveSpan()
      : null;
    if (span && typeof span.addEvent === 'function') {
      span.addEvent(UX_EVENT_NAME, attributes);
    }
  } catch {
    // OpenTelemetry is best-effort telemetry; never fail ingestion if unavailable.
  }
}

const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // req.ip respects trust proxy setting, giving the real client IP behind a reverse proxy
  message: { error: 'Too many telemetry requests, try again later' },
});

router.post('/errors', telemetryLimiter, optionalAuth, parseTelemetryJson, (req, res) => {
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
// no auth middleware is applied. Shares `telemetryLimiter` with /errors so a
// pathological client can't bypass per-IP throttling by mixing routes. The
// signal is best-effort observability (input is client-supplied + IP can be
// spoofed) — never use it for security decisions. KQL: docs/observability.md
// § B.15 (auth-warmup-deadline-exhausted incidents per day per action).

router.post('/ux-events', telemetryLimiter, parseTelemetryJson, (req, res) => {
  const parsed = validateUxEventPayload(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const environment = getDeployEnvironment();
  const fields = { ...parsed.value, environment };

  logger.warn(fields, 'ProgressiveLoader warmup retry loop exited');
  addUxEventToActiveSpan(fields);

  res.status(204).end();
});

router.post('/auth-deadline-exhausted', telemetryLimiter, parseTelemetryJson, (req, res) => {
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
