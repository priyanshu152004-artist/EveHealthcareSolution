const crypto = require('crypto');
const { logger, requestContext } = require('../logger');

// Assigns a request id (or reuses X-Request-ID), echoes it back, and logs one
// structured line per request when the response finishes.
function requestContextMiddleware(req, res, next) {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  const start = process.hrtime.bigint();
  res.set('X-Request-ID', requestId);
  res.on('finish', () => {
    logger.info(
      {
        request_id: requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        duration_ms: Number((process.hrtime.bigint() - start) / 100000n) / 10,
      },
      'request',
    );
  });
  requestContext.run({ requestId }, next);
}

module.exports = { requestContextMiddleware };
