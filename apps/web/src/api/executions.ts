import type {
  ExecutionDetail,
  ExecutionStatus,
  ExecutionSummary,
  Paginated,
} from '@cloudflow/shared';
import { request } from './client';

export interface ExecutionListParams {
  page?: number;
  pageSize?: number;
  status?: ExecutionStatus;
  workflowId?: string;
  from?: string;
  to?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
}

export function fetchExecutions(
  params: ExecutionListParams = {},
  signal?: AbortSignal,
): Promise<Paginated<ExecutionSummary>> {
  return request<Paginated<ExecutionSummary>>('/executions', { query: { ...params }, signal });
}

export function fetchExecution(id: string, signal?: AbortSignal): Promise<ExecutionDetail> {
  return request<ExecutionDetail>(`/executions/${id}`, { signal });
}

export function cancelExecution(id: string): Promise<ExecutionDetail> {
  return request<ExecutionDetail>(`/executions/${id}/cancel`, { method: 'POST' });
}

export function retryExecution(id: string): Promise<ExecutionDetail> {
  return request<ExecutionDetail>(`/executions/${id}/retry`, { method: 'POST' });
}
