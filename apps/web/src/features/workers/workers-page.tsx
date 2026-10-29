import { Server } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkerStatusBadge } from '@/components/worker-status-badge';
import { useNow } from '@/hooks/use-now';
import { formatDateTime, formatRelativeTime, formatUptime } from '@/lib/format';
import { buttonVariants } from '@/components/ui/button';
import { summarizeCapacity } from './capacity';
import { useWorkers } from './queries';

const HEADERS = [
  'Worker',
  'Status',
  'Processing',
  'Completed',
  'Failed',
  'Uptime',
  'Last heartbeat',
];

export function WorkersPage() {
  const { data, error, isError, refetch } = useWorkers();
  const now = useNow(1000);
  const capacity = data ? summarizeCapacity(data.workers) : undefined;

  let table;
  if (isError && !data) {
    table = <ErrorState what="your workers" error={error} onRetry={() => void refetch()} />;
  } else if (!data) {
    table = (
      <Card className="space-y-3 p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </Card>
    );
  } else if (data.workers.length === 0) {
    table = (
      <EmptyState
        icon={Server}
        title="No workers yet"
        description="Workers appear here as soon as they start and send their first heartbeat. Until one is online, new executions wait in the queue."
        action={
          <Link to="/queue" className={buttonVariants({ variant: 'outline' })}>
            View the queue
          </Link>
        }
      />
    );
  } else {
    table = (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Workers</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {HEADERS.map((header) => (
                  <th key={header} scope="col" className="px-5 py-2 font-medium whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.workers.map((worker) => (
                <tr key={worker.workerId}>
                  <td className="px-5 py-2.5">
                    <span className="font-mono text-xs">{worker.workerId}</span>
                    <span className="block text-xs text-muted-foreground">
                      {worker.hostname} · pid {worker.pid}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <WorkerStatusBadge status={worker.status} />
                  </td>
                  <td className="px-5 py-2.5 tabular-nums">
                    {worker.status === 'offline'
                      ? '-'
                      : `${worker.processing} / ${worker.concurrency}`}
                  </td>
                  <td
                    className="px-5 py-2.5 tabular-nums text-muted-foreground"
                    title="Steps completed since this worker started"
                  >
                    {worker.completed}
                  </td>
                  <td
                    className="px-5 py-2.5 tabular-nums text-muted-foreground"
                    title="Steps that failed for good since this worker started"
                  >
                    {worker.failed}
                  </td>
                  <td
                    className="px-5 py-2.5 tabular-nums text-muted-foreground"
                    title={
                      worker.status === 'offline' ? 'How long it ran before it stopped' : undefined
                    }
                  >
                    {formatUptime(worker.uptimeSeconds)}
                  </td>
                  <td
                    className="px-5 py-2.5 whitespace-nowrap text-muted-foreground"
                    title={formatDateTime(worker.lastHeartbeat)}
                  >
                    {formatRelativeTime(worker.lastHeartbeat, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="Workers"
        description="Processes that execute your steps. Offline workers stay listed for an hour."
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Online workers"
          tone="success"
          value={capacity?.online}
          hint={data ? 'Idle or busy' : undefined}
        />
        <MetricCard
          label="Busy workers"
          tone="running"
          value={data?.summary.busy}
          hint={data ? 'Processing jobs right now' : undefined}
        />
        <MetricCard
          label="Offline workers"
          tone="neutral"
          value={data?.summary.offline}
          hint={data ? 'Stopped or unresponsive' : undefined}
        />
        <MetricCard
          label="Job slots"
          tone="neutral"
          value={capacity ? `${capacity.slotsInUse} / ${capacity.slots}` : undefined}
          hint={capacity ? 'In use across online workers' : undefined}
        />
      </div>
      {table}
    </>
  );
}
