import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchWorkflow, fetchWorkflows, type WorkflowListParams } from '@/api/workflows';
import { queryKeys } from './keys';

export function useWorkflows(params: WorkflowListParams) {
  return useQuery({
    queryKey: queryKeys.workflows.list(params),
    queryFn: ({ signal }) => fetchWorkflows(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: queryKeys.workflows.detail(id),
    queryFn: ({ signal }) => fetchWorkflow(id, signal),
  });
}