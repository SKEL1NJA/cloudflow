import type { StatsRange } from '@cloudflow/shared';
import { ErrorState } from '@/components/layout/error-state';
import { MetricCard } from '@/components/ui/metric-card';
import { useOverview } from '@/queries/overview';
import { RANGE_LABELS } from './range';

export function KpiCards({ range }: { range: StatsRange }) {
  const { data, error, isError, isPlaceholderData, refetch } = useOverview(range);

  if (isError && !data) {
    return <ErrorState what="the overview" error={error} onRetry={() => void refetch()} />;
  }

  const rangeLabel = RANGE_LABELS[range];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        label="Total workflows"
        tone="neutral"
        value={data?.workflows.total}
        hint={data ? `${data.workflows.enabled} enabled` : undefined}
        dimmed={isPlaceholderData}
      />
      <MetricCard
        label="Running executions"
        tone="running"
        value={data?.executions.running}
        hint={data ? `${data.executions.queued} queued` : undefined}
        dimmed={isPlaceholderData}
      />
      <MetricCard
        label="Successful executions"
        tone="success"
        value={data?.executions.success}
        hint={data ? rangeLabel : undefined}
        dimmed={isPlaceholderData}
      />
      <MetricCard
        label="Failed executions"
        tone="danger"
        value={data?.executions.failed}
        hint={data ? rangeLabel : undefined}
        dimmed={isPlaceholderData}
      />
    </div>
  );
}
