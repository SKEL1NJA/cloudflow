import type { StatsRange } from '@cloudflow/shared';
import { ErrorState } from '@/components/layout/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useOverview } from '@/queries/overview';
import { RANGE_LABELS } from './range';

type Tone = 'neutral' | 'running' | 'success' | 'danger';

const DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/40',
  running: 'bg-running',
  success: 'bg-success',
  danger: 'bg-danger',
};

interface KpiCardProps {
  label: string;
  value: number | undefined;
  hint: string | undefined;
  tone: Tone;
  dimmed: boolean;
}

function KpiCard({ label, value, hint, tone, dimmed }: KpiCardProps) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn('size-2 rounded-full', DOT[tone])} aria-hidden="true" />
        {label}
      </div>
      <div className={cn('mt-2 transition-opacity', dimmed && 'opacity-60')}>
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatCount(value)}</p>
        )}
        {hint === undefined ? (
          <Skeleton className="mt-2 h-3 w-24" />
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}

export function KpiCards({ range }: { range: StatsRange }) {
  const { data, error, isError, isPlaceholderData, refetch } = useOverview(range);

  if (isError && !data) {
    return <ErrorState what="the overview" error={error} onRetry={() => void refetch()} />;
  }

  const rangeLabel = RANGE_LABELS[range];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard
        label="Total workflows"
        tone="neutral"
        value={data?.workflows.total}
        hint={data ? `${data.workflows.enabled} enabled` : undefined}
        dimmed={isPlaceholderData}
      />
      <KpiCard
        label="Running executions"
        tone="running"
        value={data?.executions.running}
        hint={data ? `${data.executions.queued} queued` : undefined}
        dimmed={isPlaceholderData}
      />
      <KpiCard
        label="Successful executions"
        tone="success"
        value={data?.executions.success}
        hint={data ? rangeLabel : undefined}
        dimmed={isPlaceholderData}
      />
      <KpiCard
        label="Failed executions"
        tone="danger"
        value={data?.executions.failed}
        hint={data ? rangeLabel : undefined}
        dimmed={isPlaceholderData}
      />
    </div>
  );
}
