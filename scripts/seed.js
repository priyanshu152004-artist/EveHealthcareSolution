// Creates an admin user and sample centres/tests. Safe to run repeatedly.
// Usage: npm run seed
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../src/db');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@eve.health').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';

const TESTS = {
  'Complete Blood Count': 'Measures red cells, white cells and platelets.',
  'Lipid Profile': 'Cholesterol and triglycerides.',
  'Thyroid Profile (T3, T4, TSH)': 'Thyroid function panel.',
  HbA1c: 'Average blood sugar over ~3 months.',
};

const CENTRES = [
  {
    name: 'EVE Diagnostics Andheri', address: '12 Link Road, Andheri West', city: 'Mumbai',
    prices: { 'Complete Blood Count': '349.00', 'Lipid Profile': '699.00', HbA1c: '499.00' },
  },
  {
    name: 'EVE Diagnostics Koramangala', address: '80 Feet Road, Koramangala', city: 'Bengaluru',
    prices: { 'Complete Blood Count': '299.00', 'Thyroid Profile (T3, T4, TSH)': '599.00' },
  },
];

async function main() {
  await withTransaction(async (db) => {
    await db.query(
      `INSERT INTO users (email, full_name, password_hash, is_admin) VALUES ($1, 'EVE Admin', $2, true)
       ON CONFLICT (email) DO NOTHING`,
      [ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 12)],
    );
    const testIds = {};
    for (const [name, description] of Object.entries(TESTS)) {
      const { rows } = await db.query(
        `INSERT INTO diagnostic_tests (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [name, description],
      );
      testIds[name] = rows[0].id;
    }
    for (const c of CENTRES) {
      const { rows } = await db.query(
        `INSERT INTO diagnostic_centres (name, address, city) VALUES ($1, $2, $3)
         ON CONFLICT (name, city) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [c.name, c.address, c.city],
      );
      for (const [testName, price] of Object.entries(c.prices)) {
        await db.query(
          `INSERT INTO centre_tests (centre_id, test_id, price) VALUES ($1, $2, $3)
           ON CONFLICT (centre_id, test_id) DO NOTHING`,
          [rows[0].id, testIds[testName], price],
        );
      }
    }
  });
  console.log(`Seeded. Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
