import type { Prisma } from '@cloudflow/db';
import type { ExecutionStatus, StepExecutionStatus, WorkflowDetail } from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';

export async function registerUser(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'correct-horse-battery' },
  });
  return res.json<{ accessToken: string }>().accessToken;
}

export async function registerUserWithId(
  app: FastifyInstance,
  email: string,
): Promise<{ token: string; userId: string }> {
  const token = await registerUser(app, email);
  const user = await app.prisma.user.findUniqueOrThrow({ where: { email } });
  return { token, userId: user.id };
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export function sampleWorkflow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Video Processing',
    description: 'Fetch, transform and notify',
    steps: [
      { type: 'HTTP_REQUEST', name: 'Fetch data', config: { url: 'https://example.com/api/data' } },
      {
        type: 'TRANSFORM',
        name: 'Pick fields',
        config: { mappings: [{ target: 'id', source: 'data.id' }] },
      },
      { type: 'NOTIFICATION', name: 'Notify', config: { message: 'Done' } },
    ],
    ...overrides,
  };
}

export async function createWorkflow(
  app: FastifyInstance,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<WorkflowDetail> {
  const res = await app.inject({
    method: 'POST',
    url: '/workflows',
    headers: authHeader(token),
    payload: sampleWorkflow(overrides),
  });
  expect(res.statusCode).toBe(201);
  return res.json<WorkflowDetail>();
}

export interface SeedExecutionOptions {
  status?: ExecutionStatus;
  stepStatuses?: StepExecutionStatus[];
  createdAt?: Date;
  stepFinishedAt?: Date;
}

export function seedExecution(
  app: FastifyInstance,
  workflow: WorkflowDetail,
  userId: string,
  options: SeedExecutionOptions = {},
) {
  const {
    status = 'QUEUED',
    stepStatuses = [],
    createdAt = new Date(),
    stepFinishedAt = createdAt,
  } = options;
  return app.prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      userId,
      status,
      createdAt,
      steps: {
        create: workflow.steps.map((step, position) => {
          const stepStatus = stepStatuses[position] ?? 'PENDING';
          const finished = stepStatus === 'SUCCESS' || stepStatus === 'FAILED';
          return {
            stepId: step.id,
            position,
            type: step.type,
            name: step.name,
            config: step.config as Prisma.InputJsonValue,
            status: stepStatus,
            finishedAt: finished ? stepFinishedAt : null,
          };
        }),
      },
    },
    include: { steps: { orderBy: { position: 'asc' } } },
  });
}

export async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
