import type { StatsRange } from '@cloudflow/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchQueue, fetchStepActivity } from '@/api/queue';
import { queryKeys } from '@/queries/keys';

export function useQueueCounts() {
  return useQuery({
    queryKey: queryKeys.queue.counts,
    queryFn: ({ signal }) => fetchQueue(signal),
    refetchInterval: 5000,
    select: (response) => response.counts,
  });
}

export function useStepActivity(range: StatsRange) {
  return useQuery({
    queryKey: queryKeys.queue.activity(range),
    queryFn: ({ signal }) => fetchStepActivity(range, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
}
