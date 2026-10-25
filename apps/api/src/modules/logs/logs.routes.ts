import { logListQuerySchema } from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';
import { requireUserId } from '../../plugins/auth.js';
import { listLogs } from './logs.service.js';

export const logRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/logs', async (request) => {
    const query = logListQuerySchema.parse(request.query);
    return listLogs(app.prisma, requireUserId(request), query);
  });
};
