import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';

type CheckResult = { status: 'up'; latencyMs: number } | { status: 'down' };

interface ReadyResponse {
  status: 'ready' | 'not_ready';
  checks: { database: CheckResult; redis: CheckResult };
}

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
    log.warn({ err, check: name }, 'readiness check failed');
    return { status: 'down' };
  }
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  });

  app.get('/health/ready', async (request, reply) => {
    const [database, redis] = await Promise.all([
      runCheck('database', () => app.prisma.$queryRaw`SELECT 1`, request.log),
      runCheck('redis', () => app.redis.ping(), request.log),
    ]);

    const ready = database.status === 'up' && redis.status === 'up';
    const body: ReadyResponse = { status: ready ? 'ready' : 'not_ready', checks: { database, redis } };
    return reply.status(ready ? 200 : 503).send(body);
  });
};