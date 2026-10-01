const bcrypt = require('bcryptjs');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db');
const { migrate } = require('../src/migrate');
const { authRateLimiter } = require('../src/middleware/rateLimit');
const { signWebhook } = require('../src/routes/payments');

const app = createApp();
const api = () => request(app);

/** Fresh schema per test file; truncate between tests. */
function useTestDatabase() {
  beforeAll(async () => {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool);
  });
  beforeEach(async () => {
    authRateLimiter.reset();
    await pool.query(
      `TRUNCATE webhook_events, payments, bookings, centre_tests, diagnostic_centres,
       diagnostic_tests, users RESTART IDENTITY CASCADE`,
    );
  });
  afterAll(() => pool.end());
}

async function createUser(email, { isAdmin = false } = {}) {
  const { rows } = await pool.query(
    'INSERT INTO users (email, full_name, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING id',
    [email, email.split('@')[0], await bcrypt.hash('password123', 4), isAdmin],
  );
  const res = await api().post('/auth/login').send({ email, password: 'password123' });
  return { id: rows[0].id, headers: { Authorization: `Bearer ${res.body.access_token}` } };
}

/** A centre offering CBC (available, 349.00) and Lipid Profile (unavailable). */
async function createCatalogue() {
  const centre = await pool.query(
    "INSERT INTO diagnostic_centres (name, address, city) VALUES ('EVE Andheri', '12 Link Road', 'Mumbai') RETURNING id",
  );
  const tests = await pool.query(
    "INSERT INTO diagnostic_tests (name) VALUES ('CBC'), ('Lipid Profile') RETURNING id",
  );
  const centreId = centre.rows[0].id;
  const [cbc, lipid] = tests.rows.map((r) => r.id);
  await pool.query(
    `INSERT INTO centre_tests (centre_id, test_id, price, is_available)
     VALUES ($1, $2, 349.00, true), ($1, $3, 699.00, false)`,
    [centreId, cbc, lipid],
  );
  return { centreId, testId: cbc, unavailableTestId: lipid };
}

function future(days = 3) {
  const d = new Date(Date.now() + days * 86400_000);
  d.setMilliseconds(0);
  return d.toISOString();
}

async function createBooking(headers, catalogue, overrides = {}) {
  const res = await api()
    .post('/bookings/')
    .set(headers)
    .send({
      centre_id: catalogue.centreId,
      test_id: catalogue.testId,
      appointment_at: future(),
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body;
}

function sendWebhook(payload, { signature = 'auto' } = {}) {
  const body = JSON.stringify(payload);
  const req = api().post('/payments/webhook/').set('Content-Type', 'application/json');
  if (signature === 'auto') req.set('X-Webhook-Signature', signWebhook(body));
  else if (signature) req.set('X-Webhook-Signature', signature);
  return req.send(body);
}

module.exports = {
  app,
  api,
  pool,
  useTestDatabase,
  createUser,
  createCatalogue,
  createBooking,
  future,
  sendWebhook,
};
