import type { Paginated, WorkflowDetail, WorkflowSummary } from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { authHeader, createWorkflow, registerUserWithId, seedExecution } from './helpers.js';

let app: FastifyInstance;
let token: string;
let userId: string;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.prisma.user.deleteMany();
  ({ token, userId } = await registerUserWithId(app, 'uday@example.com'));
});

async function summaries(): Promise<WorkflowSummary[]> {
  const res = await app.inject({ method: 'GET', url: '/workflows', headers: authHeader(token) });
  return res.json<Paginated<WorkflowSummary>>().data;
}

describe('workflow statistics', () => {
  it('reports the last run and the success rate over the last 30 days', async () => {
    const workflow = await createWorkflow(app, token, { name: 'Busy' });
    for (const [status, days] of [
      ['SUCCESS', 2],
      ['SUCCESS', 3],
      ['FAILED', 4],
      ['CANCELLED', 5],
      ['SUCCESS', 40],
    ] as const) {
      await seedExecution(app, workflow, userId, { status, createdAt: daysAgo(days) });
    }
    await seedExecution(app, workflow, userId, { status: 'RUNNING', createdAt: minutesAgo(1) });

    const summary = (await summaries()).find((entry) => entry.name === 'Busy');
    expect(summary?.finishedRuns).toBe(3);
    expect(summary?.successRate).toBeCloseTo(2 / 3, 5);
    expect(summary?.lastRun?.status).toBe('RUNNING');
    expect(Date.parse(summary?.lastRun?.at ?? '')).toBeGreaterThan(Date.now() - 5 * 60_000);
  });

  it('has no statistics for a workflow that never ran', async () => {
    await createWorkflow(app, token, { name: 'Idle' });
    const [summary] = await summaries();
    expect(summary).toMatchObject({ lastRun: null, successRate: null, finishedRuns: 0 });
  });

  it('has a last run but no rate when every run is older than 30 days', async () => {
    const workflow = await createWorkflow(app, token, { name: 'Dormant' });
    await seedExecution(app, workflow, userId, { status: 'SUCCESS', createdAt: daysAgo(40) });

    const [summary] = await summaries();
    expect(summary?.lastRun?.status).toBe('SUCCESS');
    expect(summary?.successRate).toBeNull();
    expect(summary?.finishedRuns).toBe(0);
  });

  it('keeps the statistics of different workflows apart', async () => {
    const reliable = await createWorkflow(app, token, { name: 'Reliable' });
    const flaky = await createWorkflow(app, token, { name: 'Flaky' });
    await seedExecution(app, reliable, userId, { status: 'SUCCESS', createdAt: minutesAgo(10) });
    await seedExecution(app, flaky, userId, { status: 'FAILED', createdAt: minutesAgo(5) });

    const byName = new Map((await summaries()).map((entry) => [entry.name, entry]));
    expect(byName.get('Reliable')).toMatchObject({ successRate: 1, finishedRuns: 1 });
    expect(byName.get('Reliable')?.lastRun?.status).toBe('SUCCESS');
    expect(byName.get('Flaky')).toMatchObject({ successRate: 0, finishedRuns: 1 });
    expect(byName.get('Flaky')?.lastRun?.status).toBe('FAILED');
  });

  it('returns the same statistics from the detail endpoint', async () => {
    const workflow = await createWorkflow(app, token, { name: 'Detailed' });
    await seedExecution(app, workflow, userId, { status: 'SUCCESS', createdAt: minutesAgo(3) });

    const res = await app.inject({
      method: 'GET',
      url: `/workflows/${workflow.id}`,
      headers: authHeader(token),
    });
    const detail = res.json<WorkflowDetail>();
    expect(detail).toMatchObject({ successRate: 1, finishedRuns: 1 });
    expect(detail.lastRun?.status).toBe('SUCCESS');
  });
});