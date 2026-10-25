import type { ExecutionSeriesKey, TimeSeries } from '@cloudflow/shared';
import { describe, expect, it } from 'vitest';
import { describeSeries, toChartData, totalsOf } from './chart-data';

const series: TimeSeries<ExecutionSeriesKey> = {
  range: '1h',
  bucketSeconds: 300,
  points: [
    {
      start: '2026-10-20T09:05:00.000Z',
      counts: { success: 2, failed: 1, cancelled: 0, active: 0 },
    },
    {
      start: '2026-10-20T09:10:00.000Z',
      counts: { success: 1, failed: 0, cancelled: 1, active: 2 },
    },
  ],
};

describe('chart data', () => {
  it('adds up every status across buckets', () => {
    expect(totalsOf(series)).toEqual({ success: 3, failed: 1, cancelled: 1, active: 2, total: 7 });
  });

  it('keeps one chart point per bucket, with counts and a label', () => {
    const data = toChartData(series);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ start: '2026-10-20T09:05:00.000Z', success: 2, failed: 1 });
    expect(data[0]?.label).not.toBe('');
  });

  it('describes the series in words for screen readers', () => {
    expect(describeSeries(series)).toBe(
      'Last hour: 7 executions, 3 succeeded, 1 failed, 1 cancelled, 2 in progress.',
    );
  });

  it('says so when nothing ran', () => {
    const empty: TimeSeries<ExecutionSeriesKey> = {
      ...series,
      points: [
        {
          start: series.points[0]?.start ?? '',
          counts: { success: 0, failed: 0, cancelled: 0, active: 0 },
        },
      ],
    };
    expect(describeSeries(empty)).toBe('Last hour: no executions.');
  });
});
