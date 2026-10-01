const payments = require('../src/services/payments');
const {
  api, pool, useTestDatabase, createUser, createCatalogue, createBooking, sendWebhook,
} = require('./helpers');

useTestDatabase();

let patient;
let payment;
beforeEach(async () => {
  patient = await createUser('patient@example.com');
  const booking = await createBooking(patient.headers, await createCatalogue());
  const res = await api()
    .post('/payments/')
    .set(patient.headers)
    .send({ booking_id: booking.id, simulate_outcome: 'PENDING' });
  payment = res.body;
});

const event = (overrides = {}) => ({
  event_id: 'evt_1',
  payment_reference: payment.provider_reference,
  status: 'SUCCESS',
  amount: payment.amount,
  ...overrides,
});

const bookingStatus = async () =>
  (await api().get(`/bookings/${payment.booking_id}`).set(patient.headers)).body.status;

const count = async (table) =>
  (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;

test('SUCCESS event confirms the booking', async () => {
  const res = await sendWebhook(event());
  expect(res.status).toBe(200);
  expect(res.body).toEqual({
    event_id: 'evt_1',
    result: 'processed',
    payment_status: 'SUCCESS',
    booking_status: 'CONFIRMED',
    detail: null,
  });
  expect(await bookingStatus()).toBe('CONFIRMED');
});

test('FAILED event fails the booking', async () => {
  const res = await sendWebhook(event({ status: 'FAILED', failure_reason: 'Card declined' }));
  expect(res.body).toMatchObject({ result: 'processed', booking_status: 'FAILED' });
});

test('replayed event is idempotent', async () => {
  const first = await sendWebhook(event());
  expect(first.body.result).toBe('processed');
  for (let i = 0; i < 3; i++) {
    const replay = await sendWebhook(event());
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ result: 'duplicate', booking_status: 'CONFIRMED' });
  }
  expect(await count('webhook_events')).toBe(1);
  expect(await count('payments')).toBe(1);
  expect(await count('bookings')).toBe(1);
});

test('amount formatting differences do not break idempotency', async () => {
  await sendWebhook(event({ amount: '349.00' }));
  const replay = await sendWebhook(event({ amount: 349 }));
  expect(replay.body.result).toBe('duplicate');
});

test('event_id reused with a different payload is rejected', async () => {
  await sendWebhook(event());
  expect((await sendWebhook(event({ status: 'FAILED' }))).status).toBe(409);
});

test('a late conflicting event cannot flip a settled payment', async () => {
  await sendWebhook(event({ event_id: 'evt_1', status: 'SUCCESS' }));
  const res = await sendWebhook(event({ event_id: 'evt_2', status: 'FAILED' }));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ result: 'ignored', payment_status: 'SUCCESS' });
  expect(await bookingStatus()).toBe('CONFIRMED');
});

test('signature is required and checked', async () => {
  expect((await sendWebhook(event(), { signature: null })).status).toBe(401);
  expect((await sendWebhook(event(), { signature: 'deadbeef' })).status).toBe(401);
  expect(await count('webhook_events')).toBe(0);
});

test('unknown payment reference', async () => {
  expect((await sendWebhook(event({ payment_reference: 'pay_nope' }))).status).toBe(404);
});

test('amount mismatch is rejected and not recorded', async () => {
  expect((await sendWebhook(event({ amount: '1.00' }))).status).toBe(400);
  expect(await count('webhook_events')).toBe(0);
  expect(await bookingStatus()).toBe('PENDING');
});

test('malformed payloads', async () => {
  expect((await sendWebhook(event({ status: 'MAYBE' }))).status).toBe(422);
  expect((await sendWebhook({ event_id: 'x' })).status).toBe(422);
});

test('a crash mid-processing records nothing, so the provider retry succeeds', async () => {
  const { pool: dbPool } = require('../src/db');
  const original = dbPool.connect.bind(dbPool);
  // Make the UPDATE on payments fail once, inside the webhook transaction.
  const spy = jest.spyOn(dbPool, 'connect').mockImplementationOnce(async () => {
    const client = await original();
    const query = client.query.bind(client);
    client.query = (text, params) =>
      typeof text === 'string' && text.startsWith('UPDATE payments')
        ? Promise.reject(new Error('db hiccup'))
        : query(text, params);
    const release = client.release.bind(client);
    client.release = (...args) => {
      client.query = query;
      return release(...args);
    };
    return client;
  });

  expect((await sendWebhook(event())).status).toBe(500);
  spy.mockRestore();
  expect(await count('webhook_events')).toBe(0);

  const retry = await sendWebhook(event());
  expect(retry.body.result).toBe('processed');
});

test('concurrent deliveries of the same event are applied exactly once', async () => {
  const payload = event();
  const results = await Promise.all(Array.from({ length: 8 }, () => payments.processWebhook(payload)));
  const kinds = results.map((r) => r.result);
  expect(kinds.filter((k) => k === 'processed')).toHaveLength(1);
  expect(kinds.filter((k) => k === 'duplicate')).toHaveLength(7);
  expect(await count('webhook_events')).toBe(1);
});
