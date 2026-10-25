import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { headerOf, json, mockFetch, testUser } from '@/test/fetch';
import { request } from './client';
import { ApiError, NetworkError } from './errors';

const API = 'http://api.test';

function refreshOk(token: string) {
  return json(200, { user: testUser, accessToken: token });
}

beforeEach(() => {
  sessionStore.setSession(testUser, 'old');
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'locks');
  sessionStore.reset();
});

describe('requests', () => {
  it('sends the access token and parses JSON', async () => {
    const fetchMock = mockFetch(() => json(200, { ok: true }));
    const result = await request<{ ok: boolean }>('/things', { query: { page: 2, skip: undefined } });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${API}/things?page=2`);
    expect(headerOf(init, 'authorization')).toBe('Bearer old');
    expect(init?.credentials).toBe('same-origin');
  });

  it('sends JSON bodies with a content type, and no content type without a body', async () => {
    const fetchMock = mockFetch(() => json(204));
    await request('/things', { method: 'POST', body: { name: 'x' } });
    await request('/things', { method: 'POST' });

    const [, withBody] = fetchMock.mock.calls[0] ?? [];
    const [, withoutBody] = fetchMock.mock.calls[1] ?? [];
    expect(headerOf(withBody, 'content-type')).toBe('application/json');
    expect(withBody?.body).toBe('{"name":"x"}');
    expect(headerOf(withoutBody, 'content-type')).toBeNull();
  });

  it('returns undefined for 204 responses', async () => {
    mockFetch(() => json(204));
    expect(await request('/things', { method: 'DELETE' })).toBeUndefined();
  });

  it('turns error responses into ApiError with code, message and request id', async () => {
    mockFetch(() =>
      json(409, { error: { code: 'CONFLICT', message: 'Already exists' } }, { 'x-request-id': 'req-1' }),
    );
    const error = await request('/things').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT', message: 'Already exists', requestId: 'req-1' });
  });

  it('reports network failures as NetworkError', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(request('/things')).rejects.toBeInstanceOf(NetworkError);
  });

  it('rethrows the abort when the caller cancels', async () => {
    mockFetch(() => json(200, {}));
    const controller = new AbortController();
    controller.abort();
    await expect(request('/things', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('automatic token refresh', () => {
  it('refreshes once on a 401 and retries with the new token', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.pathname === '/auth/refresh') return refreshOk('fresh');
      return headerOf(init, 'authorization') === 'Bearer fresh' ? json(200, { ok: true }) : json(401);
    });

    expect(await request('/things')).toEqual({ ok: true });
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/things',
      '/auth/refresh',
      '/things',
    ]);
    expect(sessionStore.getAccessToken()).toBe('fresh');

    const refreshInit = fetchMock.mock.calls[1]?.[1];
    expect(refreshInit?.credentials).toBe('include');
    expect(headerOf(refreshInit, 'authorization')).toBeNull();
  });

  it('shares one refresh between parallel requests', async () => {
    const fetchMock = mockFetch(async (url, init) => {
      if (url.pathname === '/auth/refresh') {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return refreshOk('fresh');
      }
      return headerOf(init, 'authorization') === 'Bearer fresh' ? json(200, { ok: true }) : json(401);
    });

    const results = await Promise.all(Array.from({ length: 5 }, () => request('/things')));

    expect(results).toHaveLength(5);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('does not refresh again when another request already replaced the token', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = mockFetch(async (url, init) => {
      if (url.pathname === '/auth/refresh') return refreshOk('fresh');
      if (url.pathname === '/slow') {
        await gate;
        return headerOf(init, 'authorization') === 'Bearer fresh' ? json(200, 'slow') : json(401);
      }
      return headerOf(init, 'authorization') === 'Bearer fresh' ? json(200, 'fast') : json(401);
    });

    const slow = request<string>('/slow');
    expect(await request<string>('/fast')).toBe('fast');
    release();
    expect(await slow).toBe('slow');

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('ends the session and fails the request when the refresh is rejected', async () => {
    mockFetch((url) =>
      url.pathname === '/auth/refresh'
        ? json(401, { error: { code: 'UNAUTHORIZED', message: 'Session expired' } })
        : json(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } }),
    );

    await expect(request('/things')).rejects.toMatchObject({ status: 401 });
    expect(sessionStore.getState()).toEqual({ status: 'anonymous', expired: true });
  });

  it('does not attempt a refresh for unauthenticated calls such as login', async () => {
    const fetchMock = mockFetch(() =>
      json(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }),
    );

    await expect(request('/auth/login', { method: 'POST', body: {}, auth: false })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sessionStore.getState().status).toBe('authenticated');
  });

  it('queues refreshes through the Web Locks API when the browser has it', async () => {
    const lockRequest = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    Object.defineProperty(navigator, 'locks', { value: { request: lockRequest }, configurable: true });
    mockFetch((url, init) =>
      url.pathname === '/auth/refresh'
        ? refreshOk('fresh')
        : headerOf(init, 'authorization') === 'Bearer fresh'
          ? json(200, {})
          : json(401),
    );

    await request('/things');
    expect(lockRequest).toHaveBeenCalledWith('cloudflow-refresh', expect.any(Function));
  });
});