import { createPrismaClient } from '@cloudflow/db';
import {
  createDeadLetterQueue,
  createStepQueue,
  createStepWorker,
  startHeartbeat,
  type StepProcessor,
} from '@cloudflow/queue';
import os from 'node:os';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { createWorkerMetrics, startMetricsServer, type MetricsServer } from './metrics.js';
import { createStepProcessor } from './processor.js';
import { startReconciler } from './reconciler.js';

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

const stats = { processing: 0, jobsHandled: 0, jobErrors: 0 };
const metrics = createWorkerMetrics(() => stats.processing);

const processor = createStepProcessor({
  prisma,
  queue,
  deadLetterQueue,
  workerId,
  logger,
  allowPrivateNetwork: env.HTTP_ALLOW_PRIVATE_NETWORK,
  observer: metrics.observer,
});

const trackedProcessor: StepProcessor = async (job) => {
  stats.processing += 1;
  try {
    await processor(job);
    stats.jobsHandled += 1;
  } catch (err) {
    stats.jobErrors += 1;
    throw err;
  } finally {
    stats.processing -= 1;
  }
};

const worker = createStepWorker(env.REDIS_URL, trackedProcessor, env.WORKER_CONCURRENCY);
worker.on('error', (err) => logger.warn({ err }, 'worker error'));
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'));
worker.on('stalled', (jobId) => logger.warn({ jobId }, 'job stalled and will be redelivered'));

const heartbeat = startHeartbeat({
  redisUrl: env.REDIS_URL,
  identity: {
    workerId,
    hostname: os.hostname(),
    pid: process.pid,
    concurrency: env.WORKER_CONCURRENCY,
  },
  getStats: () => ({ ...stats }),
  intervalMs: env.WORKER_HEARTBEAT_INTERVAL_MS,
  onError: (err) => logger.warn({ err }, 'heartbeat error'),
});

const reconciler =
  env.RECONCILER_INTERVAL_MS > 0
    ? startReconciler(
        { prisma, queue, deadLetterQueue, logger, onRecovery: metrics.countRecovery },
        {
          graceMs: env.RECONCILER_GRACE_MS,
          stuckRunningMs: env.RECONCILER_STUCK_RUNNING_MS,
          batchSize: 100,
          maxLiveJobsScanned: 10_000,
        },
        env.RECONCILER_INTERVAL_MS,
      )
    : undefined;

let metricsServer: MetricsServer | undefined;
if (env.WORKER_METRICS_PORT > 0) {
  try {
    metricsServer = await startMetricsServer(metrics.registry, env.WORKER_METRICS_PORT, env.WORKER_METRICS_HOST);
    logger.info({ port: env.WORKER_METRICS_PORT }, 'metrics server listening');
  } catch (err) {
    logger.warn({ err }, 'metrics server could not start, continuing without it');
  }
}

logger.info({ workerId, concurrency: env.WORKER_CONCURRENCY }, 'worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down, waiting for active jobs to finish');
  await reconciler?.stop();
  await worker.close();
  await heartbeat.stop();
  await metricsServer?.close();
  await queue.close();
  await deadLetterQueue.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));