import { executionListQuerySchema, runWorkflowBodySchema, type ExecutionDetail } from '@cloudflow/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RULES } from '../../lib/rate-limit-rules.js';
import { requireUserId } from '../../plugins/auth.js';
import * as executions from './executions.service.js';

const idParamsSchema = z.object({ id: z.uuid() });
const idempotencyKeySchema = z.string().trim().min(1).max(200).optional();

function announce(app: FastifyInstance, userId: string, execution: ExecutionDetail): Promise<void> {
  return app.events.publish({
    type: 'execution.updated',
    userId,
    workflowId: execution.workflowId,
    executionId: execution.id,
    status: execution.status,
    at: new Date().toISOString(),
  });
}

export const executionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.post(
    '/workflows/:id/run',
    { preHandler: app.limiter.byUser(RULES.runWorkflow) },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      const body = runWorkflowBodySchema.parse(request.body);
      const idempotencyKey = idempotencyKeySchema.parse(request.headers['idempotency-key']);
      const userId = requireUserId(request);

      const { execution, created } = await executions.runWorkflow(
        { prisma: app.prisma, queue: app.queue, log: request.log },
        userId,
        id,
        body,
        idempotencyKey,
      );
      if (created) await announce(app, userId, execution);
      return reply.status(created ? 202 : 200).send(execution);
    },
  );

  app.get('/executions', async (request) => {
    const query = executionListQuerySchema.parse(request.query);
    return executions.listExecutions(app.prisma, requireUserId(request), query);
  });

  app.get('/executions/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return executions.getExecution(app.prisma, requireUserId(request), id);
  });

  app.post('/executions/:id/cancel', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = requireUserId(request);
    const execution = await executions.cancelExecution(app.prisma, userId, id);
    await announce(app, userId, execution);
    return execution;
  });

  app.post('/executions/:id/retry', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const userId = requireUserId(request);
    const execution = await executions.retryExecution(
      { prisma: app.prisma, queue: app.queue, log: request.log },
      userId,
      id,
    );
    await announce(app, userId, execution);
    return reply.status(202).send(execution);
  });
};