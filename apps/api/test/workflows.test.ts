import type { Paginated, WorkflowDetail, WorkflowSummary } from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { authHeader, createWorkflow, registerUser, sampleWorkflow } from './helpers.js';

let app: FastifyInstance;
let token: string;
let otherToken: string;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.prisma.user.deleteMany();
  token = await registerUser(app, 'uday@example.com');
  otherToken = await registerUser(app, 'other@example.com');
});

function errorCode(body: string): string {
  return (JSON.parse(body) as { error: { code: string } }).error.code;
}

describe('authentication', () => {
  it('rejects requests without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/workflows' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /workflows', () => {
  it('creates a workflow with ordered steps and applies defaults', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: authHeader(token),
      payload: sampleWorkflow(),
    });
    expect(res.statusCode).toBe(201);

    const body = res.json<WorkflowDetail>();
    expect(body.enabled).toBe(true);
    expect(body.maxAttempts).toBe(3);
    expect(body.backoffBaseMs).toBe(2000);
    expect(body.steps.map((step) => [step.position, step.type])).toEqual([
      [0, 'HTTP_REQUEST'],
      [1, 'TRANSFORM'],
      [2, 'NOTIFICATION'],
    ]);

    const first = body.steps[0];
    expect(first?.type === 'HTTP_REQUEST' && first.config.method).toBe('GET');
    expect(first?.type === 'HTTP_REQUEST' && first.config.timeoutMs).toBe(10_000);
  });

  it.each([
    ['unknown step type', { steps: [{ type: 'RUN_SHELL', name: 'x', config: {} }] }],
    ['no steps', { steps: [] }],
    [
      'non-http URL',
      { steps: [{ type: 'HTTP_REQUEST', name: 'x', config: { url: 'ftp://example.com/f' } }] },
    ],
    [
      'DELAY step with HTTP config',
      { steps: [{ type: 'DELAY', name: 'x', config: { url: 'https://example.com' } }] },
    ],
    [
      'delay beyond the limit',
      { steps: [{ type: 'DELAY', name: 'x', config: { durationMs: 999_999_999 } }] },
    ],
  ])('rejects an invalid definition: %s', async (_label, overrides) => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: authHeader(token),
      payload: sampleWorkflow(overrides),
    });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate name for the same user', async () => {
    await createWorkflow(app, token);
    const res = await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: authHeader(token),
      payload: sampleWorkflow(),
    });
    expect(res.statusCode).toBe(409);
  });

  it('allows the same name for different users', async () => {
    await createWorkflow(app, token);
    await createWorkflow(app, otherToken);
  });
});

describe('GET /workflows', () => {
  it('paginates and sorts only the caller workflows', async () => {
    await createWorkflow(app, token, { name: 'Alpha' });
    await createWorkflow(app, token, { name: 'Beta' });
    await createWorkflow(app, token, { name: 'Gamma' });
    await createWorkflow(app, otherToken, { name: 'Not Mine' });

    const res = await app.inject({
      method: 'GET',
      url: '/workflows?pageSize=2&page=2&sortBy=name&sortOrder=asc',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<Paginated<WorkflowSummary>>();
    expect(body.data.map((workflow) => workflow.name)).toEqual(['Gamma']);
    expect(body.data[0]?.stepCount).toBe(3);
    expect(body.pagination).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('filters by search text and enabled flag', async () => {
    await createWorkflow(app, token, { name: 'Video Processing' });
    await createWorkflow(app, token, { name: 'Data Sync', enabled: false });
    await createWorkflow(app, token, { name: 'Video Upload' });

    const search = await app.inject({
      method: 'GET',
      url: '/workflows?search=VIDEO',
      headers: authHeader(token),
    });
    expect(search.json<Paginated<WorkflowSummary>>().data).toHaveLength(2);

    const disabled = await app.inject({
      method: 'GET',
      url: '/workflows?enabled=false',
      headers: authHeader(token),
    });
    expect(disabled.json<Paginated<WorkflowSummary>>().data.map((w) => w.name)).toEqual([
      'Data Sync',
    ]);
  });

  it('lists the most recently updated workflow first by default', async () => {
    await createWorkflow(app, token, { name: 'Older' });
    await createWorkflow(app, token, { name: 'Newer' });

    const res = await app.inject({ method: 'GET', url: '/workflows', headers: authHeader(token) });
    expect(res.json<Paginated<WorkflowSummary>>().data.map((w) => w.name)).toEqual([
      'Newer',
      'Older',
    ]);
  });
});

describe('GET /workflows/:id', () => {
  it('returns the workflow with its steps', async () => {
    const created = await createWorkflow(app, token);
    const res = await app.inject({
      method: 'GET',
      url: `/workflows/${created.id}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<WorkflowDetail>().steps).toHaveLength(3);
  });

  it("returns 404 for another user's workflow", async () => {
    const created = await createWorkflow(app, token);
    const res = await app.inject({
      method: 'GET',
      url: `/workflows/${created.id}`,
      headers: authHeader(otherToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workflows/not-a-uuid',
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PUT /workflows/:id', () => {
  it('replaces the details and all steps', async () => {
    const created = await createWorkflow(app, token);
    const res = await app.inject({
      method: 'PUT',
      url: `/workflows/${created.id}`,
      headers: authHeader(token),
      payload: sampleWorkflow({
        name: 'Renamed',
        maxAttempts: 5,
        steps: [{ type: 'DELAY', name: 'Wait', config: { durationMs: 1000 } }],
      }),
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<WorkflowDetail>();
    expect(body.name).toBe('Renamed');
    expect(body.maxAttempts).toBe(5);
    expect(body.steps.map((step) => step.type)).toEqual(['DELAY']);
    expect(await app.prisma.workflowStep.count()).toBe(1);
  });

  it('leaves the workflow untouched when the update is rejected', async () => {
    await createWorkflow(app, token, { name: 'First' });
    const second = await createWorkflow(app, token, { name: 'Second' });

    const res = await app.inject({
      method: 'PUT',
      url: `/workflows/${second.id}`,
      headers: authHeader(token),
      payload: sampleWorkflow({
        name: 'First',
        steps: [{ type: 'DELAY', name: 'Wait', config: { durationMs: 1000 } }],
      }),
    });
    expect(res.statusCode).toBe(409);

    const after = await app.inject({
      method: 'GET',
      url: `/workflows/${second.id}`,
      headers: authHeader(token),
    });
    const body = after.json<WorkflowDetail>();
    expect(body.name).toBe('Second');
    expect(body.steps).toHaveLength(3);
  });

  it("returns 404 and changes nothing for another user's workflow", async () => {
    const created = await createWorkflow(app, token);

    const put = await app.inject({
      method: 'PUT',
      url: `/workflows/${created.id}`,
      headers: authHeader(otherToken),
      payload: sampleWorkflow({ name: 'Hijacked' }),
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/workflows/${created.id}`,
      headers: authHeader(otherToken),
      payload: { enabled: false },
    });
    expect(put.statusCode).toBe(404);
    expect(patch.statusCode).toBe(404);

    const after = await app.prisma.workflow.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.name).toBe('Video Processing');
    expect(after.enabled).toBe(true);
  });

  it('handles concurrent updates without corrupting the steps', async () => {
    const created = await createWorkflow(app, token);
    const update = (stepCount: number) =>
      app.inject({
        method: 'PUT',
        url: `/workflows/${created.id}`,
        headers: authHeader(token),
        payload: sampleWorkflow({
          steps: Array.from({ length: stepCount }, (_, index) => ({
            type: 'DELAY',
            name: `Wait ${index}`,
            config: { durationMs: 1000 },
          })),
        }),
      });

    const [a, b] = await Promise.all([update(2), update(4)]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);

    const steps = await app.prisma.workflowStep.findMany({
      where: { workflowId: created.id },
      orderBy: { position: 'asc' },
    });
    expect([2, 4]).toContain(steps.length);
    expect(steps.map((step) => step.position)).toEqual(steps.map((_, index) => index));
  });
});

describe('PATCH /workflows/:id', () => {
  it('toggles enabled without touching any other field', async () => {
    const created = await createWorkflow(app, token, {
      description: 'keep me',
      maxAttempts: 5,
      backoffBaseMs: 4000,
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/workflows/${created.id}`,
      headers: authHeader(token),
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<WorkflowDetail>();
    expect(body.enabled).toBe(false);
    expect(body.description).toBe('keep me');
    expect(body.maxAttempts).toBe(5);
    expect(body.backoffBaseMs).toBe(4000);
    expect(body.steps).toHaveLength(3);
  });

  it('rejects an empty patch', async () => {
    const created = await createWorkflow(app, token);
    const res = await app.inject({
      method: 'PATCH',
      url: `/workflows/${created.id}`,
      headers: authHeader(token),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /workflows/:id', () => {
  it('deletes the workflow and cascades to its steps', async () => {
    const created = await createWorkflow(app, token);

    const res = await app.inject({
      method: 'DELETE',
      url: `/workflows/${created.id}`,
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: `/workflows/${created.id}`,
      headers: authHeader(token),
    });
    expect(after.statusCode).toBe(404);
    expect(await app.prisma.workflowStep.count()).toBe(0);
  });

  it("returns 404 for another user's workflow and keeps it", async () => {
    const created = await createWorkflow(app, token);

    const res = await app.inject({
      method: 'DELETE',
      url: `/workflows/${created.id}`,
      headers: authHeader(otherToken),
    });
    expect(res.statusCode).toBe(404);
    expect(await app.prisma.workflow.count()).toBe(1);
  });
});