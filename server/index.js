/**
 * Server entry point.
 * Creates the app via the factory and starts listening.
 */

// OpenTelemetry must be initialised before any other requires so
// auto-instrumentation can monkey-patch http / express modules.
require('./telemetry');

const { config, validateConfig } = require('./config');

validateConfig();

const logger = require('./logger');
const { createServer } = require('./app');

const { server, dbReady } = createServer();

server.on('error', (err) => {
  logger.fatal({ err }, 'Server error');
  setTimeout(() => process.exit(1), 500);
});

// Wait for DB initialization before accepting connections (non-Azure).
// In Azure, dbReady is null — the server starts immediately so health probes succeed.
(async () => {
  try {
    if (dbReady) await dbReady;
    server.listen(config.PORT, () => {
      logger.info({ port: config.PORT }, "Guess What's Next server running");
    });
  } catch (err) {
    // dbReady rejection is already logged in createServer; exit cleanly.
    logger.fatal({ err }, 'Startup failed');
    setTimeout(() => process.exit(1), 500);
  }
})();

module.exports = { server };

