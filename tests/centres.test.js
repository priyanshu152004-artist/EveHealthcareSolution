const { api, useTestDatabase, createUser, createCatalogue } = require('./helpers');

useTestDatabase();

test('admin can manage tests, centres and prices', async () => {
  const { headers } = await createUser('admin@example.com', { isAdmin: true });

  const test = await api().post('/tests/').set(headers).send({ name: 'HbA1c' });
  expect(test.status).toBe(201);

  const centre = await api()
    .post('/centres/')
    .set(headers)
    .send({ name: 'EVE Koramangala', address: '80 Feet Rd', city: 'Bengaluru' });
  expect(centre.status).toBe(201);

  const url = `/centres/${centre.body.id}/tests/`;
  let res = await api().put(url).set(headers).send({ test_id: test.body.id, price: 499 });
  expect(res.status).toBe(200);
  expect(res.body.price).toBe('499.00');

  // Upsert updates instead of duplicating.
  await api().put(url).set(headers).send({ test_id: test.body.id, price: '450.5' });
  res = await api().get(`/centres/${centre.body.id}`);
  expect(res.body.offerings).toHaveLength(1);
  expect(res.body.offerings[0]).toMatchObject({ price: '450.50', test: { name: 'HbA1c' } });
});

test('non-admins cannot modify the catalogue', async () => {
  const { headers } = await createUser('patient@example.com');
  const cat = await createCatalogue();
  const centre = { name: 'X', address: 'Y', city: 'Z' };

  expect((await api().post('/centres/').send(centre)).status).toBe(401);
  expect((await api().post('/centres/').set(headers).send(centre)).status).toBe(403);
  expect((await api().post('/tests/').set(headers).send({ name: 'T' })).status).toBe(403);
  expect((await api().patch(`/centres/${cat.centreId}`).set(headers).send({ name: 'Hijacked' })).status).toBe(403);
  const res = await api()
    .put(`/centres/${cat.centreId}/tests/`)
    .set(headers)
    .send({ test_id: cat.testId, price: '1.00' });
  expect(res.status).toBe(403);
});

test('invalid catalogue input', async () => {
  const { headers } = await createUser('admin@example.com', { isAdmin: true });
  const cat = await createCatalogue();
  const url = `/centres/${cat.centreId}/tests/`;

  expect((await api().post('/tests/').set(headers).send({ name: 'CBC' })).status).toBe(409);
  expect((await api().put(url).set(headers).send({ test_id: cat.testId, price: '-5' })).status).toBe(422);
  expect((await api().put(url).set(headers).send({ test_id: cat.testId, price: '1.234' })).status).toBe(422);
  expect((await api().put(url).set(headers).send({ test_id: 9999, price: '10' })).status).toBe(404);
  expect((await api().put('/centres/9999/tests/').set(headers).send({ test_id: cat.testId, price: '10' })).status).toBe(404);
  expect((await api().patch(`/centres/${cat.centreId}`).set(headers).send({})).status).toBe(422);
  const dupe = { name: 'EVE Andheri', address: 'elsewhere', city: 'Mumbai' };
  expect((await api().post('/centres/').set(headers).send(dupe)).status).toBe(409);
});

test('list centres: filters and pagination', async () => {
  const { headers } = await createUser('admin@example.com', { isAdmin: true });
  for (const [i, city] of ['Mumbai', 'Mumbai', 'Pune'].entries()) {
    await api().post('/centres/').set(headers).send({ name: `C${i}`, address: 'addr', city });
  }
  expect((await api().get('/centres/?city=mumbai')).body.total).toBe(2);

  const page = await api().get('/centres/?limit=2&offset=2');
  expect(page.body).toMatchObject({ total: 3, limit: 2, offset: 2 });
  expect(page.body.items).toHaveLength(1);

  expect((await api().get('/centres/?limit=0')).status).toBe(422);
  expect((await api().get('/centres/?limit=abc')).status).toBe(422);
});

test('list centres by test and active flag', async () => {
  const { headers } = await createUser('admin@example.com', { isAdmin: true });
  const cat = await createCatalogue();
  expect((await api().get(`/centres/?test_id=${cat.testId}`)).body.total).toBe(1);
  expect((await api().get(`/centres/?test_id=${cat.unavailableTestId}`)).body.total).toBe(0);

  await api().patch(`/centres/${cat.centreId}`).set(headers).send({ is_active: false });
  expect((await api().get('/centres/')).body.total).toBe(0);
  expect((await api().get('/centres/?include_inactive=true')).body.total).toBe(1);
});

test('tests catalogue search', async () => {
  await createCatalogue();
  const res = await api().get('/tests/?search=lipid');
  expect(res.body.total).toBe(1);
  expect(res.body.items[0].name).toBe('Lipid Profile');
});

test('unknown centre / bad id / unknown route', async () => {
  expect((await api().get('/centres/9999')).status).toBe(404);
  expect((await api().get('/centres/9999/tests')).status).toBe(404);
  expect((await api().get('/centres/abc')).status).toBe(422);
  expect((await api().get('/nope')).status).toBe(404);
});
