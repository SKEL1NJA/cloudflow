import type { ExecutionSeriesKey, StatsRange, TimeSeries } from '@cloudflow/shared';
import { RANGE_LABELS } from './range';

export const SERIES: readonly { key: ExecutionSeriesKey; label: string; color: string }[] = [
  { key: 'success', label: 'Succeeded', color: 'var(--success)' },
  { key: 'failed', label: 'Failed', color: 'var(--danger)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--muted-foreground)' },
  { key: 'active', label: 'In progress', color: 'var(--running)' },
];

export interface ChartPoint {
  start: string;
  label: string;
  success: number;
  failed: number;
  cancelled: number;
  active: number;
}

export function formatBucketLabel(iso: string, range: StatsRange): string {
  const date = new Date(iso);
  if (range === '7d') {
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function toChartData(series: TimeSeries<ExecutionSeriesKey>): ChartPoint[] {
  return series.points.map((point) => ({
    start: point.start,
    label: formatBucketLabel(point.start, series.range),
    ...point.counts,
  }));
}

export function totalsOf(series: TimeSeries<ExecutionSeriesKey>) {
  const totals: Record<ExecutionSeriesKey, number> = {
    success: 0,
    failed: 0,
    cancelled: 0,
    active: 0,
  };
  for (const point of series.points) {
    for (const { key } of SERIES) totals[key] += point.counts[key];
  }
  return { ...totals, total: totals.success + totals.failed + totals.cancelled + totals.active };
}

export function describeSeries(series: TimeSeries<ExecutionSeriesKey>): string {
  const totals = totalsOf(series);
  const label = RANGE_LABELS[series.range];
  if (totals.total === 0) return `${label}: no executions.`;
  return `${label}: ${totals.total} executions, ${totals.success} succeeded, ${totals.failed} failed, ${totals.cancelled} cancelled, ${totals.active} in progress.`;
}
