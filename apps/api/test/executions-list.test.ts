import type {
  ExecutionDetail,
  ExecutionSummary,
  Paginated,
  WorkflowDetail,
} from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { authHeader, createWorkflow, registerUserWithId, seedExecution } from './helpers.js';

let app: FastifyInstance;
let token: string;
let userId: string;
let otherToken: string;
let otherUserId: string;
let alpha: WorkflowDetail;
let beta: WorkflowDetail;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

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
  ({ token: otherToken, userId: otherUserId } = await registerUserWithId(app, 'other@example.com'));
  alpha = await createWorkflow(app, token, { name: 'Alpha' });
  beta = await createWorkflow(app, token, { name: 'Beta' });
});

function list(query = '', as = token) {
  return app.inject({ method: 'GET', url: `/executions${query}`, headers: authHeader(as) });
}

async function idsOf(query: string): Promise<string[]> {
  const res = await list(query);
  expect(res.statusCode).toBe(200);
  return res.json<Paginated<ExecutionSummary>>().data.map((execution) => execution.id);
}

describe('status, workflow and date filters', () => {
  it('combines filters and lists the newest executions first', async () => {
    const a1 = await seedExecution(app, alpha, userId, {
      status: 'SUCCESS',
      createdAt: minutesAgo(30),
    });
    const a2 = await seedExecution(app, alpha, userId, {
      status: 'FAILED',
      createdAt: minutesAgo(20),
    });
    const b1 = await seedExecution(app, beta, userId, {
      status: 'FAILED',
      createdAt: minutesAgo(10),
    });

    expect(await idsOf('')).toEqual([b1.id, a2.id, a1.id]);
    expect(await idsOf('?status=FAILED')).toEqual([b1.id, a2.id]);
    expect(await idsOf(`?workflowId=${alpha.id}`)).toEqual([a2.id, a1.id]);
    expect(await idsOf(`?workflowId=${alpha.id}&status=FAILED`)).toEqual([a2.id]);
  });

  it('filters by a date range', async () => {
    const old = await seedExecution(app, alpha, userId, { createdAt: minutesAgo(30) });
    const middle = await seedExecution(app, alpha, userId, { createdAt: minutesAgo(20) });
    const recent = await seedExecution(app, alpha, userId, { createdAt: minutesAgo(10) });
    const at = (minutes: number) => encodeURIComponent(minutesAgo(minutes).toISOString());

    expect(await idsOf(`?from=${at(25)}`)).toEqual([recent.id, middle.id]);
    expect(await idsOf(`?to=${at(15)}`)).toEqual([middle.id, old.id]);
    expect(await idsOf(`?from=${at(25)}&to=${at(15)}`)).toEqual([middle.id]);
    expect(await idsOf(`?from=${at(5)}&to=${at(25)}`)).toEqual([]);
  });

  it('never returns another user executions', async () => {
    const theirs = await createWorkflow(app, otherToken, { name: 'Theirs' });
    await seedExecution(app, theirs, otherUserId);
    const mine = await seedExecution(app, alpha, userId);

    expect(await idsOf('')).toEqual([mine.id]);
    expect(await idsOf(`?workflowId=${theirs.id}`)).toEqual([]);
  });
});

describe('duration filters', () => {
  async function seedDuration(milliseconds: number, minutes: number) {
    const createdAt = minutesAgo(minutes);
    return seedExecution(app, alpha, userId, {
      status: 'SUCCESS',
      createdAt,
      startedAt: createdAt,
      finishedAt: new Date(createdAt.getTime() + milliseconds),
    });
  }

  it('keeps executions inside the bounds and drops unfinished ones', async () => {
    const quick = await seedDuration(500, 40);
    const medium = await seedDuration(5000, 39);
    const long = await seedDuration(30_000, 38);
    const veryLong = await seedDuration(120_000, 37);
    await seedExecution(app, alpha, userId, {
      status: 'RUNNING',
      createdAt: minutesAgo(36),
      startedAt: minutesAgo(36),
    });
    await seedExecution(app, alpha, userId, { status: 'QUEUED', createdAt: minutesAgo(35) });

    expect(await idsOf('?maxDurationMs=999')).toEqual([quick.id]);
    expect(await idsOf('?minDurationMs=1000&maxDurationMs=9999')).toEqual([medium.id]);
    expect(await idsOf('?minDurationMs=10000&maxDurationMs=59999')).toEqual([long.id]);
    expect(await idsOf('?minDurationMs=60000')).toEqual([veryLong.id]);
    expect(await idsOf('?minDurationMs=0')).toEqual([veryLong.id, long.id, medium.id, quick.id]);
  });
});

describe('summaries and validation', () => {
  it('reports total attempts and step count, and the same attempts in the detail', async () => {
    const execution = await seedExecution(app, alpha, userId, {
      status: 'FAILED',
      stepStatuses: ['SUCCESS', 'FAILED', 'SKIPPED'],
      attempts: [1, 3, 0],
    });

    const [summary] = (await list()).json<Paginated<ExecutionSummary>>().data;
    expect(summary).toMatchObject({
      id: execution.id,
      stepCount: 3,
      attempts: 4,
      workflowName: 'Alpha',
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/executions/${execution.id}`,
      headers: authHeader(token),
    });
    expect(detail.json<ExecutionDetail>().attempts).toBe(4);
  });

  it('paginates with accurate totals', async () => {
    for (let index = 0; index < 5; index += 1) {
      await seedExecution(app, alpha, userId, { createdAt: minutesAgo(index + 1) });
    }
    const page = (await list('?pageSize=2&page=3')).json<Paginated<ExecutionSummary>>();
    expect(page.data).toHaveLength(1);
    expect(page.pagination).toEqual({ page: 3, pageSize: 2, total: 5, totalPages: 3 });
  });

  it.each([
    '?from=yesterday',
    '?to=nope',
    '?minDurationMs=-5',
    '?maxDurationMs=abc',
    '?status=EXPLODED',
  ])('rejects %s', async (query) => {
    expect((await list(query)).statusCode).toBe(400);
  });
});
