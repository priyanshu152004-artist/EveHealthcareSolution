const { AsyncLocalStorage } = require('async_hooks');
const pino = require('pino');
const config = require('./config');

// Holds the current request id so every log line written while handling a
// request (including from services) carries it automatically.
const requestContext = new AsyncLocalStorage();

const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: () => {
    const ctx = requestContext.getStore();
    return ctx ? { request_id: ctx.requestId } : {};
  },
});

module.exports = { logger, requestContext };
