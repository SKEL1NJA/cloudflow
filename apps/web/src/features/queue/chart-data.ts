import type { StepActivityKey, TimeSeries } from '@cloudflow/shared';
import { formatBucketLabel } from '@/features/overview/chart-data';
import { RANGE_LABELS } from '@/features/overview/range';

export const ACTIVITY_SERIES: readonly { key: StepActivityKey; label: string; color: string }[] = [
  { key: 'succeeded', label: 'Succeeded', color: 'var(--success)' },
  { key: 'failed', label: 'Failed', color: 'var(--danger)' },
];

export interface ActivityPoint {
  start: string;
  label: string;
  succeeded: number;
  failed: number;
}

export function toActivityData(series: TimeSeries<StepActivityKey>): ActivityPoint[] {
  return series.points.map((point) => ({
    start: point.start,
    label: formatBucketLabel(point.start, series.range),
    ...point.counts,
  }));
}

export function activityTotals(series: TimeSeries<StepActivityKey>) {
  let succeeded = 0;
  let failed = 0;
  for (const point of series.points) {
    succeeded += point.counts.succeeded;
    failed += point.counts.failed;
  }
  return { succeeded, failed, total: succeeded + failed };
}

export function describeActivity(series: TimeSeries<StepActivityKey>): string {
  const totals = activityTotals(series);
  const label = RANGE_LABELS[series.range];
  if (totals.total === 0) return `${label}: no steps finished.`;
  return `${label}: ${totals.total} steps finished, ${totals.succeeded} succeeded, ${totals.failed} failed.`;
}
