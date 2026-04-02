const pino = require('pino');
const { config } = require('./config');

const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers["x-access-token"]',
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
  ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});

module.exports = logger;
