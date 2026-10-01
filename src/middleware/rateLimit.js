const config = require('../config');
const { TooManyRequests } = require('../errors');

/**
 * Sliding-window, in-process rate limiter keyed by client IP. Fine for one
 * process; with several instances it should move to Redis so the count is shared.
 */
function createRateLimiter({ windowMs = 60_000, limit = () => config.authRateLimitPerMinute } = {}) {
  const hits = new Map();

  function middleware(req, res, next) {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit()) {
      hits.set(req.ip, recent);
      res.set('Retry-After', String(Math.ceil((windowMs - (now - recent[0])) / 1000)));
      throw TooManyRequests('Too many requests, please retry later');
    }
    recent.push(now);
    hits.set(req.ip, recent);
    next();
  }
  middleware.reset = () => hits.clear();
  return middleware;
}

const authRateLimiter = createRateLimiter();

module.exports = { createRateLimiter, authRateLimiter };
