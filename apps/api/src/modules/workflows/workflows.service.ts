import type { Prisma, PrismaClient } from '@cloudflow/db';
import {
  assertNever,
  workflowStepSchema,
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

function baseFields(row: WorkflowRowFields) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    maxAttempts: row.maxAttempts,
    backoffBaseMs: row.backoffBaseMs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: WorkflowWithSteps): WorkflowDetail {
  return {
    ...baseFields(row),
    stepCount: row.steps.length,
    steps: row.steps.map((step) => ({
      id: step.id,
      position: step.position,
      ...workflowStepSchema.parse({ type: step.type, name: step.name, config: step.config }),
    })),
  };
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
    return toDetail(row);
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

  return {
    data: rows.map((row) => ({ ...baseFields(row), stepCount: row._count.steps })),
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
  return toDetail(row);
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
    return toDetail(row);
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
    return toDetail(row);
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