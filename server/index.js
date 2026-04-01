/**
 * Server entry point.
 * Creates the app via the factory and starts listening.
 */

const { config, validateConfig } = require('./config');

validateConfig();

const { createServer } = require('./app');

const { server, dbReady } = createServer();

// Wait for DB initialization before accepting connections (non-Azure).
// In Azure, dbReady is null — the server starts immediately so health probes succeed.
(async () => {
  if (dbReady) await dbReady;
  server.listen(config.PORT, () => {
    console.log(`🧩 Guess What's Next server running on http://localhost:${config.PORT}`);
  });
})();

module.exports = { server };

