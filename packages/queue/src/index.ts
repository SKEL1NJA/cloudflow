import { Queue, Worker } from 'bullmq';

export const STEP_QUEUE_NAME = 'workflow-steps';
export const DEAD_LETTER_QUEUE_NAME = 'workflow-steps-dead';

export interface StepJobData {
  executionId: string;
  stepExecutionId: string;
}

export type DeadLetterReason = 'RETRIES_EXHAUSTED' | 'NON_RETRYABLE';

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

export interface RedisConnectionOptions {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

export function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  const options: RedisConnectionOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    db: Number.isInteger(db) ? db : 0,
  };
  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  if (url.protocol === 'rediss:') options.tls = {};
  return options;
}

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