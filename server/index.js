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

function exitAfterFlush() {
  setTimeout(() => process.exit(1), 500);
}

function handleFatalStartupError(err, message) {
  logger.fatal({ err }, message);
  exitAfterFlush();
}

server.on('error', (err) => {
  handleFatalStartupError(err, 'Server error');
});

// Wait for DB initialization before accepting connections (non-Azure).
// In Azure, dbReady is null — the server starts immediately so health probes succeed.
async function startServer() {
  if (dbReady) {
    await dbReady;
  }

  server.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "Guess What's Next server running");
  });
}

startServer().catch((err) => {
  handleFatalStartupError(err, 'Startup failed');
});

module.exports = { server, startServer };

