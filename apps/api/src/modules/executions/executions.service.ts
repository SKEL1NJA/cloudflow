import { Prisma, type PrismaClient } from '@cloudflow/db';
import { enqueueRecovery, enqueueStep, type StepQueue } from '@cloudflow/queue';
import type {
  ExecutionDetail,
  ExecutionListQuery,
  ExecutionStatus,
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

function durationOf(startedAt: Date | null, finishedAt: Date | null): number | null {
  return startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : null;
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
    attempts: row.steps.reduce((sum, step) => sum + step.attempts, 0),
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

function replay(existing: ExecutionWithSteps, workflowId: string): RunResult {
  if (existing.workflowId !== workflowId) {
    throw new ConflictError('This idempotency key was already used for a different workflow');
  }

  return { execution: toDetail(existing), created: false };
}

function findByIdempotencyKey(prisma: PrismaClient, userId: string, idempotencyKey: string) {
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
    const existing = await findByIdempotencyKey(prisma, userId, idempotencyKey);

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
        throw new AppError(409, 'WORKFLOW_DISABLED', 'This workflow is disabled');
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
      const existing = await findByIdempotencyKey(prisma, userId, idempotencyKey);

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
    log.error({ err, executionId: execution.id }, 'failed to enqueue first step');

    await prisma.workflowExecution.delete({ where: { id: execution.id } }).catch(() => undefined);

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

interface ListRow {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  error: string | null;
  stepCount: bigint;
  attempts: bigint;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

function buildFilter(userId: string, query: ExecutionListQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`e.user_id = ${userId}::uuid`];

  if (query.status) conditions.push(Prisma.sql`e.status::text = ${query.status}`);
  if (query.workflowId) conditions.push(Prisma.sql`e.workflow_id = ${query.workflowId}::uuid`);
  if (query.from) conditions.push(Prisma.sql`e.created_at >= ${query.from}::timestamptz`);
  if (query.to) conditions.push(Prisma.sql`e.created_at <= ${query.to}::timestamptz`);

  if (query.minDurationMs !== undefined || query.maxDurationMs !== undefined) {
    conditions.push(Prisma.sql`e.started_at IS NOT NULL AND e.finished_at IS NOT NULL`);

    const elapsed = Prisma.sql`EXTRACT(EPOCH FROM (e.finished_at - e.started_at)) * 1000`;

    if (query.minDurationMs !== undefined) {
      conditions.push(Prisma.sql`${elapsed} >= ${query.minDurationMs}::double precision`);
    }

    if (query.maxDurationMs !== undefined) {
      conditions.push(Prisma.sql`${elapsed} <= ${query.maxDurationMs}::double precision`);
    }
  }

  return Prisma.join(conditions, ' AND ');
}

export async function listExecutions(
  prisma: PrismaClient,
  userId: string,
  query: ExecutionListQuery,
): Promise<Paginated<ExecutionSummary>> {
  const where = buildFilter(userId, query);
  const offset = (query.page - 1) * query.pageSize;

  const [counted, rows] = await prisma.$transaction([
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
      FROM workflow_executions e
      WHERE ${where}`,
    prisma.$queryRaw<ListRow[]>`
      SELECT e.id,
             e.workflow_id AS "workflowId",
             w.name AS "workflowName",
             e.status::text AS status,
             e.error,
             s.step_count AS "stepCount",
             s.attempts,
             e.created_at AS "createdAt",
             e.started_at AS "startedAt",
             e.finished_at AS "finishedAt"
      FROM workflow_executions e
      JOIN workflows w ON w.id = e.workflow_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS step_count,
               COALESCE(sum(attempts), 0) AS attempts
        FROM step_executions
        WHERE execution_id = e.id
      ) s ON true
      WHERE ${where}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT ${query.pageSize}::int OFFSET ${offset}::int`,
  ]);

  const total = Number(counted[0]?.total ?? 0);

  return {
    data: rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      workflowName: row.workflowName,
      status: row.status as ExecutionStatus,
      error: row.error,
      stepCount: Number(row.stepCount),
      attempts: Number(row.attempts),
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

async function assertOwned(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
): Promise<void> {
  const found = await tx.workflowExecution.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!found) {
    throw new NotFoundError('Execution not found');
  }
}

export async function cancelExecution(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<ExecutionDetail> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.workflowExecution.updateMany({
      where: {
        id,
        userId,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      data: {
        status: 'CANCELLED',
        finishedAt: new Date(),
        error: 'Cancelled by user',
      },
    });

    if (count === 0) {
      await assertOwned(tx, id, userId);

      throw new AppError(409, 'EXECUTION_FINISHED', 'This execution has already finished');
    }

    await tx.stepExecution.updateMany({
      where: {
        executionId: id,
        status: { in: ['PENDING', 'RETRYING'] },
      },
      data: {
        status: 'SKIPPED',
        nextRetryAt: null,
      },
    });

    await tx.executionLog.create({
      data: {
        executionId: id,
        level: 'WARN',
        message: 'Execution cancelled by user',
      },
    });
  });

  return getExecution(prisma, userId, id);
}

export async function retryExecution(
  deps: RunDeps,
  userId: string,
  id: string,
): Promise<ExecutionDetail> {
  const { prisma, queue, log } = deps;

  const target = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status
      FROM workflow_executions
      WHERE id = ${id}::uuid
        AND user_id = ${userId}::uuid
      FOR UPDATE
    `;

    const current = locked[0];

    if (!current) {
      throw new NotFoundError('Execution not found');
    }

    if (current.status !== 'FAILED') {
      throw new AppError(409, 'EXECUTION_NOT_FAILED', 'Only failed executions can be retried');
    }

    const steps = await tx.stepExecution.findMany({
      where: { executionId: id },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        position: true,
        status: true,
      },
    });

    const first = steps.find((step) => step.status !== 'SUCCESS');

    if (!first) {
      throw new AppError(409, 'NOTHING_TO_RETRY', 'Every step already succeeded');
    }

    await tx.stepExecution.updateMany({
      where: {
        executionId: id,
        position: { gte: first.position },
      },
      data: {
        status: 'PENDING',
        attempts: 0,
        input: Prisma.DbNull,
        output: Prisma.DbNull,
        error: null,
        workerId: null,
        nextRetryAt: null,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
      },
    });

    await tx.workflowExecution.update({
      where: { id },
      data: {
        status: 'QUEUED',
        error: null,
        finishedAt: null,
      },
    });

    await tx.executionLog.create({
      data: {
        executionId: id,
        stepExecutionId: first.id,
        level: 'INFO',
        message: `Execution retried from step "${first.name}"`,
      },
    });

    return first;
  });

  try {
    await enqueueRecovery(
      queue,
      {
        executionId: id,
        stepExecutionId: target.id,
      },
      Date.now(),
    );
  } catch (err) {
    log.error(
      { err, executionId: id },
      'failed to enqueue retried step, the reconciler will recover it',
    );
  }

  return getExecution(prisma, userId, id);
}
