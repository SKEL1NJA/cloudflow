import { statsRangeQuerySchema, type QueueResponse } from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';
import { requireUserId } from '../../plugins/auth.js';
import { getQueueCounts, getStepActivity } from './queue.service.js';

export const queueRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/queue', async (): Promise<QueueResponse> => {
    return { counts: await getQueueCounts(app.queue, app.deadLetterQueue) };
  });

  app.get('/queue/activity', async (request) => {
    const { range } = statsRangeQuerySchema.parse(request.query);
    return getStepActivity(app.prisma, requireUserId(request), range);
  });
};