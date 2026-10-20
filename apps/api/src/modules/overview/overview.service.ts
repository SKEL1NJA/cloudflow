import type { PrismaClient } from '@cloudflow/db';
import { listWorkers } from '@cloudflow/queue';
import type {
  ExecutionSeriesKey,
  OverviewResponse,
  StatsRange,
  TimeSeries,
  WorkerCounts,
} from '@cloudflow/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import { checkInfrastructure } from '../../lib/health-checks.js';
import { fillSeries, rangeWindow, type BucketRow } from '../../lib/time-series.js';

export interface OverviewDeps {
  prisma: PrismaClient;
  redis: Redis;
  log: FastifyBaseLogger;
}

const SERIES_KEYS: readonly ExecutionSeriesKey[] = ['success', 'failed', 'cancelled', 'active'];

function keyForStatus(status: string): ExecutionSeriesKey | null {
  switch (status) {
    case 'SUCCESS':
      return 'success';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    case 'QUEUED':
    case 'RUNNING':
      return 'active';
    default:
      return null;
  }
}

async function countWorkers(redis: Redis, log: FastifyBaseLogger): Promise<WorkerCounts> {
  const counts: WorkerCounts = { online: 0, busy: 0, offline: 0 };
  try {
    for (const worker of await listWorkers(redis)) counts[worker.status] += 1;
  } catch (err) {
    log.warn({ err }, 'could not read workers');
  }
  return counts;
}

function countOf(rows: { status: string; _count: { _all: number } }[], status: string): number {
  return rows.find((row) => row.status === status)?._count._all ?? 0;
}

export async function getOverview(
  deps: OverviewDeps,
  userId: string,
  range: StatsRange,
): Promise<OverviewResponse> {
  const { prisma, redis, log } = deps;
  const { since } = rangeWindow(range, new Date());

  const [total, enabled, active, finished, infrastructure, workers] = await Promise.all([
    prisma.workflow.count({ where: { userId } }),
    prisma.workflow.count({ where: { userId, enabled: true } }),
    prisma.workflowExecution.groupBy({
      by: ['status'],
      where: { userId, status: { in: ['QUEUED', 'RUNNING'] } },
      _count: { _all: true },
    }),
    prisma.workflowExecution.groupBy({
      by: ['status'],
      where: { userId, createdAt: { gte: since }, status: { in: ['SUCCESS', 'FAILED', 'CANCELLED'] } },
      _count: { _all: true },
    }),
    checkInfrastructure(deps, log),
    countWorkers(redis, log),
  ]);

  return {
    range,
    workflows: { total, enabled },
    executions: {
      queued: countOf(active, 'QUEUED'),
      running: countOf(active, 'RUNNING'),
      success: countOf(finished, 'SUCCESS'),
      failed: countOf(finished, 'FAILED'),
      cancelled: countOf(finished, 'CANCELLED'),
    },
    health: { ...infrastructure, workers },
  };
}

export async function getExecutionSeries(
  prisma: PrismaClient,
  userId: string,
  range: StatsRange,
): Promise<TimeSeries<ExecutionSeriesKey>> {
  const now = new Date();
  const { since, bucketSeconds } = rangeWindow(range, now);

  const rows = await prisma.$queryRaw<{ bucket: Date; status: string; count: bigint }[]>`
    SELECT date_bin(make_interval(secs => ${bucketSeconds}::double precision), created_at, 'epoch'::timestamptz) AS bucket,
           status::text AS status,
           count(*) AS count
    FROM workflow_executions
    WHERE user_id = ${userId}::uuid AND created_at >= ${since}::timestamptz
    GROUP BY 1, 2`;

  const buckets = rows.flatMap((row): BucketRow<ExecutionSeriesKey>[] => {
    const key = keyForStatus(row.status);
    return key ? [{ bucket: row.bucket, key, count: Number(row.count) }] : [];
  });
  return fillSeries(range, SERIES_KEYS, buckets, now);
}