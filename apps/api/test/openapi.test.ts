import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

interface Document {
  openapi: string;
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown>; securitySchemes: Record<string, unknown> };
}

let app: FastifyInstance;
let doc: Document;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
  const res = await app.inject({ method: 'GET', url: '/docs/json' });
  expect(res.statusCode).toBe(200);
  doc = res.json<Document>();
});

afterAll(async () => {
  await app.close();
});

describe('OpenAPI document', () => {
  it('describes the main endpoints', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/auth/login',
        '/workflows',
        '/workflows/{id}/run',
        '/executions/{id}/cancel',
        '/executions/{id}/retry',
        '/overview',
        '/logs',
        '/api-keys',
        '/health/ready',
      ]),
    );
    expect(doc.components.securitySchemes).toHaveProperty('bearerAuth');
  });

  it('builds request bodies from the real step schemas', () => {
    const create = JSON.stringify(doc.paths['/workflows']?.post);
    for (const type of ['HTTP_REQUEST', 'DELAY', 'TRANSFORM', 'NOTIFICATION']) {
      expect(create).toContain(type);
    }
  });

  it('documents the idempotency header on the run endpoint', () => {
    expect(JSON.stringify(doc.paths['/workflows/{id}/run']?.post)).toContain('Idempotency-Key');
  });

  it('has no unresolved references', () => {
    const refs = [...JSON.stringify(doc).matchAll(/"\$ref":"([^"]+)"/g)].flatMap((match) =>
      match[1] ? [match[1]] : [],
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toMatch(/^#\/components\/schemas\//);
      expect(doc.components.schemas).toHaveProperty(ref.replace('#/components/schemas/', ''));
    }
  });

  it('serves the interactive documentation page', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
