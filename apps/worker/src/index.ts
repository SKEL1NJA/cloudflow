import { createPrismaClient } from '@cloudflow/db';
import { createDeadLetterQueue, createStepQueue, createStepWorker } from '@cloudflow/queue';
import os from 'node:os';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { createStepProcessor } from './processor.js';

const workerId = `worker-${os.hostname()}-${process.pid}`;
const prisma = createPrismaClient(env.DATABASE_URL);
const queue = createStepQueue(env.REDIS_URL);
const deadLetterQueue = createDeadLetterQueue(env.REDIS_URL);
queue.on('error', (err) => logger.warn({ err }, 'queue connection error'));
deadLetterQueue.on('error', (err) => logger.warn({ err }, 'dead-letter queue connection error'));
await queue.waitUntilReady();

if (env.HTTP_ALLOW_PRIVATE_NETWORK) {
  logger.warn('HTTP_ALLOW_PRIVATE_NETWORK is on, HTTP steps can reach private network addresses');
}

const processor = createStepProcessor({
  prisma,
  queue,
  deadLetterQueue,
  workerId,
  logger,
  allowPrivateNetwork: env.HTTP_ALLOW_PRIVATE_NETWORK,
});
const worker = createStepWorker(env.REDIS_URL, processor, env.WORKER_CONCURRENCY);

worker.on('error', (err) => logger.warn({ err }, 'worker error'));
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'));
worker.on('stalled', (jobId) => logger.warn({ jobId }, 'job stalled and will be redelivered'));

logger.info({ workerId, concurrency: env.WORKER_CONCURRENCY }, 'worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down, waiting for active jobs to finish');
  await worker.close();
  await queue.close();
  await deadLetterQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));