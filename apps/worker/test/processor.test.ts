import { createPrismaClient, type PrismaClient } from '@cloudflow/db';
import {
  createDeadLetterQueue,
  createStepQueue,
  createStepWorker,
  enqueueStep,
  type DeadLetterQueue,
  type StepQueue,
} from '@cloudflow/queue';
import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createStepProcessor } from '../src/processor.js';
import { seedExecution, waitForFinish } from './helpers.js';

const redisUrl = process.env.REDIS_URL as string;

let prisma: PrismaClient;
let queue: StepQueue;
let deadLetterQueue: DeadLetterQueue;
let processor: ReturnType<typeof createStepProcessor>;

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
    allowPrivateNetwork: false,
  });
});

afterAll(async () => {
  await queue.close();
  await deadLetterQueue.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await queue.obliterate({ force: true });
  await deadLetterQueue.obliterate({ force: true });
  await prisma.user.deleteMany();
});

describe('with a running worker', () => {
  let worker: ReturnType<typeof createStepWorker>;

  beforeAll(() => {
    worker = createStepWorker(redisUrl, processor, 2);
  });

  afterAll(async () => {
    await worker.close();
  });

  it('runs every step in order and marks the execution successful', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [
      { type: 'DELAY', name: 'Wait', config: { durationMs: 100 } },
      {
        type: 'TRANSFORM',
        name: 'Rename',
        config: { mappings: [{ target: 'waited', source: 'waitedMs' }] },
      },
      { type: 'NOTIFICATION', name: 'Tell', config: { message: 'done' } },
    ]);
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const execution = await waitForFinish(prisma, executionId);
    expect(execution.status).toBe('SUCCESS');
    expect(execution.startedAt).not.toBeNull();
    expect(execution.finishedAt).not.toBeNull();

    const steps = await prisma.stepExecution.findMany({
      where: { executionId },
      orderBy: { position: 'asc' },
    });
    expect(steps.map((step) => step.status)).toEqual(['SUCCESS', 'SUCCESS', 'SUCCESS']);
    expect(steps.map((step) => step.attempts)).toEqual([1, 1, 1]);
    expect(steps[0]?.workerId).toBe('test-worker');
    expect(steps[0]?.durationMs).toBeGreaterThanOrEqual(90);
    expect(steps[1]?.output).toEqual({ waited: 100 });

    const logs = await prisma.executionLog.findMany({ where: { executionId } });
    expect(logs.some((log) => log.message === 'Execution succeeded')).toBe(true);
  });

  it('passes the execution input to the first step', async () => {
    const { executionId, stepIds } = await seedExecution(
      prisma,
      [
        {
          type: 'TRANSFORM',
          name: 'Pick',
          config: { mappings: [{ target: 'id', source: 'user.id' }] },
        },
      ],
      { user: { id: 7 } },
    );
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    expect((await waitForFinish(prisma, executionId)).status).toBe('SUCCESS');
    const step = await prisma.stepExecution.findUniqueOrThrow({
      where: { id: stepIds[0] as string },
    });
    expect(step.output).toEqual({ id: 7 });
  });

  it('fails the execution and skips the remaining steps when a step fails', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [
      {
        type: 'TRANSFORM',
        name: 'Broken',
        config: { mappings: [{ target: 'x', source: 'missing.path' }] },
      },
      { type: 'NOTIFICATION', name: 'Never runs', config: { message: 'unreachable' } },
    ]);
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const execution = await waitForFinish(prisma, executionId);
    expect(execution.status).toBe('FAILED');
    expect(execution.error).toContain('Broken');
    expect(execution.error).toContain('missing.path');

    const steps = await prisma.stepExecution.findMany({
      where: { executionId },
      orderBy: { position: 'asc' },
    });
    expect(steps.map((step) => step.status)).toEqual(['FAILED', 'SKIPPED']);
  });
});

describe('redelivery (no worker running, the processor is called directly)', () => {
  it('does not run a completed step a second time', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [
      { type: 'DELAY', name: 'Wait', config: { durationMs: 100 } },
    ]);
    const job = { data: { executionId, stepExecutionId: stepIds[0] as string } };

    await processor(job);
    const afterFirst = await prisma.stepExecution.findUniqueOrThrow({
      where: { id: job.data.stepExecutionId },
    });
    await processor(job);
    const afterSecond = await prisma.stepExecution.findUniqueOrThrow({
      where: { id: job.data.stepExecutionId },
    });

    expect(afterFirst.status).toBe('SUCCESS');
    expect(afterSecond.attempts).toBe(1);
    expect(afterSecond.finishedAt).toEqual(afterFirst.finishedAt);
  });

  it('queues the next step when a finished step is delivered again after a crash', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [
      { type: 'NOTIFICATION', name: 'One', config: { message: 'a' } },
      { type: 'NOTIFICATION', name: 'Two', config: { message: 'b' } },
    ]);
    const [first, second] = stepIds as [string, string];

    await prisma.stepExecution.update({
      where: { id: first },
      data: { status: 'SUCCESS', attempts: 1 },
    });
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'RUNNING' },
    });
    expect(await queue.getJob(second)).toBeUndefined();

    await processor({ data: { executionId, stepExecutionId: first } });

    expect(await queue.getJob(second)).toBeDefined();
  });

  it('ignores jobs whose execution no longer exists', async () => {
    await expect(
      processor({ data: { executionId: randomUUID(), stepExecutionId: randomUUID() } }),
    ).resolves.toBeUndefined();
  });
});