import type { ExecutionDetail, ExecutionSummary, Paginated } from '@cloudflow/shared';
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
  await app.queue.waitUntilReady();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.queue.obliterate({ force: true });
  await app.prisma.user.deleteMany();
  token = await registerUser(app, 'uday@example.com');
  otherToken = await registerUser(app, 'other@example.com');
});

function run(
  workflowId: string,
  options: {
    token?: string;
    headers?: Record<string, string>;
    payload?: Record<string, unknown>;
  } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/workflows/${workflowId}/run`,
    headers: { ...authHeader(options.token ?? token), ...options.headers },
    ...(options.payload && { payload: options.payload }),
  });
}

describe('POST /workflows/:id/run', () => {
  it('creates a queued execution, snapshots the steps and enqueues only the first step', async () => {
    const workflow = await createWorkflow(app, token);
    const res = await run(workflow.id, { payload: { input: { videoId: 42 } } });

    expect(res.statusCode).toBe(202);

    const body = res.json<ExecutionDetail>();
    expect(body.status).toBe('QUEUED');
    expect(body.input).toEqual({ videoId: 42 });
    expect(body.steps.map((step) => [step.position, step.status])).toEqual([
      [0, 'PENDING'],
      [1, 'PENDING'],
      [2, 'PENDING'],
    ]);

    const firstStepId = body.steps[0]?.id as string;
    const job = await app.queue.getJob(firstStepId);

    expect(job?.data).toEqual({
      executionId: body.id,
      stepExecutionId: firstStepId,
    });
    expect(await app.queue.getJobCounts('waiting')).toEqual({ waiting: 1 });
  });

  it('keeps the step history unchanged when the workflow is edited afterwards', async () => {
    const workflow = await createWorkflow(app, token);
    const execution = (await run(workflow.id)).json<ExecutionDetail>();

    await app.inject({
      method: 'PUT',
      url: `/workflows/${workflow.id}`,
      headers: authHeader(token),
      payload: sampleWorkflow({
        steps: [
          {
            type: 'DELAY',
            name: 'Completely different',
            config: { durationMs: 1000 },
          },
        ],
      }),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/executions/${execution.id}`,
      headers: authHeader(token),
    });

    expect(res.json<ExecutionDetail>().steps.map((step) => step.name)).toEqual([
      'Fetch data',
      'Pick fields',
      'Notify',
    ]);
  });

  it('snapshots the retry policy so later workflow edits do not change a queued run', async () => {
    const workflow = await createWorkflow(app, token, {
      maxAttempts: 5,
      backoffBaseMs: 4000,
    });

    const execution = (await run(workflow.id)).json<ExecutionDetail>();

    expect(execution.maxAttempts).toBe(5);
    expect(execution.backoffBaseMs).toBe(4000);

    await app.inject({
      method: 'PATCH',
      url: `/workflows/${workflow.id}`,
      headers: authHeader(token),
      payload: { maxAttempts: 2 },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/executions/${execution.id}`,
      headers: authHeader(token),
    });

    expect(res.json<ExecutionDetail>().maxAttempts).toBe(5);
  });

  it('refuses to run a disabled workflow', async () => {
    const workflow = await createWorkflow(app, token, { enabled: false });
    const res = await run(workflow.id);

    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      'WORKFLOW_DISABLED',
    );
    expect(await app.prisma.workflowExecution.count()).toBe(0);
    expect(await app.queue.getJobCounts('waiting')).toEqual({ waiting: 0 });
  });

  it("returns 404 for another user's workflow and queues nothing", async () => {
    const workflow = await createWorkflow(app, token);
    const res = await run(workflow.id, { token: otherToken });

    expect(res.statusCode).toBe(404);
    expect(await app.prisma.workflowExecution.count()).toBe(0);
    expect(await app.queue.getJobCounts('waiting')).toEqual({ waiting: 0 });
  });

  it('rejects input that is not a JSON object and oversized idempotency keys', async () => {
    const workflow = await createWorkflow(app, token);
    const badInput = await run(workflow.id, {
      payload: { input: 'text' },
    });
    const badKey = await run(workflow.id, {
      headers: { 'idempotency-key': 'k'.repeat(201) },
    });

    expect(badInput.statusCode).toBe(400);
    expect(badKey.statusCode).toBe(400);
  });
});

describe('idempotency keys', () => {
  it('returns the original execution when the same key is sent again', async () => {
    const workflow = await createWorkflow(app, token);
    const headers = { 'idempotency-key': 'order-1001' };

    const first = await run(workflow.id, { headers });
    const second = await run(workflow.id, { headers });

    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(200);
    expect(second.json<ExecutionDetail>().id).toBe(
      first.json<ExecutionDetail>().id,
    );
    expect(await app.prisma.workflowExecution.count()).toBe(1);
    expect(await app.queue.getJobCounts('waiting')).toEqual({ waiting: 1 });
  });

  it('creates exactly one execution when two requests with the same key arrive together', async () => {
    const workflow = await createWorkflow(app, token);
    const headers = { 'idempotency-key': 'double-click' };

    const [a, b] = await Promise.all([
      run(workflow.id, { headers }),
      run(workflow.id, { headers }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 202]);
    expect(a.json<ExecutionDetail>().id).toBe(b.json<ExecutionDetail>().id);
    expect(await app.prisma.workflowExecution.count()).toBe(1);
    expect(await app.queue.getJobCounts('waiting')).toEqual({ waiting: 1 });
  });

  it('rejects reusing a key for a different workflow', async () => {
    const first = await createWorkflow(app, token, { name: 'One' });
    const second = await createWorkflow(app, token, { name: 'Two' });
    const headers = { 'idempotency-key': 'shared-key' };

    await run(first.id, { headers });
    const res = await run(second.id, { headers });

    expect(res.statusCode).toBe(409);
  });
});

describe('execution queries', () => {
  it('lists only the caller executions and filters by status', async () => {
    const workflow = await createWorkflow(app, token);
    const otherWorkflow = await createWorkflow(app, otherToken);

    await run(workflow.id);
    await run(workflow.id);
    await run(otherWorkflow.id, { token: otherToken });

    const all = await app.inject({
      method: 'GET',
      url: '/executions',
      headers: authHeader(token),
    });

    expect(all.json<Paginated<ExecutionSummary>>().pagination.total).toBe(2);

    const done = await app.inject({
      method: 'GET',
      url: '/executions?status=SUCCESS',
      headers: authHeader(token),
    });

    expect(done.json<Paginated<ExecutionSummary>>().data).toHaveLength(0);
  });

  it("returns 404 for another user's execution", async () => {
    const workflow = await createWorkflow(app, token);
    const execution = (await run(workflow.id)).json<ExecutionDetail>();

    const res = await app.inject({
      method: 'GET',
      url: `/executions/${execution.id}`,
      headers: authHeader(otherToken),
    });

    expect(res.statusCode).toBe(404);
  });
});