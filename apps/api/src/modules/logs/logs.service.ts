import type { Prisma, PrismaClient } from '@cloudflow/db';
import type { JsonValue, LogEntry, LogListQuery, LogListResponse } from '@cloudflow/shared';

const logInclude = {
  execution: { select: { workflowId: true, workflow: { select: { name: true } } } },
  stepExecution: { select: { name: true } },
} satisfies Prisma.ExecutionLogInclude;

type LogRow = Prisma.ExecutionLogGetPayload<{ include: typeof logInclude }>;

function toEntry(row: LogRow): LogEntry {
  return {
    id: row.id.toString(),
    level: row.level,
    message: row.message,
    meta: row.meta as JsonValue | null,
    createdAt: row.createdAt.toISOString(),
    executionId: row.executionId,
    workflowId: row.execution.workflowId,
    workflowName: row.execution.workflow.name,
    stepExecutionId: row.stepExecutionId,
    stepName: row.stepExecution?.name ?? null,
  };
}

export async function listLogs(
  prisma: PrismaClient,
  userId: string,
  query: LogListQuery,
): Promise<LogListResponse> {
  const where: Prisma.ExecutionLogWhereInput = {
    execution: { userId, ...(query.workflowId && { workflowId: query.workflowId }) },
    ...(query.executionId && { executionId: query.executionId }),
    ...(query.level && { level: query.level }),
    ...(query.search && { message: { contains: query.search, mode: 'insensitive' } }),
    ...((query.from || query.to) && {
      createdAt: { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) },
    }),
    ...(query.cursor && { id: { lt: BigInt(query.cursor) } }),
  };

  const rows = await prisma.executionLog.findMany({
    where,
    orderBy: { id: 'desc' },
    take: query.limit + 1,
    include: logInclude,
  });

  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    data: page.map(toEntry),
    nextCursor: rows.length > query.limit && last ? last.id.toString() : null,
  };
}
