import type { ExecutionListQuery, ExecutionSummary, Paginated } from '@cloudflow/shared';
import { request } from './client';

export type ExecutionListParams = Partial<
  Pick<ExecutionListQuery, 'page' | 'pageSize' | 'status' | 'workflowId'>
>;

export function fetchExecutions(
  params: ExecutionListParams = {},
  signal?: AbortSignal,
): Promise<Paginated<ExecutionSummary>> {
  return request<Paginated<ExecutionSummary>>('/executions', { query: { ...params }, signal });
}
