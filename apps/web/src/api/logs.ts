import type { LogLevel, LogListResponse } from '@cloudflow/shared';
import { request } from './client';

export interface LogParams {
  executionId?: string;
  workflowId?: string;
  level?: LogLevel;
  search?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export function fetchLogs(params: LogParams, signal?: AbortSignal): Promise<LogListResponse> {
  return request<LogListResponse>('/logs', { query: { ...params }, signal });
}
