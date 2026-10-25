import { createPrismaClient, type PrismaClient } from '@cloudflow/db';
import {
  createDeadLetterQueue,
  createStepQueue,
  type DeadLetterQueue,
  type StepQueue,
} from '@cloudflow/queue';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
    queue: StepQueue;
    deadLetterQueue: DeadLetterQueue;
  }
}

export function registerInfrastructure(app: FastifyInstance): void {
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  const queue = createStepQueue(env.REDIS_URL);

  redis.on('error', (err) => app.log.warn({ err }, 'redis connection error'));

  queue.on('error', (err) => app.log.warn({ err }, 'queue connection error'));

  app.decorate('prisma', prisma);
  app.decorate('redis', redis);
  app.decorate('queue', queue);

  const deadLetterQueue = createDeadLetterQueue(env.REDIS_URL);
  deadLetterQueue.on('error', (err) => app.log.warn({ err }, 'dead-letter queue connection error'));
  app.decorate('deadLetterQueue', deadLetterQueue);

  app.addHook('onClose', async () => {
    await queue.close();
    await deadLetterQueue.close();
    await prisma.$disconnect();
    redis.disconnect();
  });
}
