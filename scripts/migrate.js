// Usage: npm run migrate
const { pool } = require('../src/db');
const { migrate } = require('../src/migrate');

migrate(pool, console.log)
  .then(() => console.log('database is up to date'))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
