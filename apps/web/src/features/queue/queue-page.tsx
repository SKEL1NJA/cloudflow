import type { QueueCounts } from '@cloudflow/shared';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorState } from '@/components/layout/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { MetricCard } from '@/components/ui/metric-card';
import { Skeleton } from '@/components/ui/skeleton';
import { RangeSwitch } from '@/features/overview/range-switch';
import { useRange } from '@/features/overview/range';
import { summarizeCapacity } from '@/features/workers/capacity';
import { useWorkers } from '@/features/workers/queries';
import { ActivityCard } from './activity-card';
import { useQueueCounts } from './queries';

function Arrow() {
  return (
    <div className="hidden items-center text-muted-foreground lg:flex" aria-hidden="true">
      <ArrowRight className="size-5" />
    </div>
  );
}

function QueueStages({ counts }: { counts: QueueCounts | undefined }) {
  const hint = (text: string) => (counts ? text : undefined);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <MetricCard
          label="Waiting jobs"
          tone="neutral"
          value={counts?.waiting}
          hint={hint('Ready, waiting for a worker')}
        />
        <Arrow />
        <MetricCard
          label="Active jobs"
          tone="running"
          value={counts?.active}
          hint={hint('Being processed right now')}
        />
        <Arrow />
        <MetricCard
          label="Completed jobs"
          tone="success"
          value={counts?.completed}
          hint={hint('Finished in the last hour')}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Delayed jobs"
          tone="warning"
          value={counts?.delayed}
          hint={hint('Retries waiting out their backoff')}
        />
        <MetricCard
          label="Failed jobs"
          tone="danger"
          value={counts?.failed}
          hint={hint('Jobs that crashed a worker')}
        />
        <MetricCard
          label="Dead-letter queue"
          tone="danger"
          value={counts?.deadLetter}
          hint={hint('Steps that failed for good')}
        />
      </div>
    </div>
  );
}

function WorkerCapacityCard() {
  const { data, error, isError, refetch } = useWorkers();
  const capacity = data ? summarizeCapacity(data.workers) : undefined;
  const percent =
    capacity && capacity.slots > 0 ? Math.round((capacity.slotsInUse / capacity.slots) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-sm font-medium">Workers</h2>
        <div className="mt-4">
          {isError && !data ? (
            <ErrorState what="the workers" error={error} onRetry={() => void refetch()} />
          ) : !capacity ? (
            <Skeleton className="h-20 w-full" />
          ) : capacity.online === 0 ? (
            <p className="text-sm text-muted-foreground">No workers are online.</p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums">
                {capacity.online}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {capacity.online === 1 ? 'worker' : 'workers'} online
                </span>
              </p>
              <div
                role="progressbar"
                aria-label="Job slots in use"
                aria-valuemin={0}
                aria-valuemax={capacity.slots}
                aria-valuenow={capacity.slotsInUse}
                className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full bg-running transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {capacity.slotsInUse} of {capacity.slots} job slots in use
              </p>
            </>
          )}
        </div>
        <Link
          to="/workers"
          className="mt-4 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          View workers
        </Link>
      </CardContent>
    </Card>
  );
}

export function QueuePage() {
  const [range, setRange] = useRange();
  const queue = useQueueCounts();
  const workers = useWorkers();
  const counts = queue.data;
  const capacity = workers.data ? summarizeCapacity(workers.data.workers) : undefined;
  const starved =
    capacity !== undefined &&
    capacity.online === 0 &&
    counts !== undefined &&
    counts.waiting + counts.delayed > 0;

  return (
    <>
      <PageHeader
        title="Queue"
        description="Work waiting to be processed, and who is processing it."
        actions={<RangeSwitch value={range} onChange={setRange} />}
      />
      <div className="space-y-6">
        {starved ? (
          <div
            role="status"
            className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          >
            Jobs are waiting, but no workers are online. They will be processed as soon as a worker
            starts.
          </div>
        ) : null}

        {queue.isError && !counts ? (
          <ErrorState what="the queue" error={queue.error} onRetry={() => void queue.refetch()} />
        ) : (
          <QueueStages counts={counts} />
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <ActivityCard range={range} />
          </div>
          <WorkerCapacityCard />
        </div>
      </div>
    </>
  );
}
