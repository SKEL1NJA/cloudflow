import {
  workflowDefinitionSchema,
  workflowListQuerySchema,
  workflowPatchSchema,
} from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUserId } from '../../plugins/auth.js';
import * as workflows from './workflows.service.js';

const idParamsSchema = z.object({ id: z.uuid() });

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.post('/workflows', async (request, reply) => {
    const input = workflowDefinitionSchema.parse(request.body);
    const created = await workflows.createWorkflow(app.prisma, requireUserId(request), input);
    return reply.status(201).send(created);
  });

  app.get('/workflows', async (request) => {
    const query = workflowListQuerySchema.parse(request.query);
    return workflows.listWorkflows(app.prisma, requireUserId(request), query);
  });

  app.get('/workflows/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return workflows.getWorkflow(app.prisma, requireUserId(request), id);
  });

  app.put('/workflows/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const input = workflowDefinitionSchema.parse(request.body);
    return workflows.replaceWorkflow(app.prisma, requireUserId(request), id, input);
  });

  app.patch('/workflows/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const patch = workflowPatchSchema.parse(request.body);
    return workflows.patchWorkflow(app.prisma, requireUserId(request), id, patch);
  });

  app.delete('/workflows/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    await workflows.deleteWorkflow(app.prisma, requireUserId(request), id);
    return reply.status(204).send();
  });
};