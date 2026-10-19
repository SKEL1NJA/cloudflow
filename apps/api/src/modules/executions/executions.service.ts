import type { Prisma, PrismaClient } from '@cloudflow/db';
import { enqueueStep, type StepQueue } from '@cloudflow/queue';
import type {
  ExecutionDetail,
  ExecutionListQuery,
  ExecutionSummary,
  JsonValue,
  Paginated,
  RunWorkflowBody,
} from '@cloudflow/shared';
import type { FastifyBaseLogger } from 'fastify';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { lockOwnedWorkflow } from '../workflows/workflows.service.js';

const detailInclude = {
  workflow: { select: { id: true, name: true } },
  steps: { orderBy: { position: 'asc' } },
} satisfies Prisma.WorkflowExecutionInclude;

type ExecutionWithSteps = Prisma.WorkflowExecutionGetPayload<{
  include: typeof detailInclude;
}>;

function durationOf(
  startedAt: Date | null,
  finishedAt: Date | null,
): number | null {
  return startedAt && finishedAt
    ? finishedAt.getTime() - startedAt.getTime()
    : null;
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function toDetail(row: ExecutionWithSteps): ExecutionDetail {
  return {
    id: row.id,
    workflowId: row.workflowId,
    workflowName: row.workflow.name,
    status: row.status,
    error: row.error,
    stepCount: row.steps.length,
    createdAt: row.createdAt.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    durationMs: durationOf(row.startedAt, row.finishedAt),
    input: row.input as JsonValue | null,
    maxAttempts: row.maxAttempts,
    backoffBaseMs: row.backoffBaseMs,
    steps: row.steps.map((step) => ({
      id: step.id,
      position: step.position,
      type: step.type,
      name: step.name,
      status: step.status,
      attempts: step.attempts,
      input: step.input as JsonValue | null,
      output: step.output as JsonValue | null,
      error: step.error,
      workerId: step.workerId,
      nextRetryAt: iso(step.nextRetryAt),
      startedAt: iso(step.startedAt),
      finishedAt: iso(step.finishedAt),
      durationMs: step.durationMs,
    })),
  };
}

export interface RunDeps {
  prisma: PrismaClient;
  queue: StepQueue;
  log: FastifyBaseLogger;
}

export interface RunResult {
  execution: ExecutionDetail;
  created: boolean;
}

function replay(
  existing: ExecutionWithSteps,
  workflowId: string,
): RunResult {
  if (existing.workflowId !== workflowId) {
    throw new ConflictError(
      'This idempotency key was already used for a different workflow',
    );
  }

  return { execution: toDetail(existing), created: false };
}

function findByIdempotencyKey(
  prisma: PrismaClient,
  userId: string,
  idempotencyKey: string,
) {
  return prisma.workflowExecution.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
    include: detailInclude,
  });
}

export async function runWorkflow(
  deps: RunDeps,
  userId: string,
  workflowId: string,
  body: RunWorkflowBody,
  idempotencyKey: string | undefined,
): Promise<RunResult> {
  const { prisma, queue, log } = deps;

  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(
      prisma,
      userId,
      idempotencyKey,
    );

    if (existing) {
      return replay(existing, workflowId);
    }
  }

  let execution: ExecutionWithSteps;

  try {
    execution = await prisma.$transaction(async (tx) => {
      await lockOwnedWorkflow(tx, workflowId, userId);

      const workflow = await tx.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        include: { steps: { orderBy: { position: 'asc' } } },
      });

      if (!workflow.enabled) {
        throw new AppError(
          409,
          'WORKFLOW_DISABLED',
          'This workflow is disabled',
        );
      }

      return tx.workflowExecution.create({
        data: {
          workflowId,
          userId,
          idempotencyKey: idempotencyKey ?? null,
          maxAttempts: workflow.maxAttempts,
          backoffBaseMs: workflow.backoffBaseMs,
          input: body.input as Prisma.InputJsonObject | undefined,
          steps: {
            create: workflow.steps.map((step) => ({
              stepId: step.id,
              position: step.position,
              type: step.type,
              name: step.name,
              config: step.config as Prisma.InputJsonValue,
            })),
          },
          logs: {
            create: {
              level: 'INFO',
              message: 'Execution queued',
            },
          },
        },
        include: detailInclude,
      });
    });
  } catch (err) {
    if (idempotencyKey && isUniqueViolation(err)) {
      const existing = await findByIdempotencyKey(
        prisma,
        userId,
        idempotencyKey,
      );

      if (existing) {
        return replay(existing, workflowId);
      }
    }

    throw err;
  }

  const first = execution.steps[0];

  if (!first) {
    throw new Error('Workflow has no steps');
  }

  try {
    await enqueueStep(queue, {
      executionId: execution.id,
      stepExecutionId: first.id,
    });
  } catch (err) {
    log.error(
      { err, executionId: execution.id },
      'failed to enqueue first step',
    );

    await prisma.workflowExecution
      .delete({ where: { id: execution.id } })
      .catch(() => undefined);

    throw new AppError(
      503,
      'QUEUE_UNAVAILABLE',
      'Could not queue the execution. Please try again.',
    );
  }

  return { execution: toDetail(execution), created: true };
}

export async function getExecution(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<ExecutionDetail> {
  const row = await prisma.workflowExecution.findFirst({
    where: { id, userId },
    include: detailInclude,
  });

  if (!row) {
    throw new NotFoundError('Execution not found');
  }

  return toDetail(row);
}

export async function listExecutions(
  prisma: PrismaClient,
  userId: string,
  query: ExecutionListQuery,
): Promise<Paginated<ExecutionSummary>> {
  const where: Prisma.WorkflowExecutionWhereInput = {
    userId,
    ...(query.status && { status: query.status }),
    ...(query.workflowId && { workflowId: query.workflowId }),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.workflowExecution.count({ where }),
    prisma.workflowExecution.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        workflow: { select: { name: true } },
        _count: { select: { steps: true } },
      },
    }),
  ]);

  return {
    data: rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      workflowName: row.workflow.name,
      status: row.status,
      error: row.error,
      stepCount: row._count.steps,
      createdAt: row.createdAt.toISOString(),
      startedAt: iso(row.startedAt),
      finishedAt: iso(row.finishedAt),
      durationMs: durationOf(row.startedAt, row.finishedAt),
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}