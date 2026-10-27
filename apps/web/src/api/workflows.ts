import type {
  ExecutionDetail,
  Paginated,
  WorkflowDefinition,
  WorkflowDetail,
  WorkflowListQuery,
  WorkflowPatch,
  WorkflowSummary,
} from '@cloudflow/shared';
import { request } from './client';

export interface WorkflowListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  enabled?: boolean;
  sortBy?: WorkflowListQuery['sortBy'];
  sortOrder?: WorkflowListQuery['sortOrder'];
}

export function fetchWorkflows(
  params: WorkflowListParams,
  signal?: AbortSignal,
): Promise<Paginated<WorkflowSummary>> {
  return request<Paginated<WorkflowSummary>>('/workflows', {
    query: { ...params },
    signal,
  });
}

export function fetchWorkflow(id: string, signal?: AbortSignal): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(`/workflows/${id}`, { signal });
}

export function patchWorkflow(id: string, patch: WorkflowPatch): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(`/workflows/${id}`, {
    method: 'PATCH',
    body: patch,
  });
}

export function deleteWorkflow(id: string): Promise<void> {
  return request<void>(`/workflows/${id}`, { method: 'DELETE' });
}

export function runWorkflow(id: string, idempotencyKey: string): Promise<ExecutionDetail> {
  return request<ExecutionDetail>(`/workflows/${id}/run`, {
    method: 'POST',
    body: {},
    headers: { 'idempotency-key': idempotencyKey },
  });
}

export function createWorkflow(definition: WorkflowDefinition): Promise<WorkflowDetail> {
  return request<WorkflowDetail>('/workflows', {
    method: 'POST',
    body: definition,
  });
}

export function replaceWorkflow(
  id: string,
  definition: WorkflowDefinition,
): Promise<WorkflowDetail> {
  return request<WorkflowDetail>(`/workflows/${id}`, {
    method: 'PUT',
    body: definition,
  });
}
