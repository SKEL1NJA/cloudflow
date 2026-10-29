import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { fetchLogs } from '@/api/logs';
import { queryKeys } from '@/queries/keys';
import { toLogParams, type LogFilters } from './list-params';

export function useLogs(filters: LogFilters) {
  const { live, ...query } = filters;

  return useInfiniteQuery({
    queryKey: queryKeys.logs.list(query),
    queryFn: ({ pageParam, signal }) =>
      fetchLogs(toLogParams(query, Date.now(), pageParam), signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: live ? 3000 : false,
    placeholderData: keepPreviousData,
  });
}
