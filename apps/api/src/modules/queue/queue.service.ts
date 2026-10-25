import type { PrismaClient } from '@cloudflow/db';
import type { DeadLetterQueue, StepQueue } from '@cloudflow/queue';
import type { QueueCounts, StatsRange, StepActivityKey, TimeSeries } from '@cloudflow/shared';
import { fillSeries, rangeWindow, type BucketRow } from '../../lib/time-series.js';

const ACTIVITY_KEYS: readonly StepActivityKey[] = ['succeeded', 'failed'];

export async function getQueueCounts(
  queue: StepQueue,
  deadLetterQueue: DeadLetterQueue,
): Promise<QueueCounts> {
  const [counts, dead] = await Promise.all([
    queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed'),
    deadLetterQueue.getJobCounts('waiting'),
  ]);
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    deadLetter: dead.waiting ?? 0,
  };
}

export async function getStepActivity(
  prisma: PrismaClient,
  userId: string,
  range: StatsRange,
): Promise<TimeSeries<StepActivityKey>> {
  const now = new Date();
  const { since, bucketSeconds } = rangeWindow(range, now);

  const rows = await prisma.$queryRaw<{ bucket: Date; status: string; count: bigint }[]>`
    SELECT date_bin(make_interval(secs => ${bucketSeconds}::double precision), s.finished_at, 'epoch'::timestamptz) AS bucket,
           s.status::text AS status,
           count(*) AS count
    FROM step_executions s
    JOIN workflow_executions e ON e.id = s.execution_id
    WHERE e.user_id = ${userId}::uuid
      AND s.finished_at >= ${since}::timestamptz
      AND s.status IN ('SUCCESS', 'FAILED')
    GROUP BY 1, 2`;

  const buckets = rows.map((row): BucketRow<StepActivityKey> => ({
    bucket: row.bucket,
    key: row.status === 'SUCCESS' ? 'succeeded' : 'failed',
    count: Number(row.count),
  }));
  return fillSeries(range, ACTIVITY_KEYS, buckets, now);
}
