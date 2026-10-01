const config = require('../src/config');
const { api, useTestDatabase, createUser } = require('./helpers');

useTestDatabase();

test('signup, login and /me', async () => {
  const signup = await api()
    .post('/auth/signup')
    .send({ email: 'New@Example.com', full_name: 'New User', password: 'password123' });
  expect(signup.status).toBe(201);
  expect(signup.body).toMatchObject({ email: 'new@example.com', is_admin: false });
  expect(signup.body).not.toHaveProperty('password_hash');

  const login = await api().post('/auth/login').send({ email: 'new@example.com', password: 'password123' });
  expect(login.status).toBe(200);
  expect(login.body.token_type).toBe('bearer');

  const me = await api().get('/auth/me').set('Authorization', `Bearer ${login.body.access_token}`);
  expect(me.status).toBe(200);
  expect(me.body.email).toBe('new@example.com');
});

test('duplicate email is rejected case-insensitively', async () => {
  const body = { email: 'dup@example.com', full_name: 'A', password: 'password123' };
  expect((await api().post('/auth/signup').send(body)).status).toBe(201);
  const res = await api().post('/auth/signup').send({ ...body, email: 'DUP@example.com' });
  expect(res.status).toBe(409);
});

test('signup cannot grant admin', async () => {
  const res = await api()
    .post('/auth/signup')
    .send({ email: 'x@example.com', full_name: 'X', password: 'password123', is_admin: true });
  expect(res.status).toBe(201);
  expect(res.body.is_admin).toBe(false);
});

test.each([
  [{ email: 'not-an-email', full_name: 'A', password: 'password123' }],
  [{ email: 'a@example.com', full_name: 'A', password: 'short' }],
  [{ email: 'a@example.com', full_name: '   ', password: 'password123' }],
  [{}],
])('signup validation %#', async (body) => {
  const res = await api().post('/auth/signup').send(body);
  expect(res.status).toBe(422);
  expect(res.body.errors.length).toBeGreaterThan(0);
});

test('malformed JSON is a 400', async () => {
  const res = await api().post('/auth/login').set('Content-Type', 'application/json').send('{"email":');
  expect(res.status).toBe(400);
});

test('wrong password and unknown user get the same response', async () => {
  await createUser('patient@example.com');
  const wrong = await api().post('/auth/login').send({ email: 'patient@example.com', password: 'nope' });
  const unknown = await api().post('/auth/login').send({ email: 'ghost@example.com', password: 'nope' });
  expect(wrong.status).toBe(401);
  expect(unknown.status).toBe(401);
  expect(wrong.body).toEqual(unknown.body);
});

test('protected endpoints need a valid token', async () => {
  expect((await api().get('/auth/me')).status).toBe(401);
  expect((await api().get('/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
});

test('auth endpoints are rate limited', async () => {
  const original = config.authRateLimitPerMinute;
  config.authRateLimitPerMinute = 3;
  try {
    const codes = [];
    for (let i = 0; i < 4; i++) {
      codes.push((await api().post('/auth/login').send({ email: 'g@example.com', password: 'x' })).status);
    }
    expect(codes).toEqual([401, 401, 401, 429]);
  } finally {
    config.authRateLimitPerMinute = original;
  }
});
