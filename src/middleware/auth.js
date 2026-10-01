const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../db');
const { Unauthorized, Forbidden } = require('../errors');

async function authenticate(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw Unauthorized('Not authenticated');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw Unauthorized('Invalid or expired token');
  }
  const { rows } = await pool.query(
    'SELECT id, email, full_name, is_admin FROM users WHERE id = $1',
    [Number(payload.sub)],
  );
  if (!rows[0]) throw Unauthorized('Invalid or expired token');
  req.user = rows[0];
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) throw Forbidden('Admin privileges required');
  next();
}

module.exports = { authenticate, requireAdmin };
