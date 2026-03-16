const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const app = require('../src/app');
const pool = require('../src/config/db');

afterAll(async () => {
  await pool.end();
});

describe('Health check', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth validation', () => {
  test('GET /api/auth/me without token returns 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  test('POST /api/auth/login with missing fields returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/register and login round-trip', async () => {
    const unique = `testuser_${Date.now()}`;
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: `${unique}@test.com`, username: unique, password: 'password123' });
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeDefined();
    expect(reg.body.user.username).toBe(unique);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: `${unique}@test.com`, password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeDefined();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(unique);
  });
});

describe('Teams and RBAC', () => {
  let token;

  beforeAll(async () => {
    const unique = `teamtest_${Date.now()}`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `${unique}@test.com`, username: unique, password: 'password123' });
    token = res.body.token;
  });

  test('POST /api/teams creates a team', async () => {
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Team', description: 'A test' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Team');
  });

  test('GET /api/teams lists teams for authenticated user', async () => {
    const res = await request(app)
      .get('/api/teams')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/teams without auth returns 401', async () => {
    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(401);
  });
});
