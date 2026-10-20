import { statsRangeQuerySchema } from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';
import { requireUserId } from '../../plugins/auth.js';
import { getExecutionSeries, getOverview } from './overview.service.js';

export const overviewRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/overview', async (request) => {
    const { range } = statsRangeQuerySchema.parse(request.query);
    return getOverview(
      { prisma: app.prisma, redis: app.redis, log: request.log },
      requireUserId(request),
      range,
    );
  });

  app.get('/stats/executions', async (request) => {
    const { range } = statsRangeQuerySchema.parse(request.query);
    return getExecutionSeries(app.prisma, requireUserId(request), range);
  });
};