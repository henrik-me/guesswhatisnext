/**
 * Server entry point.
 * Creates the app via the factory and starts listening.
 */

const { config, validateConfig } = require('./config');

validateConfig();

const { createServer } = require('./app');

const { server } = createServer();

server.listen(config.PORT, () => {
  console.log(`🧩 Guess What's Next server running on http://localhost:${config.PORT}`);
});

module.exports = { server };

