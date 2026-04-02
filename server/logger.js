const pino = require('pino');
const { config } = require('./config');

const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});

module.exports = logger;
