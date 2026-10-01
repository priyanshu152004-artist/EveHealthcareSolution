const { assertTransition } = require('../src/services/bookings');

test.each([
  ['PENDING', 'CONFIRMED'],
  ['PENDING', 'FAILED'],
  ['PENDING', 'CANCELLED'],
  ['FAILED', 'PENDING'],
  ['FAILED', 'CANCELLED'],
  ['CONFIRMED', 'CANCELLED'],
])('%s -> %s is allowed', (from, to) => {
  expect(() => assertTransition(from, to)).not.toThrow();
});

test.each([
  ['CANCELLED', 'CONFIRMED'],
  ['CANCELLED', 'PENDING'],
  ['CONFIRMED', 'FAILED'],
  ['CONFIRMED', 'PENDING'],
  ['FAILED', 'CONFIRMED'],
])('%s -> %s is rejected with 409', (from, to) => {
  expect(() => assertTransition(from, to)).toThrow(expect.objectContaining({ status: 409 }));
});
