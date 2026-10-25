import { sessionStore } from '@/auth/session';
import { env } from '@/lib/env';
import { ApiError, NetworkError } from './errors';
import { refreshAccessToken } from './refresh';

const REQUEST_TIMEOUT_MS = 30_000;

type QueryValue = string | number | boolean | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  auth?: boolean;
  credentials?: boolean;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = new URL(`${env.apiUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function createGuard(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forward = () => controller.abort(signal?.reason);

  if (signal?.aborted) forward();
  else signal?.addEventListener('abort', forward, { once: true });

  return {
    signal: controller.signal,
    wasTimeout: () => timedOut,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    },
  };
}

type Guard = ReturnType<typeof createGuard>;

async function send(
  path: string,
  options: RequestOptions,
  token: string | null,
  guard: Guard,
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(options.body);
  }

  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: guard.signal,
      credentials: options.credentials ? 'include' : 'same-origin',
    });
  } catch (err) {
    if (guard.wasTimeout()) throw new NetworkError('The server took too long to respond.');
    if (options.signal?.aborted) throw err;
    throw new NetworkError();
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('x-request-id') ?? undefined;
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    return new ApiError(
      response.status,
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? (response.statusText || 'Request failed'),
      body.error?.details,
      requestId,
    );
  } catch {
    return new ApiError(response.status, 'UNKNOWN', response.statusText || 'Request failed', undefined, requestId);
  }
}

async function parseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (text === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The server sent an unreadable response');
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const useAuth = options.auth ?? true;
  const guard = createGuard(options.signal, REQUEST_TIMEOUT_MS);

  try {
    const token = useAuth ? sessionStore.getAccessToken() : null;
    let response = await send(path, options, token, guard);

    if (response.status === 401 && useAuth) {
      const current = sessionStore.getAccessToken();
      const fresh = current !== null && current !== token ? current : await refreshAccessToken();
      if (fresh !== null) response = await send(path, options, fresh, guard);
    }

    if (!response.ok) throw await toApiError(response);
    return await parseBody<T>(response);
  } finally {
    guard.dispose();
  }
}