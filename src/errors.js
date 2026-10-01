// Domain errors. Services throw these; the error handler turns them into HTTP
// responses, so business logic never deals with `res`.
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const BadRequest = (msg) => new AppError(400, msg);
const Unauthorized = (msg) => new AppError(401, msg);
const Forbidden = (msg) => new AppError(403, msg);
const NotFound = (msg) => new AppError(404, msg);
const Conflict = (msg) => new AppError(409, msg);
const TooManyRequests = (msg) => new AppError(429, msg);

/** Postgres unique_violation, optionally for a specific constraint/index. */
function isUniqueViolation(err, constraint) {
  return err?.code === '23505' && (!constraint || err.constraint === constraint);
}

module.exports = {
  AppError,
  BadRequest,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
  TooManyRequests,
  isUniqueViolation,
};
