import type { CheckResult } from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';
import { checkInfrastructure } from '../../lib/health-checks.js';

interface ReadyResponse {
  status: 'ready' | 'not_ready';
  checks: { database: CheckResult; redis: CheckResult };
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  });

  app.get('/health/ready', async (request, reply) => {
    const checks = await checkInfrastructure(app, request.log);
    const ready = checks.database.status === 'up' && checks.redis.status === 'up';
    const body: ReadyResponse = { status: ready ? 'ready' : 'not_ready', checks };
    return reply.status(ready ? 200 : 503).send(body);
  });
};