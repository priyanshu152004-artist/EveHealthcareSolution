const { z } = require('zod');
const { MONEY_RE, toCents, formatMoney } = require('./money');

const id = z.number().int().positive();
const idParam = z.coerce.number().int().positive();
const text = (max) => z.string().trim().min(1).max(max);

// Accepts "349", "349.5", 349.5 ... and normalises to "349.50".
const money = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(MONEY_RE, 'Must be a decimal amount with at most 2 decimal places'))
  .refine((v) => toCents(v) > 0, 'Must be greater than 0')
  .transform(formatMoney);

// ISO-8601; a missing offset is treated as UTC.
const dateTime = z.iso
  .datetime({ offset: true, local: true })
  .transform((v) => new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(v) ? v : `${v}Z`));

const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');

const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'];

module.exports = {
  idParams: z.object({ id: idParam }),

  signup: z.object({
    email: z.email().max(255).transform((v) => v.toLowerCase()),
    full_name: text(120),
    password: z.string().min(8).max(72), // bcrypt only uses the first 72 bytes
  }),
  login: z.object({
    email: z.email().transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(72),
  }),

  testCreate: z.object({ name: text(200), description: z.string().max(2000).nullish() }),
  testList: pagination.extend({ search: z.string().trim().min(1).optional() }),

  centreCreate: z.object({ name: text(200), address: text(500), city: text(100) }),
  centreUpdate: z
    .object({
      name: text(200).optional(),
      address: text(500).optional(),
      city: text(100).optional(),
      is_active: z.boolean().optional(),
    })
    .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update'),
  centreList: pagination.extend({
    city: z.string().trim().min(1).optional(),
    test_id: idParam.optional(),
    include_inactive: queryBool.default(false),
  }),
  offeringUpsert: z.object({ test_id: id, price: money, is_available: z.boolean().default(true) }),

  bookingCreate: z.object({ centre_id: id, test_id: id, appointment_at: dateTime }),
  bookingList: pagination.extend({ status: z.enum(BOOKING_STATUSES).optional() }),

  paymentCreate: z.object({
    booking_id: id,
    // Forces the simulated outcome (demos/tests). PENDING = the provider will
    // report the result later via the webhook. Omitted = random outcome.
    simulate_outcome: z.enum(['SUCCESS', 'FAILED', 'PENDING']).optional(),
  }),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),

  webhook: z.object({
    event_id: text(128),
    payment_reference: text(64),
    status: z.enum(['SUCCESS', 'FAILED']),
    amount: money,
    failure_reason: z.string().max(255).nullish(),
  }),
};
