import type { ExecutionDetail } from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { authHeader, createWorkflow, registerUserWithId, seedExecution } from './helpers.js';

let app: FastifyInstance;
let token: string;
let userId: string;
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
  ({ token, userId } = await registerUserWithId(app, 'uday@example.com'));
  ({ token: otherToken } = await registerUserWithId(app, 'other@example.com'));
});

function post(path: string, as = token) {
  return app.inject({ method: 'POST', url: path, headers: authHeader(as) });
}

describe('POST /executions/:id/cancel', () => {
  it('cancels a queued execution and skips every step', async () => {
    const workflow = await createWorkflow(app, token);
    const execution = await seedExecution(app, workflow, userId);

    const res = await post(`/executions/${execution.id}/cancel`);
    expect(res.statusCode).toBe(200);

    const body = res.json<ExecutionDetail>();
    expect(body.status).toBe('CANCELLED');
    expect(body.finishedAt).not.toBeNull();
    expect(body.steps.map((step) => step.status)).toEqual(['SKIPPED', 'SKIPPED', 'SKIPPED']);

    const logs = await app.prisma.executionLog.findMany({ where: { executionId: execution.id } });
    expect(logs.map((log) => log.message)).toContain('Execution cancelled by user');
  });

  it('keeps finished steps and skips the pending and retrying ones', async () => {
    const workflow = await createWorkflow(app, token);
    const execution = await seedExecution(app, workflow, userId, {
      status: 'RUNNING',
      stepStatuses: ['SUCCESS', 'RETRYING', 'PENDING'],
    });

    const res = await post(`/executions/${execution.id}/cancel`);
    expect(res.json<ExecutionDetail>().steps.map((step) => step.status)).toEqual([
      'SUCCESS',
      'SKIPPED',
      'SKIPPED',
    ]);
  });

  it('refuses to cancel an execution that already finished', async () => {
    const workflow = await createWorkflow(app, token);
    const execution = await seedExecution(app, workflow, userId, { status: 'SUCCESS' });

    const res = await post(`/executions/${execution.id}/cancel`);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('EXECUTION_FINISHED');
  });

  it("returns 404 for another user's execution and leaves it untouched", async () => {
    const workflow = await createWorkflow(app, token);
    const execution = await seedExecution(app, workflow, userId);

    const res = await post(`/executions/${execution.id}/cancel`, otherToken);
    expect(res.statusCode).toBe(404);
    const after = await app.prisma.workflowExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(after.status).toBe('QUEUED');
  });
});

describe('POST /executions/:id/retry', () => {
  async function failedExecution() {
    const workflow = await createWorkflow(app, token);
    const execution = await seedExecution(app, workflow, userId, {
      status: 'FAILED',
      stepStatuses: ['SUCCESS', 'FAILED', 'SKIPPED'],
    });
    const failed = execution.steps[1];
    if (!failed) throw new Error('seed failed');
    await app.prisma.stepExecution.update({
      where: { id: failed.id },
      data: { attempts: 3, error: 'HTTP 503', output: { stale: true } },
    });
    await app.prisma.workflowExecution.update({
      where: { id: execution.id },
      data: { error: 'Step failed', finishedAt: new Date() },
    });
    return { execution, failedStepId: failed.id };
  }

  async function recoveryJobIds(stepId: string): Promise<string[]> {
    const jobs = await app.queue.getJobs(['waiting', 'delayed']);
    return jobs.flatMap((job) => (job.id?.startsWith(`${stepId}-recover-`) ? [job.id] : []));
  }

  it('resets the failed step and the ones after it, keeps earlier results, and queues the failed step', async () => {
    const { execution, failedStepId } = await failedExecution();

    const res = await post(`/executions/${execution.id}/retry`);
    expect(res.statusCode).toBe(202);

    const body = res.json<ExecutionDetail>();
    expect(body.status).toBe('QUEUED');
    expect(body.error).toBeNull();
    expect(body.finishedAt).toBeNull();
    expect(body.steps.map((step) => step.status)).toEqual(['SUCCESS', 'PENDING', 'PENDING']);
    expect(body.steps[1]).toMatchObject({ attempts: 0, error: null, output: null });
    expect(await recoveryJobIds(failedStepId)).toHaveLength(1);
  });

  it('refuses executions that are not failed', async () => {
    const workflow = await createWorkflow(app, token);
    const execution = await seedExecution(app, workflow, userId, { status: 'SUCCESS' });

    const res = await post(`/executions/${execution.id}/retry`);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('EXECUTION_NOT_FAILED');
  });

  it('lets exactly one of two simultaneous retries through', async () => {
    const { execution, failedStepId } = await failedExecution();

    const [a, b] = await Promise.all([
      post(`/executions/${execution.id}/retry`),
      post(`/executions/${execution.id}/retry`),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    expect(await recoveryJobIds(failedStepId)).toHaveLength(1);
  });

  it("returns 404 for another user's execution", async () => {
    const { execution } = await failedExecution();
    const res = await post(`/executions/${execution.id}/retry`, otherToken);
    expect(res.statusCode).toBe(404);
  });
});