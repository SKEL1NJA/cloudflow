import type { StatsRange } from '@cloudflow/shared';
import { ChartColumn } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ACTIVITY_SERIES, activityTotals, describeActivity, toActivityData } from './chart-data';
import { useStepActivity } from './queries';

const ActivityChart = lazy(() =>
  import('./activity-chart').then((module) => ({ default: module.ActivityChart })),
);

export function ActivityCard({ range }: { range: StatsRange }) {
  const { data, error, isError, isPlaceholderData, refetch } = useStepActivity(range);
  const totals = data ? activityTotals(data) : undefined;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-sm font-medium">Steps processed</h2>
          {totals ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {ACTIVITY_SERIES.map(({ key, label, color }) => (
                <li key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  {label}
                  <span className="tabular-nums text-foreground">{totals[key]}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-4">
          {isError && !data ? (
            <ErrorState what="the activity chart" error={error} onRetry={() => void refetch()} />
          ) : !data || !totals ? (
            <Skeleton className="h-[260px] w-full" />
          ) : totals.total === 0 ? (
            <EmptyState
              icon={ChartColumn}
              title="No steps finished in this period"
              description="Run a workflow and the work processed by your workers will show up here."
              className="py-10"
            />
          ) : (
            <div
              role="img"
              aria-label={describeActivity(data)}
              className={cn('transition-opacity', isPlaceholderData && 'opacity-60')}
            >
              <Suspense fallback={<Skeleton className="h-[260px] w-full" />}>
                <ActivityChart data={toActivityData(data)} />
              </Suspense>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
