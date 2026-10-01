// Runs before any test module loads, so src/config.js sees these values.
require('dotenv').config({ quiet: true });
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://eve:eve@localhost:5432/eve_test';
process.env.BCRYPT_ROUNDS = '4'; // fast hashing in tests
process.env.LOG_LEVEL = 'silent';
