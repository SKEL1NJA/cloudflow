import { useQuery } from '@tanstack/react-query';
import { fetchSessions } from '@/api/account';
import { fetchApiKeys } from '@/api/api-keys';
import { queryKeys } from '@/queries/keys';

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.account.sessions,
    queryFn: ({ signal }) => fetchSessions(signal),
    select: (response) => response.data,
  });
}

export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.apiKeys,
    queryFn: ({ signal }) => fetchApiKeys(signal),
    select: (response) => response.data,
  });
}
