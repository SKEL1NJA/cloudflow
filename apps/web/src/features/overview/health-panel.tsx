import type { OverviewResponse, StatsRange } from '@cloudflow/shared';
import { ErrorState } from '@/components/layout/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useOverview } from '@/queries/overview';

type Tone = 'success' | 'warning' | 'danger';

interface HealthRow {
  label: string;
  tone: Tone;
  text: string;
}

const DOT: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

function checkRow(label: string, check: OverviewResponse['health']['database']): HealthRow {
  return check.status === 'up'
    ? { label, tone: 'success', text: `Operational · ${check.latencyMs}ms` }
    : { label, tone: 'danger', text: 'Down' };
}

function buildRows(data: OverviewResponse): HealthRow[] {
  const { database, redis, workers } = data.health;
  const available = workers.online + workers.busy;

  return [
    { label: 'API', tone: 'success', text: 'Operational' },
    checkRow('Database', database),
    checkRow('Redis', redis),
    available > 0
      ? { label: 'Workers', tone: 'success', text: `${available} online` }
      : { label: 'Workers', tone: 'warning', text: 'No workers online' },
  ];
}

export function HealthPanel({ range }: { range: StatsRange }) {
  const { data, error, isError, refetch } = useOverview(range);

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-sm font-medium">System health</h2>
        {isError && !data ? (
          <div className="mt-4">
            <ErrorState what="system health" error={error} onRetry={() => void refetch()} />
          </div>
        ) : data ? (
          <ul className="mt-3 divide-y">
            {buildRows(data).map((row) => (
              <li key={row.label} className="flex items-center justify-between py-2.5 text-sm">
                <span>{row.label}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className={cn('size-2 rounded-full', DOT[row.tone])} aria-hidden="true" />
                  {row.text}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-5 w-full" />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
