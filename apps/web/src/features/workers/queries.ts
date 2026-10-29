import { useQuery } from '@tanstack/react-query';
import { fetchWorkers } from '@/api/workers';
import { queryKeys } from '@/queries/keys';

export function useWorkers() {
  return useQuery({
    queryKey: queryKeys.workers,
    queryFn: ({ signal }) => fetchWorkers(signal),
    refetchInterval: 5000,
  });
}
