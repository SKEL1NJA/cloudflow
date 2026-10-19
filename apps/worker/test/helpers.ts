import type { Prisma, PrismaClient, StepType } from '@cloudflow/db';
import { randomUUID } from 'node:crypto';

export interface SeedStep {
  type: StepType;
  name: string;
  config: Prisma.InputJsonObject;
}

export interface SeededExecution {
  executionId: string;
  stepIds: string[];
}

export interface SeedPolicy {
  maxAttempts?: number;
  backoffBaseMs?: number;
}

export async function seedExecution(
  prisma: PrismaClient,
  steps: SeedStep[],
  input?: Prisma.InputJsonObject,
  policy: SeedPolicy = {},
): Promise<SeededExecution> {
  const user = await prisma.user.create({
    data: { email: `${randomUUID()}@example.com`, passwordHash: 'not-a-real-hash' },
  });
  const stepData = steps.map((step, position) => ({ position, ...step }));
  const workflow = await prisma.workflow.create({
    data: { userId: user.id, name: 'Test workflow', steps: { create: stepData } },
  });
  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId: workflow.id,
      userId: user.id,
      input,
      ...policy,
      steps: { create: stepData },
    },
    include: { steps: { orderBy: { position: 'asc' } } },
  });
  return { executionId: execution.id, stepIds: execution.steps.map((step) => step.id) };
}

export async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export async function waitForFinish(prisma: PrismaClient, executionId: string, timeoutMs = 15_000) {
  return waitFor(async () => {
    const execution = await prisma.workflowExecution.findUniqueOrThrow({ where: { id: executionId } });
    return execution.status === 'QUEUED' || execution.status === 'RUNNING' ? null : execution;
  }, timeoutMs);
}