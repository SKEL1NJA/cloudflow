import type {
  AuthUser,
  ChangePasswordInput,
  ChangePasswordResponse,
  SessionListResponse,
  UpdateProfileInput,
} from '@cloudflow/shared';
import { request } from './client';

export function updateProfile(input: UpdateProfileInput): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/auth/me', { method: 'PATCH', body: input });
}

export function changePassword(input: ChangePasswordInput): Promise<ChangePasswordResponse> {
  return request<ChangePasswordResponse>('/auth/change-password', { method: 'POST', body: input });
}

export function fetchSessions(signal?: AbortSignal): Promise<SessionListResponse> {
  return request<SessionListResponse>('/auth/sessions', { signal });
}

export function revokeSession(id: string): Promise<void> {
  return request<void>(`/auth/sessions/${id}`, { method: 'DELETE' });
}
