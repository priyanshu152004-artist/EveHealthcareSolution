const crypto = require('crypto');
const { Router } = require('express');
const config = require('../config');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { Unauthorized } = require('../errors');
const payments = require('../services/payments');

const router = Router();

function signWebhook(rawBody) {
  return crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest('hex');
}

// HMAC-SHA256 of the raw request bytes, checked before the body is trusted.
function verifyWebhookSignature(req, res, next) {
  const given = Buffer.from(req.get('x-webhook-signature') || '', 'utf8');
  const expected = Buffer.from(signWebhook(req.rawBody || Buffer.alloc(0)), 'utf8');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw Unauthorized('Invalid webhook signature');
  }
  next();
}

/**
 * Simulated payment. SUCCESS confirms the booking, FAILED marks it FAILED
 * (it can be retried). An Idempotency-Key header makes client retries safe:
 * a replay returns the original payment with 200 instead of 201.
 */
router.post('/', authenticate, validate({ body: schemas.paymentCreate }), async (req, res) => {
  const key = schemas.idempotencyKey.parse(req.get('idempotency-key') || undefined);
  const { payment, created } = await payments.createPayment(req.user, req.valid.body, key);
  res.status(created ? 201 : 200).json(payment);
});

/** Payment-status callback from the (simulated) provider. Idempotent. */
router.post('/webhook', verifyWebhookSignature, validate({ body: schemas.webhook }), async (req, res) => {
  res.json(await payments.processWebhook(req.valid.body));
});

module.exports = { router, signWebhook };
