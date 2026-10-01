const config = require('../src/config');
const {
  api, pool, useTestDatabase, createUser, createCatalogue, createBooking, future,
} = require('./helpers');

useTestDatabase();

let patient;
let cat;
let booking;
beforeEach(async () => {
  patient = await createUser('patient@example.com');
  cat = await createCatalogue();
  booking = await createBooking(patient.headers, cat);
});

function pay(headers, bookingId, outcome = 'SUCCESS', key) {
  const req = api().post('/payments/').set(headers);
  if (key) req.set('Idempotency-Key', key);
  return req.send({ booking_id: bookingId, simulate_outcome: outcome });
}

test('successful payment confirms the booking', async () => {
  const res = await pay(patient.headers, booking.id);
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({
    status: 'SUCCESS',
    amount: '349.00',
    booking_status: 'CONFIRMED',
    failure_reason: null,
  });
  expect(res.body.provider_reference).toMatch(/^pay_/);
});

test('failed payment marks the booking FAILED and can be retried', async () => {
  let res = await pay(patient.headers, booking.id, 'FAILED');
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ status: 'FAILED', booking_status: 'FAILED' });
  expect(res.body.failure_reason).toBeTruthy();

  res = await pay(patient.headers, booking.id, 'SUCCESS');
  expect(res.status).toBe(201);
  expect(res.body.booking_status).toBe('CONFIRMED');
});

test('random outcome follows PAYMENT_SUCCESS_RATE', async () => {
  const original = config.paymentSuccessRate;
  config.paymentSuccessRate = 0;
  try {
    const res = await api().post('/payments/').set(patient.headers).send({ booking_id: booking.id });
    expect(res.body.status).toBe('FAILED');
  } finally {
    config.paymentSuccessRate = original;
  }
});

test('cannot pay twice', async () => {
  await pay(patient.headers, booking.id);
  expect((await pay(patient.headers, booking.id)).status).toBe(409);
});

test('cannot pay for a cancelled booking', async () => {
  await api().post(`/bookings/${booking.id}/cancel`).set(patient.headers);
  expect((await pay(patient.headers, booking.id)).status).toBe(409);
});

test('cannot pay once the appointment time has passed', async () => {
  await pool.query("UPDATE bookings SET appointment_at = now() - interval '1 minute'");
  expect((await pay(patient.headers, booking.id)).status).toBe(409);
});

test("cannot pay for someone else's or an unknown booking", async () => {
  const other = await createUser('other@example.com');
  const admin = await createUser('admin@example.com', { isAdmin: true });
  expect((await pay(other.headers, booking.id)).status).toBe(404);
  expect((await pay(admin.headers, booking.id)).status).toBe(404);
  expect((await pay(patient.headers, 9999)).status).toBe(404);
});

test('payment validation', async () => {
  expect((await api().post('/payments/').set(patient.headers).send({ booking_id: 'abc' })).status).toBe(422);
  expect((await pay(patient.headers, booking.id, 'MAYBE')).status).toBe(422);
  expect((await api().post('/payments/').send({ booking_id: booking.id })).status).toBe(401);
});

test('the client cannot choose the amount', async () => {
  const res = await api()
    .post('/payments/')
    .set(patient.headers)
    .send({ booking_id: booking.id, simulate_outcome: 'SUCCESS', amount: '1.00' });
  expect(res.body.amount).toBe('349.00');
});

test('Idempotency-Key replay returns the same payment', async () => {
  const first = await pay(patient.headers, booking.id, 'SUCCESS', 'key-1');
  const second = await pay(patient.headers, booking.id, 'SUCCESS', 'key-1');
  expect(first.status).toBe(201);
  expect(second.status).toBe(200);
  expect(second.body.id).toBe(first.body.id);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM payments');
  expect(rows[0].n).toBe(1);
});

test('concurrent requests with the same Idempotency-Key create one payment', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => pay(patient.headers, booking.id, 'SUCCESS', 'key-race')),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
  expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
});

test('concurrent payments without a key can never double-charge', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => pay(patient.headers, booking.id)));
  expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  expect(results.filter((r) => r.status === 409)).toHaveLength(4);
});

test('Idempotency-Key reused for another booking is a conflict', async () => {
  const other = await createBooking(patient.headers, cat, { appointment_at: future(5) });
  await pay(patient.headers, booking.id, 'SUCCESS', 'key-1');
  expect((await pay(patient.headers, other.id, 'SUCCESS', 'key-1')).status).toBe(409);
});

test('a pending payment blocks another payment and cancellation', async () => {
  const res = await pay(patient.headers, booking.id, 'PENDING');
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ status: 'PENDING', booking_status: 'PENDING' });

  expect((await pay(patient.headers, booking.id)).status).toBe(409);
  expect((await api().post(`/bookings/${booking.id}/cancel`).set(patient.headers)).status).toBe(409);
});

test('a confirmed booking can be cancelled', async () => {
  await pay(patient.headers, booking.id);
  const res = await api().post(`/bookings/${booking.id}/cancel`).set(patient.headers);
  expect(res.body.status).toBe('CANCELLED');
});
