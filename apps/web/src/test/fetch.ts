import { vi } from 'vitest';

export type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

export function json(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  if (body === undefined) return new Response(null, { status, headers });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return handler(new URL(String(input)), init ?? {});
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

export const testUser = {
  id: '01a14cec-f85d-7079-b268-9c29038eb32d',
  email: 'uday@example.com',
  name: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};