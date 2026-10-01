const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../db');
const { Conflict, Unauthorized, isUniqueViolation } = require('../errors');

const USER_COLUMNS = 'id, email, full_name, is_admin, created_at';

async function signup({ email, full_name, password }) {
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
  try {
    // is_admin is never taken from the request: public signup creates patients.
    const { rows } = await pool.query(
      `INSERT INTO users (email, full_name, password_hash) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
      [email, full_name, passwordHash],
    );
    return rows[0];
  } catch (err) {
    if (isUniqueViolation(err, 'users_email_key')) {
      throw Conflict('An account with this email already exists');
    }
    throw err;
  }
}

async function login({ email, password }) {
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
  const user = rows[0];
  // Same error for unknown email and wrong password: don't reveal which accounts exist.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw Unauthorized('Invalid email or password');
  }
  const accessToken = jwt.sign({ sub: String(user.id) }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresInSeconds,
  });
  return { access_token: accessToken, token_type: 'bearer', expires_in: config.jwtExpiresInSeconds };
}

module.exports = { signup, login };
