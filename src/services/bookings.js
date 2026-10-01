const { pool, withTransaction } = require('../db');
const { BadRequest, Conflict, NotFound } = require('../errors');
const { logger } = require('../logger');

const BOOKING_COLUMNS =
  'id, user_id, centre_id, test_id, appointment_at, amount, status, created_at, updated_at';

// Single source of truth for legal booking status changes.
const ALLOWED_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'FAILED', 'CANCELLED'],
  // A failed payment may be retried, which puts the booking back to PENDING.
  FAILED: ['PENDING', 'CANCELLED'],
  CONFIRMED: ['CANCELLED'],
  CANCELLED: [],
};

function assertTransition(from, to) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw Conflict(`Cannot move booking from ${from} to ${to}`);
  }
}

/** Validate and persist a status change on a booking row (mutates `booking`). */
async function setBookingStatus(db, booking, to) {
  assertTransition(booking.status, to);
  await db.query('UPDATE bookings SET status = $2, updated_at = now() WHERE id = $1', [booking.id, to]);
  logger.info({ booking_id: booking.id, from: booking.status, to }, 'booking status change');
  booking.status = to;
}

/**
 * Fetch a booking the user may act on. Other users' bookings are reported as
 * 404 (not 403) so we don't reveal which booking ids exist. Admins can read all.
 */
async function getOwnedBooking(db, bookingId, user, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${BOOKING_COLUMNS} FROM bookings WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [bookingId],
  );
  const booking = rows[0];
  if (!booking || (booking.user_id !== user.id && !user.is_admin)) {
    throw NotFound('Booking not found');
  }
  return booking;
}

async function createBooking(user, { centre_id, test_id, appointment_at }) {
  if (appointment_at <= new Date()) throw BadRequest('appointment_at must be in the future');

  const centre = await pool.query('SELECT is_active FROM diagnostic_centres WHERE id = $1', [centre_id]);
  if (!centre.rows[0]) throw NotFound('Diagnostic centre not found');
  if (!centre.rows[0].is_active) throw BadRequest('This centre is not accepting bookings');

  const offering = await pool.query(
    'SELECT price, is_available FROM centre_tests WHERE centre_id = $1 AND test_id = $2',
    [centre_id, test_id],
  );
  if (!offering.rows[0]) throw NotFound('This centre does not offer the requested test');
  if (!offering.rows[0].is_available) throw BadRequest('This test is currently unavailable at this centre');

  // Duplicate active bookings are rejected by the uq_booking_active_slot
  // partial unique index (mapped to 409 by the error handler) - race-safe.
  const { rows } = await pool.query(
    `INSERT INTO bookings (user_id, centre_id, test_id, appointment_at, amount)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${BOOKING_COLUMNS}`,
    [user.id, centre_id, test_id, appointment_at, offering.rows[0].price],
  );
  logger.info({ booking_id: rows[0].id, user_id: user.id }, 'booking created');
  return rows[0];
}

async function listBookings(user, { status, limit, offset }) {
  const conditions = [];
  const params = [];
  if (!user.is_admin) {
    params.push(user.id);
    conditions.push(`user_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [items, count] = await Promise.all([
    pool.query(
      `SELECT ${BOOKING_COLUMNS} FROM bookings ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    pool.query(`SELECT count(*)::int AS n FROM bookings ${where}`, params),
  ]);
  return { items: items.rows, total: count.rows[0].n, limit, offset };
}

async function cancelBooking(user, bookingId) {
  return withTransaction(async (client) => {
    const booking = await getOwnedBooking(client, bookingId, user, { lock: true });
    const pending = await client.query(
      "SELECT 1 FROM payments WHERE booking_id = $1 AND status = 'PENDING'",
      [bookingId],
    );
    if (pending.rowCount) {
      throw Conflict('A payment for this booking is in progress; try again once it completes');
    }
    await setBookingStatus(client, booking, 'CANCELLED');
    return booking;
  });
}

module.exports = {
  ALLOWED_TRANSITIONS,
  assertTransition,
  setBookingStatus,
  getOwnedBooking,
  createBooking,
  listBookings,
  cancelBooking,
};
