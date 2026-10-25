import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { safeRequestId } from '../src/lib/request-id.js';

const METRICS_TOKEN = 'test-metrics-token-1234567890';
const ALLOWED_ORIGIN = 'http://localhost:5173';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('security headers', () => {
  it('sends hardening headers and does not advertise the framework', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('also covers error responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/no-such-route' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS', () => {
  const preflight = (origin: string) =>
    app.inject({
      method: 'OPTIONS',
      url: '/workflows',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

  it('allows a configured origin with credentials', async () => {
    const res = await preflight(ALLOWED_ORIGIN);
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(String(res.headers['access-control-allow-headers'])).toContain('authorization');
  });

  it('gives other origins no permission', async () => {
    const res = await preflight('https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('exposes the headers the frontend needs on real responses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(String(res.headers['access-control-expose-headers'])).toContain('x-request-id');
  });
});

describe('request limits', () => {
  it('rejects oversized bodies with the standard error shape', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'a@b.co', password: 'x'.repeat(300_000) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('FST_ERR_CTP_BODY_TOO_LARGE');
  });
});

describe('request ids', () => {
  it('reuses a well-formed client id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'client-id-123' },
    });
    expect(res.headers['x-request-id']).toBe('client-id-123');
  });

  it('replaces malformed or oversized ids', async () => {
    const huge = 'x'.repeat(200);
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': huge },
    });
    expect(res.headers['x-request-id']).not.toBe(huge);
    expect(String(res.headers['x-request-id'])).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('validates ids in isolation', () => {
    expect(safeRequestId('abc-1.2_3')).toBe('abc-1.2_3');
    for (const bad of [undefined, ['a', 'b'], 'has space', 'semi;colon', '']) {
      expect(safeRequestId(bad)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe('metrics endpoint', () => {
  it('requires the configured token', async () => {
    const without = await app.inject({ method: 'GET', url: '/metrics' });
    const wrong = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer wrong-token-wrong-token' },
    });
    const right = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });
    expect([without.statusCode, wrong.statusCode, right.statusCode]).toEqual([401, 401, 200]);
  });
});
