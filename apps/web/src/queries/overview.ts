import type { StatsRange } from '@cloudflow/shared';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { fetchExecutionSeries, fetchOverview } from '@/api/monitoring';
import { queryKeys } from './keys';

function overviewQuery(range: StatsRange) {
  return queryOptions({
    queryKey: queryKeys.overview(range),
    queryFn: ({ signal }) => fetchOverview(range, signal),
    refetchInterval: 30_000,
  });
}

function executionSeriesQuery(range: StatsRange) {
  return queryOptions({
    queryKey: queryKeys.executionSeries(range),
    queryFn: ({ signal }) => fetchExecutionSeries(range, signal),
    refetchInterval: 30_000,
  });
}

export function useOverview(range: StatsRange) {
  return useQuery({ ...overviewQuery(range), placeholderData: keepPreviousData });
}

export function useExecutionSeries(range: StatsRange) {
  return useQuery({ ...executionSeriesQuery(range), placeholderData: keepPreviousData });
}
