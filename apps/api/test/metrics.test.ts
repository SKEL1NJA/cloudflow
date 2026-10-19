import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
  await app.queue.waitUntilReady();
});

afterAll(async () => {
  await app.close();
});

describe('GET /metrics', () => {
  it('labels request durations with route templates, never raw URLs', async () => {
    const id = randomUUID();
    const unknown = randomUUID();
    await app.inject({ method: 'GET', url: `/workflows/${id}` });
    await app.inject({ method: 'GET', url: `/nothing-here/${unknown}` });

    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('cloudflow_http_request_duration_seconds_count');
    expect(res.body).toContain('route="/workflows/:id"');
    expect(res.body).not.toContain(id);
    expect(res.body).not.toContain(unknown);
  });

  it('reports queue depth, dead-letter depth and worker counts', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.body).toMatch(/cloudflow_queue_jobs\{state="waiting"\} \d+/);
    expect(res.body).toMatch(/cloudflow_queue_jobs\{state="active"\} \d+/);
    expect(res.body).toMatch(/cloudflow_dead_letter_jobs \d+/);
    expect(res.body).toMatch(/cloudflow_workers\{status="online"\} \d+/);
  });
});