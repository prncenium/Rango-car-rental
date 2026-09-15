import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';

describe('GET /api/health (INF-04)', () => {
  it('returns 200 with a data envelope', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('sets an X-Request-Id header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('ignores a client-supplied X-Request-Id', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'forged-id');
    expect(res.headers['x-request-id']).not.toBe('forged-id');
  });
});
