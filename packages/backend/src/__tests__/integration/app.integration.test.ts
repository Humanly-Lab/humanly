jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import request from 'supertest';
import { createApp } from '../../app';
import { generateAccessToken } from '../../utils/jwt';

describe('createApp integration', () => {
  const app = createApp();

  it('returns health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      })
    );
  });

  it('returns versioned API health status', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      })
    );
  });

  it('returns API metadata', async () => {
    const response = await request(app).get('/api/v1');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        name: 'humanly API',
        version: '1.0.0',
      })
    );
  });

  it('mounts task exports at the documented /api/v1/tasks/:taskId path', async () => {
    const canonical = await request(app).get('/api/v1/tasks/task-1/export/json');
    expect(canonical.status).toBe(401);

    const token = generateAccessToken({
      userId: 'user-1',
      email: 'owner@example.com',
    });
    const legacy = await request(app)
      .get('/api/v1/task-1/export/json')
      .set('Authorization', `Bearer ${token}`);
    expect(legacy.status).toBe(404);
  });

  it('returns 404 payload for unknown routes', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: 'Not found',
      message: 'Cannot GET /does-not-exist',
    });
  });

  it('applies configured CORS headers on authenticated API routes', async () => {
    const response = await request(app)
      .get('/api/v1/documents')
      .set('Origin', 'http://localhost:3000');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
