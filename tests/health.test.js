const http = require('http');

const BASE = `http://localhost:${process.env.PORT || 3000}`;

function get(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`${BASE}${path}`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      })
      .on('error', reject);
  });
}

describe('Health check', () => {
  test('GET /api/health returns ok', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth validation', () => {
  test('GET /api/auth/me without token returns 401', async () => {
    const res = await get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
