import type { ApiKeyListResponse, CreatedApiKey } from '@cloudflow/shared';
import { request } from './client';

export function fetchApiKeys(signal?: AbortSignal): Promise<ApiKeyListResponse> {
  return request<ApiKeyListResponse>('/api-keys', { signal });
}

export function createApiKey(name: string): Promise<CreatedApiKey> {
  return request<CreatedApiKey>('/api-keys', { method: 'POST', body: { name } });
}

export function revokeApiKey(id: string): Promise<void> {
  return request<void>(`/api-keys/${id}`, { method: 'DELETE' });
}
