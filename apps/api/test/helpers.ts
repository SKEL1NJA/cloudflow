import type { WorkflowDetail } from '@cloudflow/shared';
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