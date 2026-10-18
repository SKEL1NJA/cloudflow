import { Queue, Worker } from 'bullmq';

export const STEP_QUEUE_NAME = 'workflow-steps';

export interface StepJobData {
  executionId: string;
  stepExecutionId: string;
}

export type StepQueue = Queue<StepJobData>;
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

export function createStepQueue(redisUrl: string): StepQueue {
  return new Queue<StepJobData>(STEP_QUEUE_NAME, {
    connection: { ...parseRedisUrl(redisUrl), enableOfflineQueue: false },
    defaultJobOptions: {
      removeOnComplete: { age: 60 * 60, count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
}

export async function enqueueStep(queue: StepQueue, data: StepJobData): Promise<void> {
  await queue.add('step', data, {
    jobId: data.stepExecutionId,
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