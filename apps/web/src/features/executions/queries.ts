import type { ExecutionStatus } from '@cloudflow/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchExecution, fetchExecutions } from '@/api/executions';
import { fetchLogs } from '@/api/logs';
import { fetchWorkflows } from '@/api/workflows';
import { queryKeys } from '@/queries/keys';
import { toApiParams, type ExecutionFilters } from './list-params';

const ACTIVE_STATUSES: ReadonlySet<ExecutionStatus> = new Set(['QUEUED', 'RUNNING']);

export function isActive(status: ExecutionStatus | undefined): boolean {
  return status !== undefined && ACTIVE_STATUSES.has(status);
}

export function useExecutions(filters: ExecutionFilters) {
  return useQuery({
    queryKey: queryKeys.executions.list(filters),
    queryFn: ({ signal }) => fetchExecutions(toApiParams(filters, Date.now()), signal),
    placeholderData: keepPreviousData,
  });
}

export function useWorkflowOptions() {
  return useQuery({
    queryKey: queryKeys.workflows.options,
    queryFn: ({ signal }) =>
      fetchWorkflows({ pageSize: 100, sortBy: 'name', sortOrder: 'asc' }, signal),
    staleTime: 30_000,
    select: (page) => page.data.map(({ id, name }) => ({ id, name })),
  });
}

export function useExecution(id: string) {
  return useQuery({
    queryKey: queryKeys.executions.detail(id),
    queryFn: ({ signal }) => fetchExecution(id, signal),
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 5000 : false),
  });
}

export function useExecutionLogs(id: string, active: boolean) {
  return useQuery({
    queryKey: queryKeys.executions.logs(id),
    queryFn: ({ signal }) => fetchLogs({ executionId: id, limit: 200 }, signal),
    refetchInterval: active ? 5000 : false,
  });
}
