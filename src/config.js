require('dotenv').config({ quiet: true });

const env = process.env;

// A plain mutable object so tests can tweak individual settings.
const config = {
  port: Number(env.PORT || 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://eve:eve@localhost:5432/eve',
  jwtSecret: env.JWT_SECRET || 'dev-only-insecure-jwt-secret-change-me-please',
  jwtExpiresInSeconds: Number(env.JWT_EXPIRES_IN_SECONDS || 3600),
  webhookSecret: env.WEBHOOK_SECRET || 'dev-only-webhook-secret',
  paymentSuccessRate: Number(env.PAYMENT_SUCCESS_RATE ?? 0.8),
  authRateLimitPerMinute: Number(env.AUTH_RATE_LIMIT_PER_MINUTE || 10),
  bcryptRounds: Number(env.BCRYPT_ROUNDS || 12),
  logLevel: env.LOG_LEVEL || 'info',
};

module.exports = config;
