const { Router } = require('express');
const schemas = require('../schemas');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { pool } = require('../db');
const bookings = require('../services/bookings');

const router = Router();
router.use(authenticate);

router.post('/', validate({ body: schemas.bookingCreate }), async (req, res) => {
  res.status(201).json(await bookings.createBooking(req.user, req.valid.body));
});

// Patients see their own bookings; admins see all.
router.get('/', validate({ query: schemas.bookingList }), async (req, res) => {
  res.json(await bookings.listBookings(req.user, req.valid.query));
});

router.get('/:id', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await bookings.getOwnedBooking(pool, req.valid.params.id, req.user));
});

router.post('/:id/cancel', validate({ params: schemas.idParams }), async (req, res) => {
  res.json(await bookings.cancelBooking(req.user, req.valid.params.id));
});

module.exports = router;
