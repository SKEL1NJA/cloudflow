import type { PrismaClient } from '@cloudflow/db';
import type { CheckResult } from '@cloudflow/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runCheck(
  name: string,
  fn: () => Promise<unknown>,
  log: FastifyBaseLogger,
): Promise<CheckResult> {
  const start = performance.now();
  try {
    await withTimeout(fn(), 2000);
    return { status: 'up', latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    log.warn({ err, check: name }, 'health check failed');
    return { status: 'down' };
  }
}

export interface InfrastructureHealth {
  database: CheckResult;
  redis: CheckResult;
}

export async function checkInfrastructure(
  deps: { prisma: PrismaClient; redis: Redis },
  log: FastifyBaseLogger,
): Promise<InfrastructureHealth> {
  const [database, redis] = await Promise.all([
    runCheck('database', () => deps.prisma.$queryRaw`SELECT 1`, log),
    runCheck('redis', () => deps.redis.ping(), log),
  ]);
  return { database, redis };
}
