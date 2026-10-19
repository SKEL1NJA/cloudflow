import type { HttpRequestConfig } from '@cloudflow/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { runHttpRequest } from '../src/executors/http-request.js';
import { StepError, type StepContext } from '../src/executors/types.js';
import { sendJson, startServer, type TestServer } from './test-server.js';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function context(allowPrivateNetwork: boolean): StepContext {
  return { stepExecutionId: 'step-123', attempt: 1, allowPrivateNetwork, log: async () => {} };
}

function config(url: string, overrides: Partial<HttpRequestConfig> = {}): HttpRequestConfig {
  return { method: 'GET', url, headers: {}, timeoutMs: 2000, ...overrides };
}

async function failureOf(promise: Promise<unknown>): Promise<StepError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof StepError) return err;
    throw err;
  }
  throw new Error('expected the request to fail');
}

describe('successful requests', () => {
  it('returns the status and the parsed JSON body', async () => {
    server = await startServer((_count, res) => sendJson(res, 200, { id: 42 }));
    const output = await runHttpRequest(config(server.url), context(true));
    expect(output).toEqual({ status: 200, body: { id: 42 } });
  });

  it('sends the idempotency key, a JSON body and custom headers', async () => {
    server = await startServer((_count, res) => sendJson(res, 200, {}));
    await runHttpRequest(
      config(server.url, { method: 'POST', body: { hello: 'world' }, headers: { 'X-Custom': 'yes' } }),
      context(true),
    );
    const seen = server.seen[0];
    expect(seen?.headers['idempotency-key']).toBe('step-123');
    expect(seen?.headers['x-custom']).toBe('yes');
    expect(seen?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(seen?.body ?? '')).toEqual({ hello: 'world' });
  });

  it('returns plain text bodies as strings', async () => {
    server = await startServer((_count, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello');
    });
    expect(await runHttpRequest(config(server.url), context(true))).toEqual({ status: 200, body: 'hello' });
  });
});

describe('failure classification', () => {
  it.each([500, 502, 503, 429, 408])('treats HTTP %i as retryable', async (status) => {
    server = await startServer((_count, res) => sendJson(res, status, { error: 'nope' }));
    const error = await failureOf(runHttpRequest(config(server.url), context(true)));
    expect(error.retryable).toBe(true);
    expect(error.message).toContain(`HTTP ${status}`);
  });

  it.each([400, 401, 403, 404, 422])('treats HTTP %i as permanent', async (status) => {
    server = await startServer((_count, res) => sendJson(res, status, { error: 'nope' }));
    const error = await failureOf(runHttpRequest(config(server.url), context(true)));
    expect(error.retryable).toBe(false);
  });

  it('does not follow redirects', async () => {
    server = await startServer((_count, res) => {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });
    const error = await failureOf(runHttpRequest(config(server.url), context(true)));
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('redirects are not followed');
    expect(server.seen).toHaveLength(1);
  });

  it('times out slow servers and marks the failure retryable', async () => {
    server = await startServer(() => {
      // never respond
    });
    const error = await failureOf(runHttpRequest(config(server.url, { timeoutMs: 200 }), context(true)));
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('timed out');
  });

  it('rejects oversized responses without retrying', async () => {
    server = await startServer((_count, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('x'.repeat(2 * 1024 * 1024));
    });
    const error = await failureOf(runHttpRequest(config(server.url), context(true)));
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('larger than');
  });

  it('treats a refused connection as retryable', async () => {
    server = await startServer((_count, res) => sendJson(res, 200, {}));
    const deadUrl = server.url;
    await server.close();
    server = undefined;
    const error = await failureOf(runHttpRequest(config(deadUrl), context(true)));
    expect(error.retryable).toBe(true);
  });

  it('refuses headers that could interfere with the connection', async () => {
    server = await startServer((_count, res) => sendJson(res, 200, {}));
    const error = await failureOf(
      runHttpRequest(config(server.url, { headers: { Host: 'evil.example' } }), context(true)),
    );
    expect(error.retryable).toBe(false);
    expect(server.seen).toHaveLength(0);
  });
});

describe('SSRF protection (private network access disabled)', () => {
  it.each([
    ['an IPv4 loopback literal', (port: number) => `http://127.0.0.1:${port}/`],
    ['the localhost hostname', (port: number) => `http://localhost:${port}/`],
    ['an IPv6 loopback literal', (port: number) => `http://[::1]:${port}/`],
    ['the cloud metadata address', () => 'http://169.254.169.254/latest/meta-data/'],
    ['a private 10.x address', () => 'http://10.0.0.5/'],
    ['a decimal-encoded loopback address', () => 'http://2130706433/'],
  ])('blocks %s without sending anything', async (_label, makeUrl) => {
    server = await startServer((_count, res) => sendJson(res, 200, { secret: true }));
    const port = Number(new URL(server.url).port);
    const error = await failureOf(runHttpRequest(config(makeUrl(port)), context(false)));
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('blocked');
    expect(server.seen).toHaveLength(0);
  });
});