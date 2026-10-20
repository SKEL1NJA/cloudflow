import { executionListQuerySchema, runWorkflowBodySchema } from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUserId } from '../../plugins/auth.js';
import * as executions from './executions.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
const idempotencyKeySchema = z.string().trim().min(1).max(200).optional();

export const executionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.post('/workflows/:id/run', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const body = runWorkflowBodySchema.parse(request.body);
    const idempotencyKey = idempotencyKeySchema.parse(
      request.headers['idempotency-key'],
    );

    const { execution, created } = await executions.runWorkflow(
      { prisma: app.prisma, queue: app.queue, log: request.log },
      requireUserId(request),
      id,
      body,
      idempotencyKey,
    );

    return reply.status(created ? 202 : 200).send(execution);
  });

  app.get('/executions', async (request) => {
    const query = executionListQuerySchema.parse(request.query);

    return executions.listExecutions(
      app.prisma,
      requireUserId(request),
      query,
    );
  });

  app.get('/executions/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);

    return executions.getExecution(
      app.prisma,
      requireUserId(request),
      id,
    );
  });

  app.post('/executions/:id/cancel', async (request) => {
    const { id } = idParamsSchema.parse(request.params);

    return executions.cancelExecution(
      app.prisma,
      requireUserId(request),
      id,
    );
  });

  app.post('/executions/:id/retry', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);

    const execution = await executions.retryExecution(
      {
        prisma: app.prisma,
        queue: app.queue,
        log: request.log,
      },
      requireUserId(request),
      id,
    );

    return reply.status(202).send(execution);
  });
};