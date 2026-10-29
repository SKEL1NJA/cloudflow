import type { StepActivityKey, TimeSeries } from '@cloudflow/shared';
import { describe, expect, it } from 'vitest';
import { activityTotals, describeActivity, toActivityData } from './chart-data';

const series: TimeSeries<StepActivityKey> = {
  range: '6h',
  bucketSeconds: 1800,
  points: [
    { start: '2026-10-20T09:00:00.000Z', counts: { succeeded: 4, failed: 1 } },
    { start: '2026-10-20T09:30:00.000Z', counts: { succeeded: 2, failed: 0 } },
  ],
};

describe('queue chart data', () => {
  it('adds up the buckets', () => {
    expect(activityTotals(series)).toEqual({ succeeded: 6, failed: 1, total: 7 });
  });

  it('keeps one chart point per bucket', () => {
    const data = toActivityData(series);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ start: '2026-10-20T09:00:00.000Z', succeeded: 4, failed: 1 });
  });

  it('describes the activity in words', () => {
    expect(describeActivity(series)).toBe('Last 6 hours: 7 steps finished, 6 succeeded, 1 failed.');
    expect(
      describeActivity({
        ...series,
        points: [{ start: series.points[0]?.start ?? '', counts: { succeeded: 0, failed: 0 } }],
      }),
    ).toBe('Last 6 hours: no steps finished.');
  });
});
