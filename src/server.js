const config = require('./config');
const { createApp } = require('./app');
const { pool } = require('./db');
const { logger } = require('./logger');

const server = createApp().listen(config.port, () => {
  logger.info({ port: config.port }, `listening on http://localhost:${config.port} (docs at /docs)`);
});

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
