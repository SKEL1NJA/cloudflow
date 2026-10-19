import type { PrismaClient } from '@cloudflow/db';

export interface FailedStep {
  stepId: string;
  executionId: string;
  position: number;
  error: string;
  summary: string;
  durationMs: number | null;
}

export async function markStepFailed(prisma: PrismaClient, failed: FailedStep): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.stepExecution.update({
      where: { id: failed.stepId },
      data: {
        status: 'FAILED',
        error: failed.error,
        finishedAt: new Date(),
        durationMs: failed.durationMs,
      },
    });
    await tx.stepExecution.updateMany({
      where: {
        executionId: failed.executionId,
        position: { gt: failed.position },
        status: 'PENDING',
      },
      data: { status: 'SKIPPED' },
    });
    await tx.workflowExecution.updateMany({
      where: { id: failed.executionId, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'FAILED', error: failed.summary, finishedAt: new Date() },
    });
  });
}