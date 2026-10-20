import type { StatsRange, TimeSeries } from '@cloudflow/shared';

const RANGE_MS: Record<StatsRange, number> = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
};

const BUCKET_SECONDS: Record<StatsRange, number> = {
  '1h': 300,
  '6h': 1800,
  '24h': 3600,
  '7d': 21_600,
};

export interface BucketRow<K extends string> {
  bucket: Date;
  key: K;
  count: number;
}

export function rangeWindow(range: StatsRange, now: Date) {
  const bucketSeconds = BUCKET_SECONDS[range];
  const stepMs = bucketSeconds * 1000;
  const since = new Date(Math.floor((now.getTime() - RANGE_MS[range]) / stepMs) * stepMs);
  return { since, bucketSeconds, stepMs };
}

function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

export function fillSeries<K extends string>(
  range: StatsRange,
  keys: readonly K[],
  rows: BucketRow<K>[],
  now: Date,
): TimeSeries<K> {
  const { since, bucketSeconds, stepMs } = rangeWindow(range, now);

  const buckets = new Map<number, Record<K, number>>();
  for (let start = since.getTime(); start <= now.getTime(); start += stepMs) {
    buckets.set(start, zeroCounts(keys));
  }
  for (const row of rows) {
    const counts = buckets.get(row.bucket.getTime());
    if (counts) counts[row.key] += row.count;
  }

  return {
    range,
    bucketSeconds,
    points: [...buckets].map(([start, counts]) => ({ start: new Date(start).toISOString(), counts })),
  };
}