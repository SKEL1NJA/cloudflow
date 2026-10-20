import { createApiKeySchema } from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUserId } from '../../plugins/auth.js';
import { createApiKey, listApiKeys, revokeApiKey } from './api-keys.service.js';

const idParamsSchema = z.object({ id: z.uuid() });

export const apiKeyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireSession);

  app.post('/api-keys', async (request, reply) => {
    const { name } = createApiKeySchema.parse(request.body);
    const created = await createApiKey(app.prisma, requireUserId(request), name);
    return reply.status(201).header('cache-control', 'no-store').send(created);
  });

  app.get('/api-keys', async (request) => {
    return { data: await listApiKeys(app.prisma, requireUserId(request)) };
  });

  app.delete('/api-keys/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await revokeApiKey(app.prisma, requireUserId(request), id);
    return reply.status(204).send();
  });
};