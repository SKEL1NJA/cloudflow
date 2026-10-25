import { STATS_RANGES, type StatsRange } from '@cloudflow/shared';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

export const RANGE_LABELS: Record<StatsRange, string> = {
  '1h': 'Last hour',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
};

const rangeSchema = z.enum(STATS_RANGES).catch('24h');

export function useRange(): [StatsRange, (range: StatsRange) => void] {
  const [params, setParams] = useSearchParams();
  const range = rangeSchema.parse(params.get('range') ?? undefined);

  const setRange = useCallback(
    (next: StatsRange) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current);
          updated.set('range', next);
          return updated;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [range, setRange];
}
