import type { LogListResponse } from '@cloudflow/shared';
import { request } from './client';

export interface LogParams {
  executionId?: string;
  limit?: number;
}

export function fetchLogs(params: LogParams, signal?: AbortSignal): Promise<LogListResponse> {
  return request<LogListResponse>('/logs', { query: { ...params }, signal });
}
