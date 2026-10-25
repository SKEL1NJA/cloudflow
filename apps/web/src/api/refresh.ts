import type { AuthResponse } from '@cloudflow/shared';
import { sessionStore } from '@/auth/session';
import { env } from '@/lib/env';
import { ApiError, NetworkError } from './errors';

const LOCK_NAME = 'cloudflow-refresh';

let inflight: Promise<string | null> | null = null;

function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(LOCK_NAME, task) : task();
}

async function performRefresh(): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
  } catch {
    throw new NetworkError();
  }

  if (response.status === 401 || response.status === 403) {
    sessionStore.expire();
    return null;
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'REFRESH_FAILED', 'Could not refresh the session');
  }

  const body = (await response.json()) as AuthResponse;
  sessionStore.setSession(body.user, body.accessToken);
  return body.accessToken;
}

export function refreshAccessToken(): Promise<string | null> {
  inflight ??= exclusive(performRefresh).finally(() => {
    inflight = null;
  });
  return inflight;
}