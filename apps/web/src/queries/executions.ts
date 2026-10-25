import { useQuery } from '@tanstack/react-query';
import { fetchExecutions, type ExecutionListParams } from '@/api/executions';
import { queryKeys } from './keys';

const RECENT_PARAMS: ExecutionListParams = { page: 1, pageSize: 8 };

export function useRecentExecutions() {
  return useQuery({
    queryKey: queryKeys.executions.list(RECENT_PARAMS),
    queryFn: ({ signal }) => fetchExecutions(RECENT_PARAMS, signal),
    refetchInterval: 30_000,
  });
}
