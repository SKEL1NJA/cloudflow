import { Prisma, type PrismaClient } from '@cloudflow/db';
import {
  assertNever,
  workflowStepSchema,
  type ExecutionStatus,
  type Paginated,
  type WorkflowDefinition,
  type WorkflowDetail,
  type WorkflowListQuery,
  type WorkflowPatch,
  type WorkflowSummary,
} from '@cloudflow/shared';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';

const detailInclude = { steps: { orderBy: { position: 'asc' } } } satisfies Prisma.WorkflowInclude;
type WorkflowWithSteps = Prisma.WorkflowGetPayload<{ include: typeof detailInclude }>;
type Queryable = Pick<PrismaClient, '$queryRaw'>;

interface WorkflowRowFields {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  maxAttempts: number;
  backoffBaseMs: number;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkflowStats {
  lastRun: { status: ExecutionStatus; at: string } | null;
  successRate: number | null;
  finishedRuns: number;
}

const NO_STATS: WorkflowStats = { lastRun: null, successRate: null, finishedRuns: 0 };
const STATS_WINDOW_MS = 30 * 86_400_000;

async function loadStats(db: Queryable, ids: string[]): Promise<Map<string, WorkflowStats>> {
  const stats = new Map<string, WorkflowStats>();
  if (ids.length === 0) return stats;

  const since = new Date(Date.now() - STATS_WINDOW_MS);
  const idList = Prisma.sql`ARRAY[${Prisma.join(ids)}]::uuid[]`;

  const [latest, counts] = await Promise.all([
    db.$queryRaw<{ workflowId: string; status: string; createdAt: Date }[]>`
      SELECT w.id AS "workflowId", e.status::text AS status, e.created_at AS "createdAt"
      FROM unnest(${idList}) AS w(id)
      JOIN LATERAL (
        SELECT status, created_at
        FROM workflow_executions
        WHERE workflow_id = w.id
        ORDER BY created_at DESC
        LIMIT 1
      ) e ON true`,
    db.$queryRaw<{ workflowId: string; success: bigint; finished: bigint }[]>`
      SELECT workflow_id AS "workflowId",
             count(*) FILTER (WHERE status = 'SUCCESS') AS success,
             count(*) FILTER (WHERE status IN ('SUCCESS', 'FAILED')) AS finished
      FROM workflow_executions
      WHERE workflow_id = ANY(${idList}) AND created_at >= ${since}::timestamptz
      GROUP BY workflow_id`,
  ]);

  const counted = new Map(counts.map((row) => [row.workflowId, row]));
  for (const row of latest) {
    const count = counted.get(row.workflowId);
    const finished = Number(count?.finished ?? 0);
    stats.set(row.workflowId, {
      lastRun: { status: row.status as ExecutionStatus, at: row.createdAt.toISOString() },
      successRate: finished > 0 ? Number(count?.success ?? 0) / finished : null,
      finishedRuns: finished,
    });
  }
  return stats;
}

function baseFields(row: WorkflowRowFields, stats: WorkflowStats) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    maxAttempts: row.maxAttempts,
    backoffBaseMs: row.backoffBaseMs,
    lastRun: stats.lastRun,
    successRate: stats.successRate,
    finishedRuns: stats.finishedRuns,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: WorkflowWithSteps, stats: WorkflowStats): WorkflowDetail {
  return {
    ...baseFields(row, stats),
    stepCount: row.steps.length,
    steps: row.steps.map((step) => ({
      id: step.id,
      position: step.position,
      ...workflowStepSchema.parse({ type: step.type, name: step.name, config: step.config }),
    })),
  };
}

async function detailWithStats(db: Queryable, row: WorkflowWithSteps): Promise<WorkflowDetail> {
  const stats = (await loadStats(db, [row.id])).get(row.id) ?? NO_STATS;
  return toDetail(row, stats);
}

function toStepData(steps: WorkflowDefinition['steps']) {
  return steps.map((step, position) => ({
    position,
    type: step.type,
    name: step.name,
    config: step.config as Prisma.InputJsonValue,
  }));
}

function translateWriteError(err: unknown): unknown {
  return isUniqueViolation(err)
    ? new ConflictError('You already have a workflow with this name')
    : err;
}

export async function lockOwnedWorkflow(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM workflows
    WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
    FOR UPDATE`;
  if (rows.length === 0) {
    throw new NotFoundError('Workflow not found');
  }
}

function buildOrderBy(
  sortBy: WorkflowListQuery['sortBy'],
  sortOrder: WorkflowListQuery['sortOrder'],
): Prisma.WorkflowOrderByWithRelationInput {
  switch (sortBy) {
    case 'name':
      return { name: sortOrder };
    case 'createdAt':
      return { createdAt: sortOrder };
    case 'updatedAt':
      return { updatedAt: sortOrder };
    default:
      return assertNever(sortBy);
  }
}

export async function createWorkflow(
  prisma: PrismaClient,
  userId: string,
  input: WorkflowDefinition,
): Promise<WorkflowDetail> {
  try {
    const row = await prisma.workflow.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        enabled: input.enabled,
        maxAttempts: input.maxAttempts,
        backoffBaseMs: input.backoffBaseMs,
        steps: { create: toStepData(input.steps) },
      },
      include: detailInclude,
    });
    return await detailWithStats(prisma, row);
  } catch (err) {
    throw translateWriteError(err);
  }
}

export async function listWorkflows(
  prisma: PrismaClient,
  userId: string,
  query: WorkflowListQuery,
): Promise<Paginated<WorkflowSummary>> {
  const where: Prisma.WorkflowWhereInput = {
    userId,
    ...(query.enabled !== undefined && { enabled: query.enabled }),
    ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.workflow.count({ where }),
    prisma.workflow.findMany({
      where,
      orderBy: [buildOrderBy(query.sortBy, query.sortOrder), { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { _count: { select: { steps: true } } },
    }),
  ]);

  const stats = await loadStats(
    prisma,
    rows.map((row) => row.id),
  );

  return {
    data: rows.map((row) => ({
      ...baseFields(row, stats.get(row.id) ?? NO_STATS),
      stepCount: row._count.steps,
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getWorkflow(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<WorkflowDetail> {
  const row = await prisma.workflow.findFirst({
    where: { id, userId },
    include: detailInclude,
  });
  if (!row) {
    throw new NotFoundError('Workflow not found');
  }
  return detailWithStats(prisma, row);
}

export async function replaceWorkflow(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: WorkflowDefinition,
): Promise<WorkflowDetail> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      await lockOwnedWorkflow(tx, id, userId);
      await tx.workflow.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          enabled: input.enabled,
          maxAttempts: input.maxAttempts,
          backoffBaseMs: input.backoffBaseMs,
        },
      });
      await tx.workflowStep.deleteMany({ where: { workflowId: id } });
      await tx.workflowStep.createMany({
        data: toStepData(input.steps).map((step) => ({ ...step, workflowId: id })),
      });
      return tx.workflow.findUniqueOrThrow({ where: { id }, include: detailInclude });
    });
    return await detailWithStats(prisma, row);
  } catch (err) {
    throw translateWriteError(err);
  }
}

export async function patchWorkflow(
  prisma: PrismaClient,
  userId: string,
  id: string,
  patch: WorkflowPatch,
): Promise<WorkflowDetail> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      await lockOwnedWorkflow(tx, id, userId);
      return tx.workflow.update({
        where: { id },
        data: {
          name: patch.name,
          description: patch.description,
          enabled: patch.enabled,
          maxAttempts: patch.maxAttempts,
          backoffBaseMs: patch.backoffBaseMs,
        },
        include: detailInclude,
      });
    });
    return await detailWithStats(prisma, row);
  } catch (err) {
    throw translateWriteError(err);
  }
}

export async function deleteWorkflow(
  prisma: PrismaClient,
  userId: string,
  id: string,
): Promise<void> {
  const { count } = await prisma.workflow.deleteMany({ where: { id, userId } });
  if (count === 0) {
    throw new NotFoundError('Workflow not found');
  }
}