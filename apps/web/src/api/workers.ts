import type { WorkersResponse } from '@cloudflow/shared';
import { request } from './client';

export function fetchWorkers(signal?: AbortSignal): Promise<WorkersResponse> {
  return request<WorkersResponse>('/workers', { signal });
}
