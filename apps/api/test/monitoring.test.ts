import { startHeartbeat, workerKey } from '@cloudflow/queue';
import type {
  ExecutionSeriesKey,
  LogListResponse,
  OverviewResponse,
  QueueResponse,
  StepActivityKey,
  TimeSeries,
  WorkersResponse,
} from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { fillSeries } from '../src/lib/time-series.js';
import {
  authHeader,
  createWorkflow,
  registerUserWithId,
  seedExecution,
  waitFor,
} from './helpers.js';

let app: FastifyInstance;
let token: string;
let userId: string;
let otherToken: string;
let otherUserId: string;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

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
  await app.deadLetterQueue.obliterate({ force: true });
  await app.prisma.user.deleteMany();
  ({ token, userId } = await registerUserWithId(app, 'uday@example.com'));
  ({ token: otherToken, userId: otherUserId } = await registerUserWithId(app, 'other@example.com'));
});

function get(url: string, as = token) {
  return app.inject({ method: 'GET', url, headers: authHeader(as) });
}

describe('fillSeries', () => {
  it('returns every bucket in the window, fills gaps with zeros and ignores rows outside it', () => {
    const now = new Date('2026-10-20T10:07:00.000Z');
    const series = fillSeries(
      '1h',
      ['success', 'failed'] as const,
      [
        { bucket: new Date('2026-10-20T10:05:00.000Z'), key: 'success', count: 3 },
        { bucket: new Date('2026-10-20T08:00:00.000Z'), key: 'failed', count: 9 },
      ],
      now,
    );

    expect(series.bucketSeconds).toBe(300);
    expect(series.points).toHaveLength(13);
    expect(series.points[0]).toEqual({
      start: '2026-10-20T09:05:00.000Z',
      counts: { success: 0, failed: 0 },
    });
    expect(series.points.at(-1)).toEqual({
      start: '2026-10-20T10:05:00.000Z',
      counts: { success: 3, failed: 0 },
    });
  });
});

describe('GET /overview', () => {
  it('counts workflows and executions, respects the range and ignores other users', async () => {
    const workflow = await createWorkflow(app, token, { name: 'A' });
    await createWorkflow(app, token, { name: 'B', enabled: false });
    const recent = minutesAgo(10);
    for (const status of ['SUCCESS', 'SUCCESS', 'FAILED', 'RUNNING', 'QUEUED'] as const) {
      await seedExecution(app, workflow, userId, { status, createdAt: recent });
    }
    await seedExecution(app, workflow, userId, { status: 'SUCCESS', createdAt: daysAgo(3) });
    const otherWorkflow = await createWorkflow(app, otherToken, { name: 'Other' });
    await seedExecution(app, otherWorkflow, otherUserId, { status: 'SUCCESS', createdAt: recent });

    const day = (await get('/overview?range=24h')).json<OverviewResponse>();
    expect(day.workflows).toEqual({ total: 2, enabled: 1 });
    expect(day.executions).toEqual({ queued: 1, running: 1, success: 2, failed: 1, cancelled: 0 });
    expect(day.health.database.status).toBe('up');
    expect(day.health.redis.status).toBe('up');

    const week = (await get('/overview?range=7d')).json<OverviewResponse>();
    expect(week.executions.success).toBe(3);
  });

  it('defaults to 24h and rejects unknown ranges', async () => {
    expect((await get('/overview')).json<OverviewResponse>().range).toBe('24h');
    expect((await get('/overview?range=30d')).statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    expect((await app.inject({ method: 'GET', url: '/overview' })).statusCode).toBe(401);
  });
});

describe('GET /stats/executions', () => {
  it('buckets executions by status with aligned, gap-free buckets', async () => {
    const workflow = await createWorkflow(app, token);
    for (const [status, minutes] of [
      ['SUCCESS', 5],
      ['SUCCESS', 6],
      ['FAILED', 20],
      ['RUNNING', 1],
    ] as const) {
      await seedExecution(app, workflow, userId, { status, createdAt: minutesAgo(minutes) });
    }
    const otherWorkflow = await createWorkflow(app, otherToken, { name: 'Other' });
    await seedExecution(app, otherWorkflow, otherUserId, { status: 'SUCCESS', createdAt: minutesAgo(5) });

    const series = (await get('/stats/executions?range=1h')).json<TimeSeries<ExecutionSeriesKey>>();
    expect(series.bucketSeconds).toBe(300);
    expect(series.points.length).toBeGreaterThanOrEqual(12);
    expect(series.points.length).toBeLessThanOrEqual(13);

    const starts = series.points.map((point) => Date.parse(point.start));
    expect(starts.every((start) => start % 300_000 === 0)).toBe(true);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));

    const total = (key: ExecutionSeriesKey) =>
      series.points.reduce((sum, point) => sum + point.counts[key], 0);
    expect(total('success')).toBe(2);
    expect(total('failed')).toBe(1);
    expect(total('active')).toBe(1);
    expect(total('cancelled')).toBe(0);
  });
});

describe('queue endpoints', () => {
  it('reports queue depth including the dead-letter queue', async () => {
    await app.queue.add('step', { executionId: 'e', stepExecutionId: 's' }, { jobId: 's' });
    await app.deadLetterQueue.add('dead-letter', {
      executionId: 'e',
      stepExecutionId: 's',
      stepName: 'x',
      reason: 'NON_RETRYABLE',
      error: 'boom',
      attempts: 1,
      failedAt: new Date().toISOString(),
    });

    const { counts } = (await get('/queue')).json<QueueResponse>();
    expect(counts).toMatchObject({ waiting: 1, active: 0, delayed: 0, deadLetter: 1 });
  });

  it('charts finished steps per bucket for the caller only', async () => {
    const workflow = await createWorkflow(app, token);
    await seedExecution(app, workflow, userId, {
      status: 'FAILED',
      stepStatuses: ['SUCCESS', 'FAILED', 'SKIPPED'],
      createdAt: minutesAgo(10),
    });
    const otherWorkflow = await createWorkflow(app, otherToken, { name: 'Other' });
    await seedExecution(app, otherWorkflow, otherUserId, {
      status: 'SUCCESS',
      stepStatuses: ['SUCCESS', 'SUCCESS', 'SUCCESS'],
      createdAt: minutesAgo(10),
    });

    const series = (await get('/queue/activity?range=1h')).json<TimeSeries<StepActivityKey>>();
    const total = (key: StepActivityKey) => series.points.reduce((sum, point) => sum + point.counts[key], 0);
    expect(total('succeeded')).toBe(1);
    expect(total('failed')).toBe(1);
  });
});

describe('GET /workers', () => {
  it('lists workers from their heartbeats with live counters', async () => {
    const workerId = 'api-test-worker';
    const heartbeat = startHeartbeat({
      redisUrl: process.env.REDIS_URL as string,
      identity: { workerId, hostname: 'test-host', pid: 42, concurrency: 3 },
      getStats: () => ({ processing: 1, completed: 5, failed: 2 }),
      intervalMs: 60_000,
      onError: () => undefined,
    });

    try {
      const body = await waitFor(async () => {
        const response = (await get('/workers')).json<WorkersResponse>();
        return response.workers.some((worker) => worker.workerId === workerId) ? response : null;
      });

      const worker = body.workers.find((entry) => entry.workerId === workerId);
      expect(worker).toMatchObject({
        status: 'busy',
        hostname: 'test-host',
        concurrency: 3,
        processing: 1,
        completed: 5,
        failed: 2,
      });
      expect(body.summary.busy).toBeGreaterThanOrEqual(1);
    } finally {
      await heartbeat.stop();
      await app.redis.del(workerKey(workerId));
    }
  });
});

describe('GET /logs', () => {
  async function seedLogs(as: { workflowName: string; ownerId: string }) {
    const workflow = await createWorkflow(app, as.ownerId === userId ? token : otherToken, {
      name: as.workflowName,
    });
    const execution = await seedExecution(app, workflow, as.ownerId);
    await app.prisma.executionLog.createMany({
      data: [
        { executionId: execution.id, level: 'INFO', message: 'Execution started' },
        { executionId: execution.id, level: 'WARN', message: 'Step failed, Retrying in 2s' },
        { executionId: execution.id, level: 'ERROR', message: 'Request failed: ECONNREFUSED' },
        { executionId: execution.id, level: 'INFO', message: 'Execution succeeded' },
      ],
    });
    return { workflow, execution };
  }

  it('returns the newest logs first with workflow context and string ids', async () => {
    const { workflow, execution } = await seedLogs({ workflowName: 'Logs A', ownerId: userId });

    const body = (await get('/logs')).json<LogListResponse>();
    expect(body.data.map((log) => log.message)).toEqual([
      'Execution succeeded',
      'Request failed: ECONNREFUSED',
      'Step failed, Retrying in 2s',
      'Execution started',
    ]);
    expect(body.data[0]).toMatchObject({
      executionId: execution.id,
      workflowId: workflow.id,
      workflowName: 'Logs A',
      stepExecutionId: null,
    });
    expect(typeof body.data[0]?.id).toBe('string');
    expect(body.nextCursor).toBeNull();
  });

  it('filters by level, text and execution', async () => {
    const { execution } = await seedLogs({ workflowName: 'Logs A', ownerId: userId });
    await seedLogs({ workflowName: 'Logs B', ownerId: userId });

    const errors = (await get('/logs?level=ERROR')).json<LogListResponse>();
    expect(errors.data).toHaveLength(2);

    const search = (await get('/logs?search=RETRYING')).json<LogListResponse>();
    expect(search.data).toHaveLength(2);
    expect(search.data.every((log) => log.level === 'WARN')).toBe(true);

    const single = (await get(`/logs?executionId=${execution.id}`)).json<LogListResponse>();
    expect(single.data).toHaveLength(4);
    expect(single.data.every((log) => log.executionId === execution.id)).toBe(true);
  });

  it('pages through results with a cursor', async () => {
    await seedLogs({ workflowName: 'Logs A', ownerId: userId });
    await seedLogs({ workflowName: 'Logs B', ownerId: userId });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/logs?limit=3${cursor ? `&cursor=${cursor}` : ''}`;
      const page = (await get(url)).json<LogListResponse>();
      seen.push(...page.data.map((log) => log.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(8);
    expect(new Set(seen).size).toBe(8);
    expect(seen).toEqual([...seen].sort((a, b) => Number(BigInt(b) - BigInt(a))));
  });

  it('never returns another user logs', async () => {
    await seedLogs({ workflowName: 'Logs A', ownerId: userId });
    await seedLogs({ workflowName: 'Other logs', ownerId: otherUserId });

    const mine = (await get('/logs')).json<LogListResponse>();
    expect(mine.data).toHaveLength(4);
    expect(mine.data.every((log) => log.workflowName === 'Logs A')).toBe(true);
  });

  it('rejects an invalid cursor', async () => {
    expect((await get('/logs?cursor=abc')).statusCode).toBe(400);
  });
});