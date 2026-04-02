const express = require('express');
const rateLimit = require('express-rate-limit');
const { optionalAuth } = require('../middleware/auth');
const logger = require('../logger');

const router = express.Router();

const errorReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many error reports, try again later' },
});

router.post('/errors', errorReportLimiter, optionalAuth, (req, res) => {
  const { message, source, lineno, colno, stack, type } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const safeString = (val, maxLen) => (typeof val === 'string' ? val.substring(0, maxLen) : undefined);
  const safeInt = (val) => (Number.isFinite(val) ? val : undefined);

  const errorContext = {
    clientError: true,
    type: safeString(type, 50) || 'error',
    source: safeString(source, 500) || 'unknown',
    lineno: safeInt(lineno),
    colno: safeInt(colno),
    userId: req.user?.id || null,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };

  logger.warn(errorContext, `Client error: ${message.substring(0, 500)}`);

  if (typeof stack === 'string' && stack.length > 0) {
    logger.debug({ clientError: true, stack: stack.substring(0, 2000) }, 'Client error stack trace');
  }

  res.status(204).end();
});

module.exports = router;
