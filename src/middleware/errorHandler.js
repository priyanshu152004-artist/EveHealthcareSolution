const { ZodError } = require('zod');
const { AppError } = require('../errors');
const { logger } = require('../logger');

// Unique constraints that can be hit by legitimate (racing) requests.
const CONFLICT_MESSAGES = {
  users_email_key: 'An account with this email already exists',
  uq_centre_name_city: 'A centre with this name already exists in this city',
  diagnostic_tests_name_key: 'A test with this name already exists',
  uq_booking_active_slot: 'You already have an active booking for this test at this time',
  uq_payment_booking_active: 'A payment for this booking is already in progress or completed',
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ detail: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(422).json({
      detail: 'Validation failed',
      errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ detail: 'Malformed JSON body' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ detail: CONFLICT_MESSAGES[err.constraint] || 'Conflict' });
  }
  logger.error({ err }, 'unhandled error');
  return res.status(500).json({ detail: 'Internal server error' });
}

module.exports = { errorHandler };
