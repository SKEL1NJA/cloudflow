import type { Paginated, WorkflowSummary } from '@cloudflow/shared';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkflows, type WorkflowListParams } from '@/api/workflows';
import { queryKeys } from '@/queries/keys';

const MIN_LENGTH = 2;
const NO_RESULTS: { id: string; name: string }[] = [];

function toOptions(page: Paginated<WorkflowSummary>): { id: string; name: string }[] {
  return page.data.map(({ id, name }) => ({ id, name }));
}

export function useWorkflowResults(term: string): { id: string; name: string }[] {
  const params: WorkflowListParams = {
    search: term,
    pageSize: 5,
    sortBy: 'name',
    sortOrder: 'asc',
  };
  const { data } = useQuery({
    queryKey: queryKeys.workflows.list(params),
    queryFn: ({ signal }) => fetchWorkflows(params, signal),
    enabled: term.length >= MIN_LENGTH,
    select: toOptions,
  });

  return term.length >= MIN_LENGTH && data ? data : NO_RESULTS;
}
