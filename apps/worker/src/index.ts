import { createPrismaClient } from '@cloudflow/db';
import { createStepQueue, createStepWorker } from '@cloudflow/queue';
import os from 'node:os';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { createStepProcessor } from './processor.js';

const workerId = `worker-${os.hostname()}-${process.pid}`;
const prisma = createPrismaClient(env.DATABASE_URL);
const queue = createStepQueue(env.REDIS_URL);
queue.on('error', (err) => logger.warn({ err }, 'queue connection error'));
await queue.waitUntilReady();

const processor = createStepProcessor({ prisma, queue, workerId, logger });
const worker = createStepWorker(env.REDIS_URL, processor, env.WORKER_CONCURRENCY);

worker.on('error', (err) => logger.warn({ err }, 'worker error'));
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'));
worker.on('stalled', (jobId) => logger.warn({ jobId }, 'job stalled and will be redelivered'));

logger.info({ workerId, concurrency: env.WORKER_CONCURRENCY }, 'worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down, waiting for active jobs to finish');
  await worker.close();
  await queue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));