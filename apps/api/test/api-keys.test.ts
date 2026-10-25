import type { ApiKeyListResponse, ApiKeyView, CreatedApiKey } from '@cloudflow/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { authHeader, registerUser } from './helpers.js';

let app: FastifyInstance;
let token: string;
let otherToken: string;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await app.prisma.user.deleteMany();
  token = await registerUser(app, 'uday@example.com');
  otherToken = await registerUser(app, 'other@example.com');
});

async function createKey(as = token, name = 'ci') {
  const res = await app.inject({
    method: 'POST',
    url: '/api-keys',
    headers: authHeader(as),
    payload: { name },
  });
  return { res, key: res.statusCode === 201 ? res.json<CreatedApiKey>() : undefined };
}

describe('creating keys', () => {
  it('returns the full key once and stores only its hash', async () => {
    const { res, key } = await createKey();
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(key?.key).toMatch(/^cf_[A-Za-z0-9_-]{43}$/);
    expect(key?.prefix).toBe(key?.key.slice(0, 10));

    const stored = await app.prisma.apiKey.findUniqueOrThrow({ where: { id: key?.id ?? '' } });
    expect(stored.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.keyHash).not.toContain(key?.key ?? '');

    const list = await app.inject({ method: 'GET', url: '/api-keys', headers: authHeader(token) });
    expect(list.body).not.toContain(key?.key ?? '');
    expect(list.json<ApiKeyListResponse>().data[0]).toMatchObject({ name: 'ci', revokedAt: null });
  });

  it('rejects an empty name', async () => {
    const { res } = await createKey(token, '   ');
    expect(res.statusCode).toBe(400);
  });

  it('limits the number of active keys', async () => {
    for (let index = 0; index < 20; index += 1) {
      expect((await createKey(token, `key ${index}`)).res.statusCode).toBe(201);
    }
    const { res } = await createKey(token, 'one too many');
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('API_KEY_LIMIT');
  });
});

describe('authenticating with a key', () => {
  it('works on protected endpoints and records when it was last used', async () => {
    const { key } = await createKey();
    const res = await app.inject({
      method: 'GET',
      url: '/workflows',
      headers: authHeader(key?.key ?? ''),
    });
    expect(res.statusCode).toBe(200);

    const stored = await app.prisma.apiKey.findUniqueOrThrow({ where: { id: key?.id ?? '' } });
    expect(stored.lastUsedAt).not.toBeNull();
  });

  it('cannot manage API keys', async () => {
    const { key } = await createKey();
    const res = await app.inject({
      method: 'POST',
      url: '/api-keys',
      headers: authHeader(key?.key ?? ''),
      payload: { name: 'minted by a key' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN');
  });

  it('rejects unknown and malformed keys', async () => {
    for (const bad of ['cf_notarealkey', `cf_${'a'.repeat(43)}`]) {
      const res = await app.inject({ method: 'GET', url: '/workflows', headers: authHeader(bad) });
      expect(res.statusCode).toBe(401);
    }
  });

  it('only sees the data of the user who owns the key', async () => {
    const { key } = await createKey(otherToken);
    await app.inject({
      method: 'POST',
      url: '/workflows',
      headers: authHeader(token),
      payload: {
        name: 'Mine',
        steps: [{ type: 'DELAY', name: 'Wait', config: { durationMs: 1000 } }],
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/workflows',
      headers: authHeader(key?.key ?? ''),
    });
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
  });
});

describe('revoking keys', () => {
  it('stops a key from working and is safe to repeat', async () => {
    const { key } = await createKey();
    const revoke = () =>
      app.inject({ method: 'DELETE', url: `/api-keys/${key?.id}`, headers: authHeader(token) });

    expect((await revoke()).statusCode).toBe(204);
    expect((await revoke()).statusCode).toBe(204);

    const res = await app.inject({
      method: 'GET',
      url: '/workflows',
      headers: authHeader(key?.key ?? ''),
    });
    expect(res.statusCode).toBe(401);

    const list = await app.inject({ method: 'GET', url: '/api-keys', headers: authHeader(token) });
    const listed: ApiKeyView | undefined = list.json<ApiKeyListResponse>().data[0];
    expect(listed?.revokedAt).not.toBeNull();
  });

  it("returns 404 for another user's key and does not revoke it", async () => {
    const { key } = await createKey(token);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api-keys/${key?.id}`,
      headers: authHeader(otherToken),
    });
    expect(res.statusCode).toBe(404);
    const stored = await app.prisma.apiKey.findUniqueOrThrow({ where: { id: key?.id ?? '' } });
    expect(stored.revokedAt).toBeNull();
  });
});
