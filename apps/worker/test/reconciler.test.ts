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
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createStepProcessor } from '../src/processor.js';
import { reconcileOnce, type ReconcilerDeps, type ReconcilerOptions } from '../src/reconciler.js';
import { seedExecution, waitForFinish, type SeedStep } from './helpers.js';

const redisUrl = process.env.REDIS_URL as string;
const options: ReconcilerOptions = {
  graceMs: 60_000,
  stuckRunningMs: 600_000,
  batchSize: 100,
  maxLiveJobsScanned: 1000,
};

let prisma: PrismaClient;
let queue: StepQueue;
let deadLetterQueue: DeadLetterQueue;
let deps: ReconcilerDeps;
const logger = pino({ level: 'silent' });

const later = (ms: number) => new Date(Date.now() + ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;

const notify = (name: string): SeedStep => ({
  type: 'NOTIFICATION',
  name,
  config: { message: name },
});

beforeAll(async () => {
  prisma = createPrismaClient(process.env.DATABASE_URL as string);
  queue = createStepQueue(redisUrl);
  deadLetterQueue = createDeadLetterQueue(redisUrl);
  await queue.waitUntilReady();
  deps = { prisma, queue, deadLetterQueue, logger };
});

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await deadLetterQueue.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await queue.obliterate({ force: true });
  await deadLetterQueue.obliterate({ force: true });
  await prisma.user.deleteMany();
});

async function recoveryJobs(stepId: string) {
  const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
  return jobs.filter((job) => job.id?.startsWith(`${stepId}-recover-`));
}

describe('lost publishes (the dual-write problem)', () => {
  it('queues the first step of an execution that was committed but never published', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [notify('One'), notify('Two')]);
    const first = stepIds[0] as string;

    const result = await reconcileOnce(deps, options, later(61 * SECOND));

    expect(result).toMatchObject({ checked: 1, recovered: 1, failed: 0 });
    const jobs = await recoveryJobs(first);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual({ executionId, stepExecutionId: first });

    const logs = await prisma.executionLog.findMany({ where: { executionId } });
    expect(logs.some((log) => log.message.startsWith('Reconciler'))).toBe(true);
  });

  it('leaves a fresh execution alone until the grace period has passed', async () => {
    await seedExecution(prisma, [notify('One')]);
    const result = await reconcileOnce(deps, options, later(5 * SECOND));
    expect(result.checked).toBe(0);
    expect(await queue.getJobCounts('waiting')).toEqual({ waiting: 0 });
  });

  it('does not queue a step the queue already holds a job for', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [notify('One')]);
    await enqueueStep(queue, { executionId, stepExecutionId: stepIds[0] as string });

    const result = await reconcileOnce(deps, options, later(5 * MINUTE));

    expect(result).toMatchObject({ checked: 1, recovered: 0, skipped: 1 });
    expect(await queue.getJobCounts('waiting')).toEqual({ waiting: 1 });
  });

  it('recovers a step only once per grace period', async () => {
    const { stepIds } = await seedExecution(prisma, [notify('One')]);
    const first = stepIds[0] as string;

    const firstPass = await reconcileOnce(deps, options, later(61 * SECOND));
    const secondPass = await reconcileOnce(deps, options, later(90 * SECOND));

    expect(firstPass.recovered).toBe(1);
    expect(secondPass.checked).toBe(0);
    expect(await recoveryJobs(first)).toHaveLength(1);
  });

  it('skips the pass when the queue is too deep to scan', async () => {
    const { stepIds } = await seedExecution(prisma, [notify('One')]);
    await queue.add('step', { executionId: 'other', stepExecutionId: 'other-step' }, { jobId: 'other-step' });

    const result = await reconcileOnce(deps, { ...options, maxLiveJobsScanned: 0 }, later(61 * SECOND));

    expect(result).toMatchObject({ checked: 1, recovered: 0, skipped: 1 });
    expect(await recoveryJobs(stepIds[0] as string)).toHaveLength(0);
  });

  it('ignores steps of executions that already finished', async () => {
    const { executionId } = await seedExecution(prisma, [notify('One')]);
    await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: 'FAILED' } });
    const result = await reconcileOnce(deps, options, later(5 * MINUTE));
    expect(result.checked).toBe(0);
  });
});

describe('stalled chains and lost retries', () => {
  it('queues the next step when a finished step never queued its successor', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [notify('One'), notify('Two')]);
    const [first, second] = stepIds as [string, string];
    await prisma.stepExecution.update({
      where: { id: first },
      data: { status: 'SUCCESS', attempts: 1, finishedAt: new Date() },
    });
    await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: 'RUNNING' } });

    const result = await reconcileOnce(deps, options, later(61 * SECOND));

    expect(result.recovered).toBe(1);
    expect(await recoveryJobs(second)).toHaveLength(1);
    expect(await recoveryJobs(first)).toHaveLength(0);
  });

  it('queues a retry whose delayed job was lost', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [notify('One')]);
    const step = stepIds[0] as string;
    await prisma.stepExecution.update({
      where: { id: step },
      data: { status: 'RETRYING', attempts: 1, nextRetryAt: new Date(), error: 'HTTP 503' },
    });
    await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: 'RUNNING' } });

    const result = await reconcileOnce(deps, options, later(61 * SECOND));

    expect(result.recovered).toBe(1);
    expect(await recoveryJobs(step)).toHaveLength(1);
  });
});

describe('lost workers', () => {
  it('queues a step that has been RUNNING far too long and keeps its state', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [notify('One')]);
    const step = stepIds[0] as string;
    await prisma.stepExecution.update({
      where: { id: step },
      data: { status: 'RUNNING', attempts: 1, workerId: 'dead-worker', startedAt: new Date() },
    });
    await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: 'RUNNING' } });

    const early = await reconcileOnce(deps, options, later(5 * MINUTE));
    expect(early.checked).toBe(0);

    const result = await reconcileOnce(deps, options, later(11 * MINUTE));
    expect(result).toMatchObject({ recovered: 1, failed: 0 });
    expect(await recoveryJobs(step)).toHaveLength(1);
    const after = await prisma.stepExecution.findUniqueOrThrow({ where: { id: step } });
    expect(after.status).toBe('RUNNING');
  });

  it('fails a step that has used every attempt on dead workers instead of recovering it forever', async () => {
    const { executionId, stepIds } = await seedExecution(prisma, [notify('Poison'), notify('After')]);
    const [step, after] = stepIds as [string, string];
    await prisma.stepExecution.update({
      where: { id: step },
      data: { status: 'RUNNING', attempts: 3, workerId: 'dead-worker', startedAt: new Date() },
    });
    await prisma.workflowExecution.update({ where: { id: executionId }, data: { status: 'RUNNING' } });

    const result = await reconcileOnce(deps, options, later(11 * MINUTE));

    expect(result).toMatchObject({ recovered: 0, failed: 1 });
    expect(await recoveryJobs(step)).toHaveLength(0);

    const steps = await prisma.stepExecution.findMany({ where: { executionId }, orderBy: { position: 'asc' } });
    expect(steps.map((entry) => entry.status)).toEqual(['FAILED', 'SKIPPED']);
    expect(steps[0]?.error).toContain('stopped responding');
    expect(steps[1]?.id).toBe(after);

    const execution = await prisma.workflowExecution.findUniqueOrThrow({ where: { id: executionId } });
    expect(execution.status).toBe('FAILED');
    expect(execution.error).toContain('Poison');

    const dead = await deadLetterQueue.getJob(`${step}-dead`);
    expect(dead?.data).toMatchObject({ reason: 'WORKER_LOST', attempts: 3 });
  });
});

describe('end to end', () => {
  it('finishes an execution whose first job was lost once a worker is available', async () => {
    const { executionId } = await seedExecution(prisma, [notify('One'), notify('Two')]);
    await reconcileOnce(deps, options, later(61 * SECOND));

    const processor = createStepProcessor({
      prisma,
      queue,
      deadLetterQueue,
      workerId: 'test-worker',
      logger,
      allowPrivateNetwork: false,
    });
    const worker = createStepWorker(redisUrl, processor, 1);
    try {
      const execution = await waitForFinish(prisma, executionId);
      expect(execution.status).toBe('SUCCESS');
      const steps = await prisma.stepExecution.findMany({ where: { executionId }, orderBy: { position: 'asc' } });
      expect(steps.map((step) => step.attempts)).toEqual([1, 1]);
    } finally {
      await worker.close();
    }
  });
});