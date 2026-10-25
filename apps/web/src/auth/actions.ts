import type { AuthResponse, LoginInput, RegisterInput } from '@cloudflow/shared';
import { request } from '@/api/client';
import { queryClient } from '@/lib/query-client';
import { sessionStore } from './session';

export async function signIn(input: LoginInput): Promise<void> {
  const response = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: input,
    auth: false,
    credentials: true,
  });
  sessionStore.setSession(response.user, response.accessToken);
}

export async function signUp(input: RegisterInput): Promise<void> {
  const response = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: input,
    auth: false,
    credentials: true,
  });
  sessionStore.setSession(response.user, response.accessToken);
}

export async function signOut(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST', auth: false, credentials: true }).catch(
    () => undefined,
  );
  sessionStore.signOut();
  queryClient.clear();
}
