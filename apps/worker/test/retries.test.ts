import { createPrismaClient, type PrismaClient } from '@cloudflow/db';
import {
  createDeadLetterQueue,
  createStepQueue,
  createStepWorker,
  enqueueStep,
  type DeadLetterQueue,
  type StepQueue,
} from '@cloudflow/queue';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createStepProcessor } from '../src/processor.js';
import { seedExecution, waitFor, waitForFinish, type SeedStep } from './helpers.js';
import { sendJson, startServer, type TestServer } from './test-server.js';

const redisUrl = process.env.REDIS_URL as string;

let prisma: PrismaClient;
let queue: StepQueue;
let deadLetterQueue: DeadLetterQueue;
let processor: ReturnType<typeof createStepProcessor>;
let worker: ReturnType<typeof createStepWorker>;
let server: TestServer | undefined;

beforeAll(async () => {
  prisma = createPrismaClient(process.env.DATABASE_URL as string);
  queue = createStepQueue(redisUrl);
  deadLetterQueue = createDeadLetterQueue(redisUrl);
  await queue.waitUntilReady();
  processor = createStepProcessor({
    prisma,
    queue,
    deadLetterQueue,
    workerId: 'test-worker',
    logger: pino({ level: 'silent' }),
    allowPrivateNetwork: true,
  });
  worker = createStepWorker(redisUrl, processor, 2);
});

afterAll(async () => {
  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await deadLetterQueue.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await waitFor(async () => ((await queue.getActiveCount()) === 0 ? true : null));
  await queue.obliterate({ force: true });
  await deadLetterQueue.obliterate({ force: true });
  await prisma.user.deleteMany();
});

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function httpStep(url: string): SeedStep {
  return {
    type: 'HTTP_REQUEST',
    name: 'Call API',
    config: { method: 'GET', url, headers: {}, timeoutMs: 2000 },
  };
}

const pickId: SeedStep = {
  type: 'TRANSFORM',
  name: 'Pick id',
  config: { mappings: [{ target: 'id', source: 'body.id' }] },
};

describe('retries', () => {
  it('retries transient failures with the same idempotency key and then succeeds', async () => {
    server = await startServer((count, res) =>
      count <= 2 ? sendJson(res, 503, { error: 'busy' }) : sendJson(res, 200, { id: 42 }),
    );
    const { executionId, stepIds } = await seedExecution(prisma, [httpStep(server.url), pickId], undefined, {
      maxAttempts: 3,
      backoffBaseMs: 100,
    });
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const execution = await waitForFinish(prisma, executionId);
    expect(execution.status).toBe('SUCCESS');

    const steps = await prisma.stepExecution.findMany({ where: { executionId }, orderBy: { position: 'asc' } });
    expect(steps[0]?.status).toBe('SUCCESS');
    expect(steps[0]?.attempts).toBe(3);
    expect(steps[0]?.error).toBeNull();
    expect(steps[0]?.output).toEqual({ status: 200, body: { id: 42 } });
    expect(steps[1]?.output).toEqual({ id: 42 });

    expect(server.seen).toHaveLength(3);
    expect(new Set(server.seen.map((request) => request.headers['idempotency-key']))).toEqual(
      new Set([stepIds[0]]),
    );

    const logs = await prisma.executionLog.findMany({ where: { executionId } });
    expect(logs.filter((log) => log.message.includes('Retrying in'))).toHaveLength(2);
    expect(await deadLetterQueue.getJobCounts('waiting')).toEqual({ waiting: 0 });
  });

  it('gives up after maxAttempts, skips the rest and dead-letters the step', async () => {
    server = await startServer((_count, res) => sendJson(res, 503, { error: 'down' }));
    const { executionId, stepIds } = await seedExecution(prisma, [httpStep(server.url), pickId], undefined, {
      maxAttempts: 3,
      backoffBaseMs: 100,
    });
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const execution = await waitForFinish(prisma, executionId);
    expect(execution.status).toBe('FAILED');
    expect(execution.error).toContain('after 3 attempts');
    expect(execution.error).toContain('HTTP 503');

    const steps = await prisma.stepExecution.findMany({ where: { executionId }, orderBy: { position: 'asc' } });
    expect(steps.map((step) => step.status)).toEqual(['FAILED', 'SKIPPED']);
    expect(steps[0]?.attempts).toBe(3);
    expect(server.seen).toHaveLength(3);

    const dead = await waitFor(
      async () => (await deadLetterQueue.getJob(`${stepIds[0]}-dead`)) ?? null,
    );
    expect(dead.data).toMatchObject({
      executionId,
      stepExecutionId: stepIds[0],
      reason: 'RETRIES_EXHAUSTED',
      attempts: 3,
    });
  });

  it('does not retry a permanent failure', async () => {
    server = await startServer((_count, res) => sendJson(res, 404, { error: 'missing' }));
    const { executionId, stepIds } = await seedExecution(prisma, [httpStep(server.url)], undefined, {
      maxAttempts: 5,
      backoffBaseMs: 100,
    });
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const execution = await waitForFinish(prisma, executionId);
    expect(execution.status).toBe('FAILED');
    expect(server.seen).toHaveLength(1);

    const step = await prisma.stepExecution.findUniqueOrThrow({ where: { id: stepIds[0] as string } });
    expect(step.attempts).toBe(1);

    const dead = await waitFor(
      async () => (await deadLetterQueue.getJob(`${stepIds[0]}-dead`)) ?? null,
    );
    expect(dead.data.reason).toBe('NON_RETRYABLE');
  });

  it('exposes the RETRYING state with the time of the next attempt', async () => {
    server = await startServer((_count, res) => sendJson(res, 503, { error: 'down' }));
    const { executionId, stepIds } = await seedExecution(prisma, [httpStep(server.url)], undefined, {
      maxAttempts: 3,
      backoffBaseMs: 5000,
    });
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const step = await waitFor(async () => {
      const row = await prisma.stepExecution.findUniqueOrThrow({ where: { id: stepIds[0] as string } });
      return row.status === 'RETRYING' ? row : null;
    });
    expect(step.attempts).toBe(1);
    expect(step.error).toContain('HTTP 503');
    expect(step.nextRetryAt?.getTime() ?? 0).toBeGreaterThan(Date.now());

    const execution = await prisma.workflowExecution.findUniqueOrThrow({ where: { id: executionId } });
    expect(execution.status).toBe('RUNNING');
    expect(await queue.getJobCounts('delayed')).toEqual({ delayed: 1 });
  });
});

describe('crash recovery', () => {
  it('reclaims a step stranded in RUNNING by a dead worker and counts it as another attempt', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [
      { type: 'NOTIFICATION', name: 'Tell', config: { message: 'recovered' } },
    ]);
    const stepId = stepIds[0] as string;
    await prisma.stepExecution.update({
      where: { id: stepId },
      data: { status: 'RUNNING', attempts: 1, workerId: 'dead-worker' },
    });
    await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: 'RUNNING' } });

    await processor({ data: { executionId, stepExecutionId: stepId } });

    const step = await prisma.stepExecution.findUniqueOrThrow({ where: { id: stepId } });
    expect(step.status).toBe('SUCCESS');
    expect(step.attempts).toBe(2);
    expect(step.workerId).toBe('test-worker');
    expect((await prisma.workflowExecution.findUniqueOrThrow({ where: { id: executionId } })).status).toBe('SUCCESS');
  });
});
