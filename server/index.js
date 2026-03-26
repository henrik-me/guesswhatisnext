/**
 * Server entry point.
 * Creates the app via the factory and starts listening.
 */

const { createServer } = require('./app');

const PORT = process.env.PORT || 3000;

const { server } = createServer();

server.listen(PORT, () => {
  console.log(`🧩 Guess What's Next server running on http://localhost:${PORT}`);
});

module.exports = { server };

