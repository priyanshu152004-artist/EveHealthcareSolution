const {
  api, pool, useTestDatabase, createUser, createCatalogue, createBooking, future,
} = require('./helpers');

useTestDatabase();

let patient;
let cat;
beforeEach(async () => {
  patient = await createUser('patient@example.com');
  cat = await createCatalogue();
});

const book = (headers, overrides = {}) =>
  api()
    .post('/bookings/')
    .set(headers)
    .send({ centre_id: cat.centreId, test_id: cat.testId, appointment_at: future(), ...overrides });

test('booking snapshots the price', async () => {
  const admin = await createUser('admin@example.com', { isAdmin: true });
  const booking = await createBooking(patient.headers, cat);
  expect(booking).toMatchObject({ status: 'PENDING', amount: '349.00', user_id: patient.id });

  await api()
    .put(`/centres/${cat.centreId}/tests/`)
    .set(admin.headers)
    .send({ test_id: cat.testId, price: '999.00' });
  const res = await api().get(`/bookings/${booking.id}`).set(patient.headers);
  expect(res.body.amount).toBe('349.00');
});

test('timezones are normalised to UTC; naive times are UTC', async () => {
  let b = await createBooking(patient.headers, cat, { appointment_at: '2030-01-15T10:30:00+05:30' });
  expect(b.appointment_at).toBe('2030-01-15T05:00:00.000Z');
  b = await createBooking(patient.headers, cat, { appointment_at: '2030-01-16T10:30:00' });
  expect(b.appointment_at).toBe('2030-01-16T10:30:00.000Z');
});

test('booking requires auth', async () => {
  expect((await book({})).status).toBe(401);
});

test('booking validation and lookups', async () => {
  const past = new Date(Date.now() - 3600_000).toISOString();
  expect((await book(patient.headers, { appointment_at: past })).status).toBe(400);
  expect((await book(patient.headers, { appointment_at: 'tomorrow' })).status).toBe(422);
  expect((await book(patient.headers, { centre_id: '1' })).status).toBe(422);
  expect((await book(patient.headers, { centre_id: 9999 })).status).toBe(404);
  expect((await book(patient.headers, { test_id: 9999 })).status).toBe(404);
  expect((await book(patient.headers, { test_id: cat.unavailableTestId })).status).toBe(400);
});

test('cannot book at an inactive centre', async () => {
  await pool.query('UPDATE diagnostic_centres SET is_active = false');
  expect((await book(patient.headers)).status).toBe(400);
});

test('duplicate active booking is rejected; allowed again after cancelling', async () => {
  const when = future();
  const first = await book(patient.headers, { appointment_at: when });
  expect(first.status).toBe(201);
  const dupe = await book(patient.headers, { appointment_at: when });
  expect(dupe.status).toBe(409);

  await api().post(`/bookings/${first.body.id}/cancel`).set(patient.headers);
  expect((await book(patient.headers, { appointment_at: when })).status).toBe(201);
});

test('users only see their own bookings', async () => {
  const other = await createUser('other@example.com');
  const booking = await createBooking(patient.headers, cat);

  expect((await api().get(`/bookings/${booking.id}`).set(other.headers)).status).toBe(404);
  expect((await api().get('/bookings/').set(other.headers)).body.total).toBe(0);
  expect((await api().get('/bookings/').set(patient.headers)).body.total).toBe(1);
  expect((await api().get('/bookings/9999').set(patient.headers)).status).toBe(404);
});

test('admin sees all bookings', async () => {
  const admin = await createUser('admin@example.com', { isAdmin: true });
  const booking = await createBooking(patient.headers, cat);
  expect((await api().get('/bookings/').set(admin.headers)).body.total).toBe(1);
  expect((await api().get(`/bookings/${booking.id}`).set(admin.headers)).status).toBe(200);
});

test('status filter', async () => {
  await createBooking(patient.headers, cat);
  expect((await api().get('/bookings/?status=PENDING').set(patient.headers)).body.total).toBe(1);
  expect((await api().get('/bookings/?status=CONFIRMED').set(patient.headers)).body.total).toBe(0);
  expect((await api().get('/bookings/?status=BOGUS').set(patient.headers)).status).toBe(422);
});

test('cancel: only the owner, only once', async () => {
  const other = await createUser('other@example.com');
  const booking = await createBooking(patient.headers, cat);
  const url = `/bookings/${booking.id}/cancel`;

  expect((await api().post(url).set(other.headers)).status).toBe(404);
  const res = await api().post(url).set(patient.headers);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('CANCELLED');
  expect((await api().post(url).set(patient.headers)).status).toBe(409);
});
