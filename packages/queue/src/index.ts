import { Queue, Worker } from 'bullmq';
import { parseRedisUrl } from './redis.js';

export * from './redis.js';
export * from './workers.js';

export const STEP_QUEUE_NAME = 'workflow-steps';
export const DEAD_LETTER_QUEUE_NAME = 'workflow-steps-dead';

export interface StepJobData {
  executionId: string;
  stepExecutionId: string;
}

export type DeadLetterReason = 'RETRIES_EXHAUSTED' | 'NON_RETRYABLE' | 'WORKER_LOST';

export interface DeadLetterData extends StepJobData {
  stepName: string;
  reason: DeadLetterReason;
  error: string;
  attempts: number;
  failedAt: string;
}

export type StepQueue = Queue<StepJobData>;
export type DeadLetterQueue = Queue<DeadLetterData>;
export type StepProcessor = (job: { data: StepJobData }) => Promise<void>;

function producerConnection(redisUrl: string) {
  return { ...parseRedisUrl(redisUrl), enableOfflineQueue: false };
}

export function createStepQueue(redisUrl: string): StepQueue {
  return new Queue<StepJobData>(STEP_QUEUE_NAME, {
    connection: producerConnection(redisUrl),
    defaultJobOptions: {
      removeOnComplete: { age: 60 * 60, count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
}

export function createDeadLetterQueue(redisUrl: string): DeadLetterQueue {
  return new Queue<DeadLetterData>(DEAD_LETTER_QUEUE_NAME, {
    connection: producerConnection(redisUrl),
  });
}

const INFRASTRUCTURE_RETRY = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1000 },
};

export async function enqueueStep(queue: StepQueue, data: StepJobData): Promise<void> {
  await queue.add('step', data, {
    jobId: data.stepExecutionId,
    ...INFRASTRUCTURE_RETRY,
  });
}

export async function enqueueRetry(
  queue: StepQueue,
  data: StepJobData,
  failedAttempt: number,
  delayMs: number,
): Promise<void> {
  await queue.add('step', data, {
    jobId: `${data.stepExecutionId}-retry-${failedAttempt}`,
    delay: delayMs,
    ...INFRASTRUCTURE_RETRY,
  });
}

export async function enqueueRecovery(
  queue: StepQueue,
  data: StepJobData,
  token: number,
): Promise<void> {
  await queue.add('step', data, {
    jobId: `${data.stepExecutionId}-recover-${token}`,
    ...INFRASTRUCTURE_RETRY,
  });
}

export async function listLiveStepIds(queue: StepQueue, maxJobs: number): Promise<Set<string> | null> {
  const states = ['waiting', 'active', 'delayed', 'prioritized'] as const;
  const counts = await queue.getJobCounts(...states);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total > maxJobs) return null;
  if (total === 0) return new Set();

  const jobs = await queue.getJobs([...states], 0, -1);
  return new Set(jobs.flatMap((job) => (job ? [job.data.stepExecutionId] : [])));
}

export async function deadLetterStep(
  queue: DeadLetterQueue,
  data: DeadLetterData,
): Promise<void> {
  await queue.add('dead-letter', data, {
    jobId: `${data.stepExecutionId}-dead`,
    attempts: 1,
  });
}

export function createStepWorker(
  redisUrl: string,
  processor: StepProcessor,
  concurrency: number,
): Worker<StepJobData> {
  return new Worker<StepJobData>(STEP_QUEUE_NAME, async (job) => processor(job), {
    connection: parseRedisUrl(redisUrl),
    concurrency,
  });
}