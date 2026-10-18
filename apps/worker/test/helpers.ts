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

export async function seedExecution(
  prisma: PrismaClient,
  steps: SeedStep[],
  input?: Prisma.InputJsonObject,
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
      steps: { create: stepData },
    },
    include: { steps: { orderBy: { position: 'asc' } } },
  });
  return { executionId: execution.id, stepIds: execution.steps.map((step) => step.id) };
}

export async function waitForFinish(prisma: PrismaClient, executionId: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const execution = await prisma.workflowExecution.findUniqueOrThrow({ where: { id: executionId } });
    if (execution.status !== 'QUEUED' && execution.status !== 'RUNNING') return execution;
    if (Date.now() > deadline) throw new Error(`Execution still ${execution.status} after ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}