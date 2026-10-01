// Money is kept as decimal strings ("349.00") end to end: Postgres NUMERIC in,
// strings out of `pg`, and integer cents for comparisons. Never floats.
const MONEY_RE = /^\d{1,8}(\.\d{1,2})?$/;

function toCents(value) {
  const [whole, frac = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

function formatMoney(value) {
  const cents = toCents(value);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

module.exports = { MONEY_RE, toCents, formatMoney };
