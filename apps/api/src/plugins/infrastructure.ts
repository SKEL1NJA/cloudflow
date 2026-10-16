import { createPrismaClient, type PrismaClient } from '@cloudflow/db';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    redis: Redis;
  }
}

export function registerInfrastructure(app: FastifyInstance): void {
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });

  redis.on('error', (err) => app.log.warn({ err }, 'redis connection error'));

  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
}