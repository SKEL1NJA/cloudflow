import { createPrismaClient, type PrismaClient } from '@cloudflow/db';
import {
  EVENT_STREAM_KEY,
  createDeadLetterQueue,
  createEventPublisher,
  createRedisClient,
  createStepQueue,
  createStepWorker,
  enqueueStep,
  readEventsAfter,
  type DeadLetterQueue,
  type StepQueue,
  type StreamEntry,
} from '@cloudflow/queue';
import { pino } from 'pino';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createStepProcessor } from '../src/processor.js';
import { seedExecution, waitFor, type SeedStep } from './helpers.js';
import { sendJson, startServer, type TestServer } from './test-server.js';

const redisUrl = process.env.REDIS_URL as string;

let prisma: PrismaClient;
let queue: StepQueue;
let deadLetterQueue: DeadLetterQueue;
let redis: Redis;
let worker: ReturnType<typeof createStepWorker>;
let server: TestServer | undefined;

beforeAll(async () => {
  prisma = createPrismaClient(process.env.DATABASE_URL as string);
  queue = createStepQueue(redisUrl);
  deadLetterQueue = createDeadLetterQueue(redisUrl);
  redis = createRedisClient(redisUrl);
  await queue.waitUntilReady();
  const events = createEventPublisher(redis, () => undefined);
  const processor = createStepProcessor({
    prisma,
    queue,
    deadLetterQueue,
    workerId: 'test-worker',
    logger: pino({ level: 'silent' }),
    allowPrivateNetwork: true,
    events,
  });
  worker = createStepWorker(redisUrl, processor, 2);
});

afterAll(async () => {
  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await deadLetterQueue.close();
  redis.disconnect();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await queue.obliterate({ force: true });
  await deadLetterQueue.obliterate({ force: true });
  await redis.del(EVENT_STREAM_KEY);
  await prisma.user.deleteMany();
});

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function label(entry: StreamEntry): string {
  const { event } = entry;
  return event.type === 'step.updated'
    ? `step:${event.position}:${event.status}`
    : `execution:${event.status}`;
}

function eventsUntil(executionId: string, last: string): Promise<StreamEntry[]> {
  return waitFor(async () => {
    const entries = (await readEventsAfter(redis, '0-0', 1000)).filter(
      (entry) => entry.event.executionId === executionId,
    );
    return entries.some((entry) => label(entry) === last) ? entries : null;
  });
}

const notify = (name: string): SeedStep => ({
  type: 'NOTIFICATION',
  name,
  config: { message: name },
});

describe('worker events', () => {
  it('publishes the whole lifecycle of a successful execution, in order, with its owner', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [notify('One'), notify('Two')]);
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const entries = await eventsUntil(executionId, 'execution:SUCCESS');
    expect(entries.map(label)).toEqual([
      'execution:RUNNING',
      'step:0:RUNNING',
      'step:0:SUCCESS',
      'step:1:RUNNING',
      'step:1:SUCCESS',
      'execution:SUCCESS',
    ]);

    const row = await prisma.workflowExecution.findUniqueOrThrow({ where: { id: executionId } });
    for (const entry of entries) {
      expect(entry.event.userId).toBe(row.userId);
      expect(entry.event.workflowId).toBe(row.workflowId);
    }
  });

  it('publishes the retry with the time of the next attempt, then the final failure', async () => {
    server = await startServer((_count, res) => sendJson(res, 503, { error: 'down' }));
    const http: SeedStep = {
      type: 'HTTP_REQUEST',
      name: 'Call',
      config: { method: 'GET', url: server.url, headers: {}, timeoutMs: 2000 },
    };
    const { executionId, stepIds } = await seedExecution(prisma, [http], undefined, {
      maxAttempts: 2,
      backoffBaseMs: 100,
    });
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const entries = await eventsUntil(executionId, 'execution:FAILED');
    expect(entries.map(label)).toEqual([
      'execution:RUNNING',
      'step:0:RUNNING',
      'step:0:RETRYING',
      'step:0:RUNNING',
      'step:0:FAILED',
      'execution:FAILED',
    ]);

    const retrying = entries.find((entry) => label(entry) === 'step:0:RETRYING')?.event;
    expect(retrying?.type).toBe('step.updated');
    if (retrying?.type === 'step.updated') {
      expect(retrying.attempts).toBe(1);
      expect(Date.parse(retrying.nextRetryAt ?? '')).toBeGreaterThan(Date.parse(retrying.at));
    }
  });
});

describe('publisher', () => {
  it('reports failures without throwing, so a Redis problem cannot fail a step', async () => {
    const broken = {
      xadd: async () => {
        throw new Error('redis is down');
      },
    } as unknown as Redis;
    const errors: unknown[] = [];
    const publisher = createEventPublisher(broken, (err) => errors.push(err));

    await expect(
      publisher.publish({
        type: 'execution.updated',
        userId: '01a14cec-f85d-7079-b268-9c29038eb32d',
        workflowId: '01a14cec-f85d-7079-b268-9c29038eb32d',
        executionId: '01a14cec-f85d-7079-b268-9c29038eb32d',
        status: 'RUNNING',
        at: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});